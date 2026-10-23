import { useState, type FormEvent, type ReactNode } from 'react'
import { CalendarRange, Eye, EyeOff, LifeBuoy, MapPin, ArrowLeft, CheckCircle2, Clock } from 'lucide-react'
import { Alert, Button, Field, Input, Logo, SemBadge, Select } from '../ui'
import { Link, navigate, query, useRoute } from '../router'
import { type ApiError, currentPeriod, fmtDT, login, registerAccount, semStatus } from '../api'
import { FACULTIES } from '../data'

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden flex-col items-center justify-center bg-primary p-12 text-center text-white lg:flex">
        <Logo size={240} />
        <p className="mt-8 text-sm uppercase tracking-[0.2em] text-blue-100">Trường Đại học Công nghệ</p>
        <h1 className="mt-2 text-3xl font-semibold">Hệ thống quản lý và đăng ký học phần</h1>
      </aside>
      <main className="flex flex-col bg-white px-5 py-6 sm:px-12">
        <div className="flex items-center gap-3 lg:hidden">
          <Logo size={64} />
          <div><p className="text-xs text-muted">Trường Đại học Công nghệ</p><p className="font-semibold">Cổng đăng ký học phần</p></div>
        </div>
        <div className="mx-auto my-auto w-full max-w-md py-8">{children}</div>
      </main>
    </div>
  )
}

function PeriodNotice() {
  const sem = currentPeriod()
  const st = semStatus(sem)
  return (
    <div className="mt-6 rounded-xl border border-blue-200 bg-primary-soft p-4">
      <div className="flex items-start gap-3">
        <CalendarRange className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">Đợt đăng ký học phần · {sem.name}</p><SemBadge s={st} /></div>
          <p className="mt-1 text-[13px] text-muted">Mở: <b className="font-medium text-ink">{fmtDT(sem.openAt)}</b> · Đóng: <b className="font-medium text-ink">{fmtDT(sem.closeAt)}</b> (giờ Việt Nam)</p>
        </div>
      </div>
    </div>
  )
}

export function LoginPage() {
  const q = query(useRoute())
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const go = async (user: string, pass: string, key: string) => {
    setErr(''); setLoading(key)
    try {
      const a = await login(user, pass)
      navigate(a.role === 'admin' ? '/admin/dashboard' : '/student/dashboard')
    } catch (e) { setErr((e as Error).message); setLoading(null) }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (!u.trim()) er.u = 'Vui lòng nhập tên đăng nhập.'
    if (!p) er.p = 'Vui lòng nhập mật khẩu.'
    setErrors(er)
    if (!Object.keys(er).length) go(u, p, 'form')
  }
  return (
    <AuthShell>
      <h2 className="text-2xl font-semibold">Đăng nhập</h2>
      <p className="mt-1 text-sm text-muted">Sử dụng tài khoản do nhà trường cấp. Quyền truy cập được xác định theo tài khoản.</p>
      <PeriodNotice />
      <div className="mt-4 space-y-3">
        {q.get('expired') && <Alert tone="warning" title="Phiên đăng nhập đã hết hạn">Phiên làm việc kéo dài 20 phút. Vui lòng đăng nhập lại để tiếp tục; các đăng ký đã thành công vẫn được giữ nguyên.</Alert>}
        {q.get('done') && <Alert tone="success" title="Đăng ký học phần đã hoàn tất">Phiên làm việc đã kết thúc. Đăng nhập lại để xem kết quả hoặc đăng ký thêm.</Alert>}
        {q.get('registered') && <Alert tone="success" title="Tạo tài khoản thành công">Bạn có thể đăng nhập bằng tài khoản vừa tạo.</Alert>}
        {err && <Alert tone="error">{err}</Alert>}
      </div>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        <Field id="username" label="Tên đăng nhập" error={errors.u} required>
          <Input id="username" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} error={errors.u} placeholder="VD: sinhvien" />
        </Field>
        <Field id="password" label="Mật khẩu" error={errors.p} required>
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} error={errors.p} className="pr-12" />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-0.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-slate-100" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={show}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">Quên mật khẩu?</Link></div>
        <Button type="submit" className="w-full" loading={loading === 'form'} disabled={!!loading}>{loading === 'form' ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
      </form>
    </AuthShell>
  )
}

