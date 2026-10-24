import { useEffect, useState, type ReactNode } from 'react'
import { LayoutDashboard, BookPlus, ListChecks, CalendarDays, Menu, LogOut, X, Timer, School, Users, CalendarClock } from 'lucide-react'
import { Link, navigate, useRoute } from './router'
import { useAuth } from './AuthProvider'
import { tokenExpiresAt } from './http'
import { Button, Drawer, ErrorNotice, Logo, cx } from './ui'

const studentMenu = [
  ['/student/dashboard', 'Tổng quan và hồ sơ', LayoutDashboard],
  ['/student/classes', 'Đăng ký học phần', BookPlus],
  ['/student/registrations', 'Học phần đã đăng ký', ListChecks],
  ['/student/schedule', 'Thời khóa biểu', CalendarDays],
] as const
const adminMenu = [
  ['/admin/dashboard', 'Tổng quan', LayoutDashboard],
  ['/admin/classes', 'Quản lý lớp học phần', School],
  ['/admin/students', 'Tra cứu sinh viên', Users],
  ['/admin/registration-period', 'Thời gian đăng ký', CalendarClock],
] as const

function Sidebar({ onNav }: { onNav?: () => void }) {
  const path = useRoute().split('?')[0]
  const { user } = useAuth()
  const menu = user?.role === 'admin' ? adminMenu : studentMenu
  return <div className="flex h-full flex-col">
    <div className="flex items-center gap-3 px-5 py-5"><Logo size={48} /><div><p className="text-xs text-muted">Trường Đại học Công nghệ</p><p className="font-semibold">Cổng đăng ký học phần</p></div></div>
    <p className="px-6 py-3 text-xs font-semibold uppercase text-muted">{user?.role === 'admin' ? 'Quản trị' : 'Sinh viên'}</p>
    <nav className="flex-1 space-y-1 px-3" aria-label="Điều hướng chính">
      {menu.map(([to, label, Icon]) => <Link key={to} to={to} onClick={onNav} className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm', path === to || path.startsWith(to + '/') ? 'bg-primary-soft font-semibold text-primary' : 'text-slate-600 hover:bg-slate-50')}><Icon className="h-5 w-5" />{label}</Link>)}
    </nav>
    <p className="px-6 py-4 text-xs text-muted">Phase 1 · Kết nối API</p>
  </div>
}

function SessionTimer() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const seconds = Math.max(0, Math.ceil((tokenExpiresAt() - now) / 1000))
  return <span className="hidden items-center gap-1.5 text-sm text-muted md:inline-flex" title="Thời hạn access token do backend cấp"><Timer className="h-4 w-4" />Phiên còn {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
}

export default function Layout({ title, children }: { title: string; children: ReactNode }) {
  const { user, signOut } = useAuth()
  const [drawer, setDrawer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const logout = async () => {
    setBusy(true); setError(null)
    try { await signOut(); navigate('/login') }
    catch (cause) { setError(cause) }
    finally { setBusy(false) }
  }
  return <div className="min-h-screen lg:pl-[248px]">
    <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }} className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-3">Bỏ qua đến nội dung</a>
    <aside className="fixed inset-y-0 left-0 hidden w-[248px] border-r border-line bg-white lg:block"><Sidebar /></aside>
    <Drawer open={drawer} onClose={() => setDrawer(false)}><button className="absolute right-2 top-2 p-3" onClick={() => setDrawer(false)} aria-label="Đóng menu"><X /></button><Sidebar onNav={() => setDrawer(false)} /></Drawer>
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-line bg-white px-4 py-2 sm:px-6">
      <button className="p-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Mở menu"><Menu /></button>
      <p className="font-semibold">{title}</p>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-3"><SessionTimer /><span className="text-right text-sm"><b className="block">{user?.full_name}</b><span className="text-xs text-muted">{user?.student_code ?? 'Quản trị viên'}</span></span><Button variant="ghost" size="sm" loading={busy} onClick={logout}><LogOut className="h-4 w-4" />Đăng xuất</Button></div>
    </header>
    <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 outline-none sm:px-6 lg:px-8">{error ? <ErrorNotice error={error} retry={logout} /> : null}{children}</main>
  </div>
}
