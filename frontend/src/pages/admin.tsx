import { useCallback, useState, type FormEvent } from 'react'
import { BookOpen, ListChecks, Plus, School, Search } from 'lucide-react'
import Layout from '../Layout'
import * as api from '../api'
import { ApiError } from '../http'
import { ScheduleTable, StudentProfileEditor } from '../flows'
import { Link, navigate, query, useRoute } from '../router'
import { DAYS, type ClassDetail, type ClassUpdate, type RegistrationPeriod } from '../types'
import { useRequest } from '../useRequest'
import { Alert, Badge, Button, Capacity, Card, Empty, ErrorNotice, Field, Input, Modal, PageHeader, Pagination, RequestStatus, Select, Stat, Table, Td, fmtDT, toast } from '../ui'

export function AdminDashboard() {
  const resource = useRequest(useCallback((signal) => api.listClasses({}, signal), []))
  const list = resource.data?.classes ?? []
  return <Layout title="Tổng quan quản trị">
    <PageHeader title="Tổng quan quản trị" desc="Thống kê từ danh sách lớp của học kỳ hiện tại." actions={<Button onClick={() => navigate('/admin/classes?new=1')}><Plus className="h-4 w-4" />Tạo lớp</Button>} />
    <RequestStatus {...resource} retry={resource.reload} />
    {!resource.loading && !resource.error && <div className="grid gap-4 sm:grid-cols-3"><Stat label="Lớp đang hoạt động" value={list.length} icon={<School />} /><Stat label="Tổng sĩ số các lớp hiển thị" value={list.reduce((n, c) => n + c.enrolled, 0)} icon={<ListChecks />} /><Stat label="Lớp đã đầy" value={list.filter((c) => c.enrolled >= c.max_capacity).length} icon={<BookOpen />} /></div>}
    <Card title="Chức năng quản trị"><div className="flex flex-wrap gap-3 p-5"><Button onClick={() => navigate('/admin/classes')}>Quản lý lớp học phần</Button><Button variant="secondary" onClick={() => navigate('/admin/students')}>Tra cứu sinh viên theo ID</Button><Button variant="secondary" onClick={() => navigate('/admin/registration-period')}>Cấu hình thời gian đăng ký</Button></div></Card>
  </Layout>
}

