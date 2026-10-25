import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpen, CalendarDays, CheckCircle2, ChevronDown, FilterX, Gauge, Layers, Loader2, Lock, Search, XCircle } from 'lucide-react'
import Layout from '../components/Layout'
import * as api from '../api'
import type { ClassSummary, RegisteredClass, TimetableEntry } from '../api/types'
import { DAYS } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { markSubmitted, useSessionLocked } from '../auth/sessionLock'
import { PeriodBanner } from '../components/PeriodBanner'
import { useCancelFlow } from '../components/RegistrationFlow'
import { useClassDetail } from '../components/ClassDetailModal'
import { ScheduleTable } from '../components/Schedule'
import { Link, navigate } from '../router'
import { useRequest } from '../hooks/useRequest'
import { Alert, Badge, Button, Capacity, Card, CreditBar, Empty, ErrorNotice, Input, Modal, PageHeader, Pagination, PillToggle, Select, Skeleton, Stat, Table, Td, cx, fmtDT } from '../components/ui'

// Courses shared by every program carry this faculty label and no major.
const SHARED = 'Liên khoa'
const credits = (regs: RegisteredClass[]) => regs.reduce((n, r) => n + r.credits, 0)
const isFull = (c: { enrolled: number; max_capacity: number }) => c.enrolled >= c.max_capacity
const MIN_LOADING_MS = 600
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const byTime = (a: TimetableEntry, b: TimetableEntry) => a.day_of_week - b.day_of_week || a.start_period - b.start_period

/** The current semester with the student's registrations and weekly schedule limited to it. */
async function loadTerm(signal: AbortSignal) {
  const [{ semester, classes }, regs, timetable] = await Promise.all([api.listClasses({}, signal), api.listRegistrations(signal), api.getSchedules(signal)])
  const inTerm = new Set(classes.map((c) => c.id))
  return {
    semester,
    regs: regs.registrations.filter((r) => r.status === 'registered' && inTerm.has(r.class_id)),
    week: timetable.schedules.filter((s) => inTerm.has(s.class_id)).sort(byTime),
  }
}

/** Skeleton while loading, retry notice on error, otherwise the loaded content. */
function Fetch<T>({ r, skeleton, children }: { r: { data?: T; loading: boolean; error: unknown; reload: () => void }; skeleton: ReactNode; children: (data: T) => ReactNode }) {
  if (r.error) return <ErrorNotice error={r.error} retry={r.reload} />
  return <>{r.loading || !r.data ? skeleton : children(r.data)}</>
}

