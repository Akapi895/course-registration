import { useCallback, useState, type FormEvent } from 'react'
import { Ban, CalendarClock, Eye, FilterX, ListChecks, Pencil, Plus, School, Search, Trash2 } from 'lucide-react'
import Layout from '../components/Layout'
import * as api from '../api'
import { ApiError } from '../api/client'
import { ClassDetailModal } from '../components/ClassDetailModal'
import { PeriodBanner } from '../components/PeriodBanner'
import { Link, navigate } from '../router'
import { DAYS, type ClassDetail, type ClassSummary, type ClassUpdate, type RegistrationPeriod, type Semester } from '../api/types'
import { useRequest } from '../hooks/useRequest'
import { Alert, Badge, Button, Capacity, Card, Empty, Field, Input, Modal, PageHeader, Pagination, RequestStatus, Select, Stat, Table, Td, seatState, toast } from '../components/ui'

// Faculty / major names as stored with the catalogue; the class filter matches them exactly.
const FACULTIES: Record<string, string[]> = {
  'Công nghệ thông tin': ['Công nghệ thông tin'],
  'Điện tử - Viễn thông': ['Công nghệ kỹ thuật điện tử - viễn thông'],
  'Liên khoa': [],
}
const allMajors = Object.values(FACULTIES).flat()
const DAY_OPTIONS = [2, 3, 4, 5, 6, 7]
// datetime-local values are always interpreted in Vietnam time (UTC+7), regardless of the browser timezone.
const toLocal = (iso: string) => new Date(+new Date(iso) + 7 * 3600000).toISOString().slice(0, 16)
const fromLocal = (s: string) => new Date(s + ':00+07:00').toISOString()
const friendly = (e: unknown) => (e instanceof Error ? e.message : 'Không thể kết nối. Vui lòng thử lại.')
const positiveInt = (v: string) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 }

