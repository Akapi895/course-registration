import { useEffect, type ReactElement } from 'react'
import { useRoute, match, navigate, query } from './router'
import { useSession } from './api'
import { Toaster } from './ui'
import Layout from './Layout'
import { ForgotPage, LoginPage, RegisterPage, StatusPage } from './pages/auth'
import { AdminClassDetail, AdminClasses, AdminDashboard, AdminRegistrationPeriod, AdminStudentDetail, AdminStudents } from './pages/admin'
import { ClassDetail, StudentClasses, StudentDashboard, StudentRegistrations, StudentSchedule } from './pages/student'

const pub: Record<string, () => ReactElement> = { '/login': () => <LoginPage />, '/register': () => <RegisterPage />, '/forgot-password': () => <ForgotPage /> }
const home = (role: string) => (role === 'admin' ? '/admin/dashboard' : '/student/dashboard')

function Routes() {
  const path = useRoute()
  const s = useSession()
  const p = path.split('?')[0]
  useEffect(() => {
    if (p === '/' || p === '') navigate(s ? home(s.role) : '/login')
    else if (!pub[p] && !s) navigate('/login?expired=1')
    else if (pub[p] && s) navigate(home(s.role))
  }, [p, s])
  if (pub[p]) return pub[p]()
  if (!s) return null
  // Route guard by account role (the backend still enforces permissions on every API call).
  const area = p.startsWith('/admin') ? 'admin' : p.startsWith('/student') ? 'student' : null
  if (area && area !== s.role) return <Layout title="Không có quyền" semester={false}><StatusPage code="403" /></Layout>
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
    ['/error/network', () => <Layout title="Lỗi kết nối" semester={false}><StatusPage code="network" /></Layout>],
  ]
  for (const [pat, el] of routes) {
    const m = match(pat, p)
    if (m) return <div key={path}>{el(m)}</div>
  }
  return <Layout title="Không tìm thấy" semester={false}><StatusPage code="404" /></Layout>
}

export default function App() {
  return (
    <>
      <Routes />
      <Toaster />
    </>
  )
}
