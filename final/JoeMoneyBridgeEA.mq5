// JoeMoney local MT5 bridge EA. Intended for a single demo account during testing.
#property strict
#property version "1.00"

input string BridgeUrl = "http://127.0.0.1:8765";
input string EaToken = "SET_A_DISTINCT_EA_TOKEN";
input int PollSeconds = 1;
input int SlippagePoints = 20;

ulong g_last_status_ms = 0;

int OnInit()
{
   if(PollSeconds < 1 || StringLen(EaToken) < 32)
      return INIT_PARAMETERS_INCORRECT;
   EventSetTimer(PollSeconds);
   Print("JoeMoney EA ready. MT5 login: ", (long)AccountInfoInteger(ACCOUNT_LOGIN));
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
   PollBridge();
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

   string message;
   ulong ticket = 0;
   bool placed = ExecuteOrder(symbol, order_type, volume, entry_price, tp_enabled, tp_distance, ticket, message);
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
      message = "Volume is outside broker limits.";
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
   string body = "{\"status\":\"" + (placed ? "placed" : "rejected") + "\",\"ticket\":\"" +
                 (string)ticket + "\",\"message\":\"" + JsonEscape(message) + "\"}";
   string response;
   int status;
   HttpRequest("POST", BridgeUrl + "/v1/commands/" + id + "/result", body, response, status);
   if(status != 200) Print("JoeMoney result acknowledgement failed, HTTP ", status, " ", response);
}

void SendStatus()
{
   string login = IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN));
   bool authorized = TerminalInfoInteger(TERMINAL_CONNECTED) && AccountInfoInteger(ACCOUNT_LOGIN) > 0;
   string message = authorized ? "MT5 login successful" : "MT5 disconnected or login failed";
   string body = "{\"login\":\"" + login + "\",\"connected\":" +
                 (authorized ? "true" : "false") +
                 ",\"message\":\"" + message + "\"}";
   string response;
   int status;
   HttpRequest("POST", BridgeUrl + "/v1/terminal/status", body, response, status);
}