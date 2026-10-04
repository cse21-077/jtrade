const CLIENT_ID = '34zNDOokbtG0asz2JrtB0';
const ALLOWED_REDIRECT_URIS = new Set([
  'https://jtrade-seven.vercel.app/oauth/callback',
  'http://localhost:3000/oauth/callback',
]);

type Request = {
  method?: string;
  body?: unknown;
};

type Response = {
  status: (code: number) => Response;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body as Record<string, unknown>;
  const code = typeof body?.code === 'string' ? body.code : '';
  const verifier = typeof body?.verifier === 'string' ? body.verifier : '';
  const redirectUri = typeof body?.redirectUri === 'string' ? body.redirectUri : '';

  if (!code || verifier.length < 43 || verifier.length > 128 || !ALLOWED_REDIRECT_URIS.has(redirectUri)) {
    return res.status(400).json({ error: 'Invalid OAuth callback data.' });
  }

  const tokenResponse = await fetch('https://auth.deriv.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
  });
  const tokenPayload = await tokenResponse.json();

  if (!tokenResponse.ok || typeof tokenPayload.access_token !== 'string') {
    return res.status(tokenResponse.status || 502).json({
      error: tokenPayload.error_description || tokenPayload.error || 'Deriv rejected the authorization code.',
    });
  }

  const maxAge = Math.max(60, Math.min(Number(tokenPayload.expires_in) || 3600, 3600));
  res.setHeader('Set-Cookie', `deriv_oauth=${encodeURIComponent(tokenPayload.access_token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
  return res.status(200).json({ ok: true });
}