//+------------------------------------------------------------------+
//|                                          MaatlaKebs_Slave_v2.mq5 |
//|                                     MaatlaKebs Copy Trading       |
//|                                   EA Slave — File-Based Execution |
//|                                              Version 2.0.0        |
//+------------------------------------------------------------------+
//  ARCHITECTURE:
//    Python Manager writes: %APPDATA%\MetaQuotes\Terminal\Common\Files\MaatlaKebs\signals\{login}.json
//    EA reads via OnTick() gate (~100ms effective polling) using FILE_COMMON
//    Executes OrderSend() directly inside MT5 — ZERO IPC
//    Writes result: Common\Files\MaatlaKebs\results\{login}_result.json
//    Python collector batches results to Supabase every 5s
//
//  PORTABLE MT5 NOTE:
//    All FileOpen/FileIsExist/FileDelete/FileCopy use FILE_COMMON flag.
//    This resolves to %APPDATA%\MetaQuotes\Terminal\Common\Files\ on ALL
//    portable terminals — no sandbox path mismatch.
//
//  WELTRADE / SYNTHETIC INDICES:
//    Tested logic identical to Python manager:
//    - Margin-based volume scaling with 0.9 safety buffer
//    - OrderCalcMargin() → scale down if insufficient free margin
//    - SymbolSelect() pre-warm before any calculation
//    - Filling mode auto-detection (FOK → IOC → RETURN)
//+------------------------------------------------------------------+

#property copyright "MaatlaKebs Copy Trading"
#property version   "2.00"
#property strict

//+------------------------------------------------------------------+
//| INPUT PARAMETERS                                                  |
//+------------------------------------------------------------------+
input group "=== Signal Source ==="
input string   SignalFolder      = "MaatlaKebs\\signals\\";   // Relative to Common\Files — FILE_COMMON handles root
input string   ResultFolder      = "MaatlaKebs\\results\\";   // Relative to Common\Files — FILE_COMMON handles root

input group "=== Execution ==="
input int      MagicNumber       = 0;                             // 0 matches mentor; we filter by COMMENT
input int      Slippage          = 20;                            // Max slippage in points
input double   SafetyBuffer      = 0.9;                           // 90% buffer on margin scaling
input int      StaleSeconds      = 30;                            // Reject signals older than N seconds
input bool     UseEquityRatio    = false;                         // Fallback: scale by equity ratio

input group "=== Logging ==="
input bool     VerboseLog        = true;

//+------------------------------------------------------------------+
//| GLOBAL STATE                                                      |
//+------------------------------------------------------------------+
string   g_last_batch_id   = "";
ulong    g_last_check_ms   = 0;
const ulong POLL_INTERVAL_MS = 100;

// Comment prefix for position filtering (safer than Magic=0)
string   COMMENT_PREFIX    = "MaatlaKebs_";

//+------------------------------------------------------------------+
//| EA INITIALISATION                                                 |
//+------------------------------------------------------------------+
int OnInit()
{
   FolderCreate(SignalFolder, FILE_COMMON);
   FolderCreate(ResultFolder, FILE_COMMON);

   string login   = IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));
   string server  = AccountInfoString(ACCOUNT_SERVER);
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);

   Print("===================================================");
   Print("[MaKebs] Slave EA v2.0 — INITIALIZED");
   Print("[MaKebs] Login:   ", login);
   Print("[MaKebs] Server:  ", server);
   Print("[MaKebs] Balance: ", DoubleToString(balance, 2));
   Print("[MaKebs] Equity:  ", DoubleToString(equity, 2));
   Print("[MaKebs] Magic:   ", IntegerToString(MagicNumber));
   Print("[MaKebs] Signals: Common\\Files\\", SignalFolder);
   Print("[MaKebs] Results: Common\\Files\\", ResultFolder);
   Print("===================================================");

   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))
      Print("[MaKebs][WARN] AutoTrading DISABLED in terminal settings!");
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED))
      Print("[MaKebs][WARN] AutoTrading DISABLED for this EA!");

   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   Print("[MaKebs] EA stopped. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| ON TICK — Polling gate (~100ms on synthetic indices)              |
//+------------------------------------------------------------------+
void OnTick()
{
   ulong now = GetTickCount64();
   if(now - g_last_check_ms < POLL_INTERVAL_MS)
      return;
   g_last_check_ms = now;

   string login = IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));
   string signal_path = SignalFolder + login + ".json";

   if(!FileIsExist(signal_path, FILE_COMMON))
      return;

   ProcessSignalFile(signal_path, login);
}

