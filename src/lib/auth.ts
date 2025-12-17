import type { AuthResponse } from '../types/auth'

const API_BASE = 'http://127.0.0.1:8080'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error || 'Request failed')
  }
  return body as T
}

export function signup(payload: { phone: string; password: string; name?: string }) {
  return request<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function login(payload: { phone: string; password: string }) {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function me(token: string) {
  return request<{ user: AuthResponse['user'] }>('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

