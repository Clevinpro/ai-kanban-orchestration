import axios from 'axios';

const UNAUTHORIZED_REDIRECT_PATH = '/auth';

const DEFAULT_API_BASE = 'http://localhost:4000/api';

function getBaseURL(): string {
  const meta = (
    import.meta as ImportMeta & {
      env?: { API_URL?: string };
    }
  ).env;

  return meta?.API_URL ?? DEFAULT_API_BASE;
}

export const apiClient = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  if (config.data !== undefined && !(config.data instanceof FormData)) {
    config.headers.set('Content-Type', 'application/json');
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      const onAuthShell = path.startsWith(`${UNAUTHORIZED_REDIRECT_PATH}`);
      if (!onAuthShell) {
        window.location.assign(UNAUTHORIZED_REDIRECT_PATH);
      }
    }
    return Promise.reject(error);
  },
);

export function getApiBaseURL(): string {
  return getBaseURL();
}

/** Browser redirect; base URL must already include `/api` (e.g. `http://localhost:4000/api`). */
export function getGoogleOAuthStartURL(): string {
  const base = getBaseURL().replace(/\/$/, '');
  return `${base}/auth/google`;
}
