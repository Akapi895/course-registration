import { useEffect, type ComponentType, type ReactElement } from 'react'
import { useRoute, match, navigate, query } from './router'
import { useAuth } from './auth/AuthProvider'
import { Logo, Skeleton, Toaster } from './components/ui'
import Layout from './components/Layout'
import { ForgotPage, LoginPage, StatusPage } from './pages/auth'
import { AdminClassDetail, AdminClasses, AdminDashboard, AdminRegistrationPeriod, AdminStudentDetail, AdminStudents } from './pages/admin'
import { StudentClasses, StudentDashboard, StudentRegistrations } from './pages/student'
import { StudentSchedule } from './pages/schedule'

const publicPages: Record<string, ComponentType> = { '/login': LoginPage, '/forgot-password': ForgotPage }
const home = (role: string) => role === 'admin' ? '/admin/dashboard' : '/student/dashboard'

function Routes() {
  const path = useRoute()
  const auth = useAuth()
  const p = path.split('?')[0]
  useEffect(() => {
    if (auth.loading || auth.error) return
    if (p === '/' || p === '') navigate(auth.user ? home(auth.user.role) : '/login')
    else if (!publicPages[p] && !auth.user) navigate('/login?expired=1')
    else if (publicPages[p] && auth.user) navigate(home(auth.user.role))
  }, [p, auth.loading, auth.error, auth.user])
  if (auth.loading) return <div role="status" aria-label="Đang xác thực" className="mx-auto max-w-xl space-y-4 p-10"><Logo /><Skeleton className="h-16" /></div>
  if (auth.error) return <StatusPage code="network" onRetry={auth.refreshUser} onHome={() => { auth.clearSession(); navigate('/login') }} homeLabel="Về trang đăng nhập" />
  const PublicPage = publicPages[p]
  if (PublicPage) return <PublicPage />
  if (!auth.user) return null
  // Route guard by account role (the server still enforces permissions on every request).
  const area = p.startsWith('/admin') ? 'admin' : p.startsWith('/student') ? 'student' : null
  if (area && area !== auth.user.role) return <Layout title="Không có quyền"><StatusPage code="403" /></Layout>
  const routes: [string, (m: Record<string, string>) => ReactElement][] = [
    ['/student/dashboard', () => <StudentDashboard />],
    ['/student/classes', () => <StudentClasses />],
    ['/student/registrations', () => <StudentRegistrations />],
    ['/student/schedule', () => <StudentSchedule />],
    ['/admin/dashboard', () => <AdminDashboard />],
    ['/admin/classes', () => <AdminClasses isNew={!!query(path).get('new')} />],
    ['/admin/classes/:id', (m) => <AdminClassDetail id={m.id} />],
    ['/admin/students', () => <AdminStudents />],
    ['/admin/students/:id', (m) => <AdminStudentDetail id={m.id} />],
    ['/admin/registration-period', () => <AdminRegistrationPeriod />],
    ['/error/network', () => <Layout title="Lỗi kết nối"><StatusPage code="network" /></Layout>],
  ]
  for (const [pattern, render] of routes) {
    const params = match(pattern, p)
    if (params) return <div key={path}>{render(params)}</div>
  }
  return <Layout title="Không tìm thấy"><StatusPage code="404" /></Layout>
}
export default function App() { return <><Routes /><Toaster /></> }
