import { useEffect, type ComponentType, type ReactElement } from 'react'
import { useRoute, match, navigate, query } from './router'
import { useAuth } from './auth/AuthProvider'
import { Button, ErrorNotice, Logo, Skeleton, Toaster } from './components/ui'
import Layout from './components/Layout'
import { RegistrationFinalization } from './components/RegistrationFlow'
import { ForgotPage, LoginPage, StatusPage } from './pages/auth'
import { AdminClassDetail, AdminClasses, AdminDashboard, AdminRegistrationPeriod, AdminStudentDetail, AdminStudents } from './pages/admin'
import { ClassDetail, StudentClasses, StudentDashboard, StudentRegistrations, StudentSchedule } from './pages/student'

const publicPages: Record<string, ComponentType> = { '/login': LoginPage, '/forgot-password': ForgotPage }
const home = (role: string) => role === 'admin' ? '/admin/dashboard' : '/student/dashboard'

function Routes() {
  const path = useRoute()
  const auth = useAuth()
  const p = path.split('?')[0]
  useEffect(() => {
    if (auth.loading || auth.error) return
    if (p === '/' || p === '') navigate(auth.user ? home(auth.user.role) : '/login')
    else if (!publicPages[p] && !auth.user) navigate(auth.registrationNotice ? '/login?registered=1' : '/login?expired=1')
    else if (publicPages[p] && auth.user) navigate(home(auth.user.role))
  }, [p, auth.loading, auth.error, auth.user, auth.registrationNotice])
  if (auth.loading) return <div role="status" aria-label="Đang xác thực" className="mx-auto max-w-xl space-y-4 p-10"><Logo /><Skeleton className="h-16" /></div>
  if (auth.error) return <div className="mx-auto max-w-xl space-y-4 p-10"><ErrorNotice error={auth.error} retry={auth.refreshUser} /><Button variant="secondary" onClick={auth.clearSession}>Quay về đăng nhập</Button></div>
  if (auth.user && auth.registrationNotice?.logoutPending && auth.registrationNotice.username === auth.user.username) return <RegistrationFinalization />
  const PublicPage = publicPages[p]
  if (PublicPage) return <PublicPage />
  if (!auth.user) return null
  const area = p.startsWith('/admin') ? 'admin' : p.startsWith('/student') ? 'student' : null
  if (area && area !== auth.user.role) return <Layout title="Không có quyền"><StatusPage code="403" /></Layout>
  const routes: [string, (m: Record<string, string>) => ReactElement][] = [
    ['/student/dashboard', () => <StudentDashboard />],
    ['/student/classes', () => <StudentClasses />],
    ['/student/classes/:id', (m) => <ClassDetail id={m.id} />],
    ['/student/registrations', () => <StudentRegistrations />],
    ['/student/schedule', () => <StudentSchedule />],
    ['/admin/dashboard', () => <AdminDashboard />],
    ['/admin/classes', () => <AdminClasses isNew={!!query(path).get('new')} />],
    ['/admin/classes/:id', (m) => <AdminClassDetail id={m.id} />],
    ['/admin/students', () => <AdminStudents />],
    ['/admin/students/:id', (m) => <AdminStudentDetail id={m.id} />],
    ['/admin/registration-period', () => <AdminRegistrationPeriod />],
  ]
  for (const [pattern, render] of routes) {
    const params = match(pattern, p)
    if (params) return <div key={path}>{render(params)}</div>
  }
  return <Layout title="Không tìm thấy"><StatusPage code="404" /></Layout>
}
export default function App() { return <><Routes /><Toaster /></> }
