import { useSyncExternalStore, type ReactNode, type MouseEvent } from 'react'

const get = () => window.location.hash.replace(/^#/, '') || '/'
export function useRoute() {
  return useSyncExternalStore((l) => { window.addEventListener('hashchange', l); return () => window.removeEventListener('hashchange', l) }, get)
}
export function navigate(to: string) { window.location.hash = to; window.scrollTo(0, 0) }
export function Link({ to, children, className, onClick }: { to: string; children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <a href={'#' + to} className={className} onClick={(e: MouseEvent) => { e.preventDefault(); onClick?.(); navigate(to) }}>
      {children}
    </a>
  )
}
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/'), b = path.split('?')[0].split('/')
  if (a.length !== b.length) return null
  const p: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) p[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return p
}
export const query = (path: string) => new URLSearchParams(path.split('?')[1] ?? '')
