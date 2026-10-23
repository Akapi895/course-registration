import { Fragment, useState, type FormEvent } from 'react'
import { School, ListChecks, Ban, Plus, Pencil, Trash2, Search, Eye, ArrowLeft, Users, CalendarClock, MapPin, FilterX, Lock, History } from 'lucide-react'
import Layout from '../Layout'
import { Link, navigate } from '../router'
import { ApiError, type ClassInput, DAYS, adminListClasses, adminSearchStudents, bundleLabel, cls, course, credits, db, deleteClass, fmtDT, createRegistrationPeriod, listRegistrationPeriods, periodStatus, saveClass, semester, student, studentRegs, ui, updateRegistrationPeriod, updateStudent, useDb } from '../api'
import { FACULTIES, SHARED, STUDENT_EDITABLE_FIELDS, policy, type RegPeriod, type Session } from '../data'
import { Alert, Badge, Button, Capacity, Card, Empty, Field, Input, Modal, PageHeader, Pagination, SemBadge, Select, Skeleton, Stat, Table, Td, cx, seatState, toast, useLoading } from '../ui'
import { PeriodBanner, SessionList } from './student'

type FieldErr = ApiError & { fields?: Record<string, string> }
const allMajors = Object.values(FACULTIES).flat()
// datetime-local values are always interpreted in Vietnam time (UTC+7), regardless of the browser timezone.
const toLocal = (iso: string) => new Date(+new Date(iso) + 7 * 3600000).toISOString().slice(0, 16)
const fromLocal = (s: string) => new Date(s + ':00+07:00').toISOString()
/** Show business errors in Vietnamese only; never leak internal messages. */
const friendly = (e: unknown) => (e instanceof ApiError ? e.message : 'Không thể kết nối. Vui lòng thử lại.')

