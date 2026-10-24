import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import * as api from '../api'
import { ApiError, AUTH_EXPIRED, getAccessToken, setAccessToken, tokenExpiresAt } from '../api/client'
import { clearRegistrationNotice, confirmRegistrationLogout, cooldownUntil, getRegistrationNotice, recordRegistration, rememberCooldown, type RegistrationNotice } from './registrationCompletion'
import type { CurrentUser } from '../api/types'

interface AuthState {
  user: CurrentUser | null
  loading: boolean
  error: unknown
  registrationNotice: RegistrationNotice | null
  finishingRegistration: boolean
  finalizationError: unknown
  signIn: (username: string, password: string, signal?: AbortSignal) => Promise<CurrentUser>
  signOut: () => Promise<void>
  finishRegistration: (classCode: string, registrationId: number) => Promise<void>
  refreshUser: () => Promise<void>
  clearSession: () => void
}
const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [registrationNotice, setRegistrationNotice] = useState(getRegistrationNotice)
  const [finishingRegistration, setFinishingRegistration] = useState(false)
  const [finalizationError, setFinalizationError] = useState<unknown>(null)
  const revision = useRef(0)
  const finishing = useRef<number | null>(null)
  const sessionRevision = revision.current
  const clearSession = useCallback(() => {
    revision.current++; setAccessToken(null); setUser(null); setError(null); setLoading(false)
    finishing.current = null; setFinishingRegistration(false); setFinalizationError(null)
  }, [])
  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED, clearSession)
    return () => window.removeEventListener(AUTH_EXPIRED, clearSession)
  }, [clearSession])
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
    if (cooldownUntil(username)) throw new ApiError('Tài khoản đang trong thời gian chờ trên trình duyệt này.', 'CLIENT_COOLDOWN')
    const attempt = ++revision.current
    setAccessToken(null)
    const checkCurrent = () => {
      if (signal?.aborted || attempt !== revision.current) throw new ApiError('Yêu cầu đăng nhập đã được thay thế.', 'SUPERSEDED')
    }
    try {
      const { access_token } = await api.login(username, password, signal)
      checkCurrent(); setAccessToken(access_token)
      const current = await api.me(signal)
      checkCurrent(); setUser(current); setError(null)
      clearRegistrationNotice(); setRegistrationNotice(null); setFinalizationError(null)
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
  const finishRegistration = async (classCode: string, registrationId: number) => {
    if (!user) return
    if (revision.current !== sessionRevision) {
      // The old POST succeeded, but its continuation cannot log out a new user.
      rememberCooldown(user.username)
      return
    }
    if (finishing.current === sessionRevision) return
    finishing.current = sessionRevision; setFinishingRegistration(true); setFinalizationError(null)
    // Save completion before logout: navigation/reload must not re-register.
    const pending = recordRegistration(user.username, classCode, registrationId)
    setRegistrationNotice(pending)
    try {
      await signOut()
      const confirmed = confirmRegistrationLogout(pending)
      if (revision.current === sessionRevision + 1 && !getAccessToken()) setRegistrationNotice(confirmed)
    } catch (cause) {
      if (revision.current === sessionRevision) setFinalizationError(cause)
      throw cause
    } finally {
      if (finishing.current === sessionRevision) { finishing.current = null; setFinishingRegistration(false) }
    }
  }
  return <AuthContext.Provider value={{ user, loading, error, registrationNotice, finishingRegistration, finalizationError, signIn, signOut, finishRegistration, refreshUser, clearSession }}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider is required')
  return auth
}
