import { useSyncExternalStore } from 'react'

// Once a registration is submitted, the session turns read-only until the next login.
let submitted = false
const listeners = new Set<() => void>()
const set = (value: boolean) => { if (submitted !== value) { submitted = value; listeners.forEach((l) => l()) } }

export const markSubmitted = () => set(true)
export const sessionSubmitted = () => submitted
export const resetSessionLock = () => set(false)
export const useSessionLocked = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, sessionSubmitted)