// ---------------- Dashboard ----------------
export function AdminDashboard() {
  useDb()
  const sem = semester(ui.semesterId)
  const list = db.classes.filter((c) => c.semesterId === sem.id)
  const regs = db.registrations.filter((r) => cls(r.classId)?.semesterId === sem.id).length
  const seats = list.reduce((n, c) => n + c.enrolled, 0)
  const full = list.filter((c) => c.enrolled >= c.capacity).length
  const near = list.filter((c) => seatState(c) !== 'open').sort((a, b) => b.enrolled / b.capacity - a.enrolled / a.capacity)
  return (
    <Layout title="Tổng quan quản trị">
      <PageHeader title="Tổng quan" desc={`${sem.name} · Số liệu tính từ dữ liệu demo`}
        actions={<>
          <Button onClick={() => navigate('/admin/classes?new=1')}><Plus className="h-4 w-4" />Tạo lớp học phần</Button>
          <Button variant="secondary" onClick={() => navigate('/admin/students')}><Search className="h-4 w-4" />Tra cứu sinh viên</Button>
          <Button variant="secondary" onClick={() => navigate('/admin/registration-period')}><CalendarClock className="h-4 w-4" />Cấu hình đợt đăng ký</Button>
        </>} />
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Số lớp học phần" value={list.length} icon={<School className="h-5 w-5" />} sub={sem.name} />
          <Stat label="Tổng lượt đăng ký" value={seats} icon={<ListChecks className="h-5 w-5" />} sub={`Tổng sĩ số các lớp · ${regs} lượt từ tài khoản demo`} />
          <Stat label="Số lớp đầy" value={full} icon={<Ban className="h-5 w-5" />} />
        </div>
        <PeriodBanner />
        <Card title="Lớp gần đầy và đã đầy" action={<Link to="/admin/classes" className="text-sm font-medium text-primary hover:underline">Quản lý lớp</Link>}>
          {near.length === 0 ? <Empty title="Chưa có lớp gần đầy" /> : (
            <Table head={['Mã lớp', 'Học phần', 'Giảng viên', 'Sĩ số', 'Trạng thái']} minWidth={700}>
              {near.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap font-medium"><Link to={`/admin/classes/${c.id}`} className="text-primary hover:underline">{c.code}</Link></Td>
                  <Td>{course(c.courseId).name}</Td><Td className="whitespace-nowrap">{c.lecturer}</Td><Td><Capacity c={c} /></Td>
                  <Td>{c.enrolled >= c.capacity ? <Badge tone="red">Đã đầy</Badge> : <Badge tone="orange">Gần đầy</Badge>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </Layout>
  )
}

// ---------------- Classes ----------------
type Form = { courseId: string; semesterId: string; code: string; lecturer: string; capacity: string; sessions: { day: string; start: string; end: string; room: string }[] }
function ClassForm({ id, onClose }: { id: string; onClose: () => void }) {
  const ex = id !== 'new' ? cls(id) : undefined
  const locked = !!ex && ex.enrolled > 0 && policy.lockScheduleWhenRegistered
  const [f, setF] = useState<Form>(() => ex
    ? { courseId: ex.courseId, semesterId: ex.semesterId, code: ex.code, lecturer: ex.lecturer, capacity: String(ex.capacity), sessions: ex.sessions.map((s) => ({ day: String(s.day), start: String(s.start), end: String(s.end), room: s.room })) }
    : { courseId: '', semesterId: ui.semesterId, code: '', lecturer: '', capacity: '40', sessions: [{ day: '2', start: '1', end: '3', room: '' }] })
  const [e, setE] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const setS = (i: number, k: keyof Form['sessions'][0], v: string) => setF({ ...f, sessions: f.sessions.map((s, j) => (j === i ? { ...s, [k]: v } : s)) })
  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    const er: Record<string, string> = {}
    if (!f.courseId) er.courseId = 'Vui lòng chọn học phần.'
    if (!f.code.trim()) er.code = 'Vui lòng nhập mã lớp.'
    if (!f.lecturer.trim()) er.lecturer = 'Vui lòng nhập tên giảng viên.'
    const cap = Number(f.capacity)
    if (!f.capacity || !Number.isInteger(cap) || cap <= 0) er.capacity = 'Sức chứa phải là số nguyên dương.'
    else if (ex && cap < ex.enrolled) er.capacity = `Không được thấp hơn sĩ số hiện tại (${ex.enrolled}).`
    if (!f.sessions.length) er.sessions = 'Cần ít nhất một buổi học.'
    f.sessions.forEach((s, i) => {
      if (!s.room.trim()) er['room' + i] = 'Nhập phòng học.'
      if (+s.end < +s.start) er['end' + i] = 'Tiết kết thúc không nhỏ hơn tiết bắt đầu.'
      const dup = f.sessions.findIndex((o, j) => j < i && o.day === s.day && +o.start <= +s.end && +s.start <= +o.end)
      if (dup >= 0) er['end' + i] = `Trùng giờ với buổi ${dup + 1}.`
    })
    setE(er)
    if (Object.keys(er).length) return
    setBusy(true)
    const data: ClassInput = { courseId: f.courseId, semesterId: f.semesterId, code: f.code.trim(), lecturer: f.lecturer.trim(), capacity: cap, sessions: f.sessions.map<Session>((s) => ({ day: +s.day, start: +s.start, end: +s.end, room: s.room.trim() })) }
    try {
      await saveClass(data, ex?.id)
      toast(ex ? `Đã cập nhật lớp ${data.code}.` : `Đã tạo lớp ${data.code}.`)
      onClose()
    } catch (x) {
      // Keep the form data; show the backend reason.
      setE({ ...((x as FieldErr).fields ?? {}), form: friendly(x) })
    } finally { setBusy(false) }
  }
  const periods = Array.from({ length: 12 }, (_, i) => i + 1)
  return (
    <Modal open size="lg" onClose={onClose} closable={!busy} title={ex ? `Chỉnh sửa lớp ${ex.code}` : 'Tạo lớp học phần'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Hủy</Button><Button onClick={submit} loading={busy}>{busy ? 'Đang lưu…' : ex ? 'Lưu thay đổi' : 'Tạo lớp'}</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {locked && <Alert tone="info" title={`Lớp đã có ${ex!.enrolled} sinh viên đăng ký`}>Theo chính sách demo (có thể thay đổi), học phần, học kỳ, mã lớp và lịch học bị khóa. Bạn vẫn sửa được giảng viên và sức chứa (không thấp hơn sĩ số hiện tại).</Alert>}
        {e.form && <Alert tone="error" title="Không thể lưu">{e.form}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cf-course" label="Học phần" required error={e.courseId}><Select id="cf-course" value={f.courseId} disabled={locked} onChange={(x) => setF({ ...f, courseId: x.target.value })} error={e.courseId}><option value="">Chọn học phần</option>{db.courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.credits} TC)</option>)}</Select></Field>
          <Field id="cf-sem" label="Học kỳ" required><Select id="cf-sem" value={f.semesterId} disabled={locked} onChange={(x) => setF({ ...f, semesterId: x.target.value })}>{db.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field id="cf-code" label="Mã lớp" required error={e.code} hint="Duy nhất trong học kỳ, VD: INT2211 3"><Input id="cf-code" value={f.code} disabled={locked} onChange={(x) => setF({ ...f, code: x.target.value })} error={e.code} /></Field>
          <Field id="cf-lec" label="Giảng viên" required error={e.lecturer}><Input id="cf-lec" value={f.lecturer} onChange={(x) => setF({ ...f, lecturer: x.target.value })} error={e.lecturer} /></Field>
          <Field id="cf-cap" label="Sức chứa tối đa" required error={e.capacity} hint={ex ? `Đã đăng ký: ${ex.enrolled} — do hệ thống tính, không sửa trực tiếp` : 'Số đã đăng ký do hệ thống tự tính'}><Input id="cf-cap" type="number" min={1} value={f.capacity} onChange={(x) => setF({ ...f, capacity: x.target.value })} error={e.capacity} /></Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Buổi học <span className="text-red-600" aria-hidden>*</span></p>
            {!locked && <Button size="sm" variant="ghost" onClick={() => setF({ ...f, sessions: [...f.sessions, { day: '2', start: '1', end: '3', room: '' }] })}><Plus className="h-4 w-4" />Thêm buổi</Button>}
          </div>
          {e.sessions && <p className="mb-2 text-[13px] text-red-600">{e.sessions}</p>}
          <div className="space-y-3">
            {f.sessions.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
                <Field id={`d${i}`} label="Thứ"><Select id={`d${i}`} value={s.day} disabled={locked} onChange={(x) => setS(i, 'day', x.target.value)}>{[2, 3, 4, 5, 6, 7, 8].map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}</Select></Field>
                <Field id={`s${i}`} label="Tiết bắt đầu"><Select id={`s${i}`} value={s.start} disabled={locked} onChange={(x) => setS(i, 'start', x.target.value)}>{periods.map((p) => <option key={p}>{p}</option>)}</Select></Field>
                <Field id={`e${i}`} label="Tiết kết thúc" error={e['end' + i]}><Select id={`e${i}`} value={s.end} disabled={locked} onChange={(x) => setS(i, 'end', x.target.value)} error={e['end' + i]}>{periods.map((p) => <option key={p}>{p}</option>)}</Select></Field>
                <Field id={`r${i}`} label="Phòng" error={e['room' + i]}><Input id={`r${i}`} value={s.room} disabled={locked} onChange={(x) => setS(i, 'room', x.target.value)} error={e['room' + i]} /></Field>
                <div className="flex items-end"><Button variant="ghost" className="text-red-600" disabled={locked || f.sessions.length <= 1} onClick={() => setF({ ...f, sessions: f.sessions.filter((_, j) => j !== i) })} aria-label={`Xóa buổi ${i + 1}`}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}
          </div>
        </div>
        {ex && ex.practice.length > 0 && <p className="text-[13px] text-muted">Lớp có {ex.practice.length} nhóm thực hành đi kèm; các nhóm được giữ nguyên khi lưu.</p>}
      </form>
    </Modal>
  )
}

function DeleteClassModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const c = cls(id)
  if (!c) return null
  const regCount = Math.max(c.enrolled, db.registrations.filter((r) => r.classId === id).length)
  const blocked = regCount > 0 && !policy.allowDeleteClassWithRegistrations
  return (
    <Modal open title="Xóa lớp học phần" onClose={onClose} closable={!busy}
      footer={blocked || err ? <Button variant="secondary" onClick={onClose}>Đóng</Button> : <>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Hủy</Button>
        <Button variant="danger" loading={busy} onClick={async () => { setBusy(true); try { await deleteClass(id, policy.allowDeleteClassWithRegistrations); toast(`Đã xóa lớp ${c.code}.`); onClose() } catch (e) { setErr(friendly(e)) } setBusy(false) }}>Xóa lớp</Button>
      </>}>
      <div className="space-y-3 text-sm">
        <p>Lớp <b>{c.code}</b> – {course(c.courseId).name} · {semester(c.semesterId).name}</p>
        {blocked ? <Alert tone="error" title="Không thể xóa lớp này">Lớp đang có {regCount} sinh viên đăng ký. Theo chính sách demo (có thể thay đổi), chỉ được xóa lớp chưa có đăng ký.</Alert>
          : err ? <Alert tone="error" title="Không thể xóa">{err}</Alert>
          : <Alert tone="warning">Lớp chưa có đăng ký. Thao tác xóa không thể hoàn tác{c.practice.length ? ` và xóa cả ${c.practice.length} nhóm thực hành đi kèm` : ''}.</Alert>}
        <p className="text-[13px] text-muted">Chính sách xóa/hủy lớp chưa được SRS chốt chi tiết; hệ thống không tự hủy đăng ký hoặc thay đổi lịch sinh viên.</p>
      </div>
    </Modal>
  )
}

export function AdminClasses({ isNew }: { isNew?: boolean }) {
  useDb()
  const loading = useLoading(400)
  const [q, setQ] = useState('')
  const [sem, setSem] = useState(ui.semesterId)
  const [fac, setFac] = useState('')
  const [major, setMajor] = useState('')
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState<string | null>(isNew ? 'new' : null)
  const [del, setDel] = useState<string | null>(null)
  const list = adminListClasses({ q, semesterId: sem, faculty: fac, major })
  const size = 10
  const pg = Math.min(page, Math.max(1, Math.ceil(list.length / size)))
  const up = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(1) }
  const filtered = q || fac || major || sem !== ui.semesterId
  return (
    <Layout title="Quản lý lớp học phần">
      <PageHeader title="Quản lý lớp học phần" desc={`${list.length} lớp phù hợp`} actions={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Tạo lớp học phần</Button>} />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <label className="relative"><span className="sr-only">Tìm kiếm</span><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => up(setQ)(e.target.value)} placeholder="Mã lớp hoặc tên học phần" className="pl-10" /></label>
          <Select aria-label="Học kỳ" value={sem} onChange={(e) => up(setSem)(e.target.value)}><option value="">Tất cả học kỳ</option>{db.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select aria-label="Khoa" value={fac} onChange={(e) => { up(setFac)(e.target.value); setMajor('') }}><option value="">Tất cả khoa</option>{[...Object.keys(FACULTIES), SHARED].map((f) => <option key={f}>{f}</option>)}</Select>
          <Select aria-label="Ngành" value={major} onChange={(e) => up(setMajor)(e.target.value)}><option value="">Tất cả ngành</option>{(fac && FACULTIES[fac] ? FACULTIES[fac] : allMajors).map((m) => <option key={m}>{m}</option>)}</Select>
          <Button variant="ghost" disabled={!filtered} onClick={() => { setQ(''); setFac(''); setMajor(''); setSem(ui.semesterId); setPage(1) }}><FilterX className="h-4 w-4" />Xóa lọc</Button>
        </div>
        {loading ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : list.length === 0 ? <Empty title="Không có lớp phù hợp" text="Thử thay đổi từ khóa hoặc bộ lọc." /> : <>
          <Table head={['Mã lớp', 'Học phần', 'TC', 'Giảng viên', 'Lịch học / Phòng', 'Sĩ số', 'Thao tác']} minWidth={1040}>
            {list.slice((pg - 1) * size, pg * size).map((c) => { const x = course(c.courseId); return (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td className="whitespace-nowrap font-medium">{c.code}{c.practice.length > 0 && <div className="text-xs font-normal text-muted">+ {c.practice.length} nhóm TH</div>}</Td>
                <Td>{x.name}<div className="text-xs text-muted">{x.code} · {x.faculty}</div></Td>
                <Td>{x.credits}</Td>
                <Td className="whitespace-nowrap">{c.lecturer}</Td>
                <Td><SessionList sessions={c.sessions} /></Td>
                <Td><Capacity c={c} /></Td>
                <Td><div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/classes/${c.id}`)} aria-label={`Xem lớp ${c.code}`} title="Xem chi tiết"><Eye className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(c.id)} aria-label={`Sửa lớp ${c.code}`} title="Chỉnh sửa"><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDel(c.id)} aria-label={`Xóa lớp ${c.code}`} title="Xóa"><Trash2 className="h-4 w-4" /></Button>
                </div></Td>
              </tr>
            ) })}
          </Table>
          <Pagination page={pg} total={list.length} size={size} onChange={setPage} />
        </>}
      </Card>
      <p className="mt-3 text-[13px] text-muted">Danh sách quản trị gồm cả lớp ngoài đợt đăng ký (mock adapter; contract truy vấn mở rộng đang chờ xác định).</p>
      {edit && <ClassForm id={edit} onClose={() => { setEdit(null); if (isNew) navigate('/admin/classes') }} />}
      {del && <DeleteClassModal id={del} onClose={() => setDel(null)} />}
    </Layout>
  )
}

export function AdminClassDetail({ id }: { id: string }) {
  useDb()
  const [edit, setEdit] = useState(false)
  const [del, setDel] = useState(false)
  const c = cls(id)
  if (!c) return <Layout title="Chi tiết lớp" semester={false}><Card><Empty title="Không tìm thấy lớp học phần" text="Lớp có thể đã bị xóa." action={<Button onClick={() => navigate('/admin/classes')}>Quay lại danh sách</Button>} /></Card></Layout>
  const co = course(c.courseId)
  const regs = db.registrations.filter((r) => r.classId === id)
  return (
    <Layout title="Chi tiết lớp học phần" semester={false}>
      <PageHeader crumbs={<><Link to="/admin/classes" className="hover:text-primary">Quản lý lớp học phần</Link> <span aria-hidden>/</span> {c.code}</>} title={`${c.code} · ${co.name}`} desc={`${co.code} · ${co.credits} tín chỉ · ${semester(c.semesterId).name}`}
        actions={<><Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Chỉnh sửa</Button><Button variant="secondary" className="text-red-600" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" />Xóa</Button></>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card title="Lịch học">
            <Table head={['Thứ', 'Tiết', 'Phòng']} minWidth={360}>
              {c.sessions.map((x, i) => <tr key={i}><Td className="font-medium">{DAYS[x.day]}</Td><Td>Tiết {x.start}–{x.end}</Td><Td><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted" />{x.room}</span></Td></tr>)}
            </Table>
          </Card>
          {c.practice.length > 0 && (
            <Card title="Nhóm thực hành đi kèm">
              <Table head={['Nhóm', 'Giảng viên', 'Lịch / Phòng', 'Sĩ số']} minWidth={600}>
                {c.practice.map((g) => <tr key={g.id}><Td className="whitespace-nowrap font-medium">{g.code}</Td><Td className="whitespace-nowrap">{g.lecturer}</Td><Td><SessionList sessions={g.sessions} /></Td><Td><Capacity c={g} /></Td></tr>)}
              </Table>
            </Card>
          )}
          <Card title={`Sinh viên trong hệ thống demo đã đăng ký (${regs.length})`}>
            {regs.length === 0 ? <p className="p-5 text-sm text-muted">Chưa có tài khoản demo nào đăng ký lớp này.</p> : (
              <ul className="divide-y divide-line">{regs.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm"><Link to={`/admin/students/${r.studentId}`} className="font-medium text-primary hover:underline">{student(r.studentId).name}</Link><span className="text-muted">{student(r.studentId).code} · {bundleLabel(r.classId, r.practiceId)}</span></li>)}</ul>
            )}
          </Card>
        </div>
        <Card title="Thông tin lớp" className="h-fit">
          <dl className="space-y-3 p-5 text-sm">
            {([['Học phần', `${co.code} · ${co.name}`], ['Khoa', co.faculty], ['Ngành', co.majors.join(', ') || 'Toàn trường'], ['Giảng viên', c.lecturer], ['Sức chứa', c.capacity], ['Đã đăng ký', c.enrolled]] as const).map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            <Capacity c={c} />
          </dl>
        </Card>
      </div>
      {edit && <ClassForm id={id} onClose={() => setEdit(false)} />}
      {del && <DeleteClassModal id={id} onClose={() => { setDel(false); if (!cls(id)) navigate('/admin/classes') }} />}
    </Layout>
  )
}

// ---------------- Students ----------------
export function AdminStudents() {
  useDb()
  const loading = useLoading(400)
  const [q, setQ] = useState('')
  const [fac, setFac] = useState('')
  const [major, setMajor] = useState('')
  const [page, setPage] = useState(1)
  const sem = semester(ui.semesterId)
  const list = adminSearchStudents({ q, faculty: fac, major })
  const size = 10
  const pg = Math.min(page, Math.max(1, Math.ceil(list.length / size)))
  return (
    <Layout title="Quản lý sinh viên">
      <PageHeader title="Quản lý sinh viên" desc={`${list.length} sinh viên · Tín chỉ theo ${sem.name}`} />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-[2fr_1fr_1fr]">
          <label className="relative"><span className="sr-only">Tìm kiếm</span><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Mã sinh viên, tên đăng nhập hoặc họ tên" className="pl-10" /></label>
          <Select aria-label="Khoa" value={fac} onChange={(e) => { setFac(e.target.value); setMajor(''); setPage(1) }}><option value="">Tất cả khoa</option>{Object.keys(FACULTIES).map((f) => <option key={f}>{f}</option>)}</Select>
          <Select aria-label="Ngành" value={major} onChange={(e) => { setMajor(e.target.value); setPage(1) }}><option value="">Tất cả ngành</option>{(fac ? FACULTIES[fac] : allMajors).map((m) => <option key={m}>{m}</option>)}</Select>
        </div>
        {loading ? <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div> : list.length === 0 ? <Empty title="Không tìm thấy sinh viên" text="Kiểm tra lại mã sinh viên hoặc bộ lọc." icon={<Users className="h-6 w-6" />} /> : <>
          <Table head={['MSSV', 'Họ và tên', 'Khoa', 'Ngành', 'Tín chỉ', 'Thao tác']} minWidth={880}>
            {list.slice((pg - 1) * size, pg * size).map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td className="font-medium">{s.code}</Td><Td>{s.name}</Td><Td>{s.faculty}</Td><Td>{s.major}</Td>
                <Td className="whitespace-nowrap">{credits(s.id, sem.id)}/{sem.maxCredits}</Td>
                <Td><Button size="sm" variant="secondary" onClick={() => navigate(`/admin/students/${s.id}`)}>Xem hồ sơ</Button></Td>
              </tr>
            ))}
          </Table>
          <Pagination page={pg} total={list.length} size={size} onChange={setPage} />
        </>}
      </Card>
      <p className="mt-3 text-[13px] text-muted">Tra cứu danh sách dùng mock adapter vì SRS chưa có endpoint tìm kiếm sinh viên. Hồ sơ chi tiết dùng GET/PUT /api/students/{'{id}'}.</p>
    </Layout>
  )
}

export function AdminStudentDetail({ id }: { id: string }) {
  useDb()
  const s = db.students.find((x) => x.id === id)
  const [name, setName] = useState(s?.name ?? '')
  const [err, setErr] = useState('')
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!s) return <Layout title="Hồ sơ sinh viên" semester={false}><Card><Empty title="Không tìm thấy sinh viên" action={<Button onClick={() => navigate('/admin/students')}>Quay lại</Button>} /></Card></Layout>
  const sem = semester(ui.semesterId)
  const regs = studentRegs(s.id, sem.id)
  const editable = (f: string) => (STUDENT_EDITABLE_FIELDS as readonly string[]).includes(f)
  const dirty = name.trim() !== s.name
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setFormErr('')
    if (!name.trim()) return setErr('Vui lòng nhập họ và tên.')
    if (name.trim().length < 3) return setErr('Họ và tên phải có ít nhất 3 ký tự.')
    setErr(''); setBusy(true)
    try { await updateStudent(s.id, { name: name.trim() }); toast('Đã lưu hồ sơ sinh viên.') }
    catch (x) { setFormErr(friendly(x)) } finally { setBusy(false) }
  }
  const ro = (fid: string, label: string, v: string) => <Field id={fid} label={label} hint="Chỉ đọc theo phân quyền hiện tại"><Input id={fid} value={v} readOnly disabled /></Field>
  return (
    <Layout title="Hồ sơ sinh viên">
      <PageHeader crumbs={<><Link to="/admin/students" className="hover:text-primary">Quản lý sinh viên</Link> <span aria-hidden>/</span> {s.code}</>} title={s.name} desc={`${s.code} · ${s.faculty} · ${s.major}`} actions={<Button variant="secondary" onClick={() => navigate('/admin/students')}><ArrowLeft className="h-4 w-4" />Danh sách</Button>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card title="Thông tin hồ sơ">
          <form onSubmit={save} noValidate className="space-y-5 p-5">
            {formErr && <Alert tone="error" title="Không thể lưu">{formErr}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">{editable('name') ? <Field id="sd-name" label="Họ và tên" required error={err}><Input id="sd-name" value={name} onChange={(e) => setName(e.target.value)} error={err} /></Field> : ro('sd-name', 'Họ và tên', s.name)}</div>
              {ro('sd-code', 'Mã số sinh viên', s.code)}
              {ro('sd-user', 'Tên đăng nhập', s.username ?? '—')}
              {ro('sd-fac', 'Khoa', s.faculty)}
              {ro('sd-major', 'Ngành', s.major)}
              {ro('sd-role', 'Vai trò', 'Sinh viên')}
            </div>
            <p className="flex items-center gap-1.5 text-[13px] text-muted"><Lock className="h-3.5 w-3.5" />Trường định danh, vai trò và thông tin đào tạo chỉ sửa được khi contract cho phép.</p>
            <div className="flex flex-col-reverse justify-end gap-2 border-t border-line pt-5 sm:flex-row">
              <Button variant="secondary" disabled={!dirty || busy} onClick={() => { setName(s.name); setErr(''); setFormErr('') }}>Hủy</Button>
              <Button type="submit" loading={busy} disabled={!dirty}>Lưu thay đổi</Button>
            </div>
          </form>
        </Card>
        <Card title={`Đăng ký · ${sem.name}`} action={<span className="text-sm text-muted">{credits(s.id, sem.id)}/{sem.maxCredits} TC</span>}>
          {regs.length === 0 ? <Empty title="Chưa có đăng ký trong học kỳ này" /> : (
            <ul className="divide-y divide-line">{regs.map((r) => { const c = cls(r.classId)!; return <li key={r.id} className="px-5 py-3 text-sm"><p className="font-medium">{course(c.courseId).name}</p><p className="text-muted">{bundleLabel(r.classId, r.practiceId)} · {course(c.courseId).credits} TC</p></li> })}</ul>
          )}
          <p className="border-t border-line px-5 py-3 text-[13px] text-muted">Chỉ xem. Quản trị viên không đăng ký/hủy thay sinh viên.</p>
        </Card>
      </div>
    </Layout>
  )
}

// ---------------- Registration periods ----------------
export function AdminRegistrationPeriod() {
  useDb()
  const sem = semester(ui.semesterId)
  const list = listRegistrationPeriods(sem.id)
  const [edit, setEdit] = useState<RegPeriod | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Layout title="Cấu hình đợt đăng ký">
      <PageHeader title="Cấu hình đợt đăng ký" desc={`${sem.name} · Thời gian theo múi giờ Việt Nam (UTC+7)`} />
      <div className="space-y-6">
        <PeriodBanner />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card title="Tạo đợt đăng ký mới">
            <PeriodForm key={sem.id + list.length} semesterId={sem.id} />
          </Card>
          <Card title="Ảnh hưởng tới sinh viên" className="h-fit">
            <ul className="list-disc space-y-2 py-5 pl-10 pr-5 text-sm text-muted">
              <li>Trong đợt đang mở: sinh viên được đăng ký và hủy đăng ký.</li>
              <li>Ngoài đợt: vẫn xem được học phần đã đăng ký và thời khóa biểu; đăng ký/hủy bị khóa kèm lý do.</li>
              <li>Các đợt trong cùng học kỳ không được chồng thời gian lên nhau.</li>
            </ul>
          </Card>
        </div>
        <Card title={`Lịch sử đợt đăng ký (${list.length})`}>
          {list.length === 0 ? <Empty title="Chưa có đợt đăng ký" text="Tạo đợt đăng ký đầu tiên cho học kỳ này." icon={<CalendarClock className="h-6 w-6" />} /> : (
            <Table head={['Đợt', 'Mở đăng ký', 'Đóng đăng ký', 'Trạng thái', 'Tạo lúc', 'Cập nhật lần cuối', 'Thao tác']} minWidth={980}>
              {list.map((p) => (
                <Fragment key={p.id}>
                  <tr className={cx('hover:bg-slate-50', periodStatus(p) === 'open' && 'bg-primary-soft/50')}>
                    <Td className="font-semibold">{p.name}</Td>
                    <Td className="whitespace-nowrap">{fmtDT(p.openAt)}</Td>
                    <Td className="whitespace-nowrap">{fmtDT(p.closeAt)}</Td>
                    <Td><SemBadge s={periodStatus(p)} /></Td>
                    <Td className="whitespace-nowrap text-muted">{fmtDT(p.createdAt)}</Td>
                    <Td className="whitespace-nowrap text-muted">{p.revisions.length ? `${fmtDT(p.updatedAt)} · ${p.revisions.length} lần sửa` : '—'}</Td>
                    <Td><div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEdit(p)}><Pencil className="h-4 w-4" />Chỉnh sửa</Button>
                      <Button size="sm" variant="ghost" disabled={!p.revisions.length} aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}><History className="h-4 w-4" />Lịch sử</Button>
                    </div></Td>
                  </tr>
                  {open === p.id && (
                    <tr><td colSpan={7} className="bg-slate-50 px-6 py-4">
                      <p className="mb-2 text-sm font-medium">Các lần chỉnh sửa {p.name}</p>
                      <ul className="space-y-1.5 text-sm">
                        {p.revisions.map((r, i) => (
                          <li key={i} className="flex flex-wrap gap-x-2 text-muted"><span className="font-medium text-ink">{fmtDT(r.at)}</span>· Giá trị trước khi sửa: Mở {fmtDT(r.openAt)} – Đóng {fmtDT(r.closeAt)}</li>
                        ))}
                        <li className="text-muted"><span className="font-medium text-ink">{fmtDT(p.createdAt)}</span> · Tạo đợt</li>
                      </ul>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </Table>
          )}
          <p className="border-t border-line px-5 py-3 text-[13px] text-muted">Lưu qua PUT /api/registration-period. Endpoint đọc danh sách, chỉnh sửa đợt và cấu trúc payload chính thức chưa được SRS xác định (mock adapter).</p>
        </Card>
      </div>
      {edit && (
        <Modal open title={`Chỉnh sửa ${edit.name}`} onClose={() => setEdit(null)}>
          <PeriodForm semesterId={sem.id} period={edit} onDone={() => setEdit(null)} />
        </Modal>
      )}
    </Layout>
  )
}

function PeriodForm({ semesterId, period, onDone }: { semesterId: string; period?: RegPeriod; onDone?: () => void }) {
  const [o, setO] = useState(period ? toLocal(period.openAt) : '')
  const [c, setC] = useState(period ? toLocal(period.closeAt) : '')
  const [e, setE] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const dirty = period ? o !== toLocal(period.openAt) || c !== toLocal(period.closeAt) : !!(o || c)
  const preview = o && c && c > o ? periodStatus({ openAt: fromLocal(o), closeAt: fromLocal(c) }) : null
  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    const er: Record<string, string> = {}
    if (!o) er.open = 'Vui lòng chọn thời điểm mở.'
    if (!c) er.close = 'Vui lòng chọn thời điểm đóng.'
    else if (o && c <= o) er.close = 'Thời điểm mở phải trước thời điểm đóng.'
    setE(er)
    if (Object.keys(er).length) return
    setBusy(true)
    try {
      if (period) await updateRegistrationPeriod(period.id, fromLocal(o), fromLocal(c))
      else await createRegistrationPeriod(semesterId, fromLocal(o), fromLocal(c))
      toast(period ? `Đã cập nhật ${period.name}.` : 'Đã tạo đợt đăng ký mới.')
      if (!period) { setO(''); setC('') }
      onDone?.()
    } catch (x) { setE({ ...((x as FieldErr).fields ?? {}), form: friendly(x) }) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} noValidate className={cx('space-y-5', !period && 'p-5')}>
      {e.form && <Alert tone="error" title="Không thể lưu">{e.form}</Alert>}
      {period && <div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="text-muted">Giá trị hiện tại</p><p className="mt-1 font-medium">Mở {fmtDT(period.openAt)} – Đóng {fmtDT(period.closeAt)}</p><p className="mt-1 text-[13px] text-muted">Giá trị cũ sẽ được lưu vào lịch sử khi bạn lưu thay đổi.</p></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`rp-open-${period?.id ?? 'new'}`} label="Thời điểm mở đăng ký" required error={e.open}><Input id={`rp-open-${period?.id ?? 'new'}`} type="datetime-local" value={o} onChange={(x) => setO(x.target.value)} error={e.open} /></Field>
        <Field id={`rp-close-${period?.id ?? 'new'}`} label="Thời điểm đóng đăng ký" required error={e.close}><Input id={`rp-close-${period?.id ?? 'new'}`} type="datetime-local" value={c} onChange={(x) => setC(x.target.value)} error={e.close} /></Field>
      </div>
      {preview && <p className="flex items-center gap-2 text-sm text-muted">Trạng thái sau khi lưu: <SemBadge s={preview} /></p>}
      <div className="flex flex-col-reverse justify-end gap-2 border-t border-line pt-5 sm:flex-row">
        <Button variant="secondary" disabled={busy || (!period && !dirty)} onClick={() => { if (period) onDone?.(); else { setO(''); setC('') } setE({}) }}>Hủy</Button>
        <Button type="submit" loading={busy} disabled={!dirty}>{busy ? 'Đang lưu…' : period ? 'Lưu thay đổi' : 'Tạo đợt đăng ký'}</Button>
      </div>
    </form>
  )
}
