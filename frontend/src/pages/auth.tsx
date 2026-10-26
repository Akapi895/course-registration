import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, Clock, Eye, EyeOff, LifeBuoy, MapPin } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { ApiError } from '../api/client'
import { Alert, Button, Field, Input, Logo } from '../components/ui'
import { Link, navigate, query, useRoute } from '../router'

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden flex-col items-center justify-center bg-primary p-12 text-center text-white lg:flex">
        <Logo size={240} />
        <p className="mt-8 text-sm uppercase tracking-[0.2em] text-blue-100">Trường Đại học Công nghệ, ĐHQGHN</p>
        <h1 className="mt-2 text-3xl font-semibold">Hệ thống quản lý và đăng ký học phần</h1>
      </aside>
      <main className="flex flex-col bg-white px-5 py-6 sm:px-12">
        <div className="flex items-center gap-3 lg:hidden">
          <Logo size={64} />
          <div className="min-w-0 leading-tight"><p className="whitespace-nowrap text-xs text-muted">Trường Đại học Công nghệ, ĐHQGHN</p><p className="whitespace-nowrap font-semibold">Cổng đăng ký học phần</p></div>
        </div>
        <div className="mx-auto my-auto w-full max-w-md py-8">{children}</div>
      </main>
    </div>
  )
}

const COOLDOWNS_KEY = 'courseRegistration:login-cooldowns'
const LAST_USERNAME_KEY = 'courseRegistration:last-username'
function savedCooldowns(): Record<string, number> {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(COOLDOWNS_KEY) ?? '{}')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}
    return Object.fromEntries(Object.entries(saved).filter(([, until]) => typeof until === 'number' && Number.isFinite(until) && until > Date.now()))
  } catch { return {} }
}

export function LoginPage() {
  const { signIn } = useAuth()
  const q = query(useRoute())
  const [username, setUsername] = useState(() => { try { return sessionStorage.getItem(LAST_USERNAME_KEY) ?? '' } catch { return '' } })
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldowns, setCooldowns] = useState(savedCooldowns)
  const [now, setNow] = useState(Date.now)
  const until = cooldowns[username.trim()]
  const remaining = typeof until === 'number' ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
  const waiting = remaining > 0
  const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
  const loginRequest = useRef<AbortController | null>(null)
  useEffect(() => () => loginRequest.current?.abort(), [])
  useEffect(() => {
    try { sessionStorage.setItem(COOLDOWNS_KEY, JSON.stringify(cooldowns)) } catch { /* Server enforcement does not depend on browser storage. */ }
  }, [cooldowns])
  useEffect(() => {
    if (!waiting) return
    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [waiting])
  const go = async () => {
    setError(''); setBusy(true)
    const account = username.trim()
    try { sessionStorage.setItem(LAST_USERNAME_KEY, account) } catch { /* Only a form preference. */ }
    const controller = new AbortController()
    loginRequest.current = controller
    try {
      const user = await signIn(username, password, controller.signal)
      if (!controller.signal.aborted) {
        setCooldowns((saved) => { const next = { ...saved }; delete next[account]; return next })
        navigate(user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard')
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof ApiError && cause.code === 'LOGIN_COOLDOWN' && typeof cause.retryAfter === 'number' && Number.isFinite(cause.retryAfter) && cause.retryAfter > 0) {
          const retryAfter = cause.retryAfter
          const receivedAt = Date.now()
          setNow(receivedAt)
          setCooldowns((saved) => ({ ...saved, [account]: receivedAt + Math.ceil(retryAfter) * 1000 }))
        } else setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập. Vui lòng thử lại.')
        setBusy(false)
      }
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy || waiting) return
    const er: Record<string, string> = {}
    if (!username.trim()) er.u = 'Vui lòng nhập tên đăng nhập.'
    if (!password) er.p = 'Vui lòng nhập mật khẩu.'
    setErrors(er)
    if (!Object.keys(er).length) go()
  }
  return (
    <AuthShell>
      <h2 className="text-2xl font-semibold">Đăng nhập</h2>
      <p className="mt-1 text-sm text-muted">Sử dụng tài khoản do nhà trường cấp. Quyền truy cập được xác định theo tài khoản.</p>
      <div className="mt-4 space-y-3">
        {q.get('expired') && <Alert tone="warning" title="Phiên đăng nhập đã hết hạn">Tài khoản cần hoàn tất thời gian chờ trước khi đăng nhập lại. Các đăng ký đã thành công vẫn được giữ nguyên.</Alert>}
        {waiting && <Alert tone="warning" title="Tài khoản đang chờ đăng nhập lại">Có thể thử đăng nhập lại sau <span className="font-semibold tabular-nums" role="timer">{countdown}</span>. Thời gian chờ áp dụng theo tài khoản, kể cả khi đổi trình duyệt.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        <Field id="username" label="Tên đăng nhập" error={errors.u} required>
          <Input id="username" autoComplete="username" value={username} onChange={(e) => { setUsername(e.target.value); setError(''); setNow(Date.now()) }} error={errors.u} placeholder="VD: student001" />
        </Field>
        <Field id="password" label="Mật khẩu" error={errors.p} required>
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.p} className="pr-12" />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-0.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-slate-100" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={show}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">Quên mật khẩu?</Link></div>
        <Button type="submit" className="w-full" loading={busy} disabled={waiting}>{busy ? 'Đang đăng nhập…' : waiting ? `Đăng nhập lại sau ${countdown}` : 'Đăng nhập'}</Button>
      </form>
    </AuthShell>
  )
}