//+------------------------------------------------------------------+
//| PROCESS SIGNAL FILE                                               |
//+------------------------------------------------------------------+
void ProcessSignalFile(const string path, const string login)
{
   string content = ReadTextFile(path);
   if(content == "")
   {
      Print("[MaKebs][ERROR] Cannot read signal file: ", path);
      FileDelete(path, FILE_COMMON);
      return;
   }

   // --- Parse flat JSON fields ---
   string batch_id      = ExtractJSONValue(content, "batch_id");
   string ts_str        = ExtractJSONValue(content, "timestamp");
   string action        = ExtractJSONValue(content, "action");
   string symbol        = ExtractJSONValue(content, "symbol");
   string order_type    = ExtractJSONValue(content, "order_type");
   string volume_str    = ExtractJSONValue(content, "volume");
   string mentor_ticket = ExtractJSONValue(content, "mentor_ticket");
   string sl_str        = ExtractJSONValue(content, "sl");
   string tp_str        = ExtractJSONValue(content, "tp");

   long signal_time = StringToInteger(ts_str);
   long now = (long)TimeGMT();   // Must match Python's int(time.time()) which is UTC

   // --- Stale signal check ---
   if(signal_time > 0 && (now - signal_time) > StaleSeconds)
   {
      Print("[MaKebs][SKIP] Stale signal (", now - signal_time, "s old), batch: ", batch_id);
      FileDelete(path, FILE_COMMON);
      return;
   }

   // --- Duplicate batch check (same session) ---
   if(batch_id == g_last_batch_id && StringLen(batch_id) > 0)
   {
      Print("[MaKebs][SKIP] Duplicate batch: ", batch_id);
      FileDelete(path, FILE_COMMON);
      return;
   }

   double mentor_volume = StringToDouble(volume_str);
   double sl = StringToDouble(sl_str);
   double tp = StringToDouble(tp_str);

   // --- Pre-execution duplicate guard (survives EA restart) ---
   if(action == "OPEN" && IsPositionExists(mentor_ticket))
   {
      Print("[MaKebs][SKIP] Position already exists for ticket: ", mentor_ticket);
      FileDelete(path, FILE_COMMON);
      g_last_batch_id = batch_id;
      return;
   }

   if(VerboseLog)
   {
      Print("===================================================");
      Print("[MaKebs] SIGNAL | batch: ", batch_id);
      Print("[MaKebs] ACTION: ", action, " | Symbol: ", symbol, " | Type: ", order_type);
      Print("[MaKebs] Volume: ", volume_str, " | Ticket: ", mentor_ticket);
      Print("===================================================");
   }

   bool success = false;
   string error_msg = "";
   long exec_ticket = -1;
   double exec_volume = 0;
   double exec_price = 0;

   // --- Account health gates ---
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(equity <= 0)
   {
      error_msg = "Negative or zero equity: " + DoubleToString(equity, 2);
      Print("[MaKebs][SKIP] ", error_msg);
   }
   else if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))
   {
      error_msg = "AutoTrading disabled in terminal";
      Print("[MaKebs][ERROR] ", error_msg);
   }
   else if(!MQLInfoInteger(MQL_TRADE_ALLOWED))
   {
      error_msg = "AutoTrading disabled for this EA";
      Print("[MaKebs][ERROR] ", error_msg);
   }
   else
   {
      // --- Execute based on action ---
      if(action == "OPEN")
      {
         long ticket = ExecuteOpen(symbol, order_type, mentor_volume, mentor_ticket, sl, tp);
         if(ticket > 0)
         {
            success = true;
            exec_ticket = ticket;
            if(PositionSelectByTicket((ulong)ticket))
            {
               exec_volume = PositionGetDouble(POSITION_VOLUME);
               exec_price = PositionGetDouble(POSITION_PRICE_OPEN);
            }
            Print("[MaKebs][OK] OPEN ticket=", ticket, " symbol=", symbol);
         }
         else
         {
            error_msg = "Open failed, error: " + IntegerToString(GetLastError());
            Print("[MaKebs][ERROR] ", error_msg);
         }
      }
      else if(action == "CLOSE_ALL")
      {
         int closed = ExecuteCloseAll();
         success = (closed > 0);
         if(success)
            Print("[MaKebs][OK] CLOSE_ALL closed=", closed);
         else
            error_msg = "No positions to close";
      }
      else if(action == "CLOSE_SYMBOL")
      {
         int closed = ExecuteCloseBySymbol(symbol);
         success = (closed > 0);
         if(success)
            Print("[MaKebs][OK] CLOSE_SYMBOL symbol=", symbol, " closed=", closed);
         else
            error_msg = "No positions for symbol: " + symbol;
      }
      else if(action == "CLOSE_TICKET")
      {
         success = ExecuteCloseByMentorTicket(mentor_ticket);
         if(success)
            Print("[MaKebs][OK] CLOSE_TICKET mentor_ticket=", mentor_ticket);
         else
            error_msg = "Position not found for ticket: " + mentor_ticket;
      }
      else
      {
         error_msg = "Unknown action: " + action;
         Print("[MaKebs][ERROR] ", error_msg);
      }
   }

   // --- Write result and cleanup ---
   WriteResult(batch_id, login, action, symbol, order_type, mentor_volume,
               exec_ticket, exec_volume, exec_price,
               success ? "success" : "failed", error_msg);

   FileDelete(path, FILE_COMMON);
   g_last_batch_id = batch_id;
}

