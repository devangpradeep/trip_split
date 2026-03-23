import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
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
  login: (data) => axios.post('http://localhost:3000/users/sign_in', { user: data }),
  register: (data) => axios.post('http://localhost:3000/users', { user: data }),
  logout: () => axios.delete('http://localhost:3000/users/sign_out', {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  })
};

export default api;
