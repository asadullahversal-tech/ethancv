import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import PrimaryButton from '../components/controls/PrimaryButton'
import PrimarySelect from '../components/controls/PrimarySelect'
import { useAuthStore } from '../stores/auth'

const API_BASE = 'http://127.0.0.1:8080'

async function authRequest(
  mode: 'login' | 'signup',
  payload: { phone: string; password: string; name?: string }
) {
  const res = await fetch(`${API_BASE}/api/auth/${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error || `${mode} failed`)
  }
  return body as { token: string; user: { id: string; phone: string; name?: string } }
}

async function fetchMe(token: string) {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error || 'Auth check failed')
  return body as { user: { id: string; phone: string; name?: string } }
}

export default function AuthPage() {
  const navigate = useNavigate()
  const { user, setSession } = useAuthStore()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hydrated = useRef(false)

  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    const token = localStorage.getItem('auth_token')
    if (!token) return
    fetchMe(token)
      .then((res) => {
        setSession({ token, user: res.user })
      })
      .catch(() => {
        localStorage.removeItem('auth_token')
      })
  }, [])

  useEffect(() => {
    if (user) navigate('/')
  }, [user, navigate])

  const submit = async () => {
    try {
      setError(null)
      setLoading(true)
      const { token, user } = await authRequest(mode, { phone, password, name })
      localStorage.setItem('auth_token', token)
      setSession({ token, user })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action échouée')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[rgba(230,235,220,0.5)] px-4 py-10">
      <div className="mx-auto max-w-md rounded-lg border border-[rgba(98,120,85,0.35)] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">
            {mode === 'login' ? 'Se connecter' : "Créer un compte"}
          </h1>
          <PrimarySelect
            aria-label="Mode"
            value={mode}
            onChange={(v) => setMode(v as 'login' | 'signup')}
            className="w-[140px]"
          >
            <option value="login">Connexion</option>
            <option value="signup">Inscription</option>
          </PrimarySelect>
        </div>

        <div className="mt-4 space-y-3">
          {mode === 'signup' ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-800">Nom</span>
              <input
                type="text"
                className="u-input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Votre nom"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-800">Téléphone</span>
            <input
              type="tel"
              className="u-input w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+243 999 000 000"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-800">Mot de passe</span>
            <input
              type="password"
              className="u-input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex items-center justify-between">
          <PrimaryButton type="button" disabled={loading} onClick={submit} className="w-full justify-center">
            {loading ? '...' : mode === 'login' ? 'Connexion' : 'Créer mon compte'}
          </PrimaryButton>
        </div>

        <p className="mt-3 text-center text-xs text-neutral-600">
          Vos données d’utilisateur sont protégées par JWT (stockage local).
        </p>
      </div>
    </div>
  )
}