// ---------------- Dashboard ----------------
export function AdminDashboard() {
  const resource = useRequest(useCallback((signal: AbortSignal) => api.listClasses({}, signal), []))
  const admin = useClassAdmin(resource.reload)
  const list = resource.data?.classes ?? []
  const full = list.filter((c) => c.enrolled >= c.max_capacity).length
  const near = list.filter((c) => seatState(c) !== 'open').sort((a, b) => b.enrolled / b.max_capacity - a.enrolled / a.max_capacity)
  return (
    <Layout title="Tổng quan">
      <PageHeader title="Tổng quan" desc="Số liệu của học kỳ hiện tại"
        actions={<>
          <Button onClick={() => navigate('/admin/classes?new=1')}><Plus className="h-4 w-4" />Tạo lớp học phần</Button>
          <Button variant="secondary" onClick={() => navigate('/admin/registration-period')}><CalendarClock className="h-4 w-4" />Cấu hình đợt đăng ký</Button>
        </>} />
      <RequestStatus {...resource} retry={resource.reload} />
      {resource.data && !resource.loading && !resource.error && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Số lớp học phần" value={list.length} icon={<School className="h-5 w-5" />} sub="Học kỳ hiện tại" />
            <Stat label="Tổng lượt đăng ký" value={list.reduce((n, c) => n + c.enrolled, 0)} icon={<ListChecks className="h-5 w-5" />} sub="Tổng sĩ số các lớp" />
            <Stat label="Số lớp đầy" value={full} icon={<Ban className="h-5 w-5" />} />
          </div>
          <PeriodBanner semester={resource.data?.semester} title="Đợt đăng ký hiện tại" />
          <Card title="Lớp gần đầy và đã đầy" action={<Link to="/admin/classes" className="text-sm font-medium text-primary hover:underline">Quản lý lớp</Link>}>
            {near.length === 0 ? <Empty title="Chưa có lớp gần đầy" /> : (
              <Table head={[
                { label: 'Mã lớp', className: 'w-44' },
                { label: 'Học phần', className: 'w-auto' },
                { label: 'Sĩ số', className: 'w-36' },
                { label: 'Trạng thái', className: 'w-36' },
              ]} minWidth={600}>
                {near.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap font-medium"><button type="button" onClick={() => admin.show(c.id)} className="text-primary hover:underline">{c.class_code}</button></Td>
                    <Td>{c.course_name}<div className="text-xs text-muted">{c.course_code}</div></Td>
                    <Td><Capacity c={c} /></Td>
                    <Td>{c.enrolled >= c.max_capacity ? <Badge tone="red">Đã đầy</Badge> : <Badge tone="orange">Gần đầy</Badge>}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}
      {admin.modal}
    </Layout>
  )
}

// ---------------- Classes ----------------
type ScheduleForm = { day_of_week: string; start_period: string; end_period: string; room: string }
const blankSession = (): ScheduleForm => ({ day_of_week: '2', start_period: '1', end_period: '3', room: '' })

function ClassForm({ existing, semester, onClose, onSaved }: { existing?: ClassDetail; semester: Pick<Semester, 'id' | 'name'>; onClose: () => void; onSaved: (id: number) => void }) {
  const locked = !!existing && existing.enrolled > 0
  const [f, setF] = useState(() => ({
    course_id: existing ? String(existing.course_id) : '',
    class_code: existing?.class_code ?? '', lecturer_name: existing?.lecturer_name ?? '', max_capacity: String(existing?.max_capacity ?? 40),
    schedules: existing ? existing.schedules.map((s) => ({ day_of_week: String(s.day_of_week), start_period: String(s.start_period), end_period: String(s.end_period), room: s.room })) : [blankSession()],
  }))
  const [e, setE] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const periods = Array.from({ length: Math.max(12, ...(existing?.schedules ?? []).map((s) => s.end_period)) }, (_, i) => i + 1)
  const setS = (i: number, k: keyof ScheduleForm, v: string) => setF({ ...f, schedules: f.schedules.map((s, j) => (j === i ? { ...s, [k]: v } : s)) })
  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (busy) return
    const er: Record<string, string> = {}
    if (!existing) {
      if (!positiveInt(f.course_id)) er.course_id = 'Nhập mã học phần hợp lệ.'
    }
    if (!f.class_code.trim()) er.class_code = 'Vui lòng nhập mã lớp.'
    if (!f.lecturer_name.trim()) er.lecturer_name = 'Vui lòng nhập tên giảng viên.'
    const cap = Number(f.max_capacity)
    if (!f.max_capacity || !Number.isInteger(cap) || cap < 1 || cap > 2147483647) er.max_capacity = 'Sức chứa phải là số nguyên dương.'
    else if (existing && cap < existing.enrolled) er.max_capacity = `Không được thấp hơn sĩ số hiện tại (${existing.enrolled}).`
    const schedules = f.schedules.map((s) => ({ day_of_week: Number(s.day_of_week), start_period: Number(s.start_period), end_period: Number(s.end_period), room: s.room.trim() }))
    if (!schedules.length) er.schedules = 'Cần ít nhất một buổi học.'
    schedules.forEach((s, i) => {
      if (!s.room) er['room' + i] = 'Nhập phòng học.'
      if (s.end_period < s.start_period) er['end' + i] = 'Tiết kết thúc không nhỏ hơn tiết bắt đầu.'
      const dup = schedules.findIndex((o, j) => j < i && o.day_of_week === s.day_of_week && o.start_period <= s.end_period && s.start_period <= o.end_period)
      if (dup >= 0 && !er['end' + i]) er['end' + i] = `Trùng giờ với buổi ${dup + 1}.`
    })
    setE(er)
    if (Object.keys(er).length) return
    const body: ClassUpdate = { class_code: f.class_code.trim(), lecturer_name: f.lecturer_name.trim(), max_capacity: cap, schedules }
    setBusy(true)
    try {
      const result = existing ? await api.updateClass(existing.id, body) : await api.createClass({ ...body, course_id: Number(f.course_id), semester_id: semester.id })
      toast(existing ? `Đã cập nhật lớp ${body.class_code}.` : `Đã tạo lớp ${body.class_code}.`)
      onSaved(result.id)
    } catch (x) {
      // Keep the entered data and show the reason from the server.
      setE(x instanceof ApiError && x.code === 'CAPACITY_BELOW_ENROLLED' ? { max_capacity: x.message } : { form: friendly(x) })
    } finally { setBusy(false) }
  }
  return (
    <Modal open size="lg" onClose={onClose} closable={!busy} title={existing ? `Chỉnh sửa lớp ${existing.class_code}` : 'Tạo lớp học phần'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Hủy</Button><Button type="submit" form="class-form" loading={busy}>{busy ? 'Đang lưu…' : existing ? 'Lưu thay đổi' : 'Tạo lớp'}</Button></>}>
      <form id="class-form" onSubmit={submit} noValidate className="space-y-4">
        {locked && <Alert tone="info" title={`Lớp đã có ${existing.enrolled} sinh viên đăng ký`}>Lịch học không thể thay đổi khi đã có sinh viên đăng ký. Bạn vẫn sửa được mã lớp, giảng viên và sức chứa (không thấp hơn sĩ số hiện tại).</Alert>}
        {e.form && <Alert tone="error" title="Không thể lưu">{e.form}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cf-course" label="Mã học phần (ID)" required error={e.course_id} hint="Mã của học phần đã có trong hệ thống."><Input id="cf-course" type="number" min={1} step={1} value={f.course_id} disabled={!!existing} onChange={(x) => setF({ ...f, course_id: x.target.value })} error={e.course_id} /></Field>
          <Field id="cf-sem" label="Học kỳ" hint={existing ? 'Học kỳ của lớp, không thể thay đổi.' : 'Tự động chọn học kỳ hiện tại từ hệ thống.'}><Input id="cf-sem" value={semester.name} readOnly /></Field>
          <Field id="cf-code" label="Mã lớp" required error={e.class_code} hint="Duy nhất trong học kỳ, VD: INT2211 3"><Input id="cf-code" value={f.class_code} onChange={(x) => setF({ ...f, class_code: x.target.value })} error={e.class_code} /></Field>
          <Field id="cf-lec" label="Giảng viên" required error={e.lecturer_name}><Input id="cf-lec" value={f.lecturer_name} onChange={(x) => setF({ ...f, lecturer_name: x.target.value })} error={e.lecturer_name} /></Field>
          <Field id="cf-cap" label="Sức chứa tối đa" required error={e.max_capacity} hint={existing ? `Đã đăng ký: ${existing.enrolled} — do hệ thống tính, không sửa trực tiếp` : 'Số đã đăng ký do hệ thống tự tính'}><Input id="cf-cap" type="number" min={1} step={1} value={f.max_capacity} onChange={(x) => setF({ ...f, max_capacity: x.target.value })} error={e.max_capacity} /></Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Buổi học <span className="text-red-600" aria-hidden>*</span></p>
            {!locked && <Button size="sm" variant="ghost" onClick={() => setF({ ...f, schedules: [...f.schedules, blankSession()] })}><Plus className="h-4 w-4" />Thêm buổi</Button>}
          </div>
          {e.schedules && <p className="mb-2 text-[13px] text-red-600">{e.schedules}</p>}
          <div className="space-y-3">
            {f.schedules.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
                <Field id={`d${i}`} label="Thứ"><Select id={`d${i}`} value={s.day_of_week} disabled={locked} onChange={(x) => setS(i, 'day_of_week', x.target.value)}>{DAY_OPTIONS.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}</Select></Field>
                <Field id={`s${i}`} label="Tiết bắt đầu"><Select id={`s${i}`} value={s.start_period} disabled={locked} onChange={(x) => setS(i, 'start_period', x.target.value)}>{periods.map((p) => <option key={p}>{p}</option>)}</Select></Field>
                <Field id={`e${i}`} label="Tiết kết thúc" error={e['end' + i]}><Select id={`e${i}`} value={s.end_period} disabled={locked} onChange={(x) => setS(i, 'end_period', x.target.value)} error={e['end' + i]}>{periods.map((p) => <option key={p}>{p}</option>)}</Select></Field>
                <Field id={`r${i}`} label="Phòng" error={e['room' + i]}><Input id={`r${i}`} value={s.room} disabled={locked} onChange={(x) => setS(i, 'room', x.target.value)} error={e['room' + i]} /></Field>
                <div className="flex items-end"><Button variant="ghost" className="text-red-600" disabled={locked || f.schedules.length <= 1} onClick={() => setF({ ...f, schedules: f.schedules.filter((_, j) => j !== i) })} aria-label={`Xóa buổi ${i + 1}`}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}

/** Loads one class on demand so the list itself never needs per-row detail requests. */
function EditClass({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: (id: number) => void }) {
  const resource = useRequest(useCallback((signal: AbortSignal) => api.getClass(id, signal), [id]))
  if (resource.data && !resource.loading) return <ClassForm existing={resource.data} semester={{ id: resource.data.semester_id, name: resource.data.semester_name }} onClose={onClose} onSaved={onSaved} />
  return <Modal open title="Chỉnh sửa lớp học phần" onClose={onClose}><RequestStatus {...resource} retry={resource.reload} /></Modal>
}

function CancelClassModal({ value, onClose, onCancelled }: { value: Pick<ClassSummary, 'id' | 'class_code' | 'course_name' | 'enrolled'>; onClose: () => void; onCancelled: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try { await api.cancelClass(value.id); toast(`Đã hủy lớp ${value.class_code}.`); onCancelled() }
    catch (x) { setErr(friendly(x)) }
    finally { setBusy(false) }
  }
  return (
    <Modal open title="Hủy lớp học phần" onClose={onClose} closable={!busy}
      footer={err ? <Button variant="secondary" onClick={onClose}>Đóng</Button> : <><Button variant="secondary" onClick={onClose} disabled={busy}>Quay lại</Button><Button variant="danger" loading={busy} onClick={submit}>Xác nhận hủy lớp</Button></>}>
      <div className="space-y-3 text-sm">
        <p>Lớp <b>{value.class_code}</b> – {value.course_name}</p>
        {err ? <Alert tone="error" title="Không thể hủy lớp">{err}</Alert>
          : value.enrolled > 0 ? <Alert tone="warning">Lớp hiện có {value.enrolled} sinh viên đăng ký. Hủy lớp sẽ hủy toàn bộ đăng ký còn hiệu lực của lớp này và đưa sĩ số về 0. Thông tin lớp vẫn được lưu trong hệ thống.</Alert>
          : <Alert tone="warning">Lớp chưa có sinh viên đăng ký. Sau khi hủy, lớp sẽ không còn nhận đăng ký.</Alert>}
      </div>
    </Modal>
  )
}

type ClassStep =
  | { type: 'detail'; id: number }
  | { type: 'edit'; id: number; back: boolean }
  | { type: 'cancel'; value: Pick<ClassSummary, 'id' | 'class_code' | 'course_name' | 'enrolled'>; back: boolean }

/**
 * Class popups: details with edit and cancel buttons. Editing or cancelling from the details returns to them
 * afterwards; editing or cancelling straight from a list row just closes. `onChanged` refreshes the page's data.
 */
function useClassAdmin(onChanged: () => void) {
  const [step, setStep] = useState<ClassStep | null>(null)
  const leave = (back: boolean, id: number) => setStep(back ? { type: 'detail', id } : null)
  let modal = null
  if (step?.type === 'detail') modal = <ClassDetailModal classId={step.id} onClose={() => setStep(null)} admin={{ onEdit: (c) => setStep({ type: 'edit', id: c.id, back: true }), onCancel: (c) => setStep({ type: 'cancel', value: c, back: true }) }} />
  else if (step?.type === 'edit') { const { id, back } = step; modal = <EditClass id={id} onClose={() => leave(back, id)} onSaved={() => { onChanged(); leave(back, id) }} /> }
  else if (step?.type === 'cancel') { const { value, back } = step; modal = <CancelClassModal value={value} onClose={() => leave(back, value.id)} onCancelled={() => { onChanged(); leave(back, value.id) }} /> }
  return {
    show: (id: number) => setStep({ type: 'detail', id }),
    edit: (id: number) => setStep({ type: 'edit', id, back: false }),
    cancel: (value: Extract<ClassStep, { type: 'cancel' }>['value']) => setStep({ type: 'cancel', value, back: false }),
    modal,
  }
}

export function AdminClasses({ isNew = false }: { isNew?: boolean }) {
  const [q, setQ] = useState('')
  const [fac, setFac] = useState('')
  const [major, setMajor] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(isNew)
  const resource = useRequest(useCallback((signal: AbortSignal) => api.listClasses({ faculty: fac, major }, signal), [fac, major]))
  const admin = useClassAdmin(resource.reload)
  const list = (resource.data?.classes ?? []).filter((c) => `${c.class_code} ${c.course_code} ${c.course_name}`.toLowerCase().includes(q.trim().toLowerCase()))
  const size = 10
  const pg = Math.min(page, Math.max(1, Math.ceil(list.length / size)))
  const filtered = !!(q || fac || major)
  const majors = fac ? FACULTIES[fac] ?? [] : allMajors
  const closeCreate = () => { setCreating(false); if (isNew) navigate('/admin/classes') }
  return (
    <Layout title="Quản lý lớp học phần">
      <PageHeader title="Quản lý lớp học phần" desc={resource.data ? `${list.length} lớp phù hợp` : undefined} actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Tạo lớp học phần</Button>} />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]">
          <label className="relative"><span className="sr-only">Tìm kiếm</span><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Mã lớp hoặc tên học phần" className="pl-10" /></label>
          <Select aria-label="Khoa" value={fac} onChange={(e) => { setFac(e.target.value); setMajor(''); setPage(1) }}><option value="">Tất cả khoa</option>{Object.keys(FACULTIES).map((x) => <option key={x}>{x}</option>)}</Select>
          <Select aria-label="Ngành" value={major} disabled={majors.length === 0} onChange={(e) => { setMajor(e.target.value); setPage(1) }}><option value="">Tất cả ngành</option>{majors.map((x) => <option key={x}>{x}</option>)}</Select>
          <Button variant="ghost" disabled={!filtered} onClick={() => { setQ(''); setFac(''); setMajor(''); setPage(1) }}><FilterX className="h-4 w-4" />Xóa lọc</Button>
        </div>
        <RequestStatus {...resource} retry={resource.reload} />
        {!resource.loading && !resource.error && (list.length === 0 ? <Empty title="Không có lớp phù hợp" text="Thử thay đổi từ khóa hoặc bộ lọc." /> : <>
          <Table head={[
            { label: 'Mã lớp', className: 'w-44' },
            { label: 'Học phần', className: 'w-auto' },
            { label: 'TC', className: 'w-16' },
            { label: 'Sĩ số', className: 'w-36' },
            { label: 'Thao tác', className: 'w-36' },
          ]} minWidth={720}>
            {list.slice((pg - 1) * size, pg * size).map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td className="whitespace-nowrap font-medium"><button type="button" onClick={() => admin.show(c.id)} className="text-primary hover:underline">{c.class_code}</button></Td>
                <Td>{c.course_name}<div className="text-xs text-muted">{c.course_code}</div></Td>
                <Td>{c.credits}</Td>
                <Td><Capacity c={c} /></Td>
                <Td><div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => admin.show(c.id)} aria-label={`Xem lớp ${c.class_code}`} title="Xem chi tiết"><Eye className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => admin.edit(c.id)} aria-label={`Sửa lớp ${c.class_code}`} title="Chỉnh sửa"><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => admin.cancel(c)} aria-label={`Hủy lớp ${c.class_code}`} title="Hủy lớp"><Trash2 className="h-4 w-4" /></Button>
                </div></Td>
              </tr>
            ))}
          </Table>
          <Pagination page={pg} total={list.length} size={size} onChange={setPage} />
        </>)}
      </Card>
      {creating && (resource.loading || resource.error || !resource.data?.semester
        ? <Modal open title="Tạo lớp học phần" onClose={closeCreate}>
          <RequestStatus {...resource} retry={resource.reload} />
          {!resource.loading && !resource.error && <Empty title="Chưa có học kỳ hiện tại" text="Hệ thống chưa xác định được học kỳ hiện tại. Chưa thể tạo lớp học phần." />}
        </Modal>
        : <ClassForm semester={resource.data.semester} onClose={closeCreate} onSaved={(id) => { setCreating(false); resource.reload(); admin.show(id) }} />)}
      {admin.modal}
    </Layout>
  )
}

