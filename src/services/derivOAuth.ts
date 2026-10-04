export const DERIV_OAUTH_CLIENT_ID = '34zNDOokbtG0asz2JrtB0';
export const DERIV_OAUTH_CALLBACK_PATH = '/oauth/callback';

export const getDerivRedirectUri = () =>
  `${window.location.origin}${DERIV_OAUTH_CALLBACK_PATH}`;

const base64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const beginDerivOAuth = async (accountType: 'demo' | 'real') => {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));

  sessionStorage.setItem('deriv_oauth_verifier', verifier);
  sessionStorage.setItem('deriv_oauth_state', state);
  sessionStorage.setItem('deriv_oauth_account_type', accountType);

  const authorizationUrl = new URL('https://auth.deriv.com/oauth2/auth');
  authorizationUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: DERIV_OAUTH_CLIENT_ID,
    redirect_uri: getDerivRedirectUri(),
    scope: 'trade',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();

  window.location.assign(authorizationUrl.toString());
};

export const exchangeDerivOAuthCode = async (code: string, verifier: string) => {
  const response = await fetch('/api/oauth/token', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, verifier, redirectUri: getDerivRedirectUri() }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Deriv sign-in failed (${response.status}).`);
  }
};