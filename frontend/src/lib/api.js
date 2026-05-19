import axios from 'axios';

const DEFAULT_API_ORIGIN = 'http://localhost:3000';
const apiOrigin = (import.meta.env.VITE_API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/+$/, '');
const apiPrefix = import.meta.env.VITE_API_PREFIX || '/api/v1';
const normalizedApiPrefix = apiPrefix.startsWith('/') ? apiPrefix : `/${apiPrefix}`;
const authBaseUrl = (import.meta.env.VITE_AUTH_BASE_URL || apiOrigin).replace(/\/+$/, '');
export const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';

const clearClientAuthState = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('token_exp');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
  }
};

const api = axios.create({
  baseURL: `${apiOrigin}${normalizedApiPrefix}`,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Persist any token (and its expiry) the server sends back
    const token = response.headers.authorization;
    if (token) {
      const raw = token.split(' ')[1] || token;
      localStorage.setItem('token', raw);
      storeTokenExpiry(raw);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      clearClientAuthState();
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Token utilities
// ---------------------------------------------------------------------------

/**
 * Decode the expiry claim from a JWT without verifying its signature.
 * Returns a Date, or null if the token is malformed.
 */
export const decodeTokenExpiry = (token) => {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload?.exp) return null;
    return new Date(payload.exp * 1000);
  } catch {
    return null;
  }
};

/**
 * Returns true if the stored JWT is already expired (or absent).
 */
export const isTokenExpired = () => {
  const token = localStorage.getItem('token');
  if (!token) return true;
  const expiry = decodeTokenExpiry(token);
  if (!expiry) return true;
  return expiry <= new Date();
};

/**
 * Persist the token expiry alongside the token so AuthContext can schedule
 * a proactive logout without re-decoding the JWT on every render.
 */
export const storeTokenExpiry = (token) => {
  const expiry = decodeTokenExpiry(token);
  if (expiry) {
    localStorage.setItem('token_exp', expiry.toISOString());
  }
};

export const authApi = {
  login: (data) => axios.post(`${authBaseUrl}/users/sign_in`, { user: data }),
  register: (data) => axios.post(`${authBaseUrl}/users`, { user: data }),
  logout: () => axios.delete(`${authBaseUrl}/users/sign_out`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }),
  // Validates the stored JWT server-side and returns fresh user data.
  // Throws on 401 — the caller uses this to detect a dead/expired session.
  me: () => api.get('/auth/me'),
};

export const profileApi = {
  get: () => api.get('/profile'),
  update: (user) => api.patch('/profile', { user })
};

export const notificationsApi = {
  list: (limit = 20) => api.get('/notifications', { params: { limit } }),
  markRead: (notificationId) => api.patch(`/notifications/${notificationId}/read`),
  markAllRead: () => api.patch('/notifications/mark_all_read')
};

export const groupMembersApi = {
  add: (groupId, email) => api.post(`/groups/${groupId}/members`, {
    member: { email }
  }),
  remove: (groupId, memberId) => api.delete(`/groups/${groupId}/members/${memberId}`),
  suggestions: (groupId, query = '', limit = 10) => api.get(`/groups/${groupId}/members/suggestions`, {
    params: {
      ...(query ? { q: query } : {}),
      limit
    }
  })
};

export const groupInvitesApi = {
  list: (groupId) => api.get(`/groups/${groupId}/invites`),
  create: (groupId, { expiresInHours = 48, noExpiry = false } = {}) => api.post(`/groups/${groupId}/invites`, {
    invite: noExpiry ? { no_expiry: true } : { expires_in_hours: expiresInHours }
  }),
  revoke: (groupId, inviteId) => api.delete(`/groups/${groupId}/invites/${inviteId}`)
};

export const groupsApi = {
  update: (groupId, group) => api.patch(`/groups/${groupId}`, { group }),
  archive: (groupId) => api.post(`/groups/${groupId}/archive`),
  restore: (groupId) => api.post(`/groups/${groupId}/restore`),
  delete: (groupId) => api.delete(`/groups/${groupId}`)
};

export const inviteLinksApi = {
  get: (token) => api.get(`/invites/${token}`),
  accept: (token) => api.post(`/invites/${token}/accept`)
};

export default api;