export function ForgotPage() {
  return (
    <AuthShell>
      <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><LifeBuoy className="h-6 w-6" /></div>
      <h2 className="mt-4 text-2xl font-semibold">Khôi phục tài khoản</h2>
      <p className="mt-2 text-sm text-muted">Hệ thống chưa hỗ trợ tự đặt lại mật khẩu trực tuyến. Vui lòng liên hệ Trung tâm Máy tính, mang theo thẻ sinh viên để được xác minh và cấp lại mật khẩu.</p>
      <ul className="mt-6 divide-y divide-line rounded-xl border border-line text-sm">
        <li className="flex items-center gap-3 p-4"><MapPin className="h-5 w-5 shrink-0 text-primary" />Trung tâm Máy tính – Phòng 104, nhà E3</li>
        <li className="flex items-center gap-3 p-4"><Clock className="h-5 w-5 shrink-0 text-primary" />Thứ Hai – Thứ Sáu, 8:00 – 17:00</li>
      </ul>
      <Button className="mt-6 w-full" onClick={() => navigate('/login')}><ArrowLeft className="h-4 w-4" />Quay lại đăng nhập</Button>
    </AuthShell>
  )
}

export function StatusPage({ code, onRetry, onHome, homeLabel = 'Về trang chính' }: { code: '403' | '404' | 'network'; onRetry?: () => void; onHome?: () => void; homeLabel?: string }) {
  const m = {
    '403': ['403', 'Không có quyền truy cập', 'Tài khoản của bạn không có quyền xem trang này.'],
    '404': ['404', 'Không tìm thấy trang', 'Đường dẫn không tồn tại hoặc đã bị thay đổi.'],
    network: ['!', 'Không thể kết nối', 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.'],
  }[code]
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <Logo size={64} />
      <p className="mt-6 text-5xl font-bold text-primary">{m[0]}</p>
      <h1 className="mt-2 text-xl font-semibold">{m[1]}</h1>
      <p className="mt-2 max-w-md text-sm text-muted">{m[2]}</p>
      <div className="mt-6 flex gap-2">
        {code === 'network' && <Button onClick={onRetry ?? (() => history.back())}>Thử lại</Button>}
        <Button variant="secondary" onClick={onHome ?? (() => navigate('/'))}>{homeLabel}</Button>
      </div>
    </div>
  )
}
