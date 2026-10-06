// JoeMoney local MT5 bridge EA. Runs one terminal per managed account slot.
#property strict
#property version "4.02"

input string BridgeUrl = "http://127.0.0.1:8765";
input string EaToken = "dab2da53cd7c4cd9ad0116a9a85f1dab814360e3e04a42c1a45b6f6b6a34b8c2";
input int PollSeconds = 1;
input int SlippagePoints = 20;
input string ReportSymbols = "Volatility 10 Index,Volatility 25 Index,Volatility 50 Index,Volatility 75 Index,Volatility 100 Index,Volatility 10 (1s) Index,Volatility 25 (1s) Index,Volatility 50 (1s) Index,Volatility 75 (1s) Index,Volatility 100 (1s) Index,Boom 500 Index,Boom 1000 Index,Crash 500 Index,Crash 1000 Index,Step Index 10,Step Index 25,Step Index 50,Step Index 75,Step Index 100,frxXAUUSD,frxXAGUSD,frxEURUSD,frxGBPUSD,frxUSDJPY,frxAUDUSD,frxUSDCAD,frxUSDCHF,frxEURGBP,frxNZDUSD,BTCUSD,ETHUSD";
input int ReportSeconds = 3;

ulong g_last_status_ms = 0;
ulong g_last_report_ms = 0;
ulong g_last_report_warn_ms = 0;
ulong g_last_symbol_warn_ms = 0;
ulong g_last_status_warn_ms = 0;
string g_last_response_headers = "";
string g_pending_result_id = "";
string g_pending_result_path = "";
string g_pending_result_body = "";

int OnInit()
{
   if(PollSeconds < 1 || ReportSeconds < 1 || StringLen(EaToken) < 32)
      return INIT_PARAMETERS_INCORRECT;
   EventSetTimer(PollSeconds);
   Print("JoeMoney EA build 4.02 ready. MT5 login: ", (long)AccountInfoInteger(ACCOUNT_LOGIN));
   Print("Allow WebRequest for ", BridgeUrl, " in MT5 Options > Expert Advisors.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   if(GetTickCount64() - g_last_status_ms >= 10000)
   {
      SendStatus();
      g_last_status_ms = GetTickCount64();
   }
   if(!TerminalInfoInteger(TERMINAL_CONNECTED) || AccountInfoInteger(ACCOUNT_LOGIN) <= 0)
      return;
   if(GetTickCount64() - g_last_report_ms >= (ulong)ReportSeconds * 1000)
   {
      g_last_report_ms = GetTickCount64();
      ReportPrices();
   }
   PollBridge();
   PollCloses();
}

string AuthHeaders()
{
   return "Authorization: Bearer " + EaToken + "\r\nContent-Type: application/json\r\n";
}

bool HttpRequest(const string method, const string url, const string body,
                 string &response, int &http_status)
{
   char data[];
   char result[];
   string result_headers;
   if(StringLen(body) > 0)
   {
      StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
      if(ArraySize(data) > 0 && data[ArraySize(data) - 1] == 0)
         ArrayResize(data, ArraySize(data) - 1);
   }
   else
      ArrayResize(data, 0);

   ResetLastError();
   http_status = WebRequest(method, url, AuthHeaders(), 5000, data, result, result_headers);
   g_last_response_headers = result_headers;
   if(http_status == -1)
   {
      Print("JoeMoney WebRequest failed: ", GetLastError(), " (check MT5 WebRequest allowlist)");
      response = "";
      return false;
   }
   response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   return true;
}

void PollBridge()
{
   if(StringLen(g_pending_result_id) > 0)
   {
      string retry_response;
      int retry_status;
      if(!HttpRequest("POST", BridgeUrl + g_pending_result_path,
                      g_pending_result_body, retry_response, retry_status) || retry_status != 200)
      {
         Print("JoeMoney result retry pending for command ", g_pending_result_id,
               ", HTTP ", retry_status, ", response: ", retry_response);
         return;
      }
      Print("JoeMoney result retry acknowledged for command ", g_pending_result_id);
      g_pending_result_id = "";
      g_pending_result_path = "";
      g_pending_result_body = "";
      return;
   }

   string url = BridgeUrl + "/v1/commands/next?login=" + IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));
   string response;
   int status;
   if(!HttpRequest("GET", url, "", response, status)) return;
   if(status == 204 || status == 401 || status == 403) return;
   if(status != 200 || StringLen(response) == 0) return;

   string fields[];
   ushort separator = StringGetCharacter("|", 0);
   int count = StringSplit(response, separator, fields);
   if(count != 7)
   {
      Print("JoeMoney received malformed command: ", response);
      return;
   }

   string command_id = fields[0];
   string symbol = fields[1];
   string order_type = fields[2];
   double volume = StringToDouble(fields[3]);
   double entry_price = StringToDouble(fields[4]);
   bool tp_enabled = fields[5] == "1";
   double tp_distance = StringToDouble(fields[6]);

      Print("JoeMoney processing ", order_type, " ", symbol, " volume ", DoubleToString(volume, 2),
         " entry ", DoubleToString(entry_price, 8), " command ", command_id);
   string message;
   ulong ticket = 0;
   bool placed = ExecuteOrder(symbol, order_type, volume, entry_price, tp_enabled, tp_distance, ticket, message);
      Print("JoeMoney execution ", (placed ? "accepted" : "rejected"), " command ", command_id,
         ": ", message);
   SendResult(command_id, placed, ticket, message);
}

