import { useCallback, useState, type FormEvent } from 'react'
import { BookOpen, CalendarDays, ListChecks, Search } from 'lucide-react'
import Layout from '../components/Layout'
import * as api from '../api'
import { useAuth } from '../auth/AuthProvider'
import { RegisterClassModal, useCancelFlow } from '../components/RegistrationFlow'
import { ScheduleList, ScheduleTable } from '../components/Schedule'
import { StudentProfileEditor } from '../components/StudentProfileEditor'
import { Link, navigate } from '../router'
import { DAYS } from '../api/types'
import { useRequest } from '../hooks/useRequest'
import { Alert, Badge, Button, Capacity, Card, Empty, Field, Input, PageHeader, Pagination, PillToggle, RequestStatus, Stat, Table, Td, fmtDT } from '../components/ui'

export function StudentDashboard() {
  const { user, refreshUser } = useAuth()
  const resource = useRequest(useCallback(async (signal: AbortSignal) => {
    const [regs, timetable] = await Promise.all([api.listRegistrations(signal), api.getSchedules(signal)])
    return { registrations: regs.registrations, schedules: timetable.schedules }
  }, []))
  const data = resource.data
  return <Layout title="Tổng quan và hồ sơ">
    <PageHeader title={`Xin chào, ${user!.full_name}`} desc={`Mã sinh viên: ${user!.student_code ?? '—'}`} actions={<Button onClick={() => navigate('/student/classes')}>Đăng ký học phần</Button>} />
    <RequestStatus {...resource} retry={resource.reload} />
    {data && !resource.loading && !resource.error && <>
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Học phần đang đăng ký" value={data.registrations.length} icon={<ListChecks />} /><Stat label="Tổng tín chỉ" value={data.registrations.reduce((n, r) => n + r.credits, 0)} icon={<BookOpen />} /><Stat label="Buổi học mỗi tuần" value={data.schedules.length} icon={<CalendarDays />} /></div>
      <Card title="Các học phần đã đăng ký" action={<Link to="/student/registrations" className="text-sm text-primary">Xem và hủy đăng ký</Link>}>
        {data.registrations.length ? <ul className="divide-y divide-line">{data.registrations.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm"><Link to={`/student/classes/${r.class_id}`} className="font-medium text-primary">{r.course_name} · {r.class_code}</Link><span>{r.credits} tín chỉ</span></li>)}</ul> : <Empty title="Chưa có học phần đã đăng ký" />}
      </Card>
    </>}
    <StudentProfileEditor studentId={user!.id} onSaved={refreshUser} />
  </Layout>
}

export function StudentClasses() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ faculty: '', major: '' })
  const [applied, setApplied] = useState({ faculty: '', major: '' })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number | null>(null)
  const resource = useRequest(useCallback((signal) => api.listClasses(applied, signal), [applied]))
  const list = (resource.data?.classes ?? []).filter((c) => `${c.class_code} ${c.course_code} ${c.course_name}`.toLowerCase().includes(query.trim().toLowerCase()))
  const size = 10
  const pg = Math.min(page, Math.max(1, Math.ceil(list.length / size)))
  const filter = (e: FormEvent) => { e.preventDefault(); setPage(1); setApplied({ ...filters }) }
  return <Layout title="Đăng ký học phần">
    <PageHeader title="Tra cứu lớp học phần" desc="Danh sách lớp của học kỳ hiện tại do máy chủ trả về. Mỗi lần đăng ký gửi một lớp." actions={<Button variant="secondary" onClick={resource.reload}>Tải lại</Button>} />
    <Card>
      <form onSubmit={filter} className="grid gap-3 border-b border-line p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
        <Field id="class-search" label="Tìm trong kết quả"><Input id="class-search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Mã lớp, học phần hoặc tên học phần" /></Field>
        <Field id="class-faculty" label="Khoa"><Input id="class-faculty" value={filters.faculty} onChange={(e) => setFilters({ ...filters, faculty: e.target.value })} placeholder="Tên khoa chính xác" /></Field>
        <Field id="class-major" label="Ngành"><Input id="class-major" value={filters.major} onChange={(e) => setFilters({ ...filters, major: e.target.value })} placeholder="Tên ngành chính xác" /></Field>
        <div className="flex items-end"><Button type="submit"><Search className="h-4 w-4" />Lọc</Button></div>
      </form>
      <RequestStatus {...resource} retry={resource.reload} />
      {!resource.loading && !resource.error && (list.length ? <>
        <Table head={['Mã lớp', 'Học phần', 'TC', 'Sĩ số', 'Thời gian đăng ký', 'Thao tác']} minWidth={850}>
          {list.slice((pg - 1) * size, pg * size).map((c) => <tr key={c.id}><Td><Link to={`/student/classes/${c.id}`} className="font-medium text-primary">{c.class_code}</Link></Td><Td>{c.course_name}<p className="text-xs text-muted">{c.course_code}</p></Td><Td>{c.credits}</Td><Td><Capacity c={c} /></Td><Td><Badge tone={c.registration_open ? 'green' : 'gray'}>{c.registration_open ? 'Đang mở' : 'Không mở'}</Badge></Td><Td><Button size="sm" onClick={() => setSelected(c.id)}>Đăng ký</Button></Td></tr>)}
        </Table><Pagination page={pg} total={list.length} size={size} onChange={setPage} />
      </> : <Empty title="Không tìm thấy lớp phù hợp" text="Thử xóa bộ lọc hoặc kiểm tra thông tin học kỳ." />)}
    </Card>
    <Alert>Máy chủ quyết định điều kiện đăng ký và giới hạn tín chỉ. Mỗi lớp có thể có nhiều buổi học; đăng ký lớp bao gồm tất cả các buổi đó.</Alert>
    {selected !== null && <RegisterClassModal classId={selected} onClose={() => { setSelected(null); resource.reload() }} />}
  </Layout>
}

