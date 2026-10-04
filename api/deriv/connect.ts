type Request = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type Response = {
  status: (code: number) => Response;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

const readCookie = (cookieHeader: string, name: string) => {
  const entry = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
};

const isSameOrigin = (req: Request) => {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin || !host) return false;
  const forwardedHost = Array.isArray(host) ? host[0] : host;
  try {
    return new URL(origin).host === forwardedHost;
  } catch {
    return false;
  }
};

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!isSameOrigin(req)) return res.status(403).json({ error: 'Cross-origin request rejected.' });

  const cookieHeader = req.headers.cookie || '';
  const accessToken = readCookie(Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader, 'deriv_oauth');
  if (!accessToken) return res.status(401).json({ error: 'Your Deriv sign-in has expired. Sign in again.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body as Record<string, unknown>;
  const accountType = body?.accountType === 'real' ? 'real' : body?.accountType === 'demo' ? 'demo' : null;
  if (!accountType) return res.status(400).json({ error: 'Select a valid Demo or Real account.' });

  const headers = { Authorization: `Bearer ${accessToken}` };
  const accountsResponse = await fetch('https://api.derivws.com/trading/v1/options/accounts', { headers });
  const accountsPayload = await accountsResponse.json();
  if (!accountsResponse.ok) {
    return res.status(accountsResponse.status).json({
      error: accountsPayload.errors?.[0]?.message || 'Could not retrieve your Deriv accounts.',
    });
  }

  const accounts = Array.isArray(accountsPayload.data) ? accountsPayload.data : [];
  const account = accounts.find((item: { account_type?: string; status?: string }) =>
    item.account_type === accountType && item.status === 'active'
  );
  if (!account) return res.status(404).json({ error: `No active ${accountType} Options account is available.` });

  const otpResponse = await fetch(
    `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(account.account_id)}/otp`,
    { method: 'POST', headers }
  );
  const otpPayload = await otpResponse.json();
  if (!otpResponse.ok || typeof otpPayload.data?.url !== 'string') {
    return res.status(otpResponse.status || 502).json({
      error: otpPayload.errors?.[0]?.message || 'Could not start the Deriv trading session.',
    });
  }

  return res.status(200).json({
    url: otpPayload.data.url,
    account: {
      accountId: account.account_id,
      accountType: account.account_type,
      balance: account.balance,
      currency: account.currency,
    },
  });
}