bool ExecuteOrder(const string symbol, const string order_type, const double requested_volume,
                  const double requested_entry, const bool tp_enabled, const double tp_distance,
                  ulong &ticket, string &message)
{
   ticket = 0;
   if(!SymbolSelect(symbol, true))
   {
      message = "Could not select broker symbol: " + symbol;
      return false;
   }
   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
   {
      message = "No current quote for " + symbol;
      return false;
   }

   double min_volume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double max_volume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double volume_step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   if(requested_volume < min_volume || requested_volume > max_volume || volume_step <= 0)
   {
      message = "Volume " + DoubleToString(requested_volume, 4) + " is outside broker limits for " + symbol +
             " (min " + DoubleToString(min_volume, 4) + ", max " + DoubleToString(max_volume, 4) +
             ", step " + DoubleToString(volume_step, 4) + ").";
      return false;
   }
   double volume = MathFloor(requested_volume / volume_step + 1e-8) * volume_step;
   if(MathAbs(volume - requested_volume) > 1e-8)
   {
      message = "Volume does not match this symbol's volume step.";
      return false;
   }

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double tp = 0;
   bool is_buy = StringFind(order_type, "BUY") >= 0;
   bool market = StringFind(order_type, "MARKET_") == 0;
   if(tp_enabled)
   {
      tp = NormalizeDouble((is_buy ? tick.ask + tp_distance : tick.bid - tp_distance), digits);
      double stops_distance = SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL) * SymbolInfoDouble(symbol, SYMBOL_POINT);
      if((is_buy && tp <= tick.ask + stops_distance) || (!is_buy && tp >= tick.bid - stops_distance))
      {
         message = "Spot-based TP is inside the broker's minimum stop distance.";
         return false;
      }
   }

   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   request.symbol = symbol;
   request.volume = volume;
   request.magic = 26060401;
   request.deviation = SlippagePoints;
   request.type_time = ORDER_TIME_GTC;
   request.tp = tp;

   if(order_type == "MARKET_BUY" || order_type == "MARKET_SELL")
   {
      request.action = TRADE_ACTION_DEAL;
      request.type = is_buy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      request.price = is_buy ? tick.ask : tick.bid;
      request.type_filling = GetMarketFilling(symbol);
   }
   else
   {
      request.action = TRADE_ACTION_PENDING;
      request.price = NormalizeDouble(requested_entry, digits);
      request.type_filling = ORDER_FILLING_RETURN;
      if(order_type == "BUY_LIMIT") request.type = ORDER_TYPE_BUY_LIMIT;
      else if(order_type == "SELL_LIMIT") request.type = ORDER_TYPE_SELL_LIMIT;
      else if(order_type == "BUY_STOP") request.type = ORDER_TYPE_BUY_STOP;
      else if(order_type == "SELL_STOP") request.type = ORDER_TYPE_SELL_STOP;
      else { message = "Unsupported order type."; return false; }

      if(tp_enabled && ((is_buy && tp <= request.price) || (!is_buy && tp >= request.price)))
      {
         message = "Spot-based TP is not on the profit side of this pending entry; adjust entry or TP distance.";
         return false;
      }
   }

   request.comment = "JoeMoney";
   ResetLastError();
   if(!OrderSend(request, result))
   {
      message = "OrderSend failed, error " + IntegerToString(GetLastError());
      return false;
   }
   if(result.retcode != TRADE_RETCODE_DONE && result.retcode != TRADE_RETCODE_PLACED && result.retcode != TRADE_RETCODE_DONE_PARTIAL)
   {
      message = "Broker rejected order, retcode " + IntegerToString((int)result.retcode) + ": " + result.comment;
      return false;
   }
   ticket = result.order;
   message = "Accepted by MT5, retcode " + IntegerToString((int)result.retcode);
   return true;
}

