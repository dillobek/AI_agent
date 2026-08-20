import axios from 'axios';

/**
 * sessionStorage (not localStorage) for the JWT: it's cleared when the tab
 * closes, which meaningfully shrinks the window an XSS payload could use a
 * stolen token in, compared to localStorage's indefinite persistence. This
 * is a pragmatic middle ground — the strongest option (httpOnly, SameSite
 * cookies + CSRF protection) would require the API to set cookies itself
 * instead of returning a bearer token; see docs/security.md for that
 * follow-up recommendation.
 */
const TOKEN_KEY = 'accessToken';

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearToken();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);
