// Only UI completion/cooldown metadata is persisted; never access tokens.
const noticeKey = 'courseRegistration.registrationNotice'
const cooldownKey = (username: string) => 'courseRegistration.cooldown.' + encodeURIComponent(username.trim())
const cooldowns = new Map<string, number>()
export interface RegistrationNotice {
  username: string
  classCode: string
  registrationId: number
  until: number
  logoutPending: boolean
  storageWarning?: boolean
}
let notice: RegistrationNotice | null = null
try {
  const saved = JSON.parse(window.sessionStorage.getItem(noticeKey) ?? 'null')
  if (saved && typeof saved.username === 'string' && typeof saved.classCode === 'string' && Number.isSafeInteger(saved.registrationId) && typeof saved.until === 'number' && Number.isFinite(saved.until) && typeof saved.logoutPending === 'boolean') notice = saved
} catch { /* Storage can be unavailable; current-page state still works. */ }

export function cooldownUntil(username: string) {
  username = username.trim()
  let until = Math.max(cooldowns.get(username) ?? 0, notice?.username === username ? notice.until : 0)
  try { until = Math.max(until, Number(window.localStorage.getItem(cooldownKey(username))) || 0) } catch { /* Use the in-memory fallback. */ }
  return Number.isFinite(until) && until > Date.now() ? until : 0
}
export const getRegistrationNotice = () => notice
export function rememberCooldown(username: string, until = Date.now() + 20 * 60 * 1000) {
  cooldowns.set(username, until)
  try { window.localStorage.setItem(cooldownKey(username), String(until)); return false } catch { return true }
}
function save(value: RegistrationNotice) {
  notice = value
  if (rememberCooldown(value.username, value.until)) value.storageWarning = true
  try { window.sessionStorage.setItem(noticeKey, JSON.stringify(value)) } catch { value.storageWarning = true }
  return value
}
export function recordRegistration(username: string, classCode: string, registrationId: number) {
  if (notice?.username === username && notice.registrationId === registrationId) return notice
  return save({ username, classCode, registrationId, until: Date.now() + 20 * 60 * 1000, logoutPending: true })
}
export function confirmRegistrationLogout(value: RegistrationNotice) {
  const confirmed = { ...value, logoutPending: false }
  // An old session must not replace another account's pending completion.
  return notice === value ? save(confirmed) : confirmed
}
export function clearRegistrationNotice() {
  notice = null
  try { window.sessionStorage.removeItem(noticeKey) } catch { /* Never interrupt auth cleanup. */ }
}
