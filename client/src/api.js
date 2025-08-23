import axios from 'axios';
export const API_BASE = 'http://localhost:5000';

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
});

export function setAuth(token) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}