// ---------------- Registration period ----------------
const periodBadge = (opens: string, closes: string) => {
  const now = Date.now()
  return now < +new Date(opens) ? <Badge tone="orange">Chưa mở</Badge> : now > +new Date(closes) ? <Badge>Đã đóng</Badge> : <Badge tone="green">Đang mở</Badge>
}

export function AdminRegistrationPeriod() {
  const resource = useRequest(useCallback((signal: AbortSignal) => api.listClasses({}, signal), []))
  const semester = resource.data?.semester
  const [o, setO] = useState('')
  const [c, setC] = useState('')
  const [saved, setSaved] = useState<RegistrationPeriod | null>(null)
  const [e, setE] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const dirty = saved
    ? semester?.id !== saved.semester_id || o !== toLocal(saved.registration_opens_at) || c !== toLocal(saved.registration_closes_at)
    : !!(o || c)
  const preview = o && c && c > o ? periodBadge(fromLocal(o), fromLocal(c)) : null
  const reset = () => {
    if (saved) { setO(toLocal(saved.registration_opens_at)); setC(toLocal(saved.registration_closes_at)) } else { setO(''); setC('') }
    setE({})
  }
  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (busy || resource.loading || resource.error || !semester) return
    const er: Record<string, string> = {}
    if (!o) er.open = 'Vui lòng chọn thời điểm mở.'
    if (!c) er.close = 'Vui lòng chọn thời điểm đóng.'
    else if (o && c <= o) er.close = 'Thời điểm mở phải trước thời điểm đóng.'
    setE(er)
    if (Object.keys(er).length) return
    setBusy(true)
    try {
      const result = await api.updateRegistrationPeriod({ semester_id: semester.id, registration_opens_at: fromLocal(o), registration_closes_at: fromLocal(c) })
      setSaved(result); toast('Đã cập nhật thời gian đăng ký.')
    } catch (x) { setE({ form: friendly(x) }) } finally { setBusy(false) }
  }
  return (
    <Layout title="Cấu hình đợt đăng ký">
      <PageHeader title="Cấu hình đợt đăng ký" desc="Thời gian theo múi giờ Việt Nam (UTC+7)" />
      <div className="space-y-6">
        {saved && <PeriodBanner title="Thời gian đăng ký vừa lưu" open={Date.now() >= +new Date(saved.registration_opens_at) && Date.now() <= +new Date(saved.registration_closes_at)} opensAt={saved.registration_opens_at} closesAt={saved.registration_closes_at} />}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card title="Thời gian đăng ký của học kỳ">
            <RequestStatus {...resource} retry={resource.reload} />
            {!resource.loading && !resource.error && (semester ? <form onSubmit={submit} noValidate className="space-y-5 p-5">
              {e.form && <Alert tone="error" title="Không thể lưu">{e.form}</Alert>}
              <Field id="rp-sem" label="Học kỳ" hint="Tự động chọn học kỳ hiện tại từ hệ thống."><Input id="rp-sem" value={semester.name} readOnly /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="rp-open" label="Thời điểm mở đăng ký" required error={e.open}><Input id="rp-open" type="datetime-local" value={o} onChange={(x) => setO(x.target.value)} error={e.open} /></Field>
                <Field id="rp-close" label="Thời điểm đóng đăng ký" required error={e.close}><Input id="rp-close" type="datetime-local" value={c} onChange={(x) => setC(x.target.value)} error={e.close} /></Field>
              </div>
              {preview && <p className="flex items-center gap-2 text-sm text-muted">Trạng thái sau khi lưu: {preview}</p>}
              <div className="flex flex-col-reverse justify-end gap-2 border-t border-line pt-5 sm:flex-row">
                <Button variant="secondary" disabled={busy || !dirty} onClick={reset}>Hủy</Button>
                <Button type="submit" loading={busy} disabled={!dirty}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</Button>
              </div>
            </form> : <Empty title="Chưa có học kỳ hiện tại" text="Hệ thống chưa xác định được học kỳ hiện tại. Chưa thể cấu hình thời gian đăng ký." />)}
          </Card>
          <Card title="Ảnh hưởng tới sinh viên" className="h-fit">
            <ul className="list-disc space-y-2 py-5 pl-10 pr-5 text-sm text-muted">
              <li>Trong thời gian đăng ký: sinh viên được đăng ký và hủy đăng ký.</li>
              <li>Ngoài thời gian đăng ký: vẫn xem được học phần đã đăng ký và thời khóa biểu; đăng ký/hủy bị khóa kèm lý do.</li>
            </ul>
          </Card>
        </div>
      </div>
    </Layout>
  )
}
