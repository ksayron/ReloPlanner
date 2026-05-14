import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

type LockoutReason = 'blocked' | 'session_expired';

function normalizeResponseMessage(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return '';
  }
  const maybeMessage = (data as { message?: unknown }).message;
  if (typeof maybeMessage === 'string') {
    return maybeMessage;
  }
  if (Array.isArray(maybeMessage) && typeof maybeMessage[0] === 'string') {
    return maybeMessage[0];
  }
  return '';
}

function resolveLockoutReason(message: string): LockoutReason {
  const normalized = message.trim().toLowerCase();
  if (normalized.includes('blocked')) {
    return 'blocked';
  }
  return 'session_expired';
}

function shouldSkipUnauthorizedRedirect(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/oauth/exchange') ||
    url.includes('/auth/oauth/complete-email')
  );
}

function resolveLoginPath(pathname: string): string {
  if (pathname === '/internal' || pathname.startsWith('/internal/')) {
    return '/internal/login';
  }
  return '/login';
}

function redirectToLogin(reason: LockoutReason) {
  const currentUrl = new URL(window.location.href);
  const loginPath = resolveLoginPath(currentUrl.pathname);
  const loginUrl = new URL(loginPath, currentUrl.origin);
  loginUrl.searchParams.set('lockout', reason);
  loginUrl.searchParams.set('from', `${currentUrl.pathname}${currentUrl.search}`);

  const alreadyAtLogin = currentUrl.pathname === loginPath;
  if (alreadyAtLogin) {
    window.history.replaceState({}, '', `${loginUrl.pathname}${loginUrl.search}`);
    return;
  }
  window.location.assign(`${loginUrl.pathname}${loginUrl.search}`);
}

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.response) {
      return Promise.reject(error);
    }

    if (error.response.status === 401 && !shouldSkipUnauthorizedRedirect(error.config?.url)) {
      const message = normalizeResponseMessage(error.response.data);
      const reason = resolveLockoutReason(message);
      localStorage.removeItem('token');
      redirectToLogin(reason);
    }

    return Promise.reject(error);
  },
);

export default client;
