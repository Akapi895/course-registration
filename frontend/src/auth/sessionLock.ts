import { useSyncExternalStore } from 'react'

// Once a registration is submitted, the session turns read-only until the next login.
const LOCK_KEY = 'courseRegistration:submitted'
let submitted = (() => { try { return sessionStorage.getItem(LOCK_KEY) === '1' } catch { return false } })()
const listeners = new Set<() => void>()
const set = (value: boolean) => {
  try {
    if (value) sessionStorage.setItem(LOCK_KEY, '1')
    else sessionStorage.removeItem(LOCK_KEY)
  } catch { /* Keep the same session state in memory if storage is unavailable. */ }
  if (submitted !== value) { submitted = value; listeners.forEach((l) => l()) }
}

export const markSubmitted = () => set(true)
export const sessionSubmitted = () => submitted
export const resetSessionLock = () => set(false)
export const useSessionLocked = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, sessionSubmitted)