ENUM_ORDER_TYPE_FILLING GetMarketFilling(const string symbol)
{
   long mode = SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
   if((mode & SYMBOL_FILLING_FOK) != 0) return ORDER_FILLING_FOK;
   if((mode & SYMBOL_FILLING_IOC) != 0) return ORDER_FILLING_IOC;
   return ORDER_FILLING_RETURN;
}

string JsonEscape(const string value)
{
   string output = "";
   for(int i = 0; i < StringLen(value); i++)
   {
      ushort ch = StringGetCharacter(value, i);
      if(ch == '"' || ch == '\\') output += "\\" + ShortToString(ch);
      else if(ch == '\n') output += "\\n";
      else if(ch >= 32) output += ShortToString(ch);
   }
   return output;
}

void SendResult(const string id, const bool placed, const ulong ticket, const string message)
{
   g_pending_result_id = id;
   g_pending_result_path = "/v1/commands/" + id + "/result";
   g_pending_result_body = "{\"status\":\"" + (placed ? "placed" : "rejected") + "\",\"ticket\":\"" +
                 (string)ticket + "\",\"message\":\"" + JsonEscape(message) + "\"}";
   string response;
   int status;
   bool sent = HttpRequest("POST", BridgeUrl + g_pending_result_path,
                           g_pending_result_body, response, status);
   if(!sent || status != 200)
   {
      Print("JoeMoney result acknowledgement failed, HTTP ", status, ", response: ", response,
            ", headers: ", g_last_response_headers);
      return;
   }
   g_pending_result_id = "";
   g_pending_result_path = "";
   g_pending_result_body = "";
}

void PollCloses()
{
   if(StringLen(g_pending_result_id) > 0)
      return; // an order result retry is still in flight; try again next timer tick
   string url = BridgeUrl + "/v1/closes/next?login=" + IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));
   string response;
   int status;
   if(!HttpRequest("GET", url, "", response, status)) return;
   if(status == 204 || status == 401 || status == 403) return;
   if(status != 200 || StringLen(response) == 0) return;

   string fields[];
   ushort separator = StringGetCharacter("|", 0);
   if(StringSplit(response, separator, fields) != 2)
   {
      Print("JoeMoney received malformed close request: ", response);
      return;
   }

   string close_id = fields[0];
   ulong ticket = (ulong)StringToInteger(fields[1]);
   Print("JoeMoney processing close request ", close_id,
         ticket == 0 ? " (all positions)" : " (position " + (string)ticket + ")");
   string message;
   bool closed = ExecuteClose(ticket, message);
   Print("JoeMoney close ", close_id, closed ? " succeeded" : " failed", ": ", message);
   SendCloseResult(close_id, closed, message);
}

