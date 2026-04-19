import axios from 'axios';

const DEFAULT_API_ORIGIN = 'http://localhost:3000';
const apiOrigin = (import.meta.env.VITE_API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/+$/, '');
const apiPrefix = import.meta.env.VITE_API_PREFIX || '/api/v1';
const normalizedApiPrefix = apiPrefix.startsWith('/') ? apiPrefix : `/${apiPrefix}`;
const authBaseUrl = (import.meta.env.VITE_AUTH_BASE_URL || apiOrigin).replace(/\/+$/, '');

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
    // Check if the response includes a new authorization token (Devise JWT)
    const token = response.headers.authorization;
    if (token) {
      localStorage.setItem('token', token.split(' ')[1] || token);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Uncomment when routing is ready
      // window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (data) => axios.post(`${authBaseUrl}/users/sign_in`, { user: data }),
  register: (data) => axios.post(`${authBaseUrl}/users`, { user: data }),
  logout: () => axios.delete(`${authBaseUrl}/users/sign_out`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  })
};

export const groupMembersApi = {
  add: (groupId, email) => api.post(`/groups/${groupId}/members`, {
    member: { email }
  })
};

export const groupInvitesApi = {
  list: (groupId) => api.get(`/groups/${groupId}/invites`),
  create: (groupId, { expiresInHours = 48, noExpiry = false } = {}) => api.post(`/groups/${groupId}/invites`, {
    invite: noExpiry ? { no_expiry: true } : { expires_in_hours: expiresInHours }
  }),
  revoke: (groupId, inviteId) => api.delete(`/groups/${groupId}/invites/${inviteId}`)
};

export const inviteLinksApi = {
  get: (token) => api.get(`/invites/${token}`),
  accept: (token) => api.post(`/invites/${token}/accept`)
};

export default api;
