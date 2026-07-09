// Centralized API client. Replaces the previous global window.fetch override:
// it attaches the auth token to /api requests and signals a logout on 401,
// without touching fetch for unrelated (third-party/asset) requests.

const TOKEN_KEY = 'onyx_auth_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Fired when the server rejects our token (expired/invalid). App listens for
// this to drop back to the login screen.
export const UNAUTHORIZED_EVENT = 'onyx-unauthorized';

export async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  return response;
}

// Build a URL for a protected /uploads asset. Static file requests come from
// <img>/<iframe>, which cannot send an Authorization header, so the token is
// passed as a query parameter that the server also accepts.
export function uploadUrl(path) {
  const token = getToken();
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}