function ClassForm({ existing, onClose, onSaved }: { existing?: ClassDetail; onClose: () => void; onSaved: (id: number) => void }) {
  const locked = !!existing && existing.enrolled > 0
  const [form, setForm] = useState({
    course_id: existing ? String(existing.course_id) : '', semester_id: existing ? String(existing.semester_id) : '',
    class_code: existing?.class_code ?? '', lecturer_name: existing?.lecturer_name ?? '', max_capacity: String(existing?.max_capacity ?? 40),
    schedules: (existing?.schedules ?? [{ day_of_week: 2, start_period: 1, end_period: 3, room: '' }]).map((s) => ({ day_of_week: String(s.day_of_week), start_period: String(s.start_period), end_period: String(s.end_period), room: s.room })),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const changeSchedule = (index: number, key: keyof typeof form.schedules[number], value: string) => setForm({ ...form, schedules: form.schedules.map((s, i) => i === index ? { ...s, [key]: value } : s) })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    const body: ClassUpdate = { class_code: form.class_code.trim(), lecturer_name: form.lecturer_name.trim(), max_capacity: Number(form.max_capacity), schedules: form.schedules.map((s) => ({ day_of_week: Number(s.day_of_week), start_period: Number(s.start_period), end_period: Number(s.end_period), room: s.room.trim() })) }
    if (!body.class_code || !body.lecturer_name || !Number.isInteger(body.max_capacity) || body.max_capacity < 1 || body.max_capacity > 2147483647 || !body.schedules.length || body.schedules.some((s) => !s.room || !Number.isInteger(s.start_period) || !Number.isInteger(s.end_period) || s.start_period < 1 || s.end_period < s.start_period || s.end_period > 32767 || s.day_of_week < 2 || s.day_of_week > 7)) {
      setError(new ApiError('Kiểm tra mã lớp, giảng viên, sĩ số và lịch học. Thứ từ 2–7; tiết từ 1–32767, tiết kết thúc không trước tiết bắt đầu.', 'VALIDATION_ERROR')); return
    }
    const courseId = Number(form.course_id), semesterId = Number(form.semester_id)
    if (!existing && (!Number.isSafeInteger(courseId) || courseId < 1 || !Number.isSafeInteger(semesterId) || semesterId < 1)) {
      setError(new ApiError('ID học phần và học kỳ phải là số nguyên dương hợp lệ.', 'VALIDATION_ERROR')); return
    }
    setBusy(true)
    try {
      const result = existing ? await api.updateClass(existing.id, body) : await api.createClass({ ...body, course_id: courseId, semester_id: semesterId })
      toast(existing ? 'Đã cập nhật lớp học phần.' : 'Đã tạo lớp học phần.'); onSaved(result.id)
    } catch (cause) { setError(cause) }
    finally { setBusy(false) }
  }
  return <Modal open size="lg" title={existing ? `Chỉnh sửa ${existing.class_code}` : 'Tạo lớp học phần'} onClose={onClose} closable={!busy} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button><Button type="submit" form="class-form" loading={busy}>Lưu lớp học phần</Button></>}>
    <form id="class-form" onSubmit={submit} className="space-y-5">
      {locked && <Alert>Lớp có {existing.enrolled} sinh viên đăng ký: lịch học chỉ đọc. Vẫn có thể sửa mã lớp, giảng viên và sĩ số phù hợp.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="class-course-id" label="ID học phần" required hint="Dùng ID từ dữ liệu học phần đã seed."><Input id="class-course-id" type="number" min={1} step={1} required disabled={!!existing} value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })} /></Field>
        <Field id="class-semester-id" label="ID học kỳ" required hint="Không thay đổi học kỳ khi cập nhật lớp."><Input id="class-semester-id" type="number" min={1} step={1} required disabled={!!existing} value={form.semester_id} onChange={(e) => setForm({ ...form, semester_id: e.target.value })} /></Field>
        <Field id="class-code" label="Mã lớp" required><Input id="class-code" required value={form.class_code} onChange={(e) => setForm({ ...form, class_code: e.target.value })} /></Field>
        <Field id="class-lecturer" label="Giảng viên" required><Input id="class-lecturer" required value={form.lecturer_name} onChange={(e) => setForm({ ...form, lecturer_name: e.target.value })} /></Field>
        <Field id="class-capacity" label="Sức chứa tối đa" required><Input id="class-capacity" type="number" min={1} max={2147483647} step={1} required value={form.max_capacity} onChange={(e) => setForm({ ...form, max_capacity: e.target.value })} /></Field>
      </div>
      <div className="flex items-center justify-between"><h3 className="font-semibold">Các buổi học của lớp</h3><Button size="sm" variant="secondary" disabled={locked} onClick={() => setForm({ ...form, schedules: [...form.schedules, { day_of_week: '2', start_period: '1', end_period: '3', room: '' }] })}>Thêm buổi học</Button></div>
      {form.schedules.map((s, index) => <div key={index} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
        <Field id={`schedule-day-${index}`} label="Thứ"><Select id={`schedule-day-${index}`} value={s.day_of_week} disabled={locked} onChange={(e) => changeSchedule(index, 'day_of_week', e.target.value)}>{Object.entries(DAYS).map(([day, text]) => <option key={day} value={day}>{text}</option>)}</Select></Field>
        <Field id={`schedule-start-${index}`} label="Tiết bắt đầu" required><Input id={`schedule-start-${index}`} type="number" min={1} max={32767} step={1} required disabled={locked} value={s.start_period} onChange={(e) => changeSchedule(index, 'start_period', e.target.value)} /></Field>
        <Field id={`schedule-end-${index}`} label="Tiết kết thúc" required><Input id={`schedule-end-${index}`} type="number" min={1} max={32767} step={1} required disabled={locked} value={s.end_period} onChange={(e) => changeSchedule(index, 'end_period', e.target.value)} /></Field>
        <Field id={`schedule-room-${index}`} label="Phòng" required><Input id={`schedule-room-${index}`} required disabled={locked} value={s.room} onChange={(e) => changeSchedule(index, 'room', e.target.value)} /></Field>
        <div className="flex items-end"><Button size="sm" variant="ghost" disabled={locked || form.schedules.length === 1} onClick={() => setForm({ ...form, schedules: form.schedules.filter((_, i) => i !== index) })} aria-label={`Xóa buổi học ${index + 1}`}>Bỏ</Button></div>
      </div>)}
      {error ? <ErrorNotice error={error} /> : null}
    </form>
  </Modal>
}

function CancelClassModal({ value, onClose, onCancelled }: { value: ClassDetail; onClose: () => void; onCancelled: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const submit = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try { await api.cancelClass(value.id); toast('Đã hủy lớp học phần và các đăng ký còn hiệu lực.'); onCancelled() }
    catch (cause) { setError(cause) }
    finally { setBusy(false) }
  }
  return <Modal open title="Hủy lớp học phần" onClose={onClose} closable={!busy} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Quay lại</Button><Button variant="danger" loading={busy} onClick={submit}>Xác nhận hủy lớp</Button></>}><div className="space-y-4"><p><b>{value.class_code}</b> · {value.course_name}</p><Alert tone="warning">Lớp hiện có {value.enrolled} sinh viên đăng ký. Hủy mềm lớp sẽ hủy toàn bộ đăng ký còn hiệu lực và đưa sĩ số về 0. Dữ liệu lớp vẫn được giữ trong hệ thống.</Alert>{error ? <ErrorNotice error={error} /> : null}</div></Modal>
}

