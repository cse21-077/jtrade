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

export interface Mt5ApiStatus {
  configured_login: string | null;
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

export interface Mt5OrderBatch {
  count: number;
  replayed: boolean;
  orders: Mt5QueuedOrder[];
}

const apiBaseUrl = (import.meta.env.VITE_JOEMONEY_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error('The JoeMoney VPS HTTPS tunnel URL is not configured in the PWA build.');
  }
  if (!apiBaseUrl.startsWith('https://')) {
    throw new Error('The VPS API URL must use HTTPS. Use the Cloudflare tunnel URL, not the VPS IP over HTTP.');
  }
  if (!token.trim()) {
    throw new Error('Enter the temporary demo API token from the VPS bridge window.');
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

export const getMt5ApiStatus = (token: string) =>
  request<Mt5ApiStatus>('/v1/status', token);

export const queueMt5Orders = (token: string, orders: Mt5OrderRequest[]) =>
  request<Mt5OrderBatch>('/v1/orders', token, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ orders }),
  });

export const getMt5Order = (token: string, orderId: string) =>
  request<Mt5QueuedOrder>(`/v1/orders/${encodeURIComponent(orderId)}`, token);