export function StudentDashboard() {
  const { user } = useAuth()
  const detail = useClassDetail()
  const resource = useRequest(loadTerm)
  const desc = [`MSSV ${user!.student_code ?? '—'}`, user!.faculty, user!.major && `Ngành ${user!.major}`].filter(Boolean).join(' · ')
  return (
    <Layout title="Tổng quan">
      <PageHeader title={`Xin chào, ${user!.full_name}`} desc={desc}
        actions={<><Button onClick={() => navigate('/student/classes')}>Đăng ký học phần</Button><Button variant="secondary" onClick={() => navigate('/student/schedule')}>Xem thời khóa biểu</Button></>} />
      <div className="space-y-6">
        <Fetch r={resource} skeleton={<>
          <Skeleton className="h-[74px]" />
          <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
        </>}>
          {({ semester, regs, week }) => {
            const recent = [...regs].sort((a, b) => b.registered_at.localeCompare(a.registered_at))
            const cur = credits(regs)
            const max = semester?.max_credits
            return <>
              {semester && <PeriodBanner semester={semester} />}
              <div className="grid gap-4 md:grid-cols-3">
                <Stat label="Tổng tín chỉ đã đăng ký" value={cur} icon={<BookOpen className="h-5 w-5" />} sub={max ? (cur <= max ? `Tối đa ${max} tín chỉ` : 'Vượt mức tối đa') : undefined} />
                <Stat label="Số học phần đã đăng ký" value={regs.length} icon={<Layers className="h-5 w-5" />} sub={semester?.name ? semester.name.replace(/\s*-\s*(đang mở|chưa mở|đã đóng)$/i, '') : undefined} />
                {max ? <Card className="p-5"><p className="text-sm text-muted">Tiến độ tín chỉ</p><p className="mb-3 mt-1 text-2xl font-semibold tabular-nums">{cur}<span className="text-base font-normal text-muted">/{max}</span></p><CreditBar value={cur} max={max} /></Card>
                  : <Stat label="Buổi học mỗi tuần" value={week.length} icon={<CalendarDays className="h-5 w-5" />} />}
              </div>
              <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
                <Card title="Học phần đã đăng ký gần đây" action={<Link to="/student/registrations" className="text-sm font-medium text-primary hover:underline">Xem tất cả</Link>}>
                  {recent.length === 0 ? <Empty title="Chưa có học phần nào" text="Bạn chưa đăng ký học phần nào trong học kỳ này." action={<Button onClick={() => navigate('/student/classes')}>Tìm lớp học phần</Button>} /> : (
                    <Table head={[
                      { label: 'Học phần', className: 'w-auto' },
                      { label: 'Lớp', className: 'w-44' },
                      { label: 'TC', className: 'w-16' },
                      { label: 'Đăng ký lúc', className: 'w-44' },
                    ]} minWidth={600}>
                      {recent.slice(0, 5).map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <Td><button type="button" onClick={() => detail.show(r.class_id)} className="text-left font-medium text-primary hover:underline">{r.course_name}</button><div className="text-xs text-muted">{r.course_code}</div></Td>
                          <Td className="whitespace-nowrap">{r.class_code}</Td><Td>{r.credits}</Td><Td className="whitespace-nowrap text-muted">{fmtDT(r.registered_at)}</Td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </Card>
                <Card title="Lịch học trong tuần" action={<Link to="/student/schedule" className="text-sm font-medium text-primary hover:underline">Thời khóa biểu</Link>}>
                  {week.length === 0 ? <Empty title="Chưa có lịch học" icon={<CalendarDays className="h-6 w-6" />} /> : (
                    <ul className="divide-y divide-line">
                      {week.map((x, i) => (
                        <li key={i} className="flex items-center gap-3 px-5 py-3">
                          <span className="w-16 shrink-0 text-sm font-semibold text-primary">{DAYS[x.day_of_week]}</span>
                          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{x.course_name}</p><p className="text-[13px] text-muted">{x.class_code} · Tiết {x.start_period}–{x.end_period} · {x.room}</p></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </>
          }}
        </Fetch>
      </div>
      {detail.modal}
    </Layout>
  )
}

type Scope = 'major' | 'all'
type BatchItem = { c: ClassSummary; status: 'pending' | 'ok' | 'fail'; msg?: string }

/** "Theo ngành" = the student's own program plus the shared courses; "Toàn trường" = everything. */
async function loadClasses(scope: Scope, major: string | null, signal: AbortSignal) {
  // The unfiltered list also tells which classes belong to the current semester, whatever the scope.
  const everything = await api.listClasses({}, signal)
  const term = { semester: everything.semester, termIds: new Set(everything.classes.map((c) => c.id)) }
  if (scope === 'all' || !major) return { ...term, classes: everything.classes }
  const [own, shared] = await Promise.all([api.listClasses({ major }, signal), api.listClasses({ faculty: SHARED }, signal)])
  const seen = new Set<number>()
  const classes = [...own.classes, ...shared.classes].filter((c) => !seen.has(c.id) && seen.add(c.id)).sort((a, b) => a.class_code.localeCompare(b.class_code, 'vi', { numeric: true }))
  return { ...term, classes }
}

export function StudentClasses() {
  const { user } = useAuth()
  const major = user!.major
  const detail = useClassDetail()
  const locked = useSessionLocked()
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<Scope>('major')
  const [classesByScope, setClassesByScope] = useState<Partial<Record<Scope, ClassSummary[]>>>({})
  const [classesLoading, setClassesLoading] = useState(false)
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const scopeAbortRef = useRef<AbortController | null>(null)
  useEffect(() => () => scopeAbortRef.current?.abort(), [])
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  // Ticked classes, by class id. Each one is submitted as its own registration request.
  const [picked, setPicked] = useState<Record<number, ClassSummary>>({})
  const [batch, setBatch] = useState<BatchItem[] | null>(null)
  const [running, setRunning] = useState(false)
  const resource = useRequest(useCallback(async (signal: AbortSignal) => {
    const [loaded, regs] = await Promise.all([loadClasses(scopeRef.current, major, signal), api.listRegistrations(signal)])
    return { semester: loaded.semester, classes: loaded.classes, regs: regs.registrations.filter((r) => r.status === 'registered' && loaded.termIds.has(r.class_id)) }
  }, [major]))
  useEffect(() => {
    if (resource.data?.classes) {
      setClassesByScope((prev) => ({ ...prev, [scopeRef.current]: resource.data!.classes }))
    }
  }, [resource.data])

  const onScopeChange = async (nextScope: Scope) => {
    setScope(nextScope)
    setPage(1)
    if (classesByScope[nextScope]) return
    scopeAbortRef.current?.abort()
    const controller = new AbortController()
    scopeAbortRef.current = controller
    setClassesLoading(true)
    try {
      const res = await loadClasses(nextScope, major, controller.signal)
      if (!controller.signal.aborted) {
        setClassesByScope((prev) => ({ ...prev, [nextScope]: res.classes }))
        setClassesLoading(false)
      }
    } catch {
      if (!controller.signal.aborted) {
        setClassesLoading(false)
      }
    }
  }

  const ready = !!resource.data && !resource.error
  const semester = resource.data?.semester
  const classes = classesByScope[scope] ?? resource.data?.classes ?? []
  const regs = resource.data?.regs ?? []
  const registered = new Set(regs.map((r) => r.class_id))
  const open = !!semester?.registration_open
  const canAct = open && !locked

  const t = q.trim().toLowerCase()
  const list = classes.filter((c) => {
    if (t && ![c.course_code, c.course_name, c.class_code].some((x) => x.toLowerCase().includes(t))) return false
    if (status === 'registered' && !registered.has(c.id)) return false
    if (status === 'unregistered' && registered.has(c.id)) return false
    return true
  })
  const size = 8
  const pg = Math.min(page, Math.max(1, Math.ceil(list.length / size)))
  const shown = list.slice((pg - 1) * size, pg * size)
  const cur = credits(regs)
  const pickList = Object.values(picked)
  const pickedCredits = pickList.reduce((n, c) => n + c.credits, 0)
  const filtered = !!q || !!status || scope !== 'major'
  const reset = () => {
    setQ('')
    setStatus('')
    setPage(1)
    if (scope !== 'major') {
      onScopeChange('major')
    }
  }
  const toggle = (c: ClassSummary) => setPicked((p) => { const n = { ...p }; if (n[c.id]) delete n[c.id]; else n[c.id] = c; return n })

  // One request carries every ticked class; each class is accepted or rejected on its own.
  const confirm = async () => {
    if (running || !pickList.length) return
    const chosen = pickList
    setBatch(chosen.map((c) => ({ c, status: 'pending' }))); setRunning(true)
    let items: BatchItem[]
    try {
      // Keep the loading state on screen for a moment so it is visible even when the reply is instant.
      const [{ results }] = await Promise.all([api.registerClasses(chosen.map((c) => c.id)), sleep(MIN_LOADING_MS)])
      items = chosen.map((c) => {
        const r = results.find((x) => x.class_id === c.id)
        return r?.status === 'registered' ? { c, status: 'ok' } : { c, status: 'fail', msg: r?.status === 'failed' ? r.message : 'Không nhận được kết quả cho lớp này.' }
      })
    } catch (e) {
      items = chosen.map((c) => ({ c, status: 'fail', msg: (e as Error).message }))
    }
    setBatch(items); setRunning(false); setPicked({})
    // View-only only when every class went through. Any rejected class leaves the student free to keep registering.
    if (items.every((x) => x.status === 'ok')) markSubmitted()
  }
  const okCount = batch?.filter((b) => b.status === 'ok').length ?? 0
  const closeBatch = () => { setBatch(null); setClassesByScope({}); resource.reload() }

  const row = (c: ClassSummary) => {
    const mine = registered.has(c.id)
    const full = isFull(c)
    const can = canAct && !mine && !full
    const sel = !!picked[c.id]
    return (
      <tr key={c.id} onClick={(e) => { if (can && !(e.target as HTMLElement).closest('input,a,button')) toggle(c) }}
        className={cx(mine ? 'bg-emerald-50 shadow-[inset_4px_0_0_#10b981]' : sel ? 'bg-primary-soft shadow-[inset_4px_0_0_#0b4f8a]' : !can ? 'bg-slate-50 text-slate-400' : 'cursor-pointer hover:bg-slate-50')}>
        <Td className="w-12">
          <input type="checkbox" className="h-5 w-5 cursor-pointer accent-[#0b4f8a] disabled:cursor-not-allowed" checked={mine || sel} disabled={!can} onChange={() => toggle(c)}
            aria-label={mine ? `Đã đăng ký ${c.course_name}` : `Chọn ${c.course_name} ${c.class_code}`} />
        </Td>
        <Td className="whitespace-nowrap font-medium"><button type="button" onClick={() => detail.show(c.id)} className="hover:underline">{c.class_code}</button></Td>
        <Td><span className={cx('font-medium', mine && 'text-emerald-900')}>{c.course_name}</span><div className="text-xs text-muted">{c.course_code}</div></Td>
        <Td>{c.credits}</Td>
        <Td><Capacity c={c} /></Td>
        <Td>{mine ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" />Đã đăng ký</Badge> : full ? <Badge>Hết chỗ</Badge> : <Badge>Chưa đăng ký</Badge>}</Td>
      </tr>
    )
  }

  return (
    <Layout title="Đăng ký học phần">
      <PageHeader title="Đăng ký học phần" desc={ready && semester && <>Học kỳ: <b className="text-ink">{semester.name.replace(/\s*-\s*(đang mở|chưa mở|đã đóng)$/i, '')}</b> · Tổng tín chỉ hiện tại: <b className="text-ink">{cur}</b>/{semester.max_credits}</>} />
      {ready && semester && <div className="mb-6"><PeriodBanner semester={semester} /></div>}
      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Tìm kiếm</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Mã học phần, tên học phần hoặc mã lớp" className="pl-10" />
          </label>
          <PillToggle label="Phạm vi" value={scope} onChange={onScopeChange} options={[{ value: 'major', label: 'Theo ngành' }, { value: 'all', label: 'Toàn trường' }] as const} />
          <Select aria-label="Trạng thái" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="lg:w-48"><option value="">Mọi trạng thái</option><option value="registered">Đã đăng ký</option><option value="unregistered">Chưa đăng ký</option></Select>
          <Button variant="ghost" onClick={reset} disabled={!filtered}><FilterX className="h-4 w-4" />Xóa bộ lọc</Button>
        </div>
      </Card>
      {ready && open && locked && <div className="mb-4"><Alert tone="warning" title="Bạn đã gửi đăng ký trong phiên này">Phiên hiện tại chỉ cho phép xem. Để đăng ký hoặc hủy tiếp, hãy đăng xuất (hoặc chờ hết phiên) và đăng nhập lại.</Alert></div>}
      {ready && semester && !open && <div className="mb-4"><Alert tone="info" title="Không trong thời gian đăng ký">Hiện không trong thời gian đăng ký học phần. Bạn chỉ có thể xem danh sách lớp.</Alert></div>}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm">
          <span><b>{classesLoading ? '…' : list.length}</b> lớp học phần</span>
          <span className="flex items-center gap-4 text-muted"><span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded bg-emerald-200 ring-1 ring-emerald-500" />Đã đăng ký</span><span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded bg-slate-200" />Không thể chọn</span></span>
        </div>
        {resource.error ? (
          <ErrorNotice error={resource.error} retry={resource.reload} />
        ) : !ready || resource.loading || classesLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : list.length === 0 ? (
          <Empty title="Không tìm thấy lớp phù hợp" text="Thử từ khóa khác hoặc xóa bộ lọc." action={<Button variant="secondary" onClick={reset}>Xóa bộ lọc</Button>} icon={<Search className="h-6 w-6" />} />
        ) : <>
          <Table head={[
            { label: <span className="sr-only">Chọn</span>, className: 'w-12' },
            { label: 'Mã lớp', className: 'w-44' },
            { label: 'Tên học phần', className: 'w-auto' },
            { label: 'TC', className: 'w-16' },
            { label: 'Sĩ số', className: 'w-36' },
            { label: 'Trạng thái', className: 'w-40' },
          ]} minWidth={760}>{shown.map(row)}</Table>
          <Pagination page={pg} total={list.length} size={size} onChange={setPage} />
        </>}
      </Card>
      {ready && canAct && (
        <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-lg">
          <p className="text-sm">
            Đã chọn <b>{pickList.length}</b> học phần · <b>{pickedCredits}</b> tín chỉ
            <span className="text-muted"> · Tổng dự kiến {cur + pickedCredits}{semester && `/${semester.max_credits}`} TC</span>
            {semester && cur + pickedCredits > semester.max_credits && <span className="ml-2 font-medium text-red-700">Vượt giới hạn tối đa</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!pickList.length} onClick={() => setPicked({})}>Bỏ chọn</Button>
            <Button disabled={!pickList.length} loading={running} onClick={confirm}>{running ? 'Đang đăng ký…' : `Xác nhận đăng ký${pickList.length ? ` (${pickList.length})` : ''}`}</Button>
          </div>
        </div>
      )}
      {batch && (
        <Modal open closable={!running} onClose={closeBatch} title={running ? 'Đang xử lý đăng ký…' : 'Kết quả đăng ký'} footer={<Button onClick={closeBatch} loading={running}>{running ? 'Đang xử lý…' : 'Đóng'}</Button>}>
          {running && <div role="status" className="mb-3 flex items-center gap-3 rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary"><Loader2 className="h-5 w-5 shrink-0 animate-spin" />Đang gửi {batch.length} học phần, vui lòng chờ trong giây lát…</div>}
          <ul className="divide-y divide-line">
            {batch.map((b) => (
              <li key={b.c.id} className="flex gap-3 py-3 text-sm">
                {b.status === 'pending' ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" /> : b.status === 'ok' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
                <div><p className="font-medium">{b.c.course_name}</p><p className="text-[13px] text-muted">{b.c.class_code}</p><p className={b.status === 'fail' ? 'text-red-700' : 'text-muted'}>{b.status === 'pending' ? 'Đang gửi…' : b.status === 'ok' ? 'Đăng ký thành công.' : b.msg}</p></div>
              </li>
            ))}
          </ul>
          {!running && (okCount === batch.length
            ? <Alert tone="success" title={`Đăng ký thành công ${okCount}/${batch.length} học phần`}>Trong phiên này bạn chỉ có thể xem thông tin; muốn đăng ký tiếp cần đăng xuất và đăng nhập lại.</Alert>
            : okCount > 0
              ? <Alert tone="warning" title={`Đã đăng ký thành công ${okCount}/${batch.length} học phần`}>Các học phần thành công đã được ghi nhận. Học phần chưa thành công không được ghi nhận; bạn có thể chọn lại và tiếp tục đăng ký.</Alert>
              : <Alert tone="error" title="Chưa đăng ký được học phần nào">Bạn có thể kiểm tra lại lựa chọn và tiếp tục đăng ký.</Alert>)}
        </Modal>
      )}
      {detail.modal}
    </Layout>
  )
}

function RegistrationRow({ r, open, schedules, onCancel, onDetail }: { r: RegisteredClass; open: boolean; schedules: TimetableEntry[]; onCancel: (r: RegisteredClass) => void; onDetail: (classId: number) => void }) {
  const [exp, setExp] = useState(false)
  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button onClick={() => setExp(!exp)} aria-expanded={exp} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronDown className={cx('h-5 w-5 shrink-0 text-muted transition-transform', exp && 'rotate-180')} />
          <span className="min-w-0">
            <span className="block font-semibold">{r.course_name} <span className="font-normal text-muted">· {r.course_code}</span></span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted"><span className="font-medium text-ink">{r.class_code}</span>· {r.credits} tín chỉ · Đăng ký lúc {fmtDT(r.registered_at)}</span>
          </span>
        </button>
        {open ? <Button size="sm" variant="secondary" className="text-red-600" onClick={() => onCancel(r)}>Hủy đăng ký</Button> : <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-muted"><Lock className="h-3.5 w-3.5" />Đã khóa</span>}
      </div>
      {exp && (
        <div className="px-5 pb-4">
          {schedules.length ? <ScheduleTable schedules={schedules} /> : <p className="text-sm text-muted">Chưa có lịch học.</p>}
          <button type="button" onClick={() => onDetail(r.class_id)} className="mt-2 inline-block text-sm font-medium text-primary hover:underline">Xem chi tiết lớp</button>
        </div>
      )}
    </li>
  )
}

export function StudentRegistrations() {
  const locked = useSessionLocked()
  const resource = useRequest(loadTerm)
  const regs = resource.data?.regs ?? []
  const cur = credits(regs)
  const flow = useCancelFlow(resource.reload, cur)
  const detail = useClassDetail()
  return (
    <Layout title="Học phần đã đăng ký">
      <PageHeader title="Học phần đã đăng ký" desc={resource.data?.semester?.name} actions={resource.data?.semester?.registration_open && <Button onClick={() => navigate('/student/classes')}>Đăng ký thêm</Button>} />
      <div className="space-y-6">
        <Fetch r={resource} skeleton={<>
          <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
          <Skeleton className="h-64" />
        </>}>
          {({ semester, regs, week: schedules }) => { const open = !!semester?.registration_open, max = semester?.max_credits; return <>
            <div className="grid gap-4 md:grid-cols-3">
              <Stat label="Tổng số học phần" value={regs.length} icon={<Layers className="h-5 w-5" />} />
              <Stat label="Tổng tín chỉ" value={max ? `${cur}/${max}` : cur} icon={<BookOpen className="h-5 w-5" />} />
              {max ? <Stat label="Giới hạn tín chỉ tối đa" value={<span className={cur <= max ? 'text-emerald-700' : 'text-red-700'}>{cur <= max ? 'Trong giới hạn' : 'Vượt tối đa'}</span>} icon={<Gauge className="h-5 w-5" />} sub={`Tối đa ${max} tín chỉ`} />
                : <Stat label="Buổi học mỗi tuần" value={schedules.length} icon={<CalendarDays className="h-5 w-5" />} />}
            </div>
            {open && locked && <Alert tone="warning" title="Thao tác hủy đang bị khóa trong phiên này">Bạn đã gửi đăng ký trong phiên này. Đăng xuất và đăng nhập lại để thay đổi.</Alert>}
            {!open && <Alert tone="info" title="Thao tác hủy đang bị khóa">Hiện không trong thời gian đăng ký nên không thể hủy đăng ký. Danh sách chỉ để xem.</Alert>}
            <Card title="Danh sách học phần" action={regs.length > 0 && <span className="text-[13px] text-muted">Nhấn vào học phần để xem chi tiết</span>}>
              {regs.length === 0 ? <Empty title="Chưa đăng ký học phần nào" text="Tìm và đăng ký lớp học phần cho học kỳ này." action={<Button onClick={() => navigate('/student/classes')}>Tìm lớp học phần</Button>} /> : (
                <ul className="divide-y divide-line">{regs.map((r) => <RegistrationRow key={r.id} r={r} open={open && !locked} schedules={schedules.filter((s) => s.class_id === r.class_id)} onCancel={flow.start} onDetail={detail.show} />)}</ul>
              )}
            </Card>
          </> }}
        </Fetch>

      </div>
      {flow.modal}
      {detail.modal}
    </Layout>
  )
}
