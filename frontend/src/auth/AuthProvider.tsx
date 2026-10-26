import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import * as api from '../api'
import { ApiError, AUTH_EXPIRED, getAccessToken, setAccessToken, tokenExpiresAt } from '../api/client'
import { resetSessionLock } from './sessionLock'
import type { CurrentUser } from '../api/types'

interface AuthState {
  user: CurrentUser | null
  loading: boolean
  error: unknown
  signIn: (username: string, password: string, signal?: AbortSignal) => Promise<CurrentUser>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
  clearSession: () => void
}
const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(() => !!getAccessToken())
  const [error, setError] = useState<unknown>(null)
  const revision = useRef(0)
  const clearSession = useCallback(() => {
    revision.current++; setAccessToken(null); setUser(null); setError(null); setLoading(false); resetSessionLock()
  }, [])
  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED, clearSession)
    return () => window.removeEventListener(AUTH_EXPIRED, clearSession)
  }, [clearSession])
  useEffect(() => {
    if (!getAccessToken()) return
    const controller = new AbortController()
    const currentRevision = revision.current
    api.me(controller.signal).then((current) => {
      if (!controller.signal.aborted && revision.current === currentRevision) { setUser(current); setError(null) }
    }).catch((cause) => {
      if (!controller.signal.aborted && revision.current === currentRevision) setError(cause)
    }).finally(() => {
      if (!controller.signal.aborted && revision.current === currentRevision) setLoading(false)
    })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!user) return
    const timer = setTimeout(clearSession, Math.max(0, tokenExpiresAt() - Date.now()))
    return () => clearTimeout(timer)
  }, [user, clearSession])

  const refreshUser = useCallback(async () => {
    const currentRevision = revision.current
    setLoading(true)
    try { const current = await api.me(); if (revision.current === currentRevision) { setUser(current); setError(null) } }
    catch (cause) { if (revision.current === currentRevision) setError(cause) }
    finally { if (revision.current === currentRevision) setLoading(false) }
  }, [])
  const signIn = async (username: string, password: string, signal?: AbortSignal) => {
    username = username.trim()
    const attempt = ++revision.current
    setAccessToken(null); resetSessionLock()
    const checkCurrent = () => {
      if (signal?.aborted || attempt !== revision.current) throw new ApiError('Yêu cầu đăng nhập đã được thay thế.', 'SUPERSEDED')
    }
    try {
      const { access_token } = await api.login(username, password, signal)
      checkCurrent(); setAccessToken(access_token)
      const current = await api.me(signal)
      checkCurrent(); setUser(current); setError(null)
      return current
    } catch (cause) {
      if (attempt === revision.current) clearSession()
      throw cause
    }
  }
  const signOut = async () => {
    const usedToken = getAccessToken()
    try { await api.logout() }
    catch (cause) { if (!(cause instanceof ApiError && cause.status === 401)) throw cause }
    if (getAccessToken() === usedToken) clearSession()
  }
  return <AuthContext.Provider value={{ user, loading, error, signIn, signOut, refreshUser, clearSession }}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider is required')
  return auth
}