export function AdminClasses({ isNew = false }: { isNew?: boolean }) {
  const [filters, setFilters] = useState({ faculty: '', major: '' })
  const [applied, setApplied] = useState({ faculty: '', major: '' })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(isNew)
  const resource = useRequest(useCallback((signal) => api.listClasses(applied, signal), [applied]))
  const list = (resource.data?.classes ?? []).filter((c) => `${c.class_code} ${c.course_code} ${c.course_name}`.toLowerCase().includes(search.trim().toLowerCase()))
  const size = 10, pg = Math.min(page, Math.max(1, Math.ceil(list.length / size)))
  const close = () => { setCreating(false); if (isNew) navigate('/admin/classes') }
  return <Layout title="Quản lý lớp học phần">
    <PageHeader title="Quản lý lớp học phần" desc="Danh sách active của học kỳ hiện tại theo API. Xem lớp ở học kỳ khác bằng ID đã biết." actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Tạo lớp</Button>} />
    <Card><form className="grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied({ ...filters }) }}>
      <Field id="admin-class-search" label="Tìm trong kết quả"><Input id="admin-class-search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Mã lớp hoặc tên học phần" /></Field>
      <Field id="admin-class-faculty" label="Khoa"><Input id="admin-class-faculty" value={filters.faculty} onChange={(e) => setFilters({ ...filters, faculty: e.target.value })} /></Field><Field id="admin-class-major" label="Ngành"><Input id="admin-class-major" value={filters.major} onChange={(e) => setFilters({ ...filters, major: e.target.value })} /></Field><div className="flex items-end"><Button type="submit">Lọc</Button></div>
    </form><RequestStatus {...resource} retry={resource.reload} />
      {!resource.loading && !resource.error && (list.length ? <><Table head={['Mã lớp', 'Học phần', 'TC', 'Sĩ số', 'Thao tác']} minWidth={700}>{list.slice((pg - 1) * size, pg * size).map((c) => <tr key={c.id}><Td><Link to={`/admin/classes/${c.id}`} className="font-medium text-primary">{c.class_code}</Link><p className="text-xs text-muted">ID {c.id}</p></Td><Td>{c.course_name}<p className="text-xs text-muted">{c.course_code}</p></Td><Td>{c.credits}</Td><Td><Capacity c={c} /></Td><Td><Button size="sm" variant="secondary" onClick={() => navigate(`/admin/classes/${c.id}`)}>Xem / Sửa / Hủy</Button></Td></tr>)}</Table><Pagination page={pg} total={list.length} size={size} onChange={setPage} /></> : <Empty title="Không có lớp phù hợp" />)}
    </Card>
    <ClassLookup />
    {creating && <ClassForm onClose={close} onSaved={(id) => { setCreating(false); navigate(`/admin/classes/${id}`) }} />}
  </Layout>
}

function ClassLookup() {
  const [id, setId] = useState('')
  return <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (Number.isSafeInteger(Number(id)) && Number(id) > 0) navigate(`/admin/classes/${Number(id)}`) }}><Field id="class-lookup-id" label="Tra cứu lớp theo ID"><Input id="class-lookup-id" type="number" min={1} step={1} required value={id} onChange={(e) => setId(e.target.value)} /></Field><Button type="submit" variant="secondary">Xem chi tiết</Button></form>
}

export function AdminClassDetail({ id }: { id: string }) {
  const resource = useRequest(useCallback((signal) => api.getClass(Number(id), signal), [id]))
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const c = resource.data
  return <Layout title="Chi tiết lớp học phần">
    <PageHeader title={c?.class_code ?? 'Chi tiết lớp học phần'} actions={<Button variant="secondary" onClick={() => navigate('/admin/classes')}>Quay lại danh sách</Button>} />
    <RequestStatus {...resource} retry={resource.reload} />
    {c && !resource.loading && !resource.error && <>
      <Card title={c.course_name} action={<Badge tone={c.status === 'active' ? 'blue' : 'red'}>{c.status === 'active' ? 'Đang hoạt động' : 'Đã hủy'}</Badge>}><dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">{[['ID lớp', c.id], ['ID học phần', c.course_id], ['ID học kỳ', c.semester_id], ['Mã học phần', c.course_code], ['Giảng viên', c.lecturer_name], ['Số tín chỉ', c.credits]].map(([label, value]) => <div key={label}><dt className="text-muted">{label}</dt><dd>{value}</dd></div>)}<div><dt className="mb-1 text-muted">Sĩ số</dt><Capacity c={c} /></div></dl></Card>
      <Card title={`Lịch học (${c.schedules.length} buổi)`}><ScheduleTable schedules={c.schedules} /></Card>
      <div className="flex flex-wrap gap-3"><Button disabled={c.status === 'cancelled'} onClick={() => setEditing(true)}>Chỉnh sửa lớp</Button><Button variant="danger" disabled={c.status === 'cancelled'} onClick={() => setCancelling(true)}>Hủy lớp</Button><Button variant="secondary" onClick={() => navigate(`/admin/registration-period?semester_id=${c.semester_id}`)}>Cấu hình thời gian học kỳ này</Button></div>
      {editing && <ClassForm existing={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); resource.reload() }} />}
      {cancelling && <CancelClassModal value={c} onClose={() => setCancelling(false)} onCancelled={() => { setCancelling(false); resource.reload() }} />}
    </>}
  </Layout>
}

