import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { login, signup, me } from '../lib/auth'
import type { AuthUser } from '../types/auth'

interface AuthState {
  user: AuthUser | null
  token: string | null
  loading: boolean
  error: string | null
  initialized: boolean
  signup: (payload: { phone: string; password: string; name?: string }) => Promise<void>
  login: (payload: { phone: string; password: string }) => Promise<void>
  logout: () => void
  hydrate: () => Promise<void>
  clearError: () => void
  setSession: (session: { token: string; user: AuthUser }) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,
      error: null,
      initialized: false,

      clearError: () => set({ error: null }),

      setSession: (session) => {
        set({ user: session.user, token: session.token, error: null })
      },

      hydrate: async () => {
        const token = get().token
        if (!token) {
          set({ initialized: true })
          return
        }
        try {
          const res = await me(token)
          set({ user: res.user, initialized: true })
        } catch {
          set({ user: null, token: null, initialized: true })
        }
      },

      signup: async (payload) => {
        set({ loading: true, error: null })
        try {
          const res = await signup(payload)
          set({ user: res.user, token: res.token })
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Signup failed' })
          throw e
        } finally {
          set({ loading: false })
        }
      },

      login: async (payload) => {
        set({ loading: true, error: null })
        try {
          const res = await login(payload)
          set({ user: res.user, token: res.token })
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Login failed' })
          throw e
        } finally {
          set({ loading: false })
        }
      },

      logout: () => {
        try {
          localStorage.removeItem('auth_token')
        } catch {}
        set({ user: null, token: null, error: null })
      },
    }),
    {
      name: 'mako_auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.hydrate()
      },
    }
  )
)

