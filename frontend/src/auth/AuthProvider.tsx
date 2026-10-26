import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import * as api from '../api'
import { ApiError, AUTH_EXPIRED, getAccessToken, setAccessToken, subscribeAccessToken, tokenExpiresAt } from '../api/client'
import { resetSessionLock } from './sessionLock'
import type { CurrentUser } from '../api/types'

interface AuthState {
  user: CurrentUser | null
  loading: boolean
  error: unknown
  expired: boolean
  signIn: (username: string, password: string, signal?: AbortSignal) => Promise<CurrentUser>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
  clearSession: () => void
}
const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribeAccessToken, getAccessToken)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(() => !!getAccessToken())
  const [error, setError] = useState<unknown>(null)
  const [expired, setExpired] = useState(false)
  const revision = useRef(0)
  const signInRequest = useRef<AbortController | null>(null)
  const endSession = useCallback((wasExpired: boolean) => {
    revision.current++
    const pending = signInRequest.current
    signInRequest.current = null
    pending?.abort(wasExpired
      ? new ApiError('Phiên đăng nhập đã hết hạn hoặc không hợp lệ.', 'UNAUTHORIZED', 401)
      : new ApiError('Yêu cầu đăng nhập đã được thay thế.', 'SUPERSEDED'))
    setUser(null); setError(null); setLoading(false); setExpired(wasExpired)
    resetSessionLock(); setAccessToken(null)
  }, [])
  const clearSession = useCallback(() => endSession(false), [endSession])
  const expireSession = useCallback(() => endSession(true), [endSession])
  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED, expireSession)
    return () => window.removeEventListener(AUTH_EXPIRED, expireSession)
  }, [expireSession])
  useEffect(() => {
    const usedToken = getAccessToken()
    if (!usedToken) { resetSessionLock(); return }
    if (tokenExpiresAt(usedToken) <= Date.now()) { expireSession(); return }
    const controller = new AbortController()
    const currentRevision = revision.current
    api.me(controller.signal).then((current) => {
      if (!controller.signal.aborted && revision.current === currentRevision && getAccessToken() === usedToken) { setUser(current); setError(null) }
    }).catch((cause) => {
      if (!controller.signal.aborted && revision.current === currentRevision) setError(cause)
    }).finally(() => {
      if (!controller.signal.aborted && revision.current === currentRevision) setLoading(false)
    })
    return () => controller.abort()
  }, [expireSession])
  useEffect(() => {
    if (!token) return
    let timer: ReturnType<typeof setTimeout>
    const checkExpiry = () => {
      if (getAccessToken() !== token) return
      clearTimeout(timer)
      const left = tokenExpiresAt(token) - Date.now()
      if (left <= 0) { expireSession(); return }
      // Browsers clamp larger delays; re-check before scheduling the next chunk.
      timer = setTimeout(checkExpiry, Math.min(left, 2_147_483_647))
    }
    const checkVisible = () => { if (document.visibilityState === 'visible') checkExpiry() }
    checkExpiry()
    window.addEventListener('focus', checkExpiry)
    window.addEventListener('pageshow', checkExpiry)
    document.addEventListener('visibilitychange', checkVisible)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', checkExpiry)
      window.removeEventListener('pageshow', checkExpiry)
      document.removeEventListener('visibilitychange', checkVisible)
    }
  }, [token, expireSession])

  const refreshUser = useCallback(async () => {
    const usedToken = getAccessToken()
    if (!usedToken || tokenExpiresAt(usedToken) <= Date.now()) { expireSession(); return }
    const currentRevision = revision.current
    setLoading(true)
    try { const current = await api.me(); if (revision.current === currentRevision && getAccessToken() === usedToken) { setUser(current); setError(null) } }
    catch (cause) { if (revision.current === currentRevision) setError(cause) }
    finally { if (revision.current === currentRevision) setLoading(false) }
  }, [expireSession])
  const signIn = async (username: string, password: string, signal?: AbortSignal) => {
    username = username.trim()
    signInRequest.current?.abort(new ApiError('Yêu cầu đăng nhập đã được thay thế.', 'SUPERSEDED'))
    const controller = new AbortController()
    signInRequest.current = controller
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const attempt = ++revision.current
    setUser(null); setError(null); setExpired(false); setAccessToken(null); resetSessionLock()
    const checkCurrent = () => {
      if (controller.signal.aborted) throw controller.signal.reason
      if (attempt !== revision.current) throw new ApiError('Yêu cầu đăng nhập đã được thay thế.', 'SUPERSEDED')
    }
    try {
      const { access_token } = await api.login(username, password, controller.signal)
      checkCurrent(); setAccessToken(access_token)
      const current = await api.me(controller.signal)
      checkCurrent(); setUser(current); setError(null)
      return current
    } catch (cause) {
      if (attempt === revision.current) clearSession()
      throw cause
    } finally {
      signal?.removeEventListener('abort', abort)
      if (signInRequest.current === controller) signInRequest.current = null
    }
  }
  const signOut = async () => {
    const usedToken = getAccessToken()
    if (!usedToken) return
    if (tokenExpiresAt(usedToken) <= Date.now()) { expireSession(); return }
    const currentRevision = revision.current
    try { await api.logout() }
    catch (cause) { if (!(cause instanceof ApiError && cause.status === 401)) throw cause }
    if (getAccessToken() === usedToken && revision.current === currentRevision) clearSession()
  }
  return <AuthContext.Provider value={{ user, loading, error, expired, signIn, signOut, refreshUser, clearSession }}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider is required')
  return auth
}