//+------------------------------------------------------------------+
//| EXECUTE OPEN TRADE (2-attempt retry, same as Python)              |
//+------------------------------------------------------------------+
long ExecuteOpen(const string symbol, const string order_type,
                 const double mentor_volume, const string mentor_ticket,
                 const double sl, const double tp)
{
   if(!SymbolSelect(symbol, true))
   {
      Print("[MaKebs][ERROR] SymbolSelect failed: ", symbol);
      return -1;
   }

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
   {
      Print("[MaKebs][ERROR] No tick data: ", symbol);
      return -1;
   }

   double student_volume = CalculateStudentVolume(symbol, order_type, mentor_volume);
   if(student_volume <= 0)
   {
      Print("[MaKebs][SKIP] Volume scaled to zero (insufficient margin/equity)");
      return -1;
   }

   ENUM_ORDER_TYPE ot = (order_type == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;

   for(int attempt = 0; attempt < 2; attempt++)
   {
      if(!SymbolInfoTick(symbol, tick))
      {
         if(attempt == 0) Sleep(300);
         continue;
      }

      double price = (ot == ORDER_TYPE_BUY) ? tick.ask : tick.bid;

      MqlTradeRequest req = {};
      MqlTradeResult  res = {};

      req.action       = TRADE_ACTION_DEAL;
      req.symbol       = symbol;
      req.volume       = student_volume;
      req.type         = ot;
      req.price        = price;
      req.deviation    = Slippage;
      req.magic        = MagicNumber;
      req.comment      = COMMENT_PREFIX + mentor_ticket;
      req.type_time    = ORDER_TIME_GTC;
      req.type_filling = GetFillingMode(symbol);

      if(sl > 0) req.sl = sl;
      if(tp > 0) req.tp = tp;

      if(!OrderSend(req, res))
      {
         int err = GetLastError();
         Print("[MaKebs][ERROR] OrderSend failed, err=", err, " attempt=", attempt + 1);
         if(attempt == 0) Sleep(300);
         continue;
      }

      if(res.retcode == TRADE_RETCODE_DONE)
         return (long)res.order;

      Print("[MaKebs][ERROR] Trade rejected, retcode=", res.retcode, " attempt=", attempt + 1);
      if(attempt == 0) Sleep(300);
   }

   return -1;
}

//+------------------------------------------------------------------+
//| CALCULATE STUDENT VOLUME — Identical to Python logic              |
//+------------------------------------------------------------------+
double CalculateStudentVolume(const string symbol, const string order_type,
                              const double mentor_volume)
{
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double free_margin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);

   if(equity <= 0 || free_margin <= 0)
      return 0;

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
      return 0;

   ENUM_ORDER_TYPE ot = (order_type == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double price = (ot == ORDER_TYPE_BUY) ? tick.ask : tick.bid;

   // Method 1: Equity ratio (optional fallback)
   if(UseEquityRatio)
   {
      double ratio = equity / AccountInfoDouble(ACCOUNT_BALANCE);
      return NormalizeVolume(symbol, mentor_volume * ratio);
   }

   // Method 2: Margin-based (default — same as Python manager)
   double margin_required = 0;
   if(!OrderCalcMargin(ot, symbol, mentor_volume, price, margin_required))
   {
      Print("[MaKebs][WARN] OrderCalcMargin failed, using equity fallback");
      return NormalizeVolume(symbol, mentor_volume);
   }

   if(margin_required <= 0)
      return 0;

   // Can afford full volume?
   if(margin_required <= free_margin)
      return NormalizeVolume(symbol, mentor_volume);

   // Scale down proportionally with safety buffer
   double ratio = free_margin / margin_required;
   double scaled = mentor_volume * ratio * SafetyBuffer;

   Print("[MaKebs] Volume scaled: ", DoubleToString(mentor_volume, 2),
         " -> ", DoubleToString(scaled, 2),
         " (free_margin=", DoubleToString(free_margin, 2), ")");

   return NormalizeVolume(symbol, scaled);
}

//+------------------------------------------------------------------+
//| NORMALIZE VOLUME TO SYMBOL STEP                                   |
//+------------------------------------------------------------------+
double NormalizeVolume(const string symbol, double volume)
{
   if(volume <= 0) return 0;

   double min_vol = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double max_vol = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double vol_step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);

   if(volume < min_vol) return 0;
   if(volume > max_vol) volume = max_vol;

   if(vol_step > 0)
   {
      volume = MathFloor(volume / vol_step) * vol_step;
      int digits = 0;
      double temp = vol_step;
      while(temp < 1 && digits < 8)
      {
         temp *= 10;
         digits++;
      }
      volume = NormalizeDouble(volume, digits);
   }

   return volume;
}