bool ExecuteClose(const ulong ticket, string &message)
{
   if(ticket == 0)
   {
      int closed = 0;
      int failed = 0;
      string first_failure = "";
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         ulong pos_ticket = PositionGetTicket(i);
         if(pos_ticket == 0)
            continue;
         string one_message;
         if(CloseOnePosition(pos_ticket, one_message))
            closed++;
         else
         {
            failed++;
            if(StringLen(first_failure) == 0)
               first_failure = one_message;
         }
      }
      message = "Closed " + IntegerToString(closed) + " position(s)" +
                (failed > 0 ? ", " + IntegerToString(failed) + " failed: " + first_failure : "");
      return failed == 0 && closed > 0;
   }
   if(!PositionSelectByTicket(ticket))
   {
      message = "Position " + (string)ticket + " not found; it may already be closed.";
      return false;
   }
   return CloseOnePosition(ticket, message);
}

bool CloseOnePosition(const ulong pos_ticket, string &message)
{
   if(!PositionSelectByTicket(pos_ticket))
   {
      message = "Position " + (string)pos_ticket + " not found.";
      return false;
   }
   string symbol = PositionGetString(POSITION_SYMBOL);
   long pos_type = PositionGetInteger(POSITION_TYPE);
   double volume = PositionGetDouble(POSITION_VOLUME);
   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
   {
      message = "No current quote for " + symbol;
      return false;
   }

   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   request.action = TRADE_ACTION_DEAL;
   request.position = pos_ticket;
   request.symbol = symbol;
   request.volume = volume;
   request.magic = 26060401;
   request.deviation = SlippagePoints;
   request.type = (pos_type == POSITION_TYPE_BUY) ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
   request.price = (request.type == ORDER_TYPE_SELL) ? tick.bid : tick.ask;
   request.type_filling = GetMarketFilling(symbol);
   request.comment = "JoeMoney close";
   ResetLastError();
   if(!OrderSend(request, result))
   {
      message = "OrderSend failed, error " + IntegerToString(GetLastError());
      return false;
   }
   if(result.retcode != TRADE_RETCODE_DONE && result.retcode != TRADE_RETCODE_DONE_PARTIAL)
   {
      message = "Broker rejected close, retcode " + IntegerToString((int)result.retcode) + ": " + result.comment;
      return false;
   }
   message = "Closed position " + (string)pos_ticket + ", retcode " + IntegerToString((int)result.retcode);
   return true;
}

void SendCloseResult(const string id, const bool closed, const string message)
{
   g_pending_result_id = id;
   g_pending_result_path = "/v1/closes/" + id + "/result";
   g_pending_result_body = "{\"status\":\"" + (closed ? "closed" : "failed") +
                 "\",\"message\":\"" + JsonEscape(message) + "\"}";
   string response;
   int status;
   bool sent = HttpRequest("POST", BridgeUrl + g_pending_result_path,
                           g_pending_result_body, response, status);
   if(!sent || status != 200)
   {
      Print("JoeMoney close acknowledgement failed, HTTP ", status, ", response: ", response,
            ", headers: ", g_last_response_headers);
      return;
   }
   g_pending_result_id = "";
   g_pending_result_path = "";
   g_pending_result_body = "";
}