export function ClassDetail({ id }: { id: string }) {
  const resource = useRequest(useCallback((signal) => api.getClass(Number(id), signal), [id]))
  const [registering, setRegistering] = useState(false)
  const c = resource.data
  return <Layout title="Chi tiết lớp học phần">
    <PageHeader title={c?.course_name ?? 'Chi tiết lớp học phần'} actions={<Button variant="secondary" onClick={() => navigate('/student/classes')}>Quay lại danh sách</Button>} />
    <RequestStatus {...resource} retry={resource.reload} />
    {c && !resource.loading && !resource.error && <>
      <Card title={c.class_code} action={<Badge tone={c.status === 'active' ? 'blue' : 'red'}>{c.status === 'active' ? 'Đang hoạt động' : 'Đã hủy'}</Badge>}>
        <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">{[['Mã học phần', c.course_code], ['Số tín chỉ', c.credits], ['Giảng viên', c.lecturer_name], ['ID học kỳ', c.semester_id], ['ID học phần', c.course_id]].map(([label, value]) => <div key={label}><dt className="text-muted">{label}</dt><dd className="font-medium">{value}</dd></div>)}<div><dt className="mb-1 text-muted">Sĩ số</dt><Capacity c={c} /></div></dl>
      </Card>
      <Card title={`Lịch học (${c.schedules.length} buổi mỗi tuần)`}><ScheduleTable schedules={c.schedules} /></Card>
      <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-muted">{c.registration_open ? 'Học kỳ đang mở đăng ký.' : 'Học kỳ không trong thời gian đăng ký.'} Các điều kiện khác được backend kiểm tra khi gửi yêu cầu.</p><Button onClick={() => setRegistering(true)} disabled={c.status === 'cancelled'}>Đăng ký lớp này</Button></div>
    </>}
    {registering && c && <RegisterClassModal classId={c.id} onClose={() => { setRegistering(false); resource.reload() }} />}
  </Layout>
}

export function StudentRegistrations() {
  const resource = useRequest(api.listRegistrations)
  const flow = useCancelFlow(resource.reload)
  const regs = resource.data?.registrations ?? []
  return <Layout title="Học phần đã đăng ký">
    <PageHeader title="Học phần đã đăng ký" desc="Các đăng ký đang hiệu lực của chính bạn." actions={<Button variant="secondary" onClick={resource.reload}>Tải lại</Button>} />
    <RequestStatus {...resource} retry={resource.reload} />
    {!resource.loading && !resource.error && <>
      <p className="text-sm">{regs.length} lớp · Tổng {regs.reduce((n, r) => n + r.credits, 0)} tín chỉ</p>
      <Card>{regs.length ? <Table head={['Lớp học phần', 'TC', 'Thời điểm đăng ký', 'Thao tác']} minWidth={700}>{regs.map((r) => <tr key={r.id}><Td><Link to={`/student/classes/${r.class_id}`} className="font-medium text-primary">{r.course_name}</Link><p className="text-xs text-muted">{r.course_code} · {r.class_code} · Mã đăng ký {r.id}</p></Td><Td>{r.credits}</Td><Td>{fmtDT(r.registered_at)}</Td><Td><Button variant="danger" size="sm" onClick={() => flow.start(r)}>Hủy đăng ký</Button></Td></tr>)}</Table> : <Empty title="Chưa có đăng ký đang hiệu lực" action={<Button onClick={() => navigate('/student/classes')}>Tra cứu lớp</Button>} />}</Card>
      <Alert>Hủy đăng ký trong thời gian do quản trị cấu hình. Nếu yêu cầu không hợp lệ, máy chủ trả lý do; frontend không tự giảm sĩ số.</Alert>
    </>}
    {flow.modal}
  </Layout>
}

export function StudentSchedule() {
  const resource = useRequest(api.getSchedules)
  const [view, setView] = useState<'week' | 'list'>('week')
  const entries = resource.data?.schedules ?? []
  return <Layout title="Thời khóa biểu">
    <PageHeader title="Thời khóa biểu" desc="Tất cả buổi học của các lớp đang đăng ký." actions={<Button variant="secondary" onClick={resource.reload}>Tải lại</Button>} />
    <PillToggle value={view} onChange={setView} label="Kiểu thời khóa biểu" options={[{ value: 'week', label: 'Theo tuần' }, { value: 'list', label: 'Danh sách' }]} />
    <RequestStatus {...resource} retry={resource.reload} />
    {!resource.loading && !resource.error && (entries.length ? view === 'week' ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Object.entries(DAYS).map(([day, label]) => <Card key={day} title={label}><ul className="space-y-3 p-4">{entries.filter((s) => s.day_of_week === Number(day)).map((s, i) => <li key={i} className="rounded-xl border border-blue-200 bg-primary-soft p-3 text-sm"><Link to={`/student/classes/${s.class_id}`} className="font-semibold text-primary">{s.course_name}</Link><p className="mb-2 text-xs text-muted">{s.class_code}</p><ScheduleList schedules={[s]} /></li>)}</ul></Card>)}</div> : <Card><Table head={['Học phần', 'Lớp', 'Thứ', 'Tiết', 'Phòng']} minWidth={700}>{entries.map((s, i) => <tr key={i}><Td>{s.course_name}</Td><Td><Link to={`/student/classes/${s.class_id}`} className="text-primary">{s.class_code}</Link></Td><Td>{DAYS[s.day_of_week]}</Td><Td>{s.start_period}–{s.end_period}</Td><Td>{s.room}</Td></tr>)}</Table></Card> : <Card><Empty title="Chưa có lịch học" /></Card>)}
  </Layout>
}
