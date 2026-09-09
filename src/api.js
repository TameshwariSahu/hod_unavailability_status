// ===== Base URL =====
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// ===== Shared fetch wrapper =====
async function request(path, options = {}) {
  const token = localStorage.getItem('hod_token');

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || 'Request failed.');
  }

  return body;
}

// ===== Endpoints =====
export const api = {
  // Auth
  setup: (data) => request('/auth/setup', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  login: (data) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Departments
  departments: () => request('/departments'),
  createDepartment: (department_name) => request('/departments', {
    method: 'POST',
    body: JSON.stringify({ department_name }),
  }),

  // HOD members
  hods: () => request('/hods'),
  createHod: (data) => request('/hods', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Availability status
  statuses: () => request('/availability-status'),
  createStatus: (data) => request('/availability-status', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Users (admin)
  users: () => request('/users'),
  setPassword: (id, password) => request(`/users/${id}/password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  }),
};
