export interface AuthUser {
  id: string
  phone: string
  name?: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

