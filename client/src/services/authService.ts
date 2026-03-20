import api from './api.js';

interface AuthResponse {
  token: string;
  userId: string;
  username: string;
}

export async function register(
  email: string,
  username: string,
  password: string
): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/api/auth/register', {
    email,
    username,
    password,
  });
  return res.data;
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/api/auth/login', {
    email,
    password,
  });
  return res.data;
}

export function saveAuth(data: AuthResponse): void {
  localStorage.setItem('token', data.token);
  localStorage.setItem('userId', data.userId);
  localStorage.setItem('username', data.username);
}

export function clearAuth(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  localStorage.removeItem('username');
}

export function getStoredAuth(): {
  token: string | null;
  userId: string | null;
  username: string | null;
} {
  return {
    token: localStorage.getItem('token'),
    userId: localStorage.getItem('userId'),
    username: localStorage.getItem('username'),
  };
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem('token');
}