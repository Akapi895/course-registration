import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LayoutDashboard, BookPlus, ListChecks, CalendarDays, Menu, LogOut, ChevronDown, X, Timer, School, Users, CalendarClock, Loader2 } from 'lucide-react'
import { Link, navigate, useRoute } from '../router'
import { useAuth } from '../auth/AuthProvider'
import { tokenExpiresAt } from '../api/client'
import { Drawer, ErrorNotice, Logo, cx } from './ui'

const studentMenu = [
  ['/student/dashboard', 'Tổng quan', LayoutDashboard],
  ['/student/classes', 'Đăng ký học phần', BookPlus],
  ['/student/registrations', 'Học phần đã đăng ký', ListChecks],
  ['/student/schedule', 'Thời khóa biểu', CalendarDays],
] as const
const adminMenu = [
  ['/admin/dashboard', 'Tổng quan', LayoutDashboard],
  ['/admin/classes', 'Quản lý lớp học phần', School],
  ['/admin/students', 'Quản lý sinh viên', Users],
  ['/admin/registration-period', 'Cấu hình đợt đăng ký', CalendarClock],
] as const

function Sidebar({ onNav }: { onNav?: () => void }) {
  const path = useRoute().split('?')[0]
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const menu = isAdmin ? adminMenu : studentMenu
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo size={48} />
        <div className="leading-tight">
          <p className="text-xs text-muted">Trường Đại học Công nghệ</p>
          <p className="text-[15px] font-semibold">Cổng đăng ký học phần</p>
        </div>
      </div>
      <p className="px-6 pb-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{isAdmin ? 'Quản trị' : 'Sinh viên'}</p>
      <nav className="flex-1 space-y-1 px-3" aria-label="Điều hướng chính">
        {menu.map(([to, label, Icon]) => {
          const active = path === to || path.startsWith(to + '/')
          return (
            <Link key={to} to={to} onClick={onNav} className={cx('relative flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors', active ? 'bg-primary-soft text-primary' : 'text-slate-600 hover:bg-slate-50 hover:text-ink')}>
              {active && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r bg-primary" aria-hidden />}
              <Icon className="h-5 w-5" aria-hidden />
              <span aria-current={active ? 'page' : undefined}>{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

function SessionTimer() {
  const { clearSession } = useAuth()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const left = Math.max(0, tokenExpiresAt() - now)
  // Session expired: clear client data and return to login with an explanation.
  useEffect(() => { if (left <= 0) { clearSession(); navigate('/login?expired=1') } }, [left <= 0])
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000)
  return (
    <span className={cx('hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium tabular-nums md:inline-flex', left < 60000 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-muted')} title="Thời gian còn lại của phiên đăng nhập" aria-live={left < 60000 ? 'polite' : 'off'}>
      <Timer className="h-4 w-4" />Phiên còn {m}:{String(s).padStart(2, '0')}
    </span>
  )
}

function AccountMenu({ onError }: { onError: (cause: unknown) => void }) {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [out, setOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [])
  const name = user?.full_name ?? ''
  const initials = name.split(' ').slice(-2).map((w) => w[0]).join('')
  const item = 'flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm hover:bg-slate-50 focus:bg-slate-50'
  const logout = async () => {
    setOut(true); onError(null)
    try { await signOut(); navigate('/login') }
    catch (cause) { setOut(false); setOpen(false); onError(cause) }
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className="flex min-h-11 items-center gap-2 rounded-[10px] px-2 hover:bg-slate-50">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-semibold text-white">{initials}</span>
        <span className="hidden text-left leading-tight md:block"><span className="block text-sm font-medium">{name}</span><span className="block text-xs text-muted">{user?.student_code ?? 'Quản trị viên'}</span></span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg">
          <button role="menuitem" disabled={out} className={cx(item, 'text-red-600 disabled:opacity-60')} onClick={logout}>{out ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}{out ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
        </div>
      )}
    </div>
  )
}

// `semester` is accepted for caller compatibility; there is no semester picker to show.
export default function Layout({ title, children }: { title: string; children: ReactNode; semester?: boolean }) {
  const { user } = useAuth()
  const [drawer, setDrawer] = useState(false)
  const [error, setError] = useState<unknown>(null)
  return (
    <div className="min-h-screen lg:pl-[248px]">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }} className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">Bỏ qua đến nội dung</a>
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] border-r border-line bg-white lg:block"><Sidebar /></aside>
      <Drawer open={drawer} onClose={() => setDrawer(false)}>
        <button className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-slate-100" onClick={() => setDrawer(false)} aria-label="Đóng menu"><X className="h-5 w-5" /></button>
        <Sidebar onNav={() => setDrawer(false)} />
      </Drawer>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white px-4 sm:px-6">
        <button className="grid h-11 w-11 place-items-center rounded-lg hover:bg-slate-100 lg:hidden" onClick={() => setDrawer(true)} aria-label="Mở menu"><Menu className="h-5 w-5" /></button>
        <p className="truncate text-base font-semibold">{title}</p>
        <div className="ml-auto flex items-center gap-2">
          {user?.role !== 'admin' && <SessionTimer />}
          <AccountMenu onError={setError} />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">{error ? <div className="mb-6"><ErrorNotice error={error} title="Không thể đăng xuất" /></div> : null}{children}</main>
    </div>
  )
}