//+------------------------------------------------------------------+
//| CLOSE ALL POSITIONS (regardless of symbol)                        |
//+------------------------------------------------------------------+
int ExecuteCloseAll()
{
   int closed = 0;
   int total = PositionsTotal();

   for(int i = total - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket))
         continue;

      string comment = PositionGetString(POSITION_COMMENT);
      if(StringFind(comment, COMMENT_PREFIX) < 0)
         continue;

      if(ClosePosition(ticket, PositionGetString(POSITION_SYMBOL)))
         closed++;
   }
   return closed;
}

//+------------------------------------------------------------------+
//| CLOSE POSITIONS BY SYMBOL                                         |
//+------------------------------------------------------------------+
int ExecuteCloseBySymbol(const string symbol)
{
   int closed = 0;
   int total = PositionsTotal();

   for(int i = total - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket))
         continue;

      if(PositionGetString(POSITION_SYMBOL) != symbol)
         continue;

      string comment = PositionGetString(POSITION_COMMENT);
      if(StringFind(comment, COMMENT_PREFIX) < 0)
         continue;

      if(ClosePosition(ticket, symbol))
         closed++;
   }
   return closed;
}

//+------------------------------------------------------------------+
//| CLOSE POSITION BY MENTOR TICKET                                   |
//+------------------------------------------------------------------+
bool ExecuteCloseByMentorTicket(const string mentor_ticket)
{
   string search = COMMENT_PREFIX + mentor_ticket;
   int total = PositionsTotal();

   for(int i = total - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket))
         continue;

      string comment = PositionGetString(POSITION_COMMENT);
      if(StringFind(comment, search) >= 0)
         return ClosePosition(ticket, PositionGetString(POSITION_SYMBOL));
   }
   return false;
}

//+------------------------------------------------------------------+
//| CLOSE SINGLE POSITION                                             |
//+------------------------------------------------------------------+
bool ClosePosition(const ulong position_ticket, const string symbol)
{
   if(!PositionSelectByTicket(position_ticket))
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
      return false;

   ENUM_ORDER_TYPE close_type = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
                                ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
   double close_price = (close_type == ORDER_TYPE_SELL) ? tick.bid : tick.ask;

   MqlTradeRequest req = {};
   MqlTradeResult  res = {};

   req.action       = TRADE_ACTION_DEAL;
   req.symbol       = symbol;
   req.volume       = PositionGetDouble(POSITION_VOLUME);
   req.type         = close_type;
   req.price        = close_price;
   req.position     = position_ticket;
   req.deviation    = Slippage;
   req.magic        = MagicNumber;
   req.comment      = COMMENT_PREFIX + "Close";
   req.type_time    = ORDER_TIME_GTC;
   req.type_filling = GetFillingMode(symbol);

   if(!OrderSend(req, res))
   {
      Print("[MaKebs][ERROR] Close OrderSend failed: ", GetLastError());
      return false;
   }

   if(res.retcode != TRADE_RETCODE_DONE)
   {
      Print("[MaKebs][ERROR] Close rejected, retcode=", res.retcode);
      return false;
   }

   return true;
}

//+------------------------------------------------------------------+
//| CHECK IF POSITION ALREADY EXISTS FOR MENTOR TICKET                |
//+------------------------------------------------------------------+
bool IsPositionExists(const string mentor_ticket)
{
   string search = COMMENT_PREFIX + mentor_ticket;
   int total = PositionsTotal();

   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket))
         continue;

      string comment = PositionGetString(POSITION_COMMENT);
      if(StringFind(comment, search) >= 0)
         return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| FILLING MODE DETECTION                                            |