void SendStatus()
{
   string login = IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));
   string server = AccountInfoString(ACCOUNT_SERVER);
   bool authorized = TerminalInfoInteger(TERMINAL_CONNECTED) && AccountInfoInteger(ACCOUNT_LOGIN) > 0;
   string message = authorized
      ? "MT5 login successful on " + server
      : "MT5 disconnected or login failed on " + server;
   double balance = authorized ? AccountInfoDouble(ACCOUNT_BALANCE) : 0;
   string currency = authorized ? AccountInfoString(ACCOUNT_CURRENCY) : "";
   string body = "{\"login\":\"" + login + "\",\"connected\":" +
                 (authorized ? "true" : "false") +
                 ",\"message\":\"" + JsonEscape(message) + "\"," +
                 "\"server\":\"" + JsonEscape(server) + "\"," +
                 "\"balance\":" + DoubleToString(balance, 2) +
                 ",\"currency\":\"" + JsonEscape(currency) + "\"}";
   string response;
   int status;
   bool sent = HttpRequest("POST", BridgeUrl + "/v1/terminal/status", body, response, status);
   if((!sent || status != 200) && GetTickCount64() - g_last_status_warn_ms >= 30000)
   {
      g_last_status_warn_ms = GetTickCount64();
      Print("JoeMoney heartbeat failed: login ", login, ", MT5 server '", server,
            "', terminal connected ", (TerminalInfoInteger(TERMINAL_CONNECTED) ? "yes" : "no"),
            ", account trade allowed ", (AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) ? "yes" : "no"),
            ", HTTP ", status, ", response: ", response, ", headers: ", g_last_response_headers);
   }
}

void ReportPrices()
{
   string names[];
   ushort separator = StringGetCharacter(",", 0);
   int count = StringSplit(ReportSymbols, separator, names);
   if(count <= 0)
      return;

   string ticks = "";
   string skipped = "";
   int reported = 0;
   for(int i = 0; i < count && reported < 200; i++)
   {
      string name = names[i];
      StringTrimLeft(name);
      StringTrimRight(name);
      if(StringLen(name) == 0)
         continue;
      if(!SymbolSelect(name, true))
      {
         if(StringLen(skipped) > 0) skipped += ", ";
         skipped += name + " (select failed)";
         continue;
      }
      MqlTick tick;
      if(!SymbolInfoTick(name, tick))
      {
         if(StringLen(skipped) > 0) skipped += ", ";
         skipped += name + " (no tick)";
         continue;
      }
      double volume_min = SymbolInfoDouble(name, SYMBOL_VOLUME_MIN);
      double volume_max = SymbolInfoDouble(name, SYMBOL_VOLUME_MAX);
      double volume_step = SymbolInfoDouble(name, SYMBOL_VOLUME_STEP);
      if(reported > 0)
         ticks += ",";
      ticks += "{\"symbol\":\"" + JsonEscape(name) + "\",\"bid\":" + DoubleToString(tick.bid, 8) +
               ",\"ask\":" + DoubleToString(tick.ask, 8) +
               ",\"volume_min\":" + DoubleToString(volume_min, 4) +
               ",\"volume_max\":" + DoubleToString(volume_max, 4) +
               ",\"volume_step\":" + DoubleToString(volume_step, 4) + "}";
      reported++;
   }
   if(StringLen(skipped) > 0 && GetTickCount64() - g_last_symbol_warn_ms >= 60000)
   {
      g_last_symbol_warn_ms = GetTickCount64();
      Print("JoeMoney symbols unavailable in this terminal: ", skipped);
   }
   if(reported == 0)
      return;

   string login = IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));
   string body = "{\"login\":\"" + login + "\",\"ticks\":[" + ticks + "]}";
   string response;
   int status;
   bool sent = HttpRequest("POST", BridgeUrl + "/v1/prices", body, response, status);
   if(!sent)
      return;
   if(status != 200 && GetTickCount64() - g_last_report_warn_ms >= 60000)
   {
      g_last_report_warn_ms = GetTickCount64();
      Print("JoeMoney price report failed, HTTP ", status, ", response: ", response,
            ", headers: ", g_last_response_headers);
   }
}
