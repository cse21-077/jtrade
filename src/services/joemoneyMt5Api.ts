export type Mt5OrderType =
  | 'MARKET_BUY'
  | 'MARKET_SELL'
  | 'BUY_LIMIT'
  | 'SELL_LIMIT'
  | 'BUY_STOP'
  | 'SELL_STOP';

export interface Mt5OrderRequest {
  symbol: string;
  order_type: Mt5OrderType;
  volume: number;
  entry_price: number;
  tp_enabled: boolean;
  tp_distance: number;
}

export interface Mt5Account {
  login: string;
  server: string;
  folder_path: string;
  is_active: boolean;
  terminal_running: boolean;
  ea_connected: boolean;
  last_seen: number | null;
  message: string;
}

export interface Mt5AccountRegistration {
  login: string;
  password: string;
  server: string;
}

export interface Mt5ProvisionResult {
  login: string;
  folder_path: string;
  launched: boolean;
  message: string;
}

export interface Mt5BridgeHealth {
  status: string;
  service: string;
  active_accounts: number;
}

export interface Mt5AccountStatus {
  login: string;
  terminal_connected: boolean;
  last_seen: number | null;
  message: string;
}

export interface Mt5QueuedOrder {
  id: string;
  status: string;
  ticket?: string | null;
  result_message?: string | null;
}

export interface Mt5Price {
  login: string;
  symbol: string;
  bid: number;
  ask: number;
  age_sec: number;
}

export interface Mt5PricesResponse {
  prices: Mt5Price[];
  now: number;
}

export interface Mt5OrderBatch {
  count: number;
  replayed: boolean;
  orders: Mt5QueuedOrder[];
}

const apiBaseUrl = (import.meta.env.VITE_JOEMONEY_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

const MENTOR_TOKEN_ENV = (import.meta.env.VITE_JOEMONEY_BRIDGE_KEY as string | undefined) ?? '';
const LEGACY_TOKEN_ENV = (import.meta.env.VITE_JOEMONEY_MENTOR_TOKEN as string | undefined) ?? '';
const TOKEN_STORAGE_KEY = 'joemoney-mentor-token';
const ACCOUNT_STORAGE_KEY = 'joemoney-mt5-account';

export interface StoredMt5Account {
  login: string;
  server: string;
}

export const getMentorToken = (): string =>
  MENTOR_TOKEN_ENV.trim() || LEGACY_TOKEN_ENV.trim() || window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';

export const getStoredMt5Account = (): StoredMt5Account | null => {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMt5Account;
    return typeof parsed.login === 'string' && typeof parsed.server === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

export const storeMt5Account = (account: StoredMt5Account) => {
  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
};

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error('The JoeMoney VPS API URL is not configured in the PWA build (VITE_JOEMONEY_API_URL).');
  }
  if (!apiBaseUrl.startsWith('https://')) {
    throw new Error('The VPS API URL must use HTTPS. Point VITE_JOEMONEY_API_URL at the Caddy-served domain.');
  }
  if (!token.trim()) {
    throw new Error('Enter the bridge key printed by start-bridge.ps1 on the VPS (or bake VITE_JOEMONEY_BRIDGE_KEY into the build).');
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'omit',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });

  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `JoeMoney API returned HTTP ${response.status}.`);
  }
  return payload as T;
}

export const getMt5BridgeHealth = (token: string) =>
  request<Mt5BridgeHealth>('/v1/status', token);

export const listMt5Accounts = (token: string) =>
  request<{ accounts: Mt5Account[] }>('/v1/accounts', token);

export const registerMt5Account = (token: string, account: Mt5AccountRegistration) =>
  request<Mt5ProvisionResult>('/v1/accounts', token, {
    method: 'POST',
    body: JSON.stringify(account),
  });

export const deactivateMt5Account = (token: string, login: string) =>
  request<{ status: string; login: string }>(`/v1/accounts/${encodeURIComponent(login)}/deactivate`, token, {
    method: 'POST',
  });

export const getMt5AccountStatus = (token: string, login: string) =>
  request<Mt5AccountStatus>(`/v1/status?login=${encodeURIComponent(login)}`, token);

export const queueMt5Orders = (token: string, login: string, orders: Mt5OrderRequest[]) =>
  request<Mt5OrderBatch>('/v1/orders', token, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ login, orders }),
  });

export const getMt5Order = (token: string, orderId: string) =>
  request<Mt5QueuedOrder>(`/v1/orders/${encodeURIComponent(orderId)}`, token);

export const getMt5Prices = (token: string, opts?: { login?: string; symbols?: string[] }) => {
  const params = new URLSearchParams();
  if (opts?.login) params.set('login', opts.login);
  if (opts?.symbols && opts.symbols.length > 0) params.set('symbols', opts.symbols.join(','));
  const query = params.toString();
  return request<Mt5PricesResponse>(`/v1/prices${query ? `?${query}` : ''}`, token);
};