//+------------------------------------------------------------------+
ENUM_ORDER_TYPE_FILLING GetFillingMode(const string symbol)
{
   uint filling = (uint)SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);

   if((filling & SYMBOL_FILLING_FOK) != 0)
      return ORDER_FILLING_FOK;
   if((filling & SYMBOL_FILLING_IOC) != 0)
      return ORDER_FILLING_IOC;

   return ORDER_FILLING_RETURN;
}

//+------------------------------------------------------------------+
//| READ TEXT FILE (shared access for concurrent Python)              |
//| FILE_ANSI = read as ASCII/UTF-8 (Python writes UTF-8 JSON)        |
//+------------------------------------------------------------------+
string ReadTextFile(const string path)
{
   int handle = FileOpen(path, FILE_READ | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_COMMON);
   if(handle == INVALID_HANDLE)
      return "";

   string content = "";
   while(!FileIsEnding(handle))
      content += FileReadString(handle);

   FileClose(handle);
   return content;
}

//+------------------------------------------------------------------+
//| WRITE RESULT FILE (atomic .tmp → rename)                          |
//+------------------------------------------------------------------+
void WriteResult(const string batch_id, const string login,
                 const string action, const string symbol,
                 const string order_type, const double requested_volume,
                 const long exec_ticket, const double exec_volume,
                 const double exec_price,
                 const string status, const string error)
{
   string filename = ResultFolder + login + "_result.json";
   string tmppath  = ResultFolder + login + "_result.tmp";

   string json = "{";
   json += "\"batch_id\":\"" + batch_id + "\",";
   json += "\"login\":" + login + ",";
   json += "\"action\":\"" + action + "\",";
   json += "\"symbol\":\"" + symbol + "\",";
   json += "\"order_type\":\"" + order_type + "\",";
   json += "\"requested_volume\":" + DoubleToString(requested_volume, 5) + ",";
   json += "\"exec_ticket\":" + IntegerToString(exec_ticket) + ",";
   json += "\"exec_volume\":" + DoubleToString(exec_volume, 5) + ",";
   json += "\"exec_price\":" + DoubleToString(exec_price, 5) + ",";
   json += "\"status\":\"" + status + "\",";
   json += "\"error\":\"" + EscapeJSON(error) + "\",";
   json += "\"timestamp\":\"" + TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS) + "\"";
   json += "}";

   // FILE_ANSI forces ASCII/UTF-8 output — without it MQL5 writes UTF-16 LE (BOM 0xFF 0xFE)
   // which Python cannot decode as UTF-8
   int handle = FileOpen(tmppath, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(handle != INVALID_HANDLE)
   {
      FileWriteString(handle, json);
      FileClose(handle);
      
      // Delete old result file if it exists
      if(FileIsExist(filename, FILE_COMMON))
         FileDelete(filename, FILE_COMMON);
      
      // Copy temp to final, then delete temp
      FileCopy(tmppath, FILE_COMMON, filename, FILE_COMMON);
      FileDelete(tmppath, FILE_COMMON);
   }
   else
   {
      Print("[MaKebs][ERROR] Cannot write result: ", filename);
   }
}

//+------------------------------------------------------------------+
//| ESCAPE JSON STRING                                                |
//+------------------------------------------------------------------+
string EscapeJSON(const string text)
{
   string result = "";
   for(int i = 0; i < StringLen(text); i++)
   {
      ushort c = StringGetCharacter(text, i);
      if(c == '"')
         result += "\\\"";
      else if(c == '\\')
         result += "\\\\";
      else if(c == '\n')
         result += "\\n";
      else
         result += ShortToString(c);
   }
   return result;
}

//+------------------------------------------------------------------+
//| SIMPLE JSON VALUE EXTRACTOR (flat keys only)                      |
//+------------------------------------------------------------------+
string ExtractJSONValue(const string json, const string key)
{
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0) return "";

   pos += StringLen(search);
   while(pos < StringLen(json) && (StringGetCharacter(json, pos) == ' ' || StringGetCharacter(json, pos) == '\t'))
      pos++;

   if(pos >= StringLen(json)) return "";

   ushort firstChar = StringGetCharacter(json, pos);

   if(firstChar == '"')
   {
      pos++;
      string value = "";
      while(pos < StringLen(json))
      {
         ushort c = StringGetCharacter(json, pos);
         if(c == '"' && (pos == 0 || StringGetCharacter(json, pos - 1) != '\\'))
            break;
         value += ShortToString(c);
         pos++;
      }
      return value;
   }
   else
   {
      string value = "";
      while(pos < StringLen(json))
      {
         ushort c = StringGetCharacter(json, pos);
         if(c == ',' || c == '}' || c == ']')
            break;
         value += ShortToString(c);
         pos++;
      }
      StringTrimRight(value);
      StringTrimLeft(value);
      return value;
   }
}
