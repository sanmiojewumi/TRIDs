export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = Record<string, unknown>>(path: string, options?: { method?: string; body?: unknown; form?: FormData }): Promise<T> {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('n9.access') : null;
  const headers: Record<string, string> = { 'x-ninted-client': 'web' };
  if (!options?.form) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`/backend${path}`, {
    method: options?.method || 'GET',
    headers,
    credentials: 'include',
    body: options?.form ?? (options?.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
  if (!response.ok) throw new ApiError(data.message || 'Request failed', response.status, data.code);
  return data as T;
}

export function saveSession(accessToken: string) {
  sessionStorage.setItem('n9.access', accessToken);
}

export function clearSession() {
  sessionStorage.removeItem('n9.access');
}
