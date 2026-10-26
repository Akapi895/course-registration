export const AUTH_EXPIRED = 'courseRegistration:auth-expired'
const TOKEN_KEY = 'courseRegistration:access-token'
let accessToken: string | null = (() => {
  try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null }
})()
const tokenListeners = new Set<() => void>()

export class ApiError extends Error {
  constructor(message: string, public code: string, public status = 0, public retryAfter?: number, public loginAllowedAt?: string) { super(message) }
}
export const getAccessToken = () => accessToken
export function subscribeAccessToken(listener: () => void) {
  tokenListeners.add(listener)
  return () => { tokenListeners.delete(listener) }
}
export function setAccessToken(value: string | null) {
  const changed = accessToken !== value
  accessToken = value
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch { /* Requests can still use the in-memory token when storage is unavailable. */ }
  if (changed) tokenListeners.forEach((listener) => listener())
}
export function tokenExpiresAt(token = accessToken) {
  try {
    const payload = JSON.parse(atob((token ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const expiresAt = typeof payload.exp === 'number' ? payload.exp * 1000 : 0
    return Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : 0
  } catch { return 0 }
}

export async function request<T>(path: string, options: { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = options
  const usedToken = auth ? accessToken : null
  if (usedToken && tokenExpiresAt(usedToken) <= Date.now()) {
    if (accessToken === usedToken) window.dispatchEvent(new Event(AUTH_EXPIRED))
    throw new ApiError('Phiên đăng nhập đã hết hạn hoặc không hợp lệ.', 'UNAUTHORIZED', 401)
  }
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (usedToken) headers.Authorization = `Bearer ${usedToken}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError('Không thể kết nối tới máy chủ. Vui lòng thử lại.', 'NETWORK')
  }
  if (usedToken && response.status === 401 && accessToken === usedToken) {
    window.dispatchEvent(new Event(AUTH_EXPIRED))
  }
  let envelope: { status?: string; data?: T & { code?: string; message?: string; retry_after?: number; login_allowed_at?: string } }
  try { envelope = await response.json() }
  catch { throw new ApiError('Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.', 'INVALID_RESPONSE', response.status) }
  if (!response.ok || envelope.status !== 'success') {
    throw new ApiError(envelope.data?.message || 'Yêu cầu bị từ chối.', envelope.data?.code || 'HTTP_ERROR', response.status,
      envelope.data?.retry_after, envelope.data?.login_allowed_at)
  }
  return envelope.data as T
}