export function RegisterPage() {
  const [f, setF] = useState({ name: '', code: '', username: '', faculty: '', major: '', password: '', confirm: '' })
  const [e, setE] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const set = (k: keyof typeof f) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value, ...(k === 'faculty' ? { major: '' } : {}) })
  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    const er: Record<string, string> = {}
    if (!f.name.trim()) er.name = 'Vui lòng nhập họ và tên.'
    if (!f.code.trim()) er.code = 'Vui lòng nhập mã số sinh viên.'
    else if (!/^\d{8}$/.test(f.code.trim())) er.code = 'Mã số sinh viên gồm 8 chữ số.'
    if (!f.username.trim()) er.username = 'Vui lòng nhập tên đăng nhập.'
    if (!f.faculty) er.faculty = 'Vui lòng chọn khoa.'
    if (!f.major) er.major = 'Vui lòng chọn ngành.'
    if (!f.password) er.password = 'Vui lòng nhập mật khẩu.'
    else if (f.password.length < 6) er.password = 'Mật khẩu tối thiểu 6 ký tự.'
    if (!f.confirm) er.confirm = 'Vui lòng nhập lại mật khẩu.'
    else if (f.confirm !== f.password) er.confirm = 'Mật khẩu xác nhận không khớp.'
    setE(er)
    if (Object.keys(er).length) return
    setLoading(true)
    try { await registerAccount(f); setDone(true) } catch (x) { setE((x as ApiError & { fields?: Record<string, string> }).fields ?? { form: (x as Error).message }) } finally { setLoading(false) }
  }
  if (done)
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></div>
          <h2 className="mt-4 text-2xl font-semibold">Đăng ký tài khoản thành công</h2>
          <p className="mt-2 text-sm text-muted">Tài khoản <b className="text-ink">{f.username}</b> đã được tạo với vai trò Sinh viên.</p>
          <Button className="mt-6 w-full" onClick={() => navigate('/login?registered=1')}>Quay về đăng nhập</Button>
        </div>
      </AuthShell>
    )
  return (
    <AuthShell>
      <Link to="/login" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary"><ArrowLeft className="h-4 w-4" />Đăng nhập</Link>
      <h2 className="text-2xl font-semibold">Đăng ký tài khoản</h2>
      <p className="mt-1 text-sm text-muted">Tạo tài khoản sinh viên để đăng ký học phần.</p>
      {e.form && <div className="mt-4"><Alert tone="error">{e.form}</Alert></div>}
      <form onSubmit={submit} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field id="r-name" label="Họ và tên" required error={e.name}><Input id="r-name" value={f.name} onChange={set('name')} error={e.name} /></Field></div>
        <Field id="r-code" label="Mã số sinh viên" required error={e.code}><Input id="r-code" inputMode="numeric" value={f.code} onChange={set('code')} error={e.code} placeholder="VD: 24021111" /></Field>
        <Field id="r-user" label="Tên đăng nhập" required error={e.username}><Input id="r-user" value={f.username} onChange={set('username')} error={e.username} autoComplete="username" /></Field>
        <Field id="r-fac" label="Khoa" required error={e.faculty}>
          <Select id="r-fac" value={f.faculty} onChange={set('faculty')} error={e.faculty}><option value="">Chọn khoa</option>{Object.keys(FACULTIES).map((x) => <option key={x}>{x}</option>)}</Select>
        </Field>
        <Field id="r-major" label="Ngành" required error={e.major}>
          <Select id="r-major" value={f.major} onChange={set('major')} error={e.major} disabled={!f.faculty}><option value="">{f.faculty ? 'Chọn ngành' : 'Chọn khoa trước'}</option>{(FACULTIES[f.faculty] ?? []).map((x) => <option key={x}>{x}</option>)}</Select>
        </Field>
        <Field id="r-pw" label="Mật khẩu" required error={e.password}><Input id="r-pw" type="password" value={f.password} onChange={set('password')} error={e.password} autoComplete="new-password" /></Field>
        <Field id="r-pw2" label="Xác nhận mật khẩu" required error={e.confirm}><Input id="r-pw2" type="password" value={f.confirm} onChange={set('confirm')} error={e.confirm} autoComplete="new-password" /></Field>
        <Button type="submit" className="sm:col-span-2" loading={loading}>Đăng ký tài khoản</Button>
      </form>
      <p className="mt-4 text-[13px] text-muted">Gợi ý demo: thử tên đăng nhập “sinhvien” hoặc mã “22021234” để xem lỗi trùng.</p>
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

export function StatusPage({ code }: { code: '403' | '404' | 'network' }) {
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
        {code === 'network' && <Button onClick={() => history.back()}>Thử lại</Button>}
        <Button variant="secondary" onClick={() => navigate('/')}>Về trang chính</Button>
      </div>
    </div>
  )
}
