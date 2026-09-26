import axios from 'axios';

const baseURL = `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api`;
const TOKEN_KEY = 'rl_token';

export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};

const api = axios.create({ baseURL, timeout: 30000 });

api.interceptors.request.use((config) => {
  const t = tokenStore.get();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    if (status === 401 && !url.includes('/auth/login')) onUnauthorized(error.response?.data?.message);
    return Promise.reject(normalizeError(error));
  },
);

/** Turn any axios error into { message, status, fieldErrors, isNetwork } with a friendly message. */
export function normalizeError(error) {
  if (error && error.__normalized) return error;
  const out = { __normalized: true, status: error?.response?.status || 0, fieldErrors: {}, isNetwork: false, message: 'Something went wrong. Please try again.', raw: error?.response?.data };
  if (error?.response) {
    const data = error.response.data;
    if (data && typeof data === 'object' && !(data instanceof Blob)) {
      out.message = data.message || out.message;
      out.fieldErrors = data.details?.fieldErrors || {};
    } else if (out.status === 413) out.message = 'The file or request is too large.';
    else if (out.status >= 500) out.message = 'The server had a problem. Please try again shortly.';
  } else if (error?.code === 'ECONNABORTED') {
    out.isNetwork = true;
    out.message = 'The request took too long. Check your connection and try again.';
  } else {
    out.isNetwork = true;
    out.message = 'No connection to the server. Check your internet and try again.';
  }
  return out;
}

/** Decode the friendly message from a Blob error body (file downloads). */
export async function withBlobMessage(err) {
  try {
    if (err?.raw instanceof Blob) {
      const parsed = JSON.parse(await err.raw.text());
      if (parsed?.message) return { ...err, message: parsed.message };
    }
  } catch { /* not JSON */ }
  return err;
}

export default api;
