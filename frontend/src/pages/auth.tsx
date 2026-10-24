import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, Eye, EyeOff, LifeBuoy } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { cooldownUntil } from '../auth/registrationCompletion'
import { Alert, Button, ErrorNotice, Field, Input, Logo } from '../components/ui'
import { Link, navigate, query, useRoute } from '../router'

function AuthShell({ children }: { children: ReactNode }) {
  return <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
    <aside className="hidden flex-col items-center justify-center bg-primary p-12 text-center text-white lg:flex"><Logo size={240} /><p className="mt-8 text-sm uppercase tracking-widest">Trường Đại học Công nghệ</p><h1 className="mt-2 text-3xl font-semibold">Hệ thống quản lý và đăng ký học phần</h1></aside>
    <main className="flex flex-col bg-white px-5 py-6 sm:px-12"><div className="mx-auto my-auto w-full max-w-md space-y-5 py-8"><div className="lg:hidden"><Logo size={64} /></div>{children}</div></main>
  </div>
}

export function LoginPage() {
  const { signIn, registrationNotice } = useAuth()
  const q = query(useRoute())
  const [username, setUsername] = useState(registrationNotice?.username ?? '')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [now, setNow] = useState(Date.now())
  const loginRequest = useRef<AbortController | null>(null)
  useEffect(() => () => loginRequest.current?.abort(), [])
  useEffect(() => { if (registrationNotice) setUsername(registrationNotice.username) }, [registrationNotice])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const seconds = Math.max(0, Math.ceil((cooldownUntil(username) - now) / 1000))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || seconds > 0) return
    setBusy(true); setError(null)
    const controller = new AbortController()
    loginRequest.current = controller
    try {
      const user = await signIn(username, password, controller.signal)
      if (!controller.signal.aborted) navigate(user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard')
    } catch (cause) { if (!controller.signal.aborted) setError(cause) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <AuthShell>
    <div><h2 className="text-2xl font-semibold">Đăng nhập</h2><p className="mt-2 text-sm text-muted">Sử dụng tài khoản do nhà trường cấp. Vai trò được xác định bởi máy chủ.</p></div>
    {q.get('expired') && !registrationNotice && <Alert tone="warning">Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.</Alert>}
    {registrationNotice && <Alert tone="success" title="Đăng ký học phần thành công">Đã đăng ký {registrationNotice.classCode} (mã đăng ký {registrationNotice.registrationId}). {registrationNotice.logoutPending ? 'Phiên trên trang đã được xóa; chưa xác nhận được logout trên máy chủ.' : 'Đã đăng xuất phiên hiện tại.'}</Alert>}
    {registrationNotice?.storageWarning && <Alert tone="warning">Trình duyệt đang hạn chế lưu trạng thái. Tải lại trang có thể làm mất thông báo hoặc thời gian chờ tạm thời.</Alert>}
    {seconds > 0 && <Alert tone="info" title="Thời gian chờ trên trình duyệt này">Tài khoản {username.trim()} có thể đăng nhập lại trên giao diện này sau {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}.<p className="mt-2 text-xs">Cooldown 20 phút hiện chỉ áp dụng ở frontend. Backend chưa chặn đăng nhập mới hoặc thu hồi các phiên trên thiết bị khác.</p></Alert>}
    {error ? <ErrorNotice error={error} /> : null}
    <form onSubmit={submit} className="space-y-4">
      <Field id="username" label="Tên đăng nhập" required><Input id="username" autoComplete="username" required value={username} onChange={(e) => { setUsername(e.target.value); setError(null) }} placeholder="VD: student001" /></Field>
      <Field id="password" label="Mật khẩu" required><div className="relative"><Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" /><button type="button" className="absolute right-3 top-3 text-muted" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></Field>
      <div className="text-right"><Link to="/forgot-password" className="text-sm text-primary">Quên mật khẩu?</Link></div>
      <Button type="submit" className="w-full" loading={busy} disabled={seconds > 0}>Đăng nhập</Button>
    </form>
  </AuthShell>
}

export function ForgotPage() {
  return <AuthShell><LifeBuoy className="h-10 w-10 text-primary" /><h2 className="text-2xl font-semibold">Khôi phục tài khoản</h2><p className="text-sm text-muted">Hệ thống chưa hỗ trợ tự tạo tài khoản hoặc đặt lại mật khẩu trực tuyến. Vui lòng liên hệ đơn vị quản lý tài khoản của nhà trường.</p><Link to="/login" className="inline-flex items-center gap-2 text-primary"><ArrowLeft className="h-4 w-4" />Quay lại đăng nhập</Link></AuthShell>
}
export function StatusPage({ code }: { code: '403' | '404' | 'network' }) {
  const text = code === '403' ? 'Bạn không có quyền truy cập trang này.' : code === '404' ? 'Không tìm thấy trang hoặc dữ liệu.' : 'Không thể kết nối tới máy chủ.'
  return <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5"><Logo size={64} /><h1 className="text-3xl font-semibold">{code === 'network' ? 'Lỗi kết nối' : code}</h1><p className="text-muted">{text}</p><Button onClick={() => navigate('/')}>Về trang chính</Button></div>
}