export function AdminStudents() {
  const [id, setId] = useState('')
  return <Layout title="Tra cứu sinh viên"><PageHeader title="Tra cứu sinh viên theo ID" desc="Sử dụng ID tài khoản sinh viên từ dữ liệu hệ thống." /><Card><form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); if (Number.isSafeInteger(Number(id)) && Number(id) > 0) navigate(`/admin/students/${Number(id)}`) }}><Field id="student-lookup-id" label="ID sinh viên" required><Input id="student-lookup-id" type="number" min={1} step={1} required value={id} onChange={(e) => setId(e.target.value)} /></Field><Button type="submit"><Search className="h-4 w-4" />Tra cứu</Button></form></Card><Alert>Phase 1 cung cấp xem và cập nhật hồ sơ theo ID. Giao diện không giả lập danh sách/tìm kiếm toàn bộ sinh viên.</Alert></Layout>
}
export function AdminStudentDetail({ id }: { id: string }) {
  return <Layout title="Hồ sơ sinh viên"><PageHeader title={`Hồ sơ sinh viên · ID ${id}`} actions={<Button variant="secondary" onClick={() => navigate('/admin/students')}>Tra cứu khác</Button>} /><StudentProfileEditor studentId={Number(id)} /></Layout>
}

export function AdminRegistrationPeriod() {
  const [semesterId, setSemesterId] = useState(query(useRoute()).get('semester_id') ?? '')
  const [opens, setOpens] = useState('')
  const [closes, setCloses] = useState('')
  const [saved, setSaved] = useState<RegistrationPeriod | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null); setSaved(null)
    const id = Number(semesterId)
    if (!Number.isSafeInteger(id) || id < 1 || !opens || !closes || closes <= opens) { setError(new ApiError('ID học kỳ phải hợp lệ và thời điểm đóng phải sau thời điểm mở.', 'VALIDATION_ERROR')); return }
    setBusy(true)
    try {
      const result = await api.updateRegistrationPeriod({ semester_id: id, registration_opens_at: new Date(opens + ':00+07:00').toISOString(), registration_closes_at: new Date(closes + ':00+07:00').toISOString() })
      setSaved(result); toast('Đã cập nhật thời gian đăng ký học kỳ.')
    } catch (cause) { setError(cause) }
    finally { setBusy(false) }
  }
  return <Layout title="Cấu hình thời gian đăng ký"><PageHeader title="Cấu hình thời gian đăng ký" desc="Cập nhật một khung mở/đóng cho học kỳ, theo giờ Việt Nam (UTC+7)." />
    <Alert>Nhập ID học kỳ đã biết hoặc mở form từ chi tiết lớp. Biểu mẫu không tải danh sách đợt và không tạo lịch sử giả; giá trị đã lưu chỉ hiển thị sau khi máy chủ xác nhận.</Alert>
    <Card><form onSubmit={submit} className="space-y-5 p-5">
      <Field id="period-semester-id" label="ID học kỳ" required><Input id="period-semester-id" type="number" min={1} step={1} required value={semesterId} onChange={(e) => { setSemesterId(e.target.value); setSaved(null) }} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field id="period-opens" label="Mở đăng ký (giờ Việt Nam)" required><Input id="period-opens" type="datetime-local" required value={opens} onChange={(e) => setOpens(e.target.value)} /></Field><Field id="period-closes" label="Đóng đăng ký (giờ Việt Nam)" required><Input id="period-closes" type="datetime-local" required value={closes} onChange={(e) => setCloses(e.target.value)} /></Field></div>
      {error ? <ErrorNotice error={error} /> : null}
      <Button type="submit" loading={busy}>Lưu thời gian đăng ký</Button>
    </form></Card>
    {saved && <Alert tone="success" title={`Đã lưu cho học kỳ ID ${saved.semester_id}`}>Mở: {fmtDT(saved.registration_opens_at)} · Đóng: {fmtDT(saved.registration_closes_at)}</Alert>}
  </Layout>
}
