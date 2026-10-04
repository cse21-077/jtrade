type Request = {
  method?: string;
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
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!isSameOrigin(req)) return res.status(403).json({ error: 'Cross-origin request rejected.' });

  const cookieHeader = req.headers.cookie || '';
  const accessToken = readCookie(Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader, 'deriv_oauth');
  if (!accessToken) return res.status(401).json({ error: 'Your Deriv sign-in has expired. Sign in again.' });

  const accountsResponse = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const accountsPayload = await accountsResponse.json();
  if (!accountsResponse.ok) {
    return res.status(accountsResponse.status).json({
      error: accountsPayload.errors?.[0]?.message || 'Could not retrieve your Deriv accounts.',
    });
  }

  const accounts = Array.isArray(accountsPayload.data) ? accountsPayload.data : [];
  return res.status(200).json({
    accounts: accounts
      .filter((account: { status?: string; account_id?: string; account_type?: string }) =>
        account.status === 'active' && typeof account.account_id === 'string' &&
        (account.account_type === 'demo' || account.account_type === 'real')
      )
      .map((account: { account_id: string; account_type: 'demo' | 'real'; balance: number; currency: string }) => ({
        accountId: account.account_id,
        accountType: account.account_type,
        balance: Number(account.balance) || 0,
        currency: account.currency || 'USD',
      })),
  });
}
