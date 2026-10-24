const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

let accessToken: string | null = localStorage.getItem('td_access');

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem('td_access', token);
  else localStorage.removeItem('td_access');
}

export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  opts: RequestInit & { json?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (opts.auth !== false && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers,
    credentials: 'include',
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  });

  if (res.status === 401 && opts.auth !== false) {
    const refreshed = await tryRefresh();
    if (refreshed) return api(path, opts);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      data?.error?.code ?? 'error',
      data?.error?.message ?? res.statusText,
      res.status,
    );
  }
  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      setAccessToken(null);
      return false;
    }
    const data = (await res.json()) as { accessToken: string };
    setAccessToken(data.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}

export async function apiForm<T>(path: string, form: FormData): Promise<T> {
  const headers = new Headers();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: form,
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      data?.error?.code ?? 'error',
      data?.error?.message ?? res.statusText,
      res.status,
    );
  }
  return data as T;
}
