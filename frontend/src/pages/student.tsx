import { Fragment, useState, type FormEvent } from 'react'
import { BookOpen, Layers, Gauge, Search, FilterX, CalendarDays, List, ArrowRight, Lock, CalendarRange, MapPin, UserRound, CheckCircle2, XCircle, ChevronDown, Ban, Loader2 } from 'lucide-react'
import Layout from '../Layout'
import { Link, navigate } from '../router'
import { type ApiError, register, markSubmitted, sessionSubmitted, checkRegistration, DAYS, bundleLabel, cancelCheck, cls, course, credits, db, fmtDT, passed, practice, practiceBlock, regSlots, semStatus, semester, sessionText, student, studentRegs, ui, updateAccountName, updateStudent, useDb, useSession, type Slot } from '../api'
import { type ClassSection, type Course, type PracticeGroup, type Registration, type Session, type Student } from '../data'
import { Modal, Alert, Badge, Button, Capacity, Card, CreditBar, Empty, Field, Input, PageHeader, Pagination, PillToggle, SemBadge, Select, Skeleton, Stat, Table, Td, cx, toast, useLoading } from '../ui'
import { CheckList, useCancelFlow } from '../flows'

const useMe = () => { useDb(); return student(useSession()!.studentId!) }
const isFull = (x: { enrolled: number; capacity: number }) => x.enrolled >= x.capacity

export function PeriodBanner() {
  useDb()
  const sem = semester(ui.semesterId)
  const st = semStatus(sem)
  return (
    <div className={cx('flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-5 py-4', st === 'open' ? 'border-blue-200 bg-primary-soft' : 'border-line bg-white')}>
      <div className="flex items-center gap-3">
        <CalendarRange className="h-5 w-5 shrink-0 text-primary" />
        <div><p className="text-sm font-semibold">Đợt đăng ký · {sem.name}</p><p className="text-[13px] text-muted">Mở {fmtDT(sem.openAt)} – Đóng {fmtDT(sem.closeAt)} (giờ Việt Nam)</p></div>
      </div>
      <SemBadge s={st} />
    </div>
  )
}

export function SessionList({ sessions }: { sessions: Session[] }) {
  return <div className="space-y-0.5">{sessions.map((s, i) => <div key={i} className="whitespace-nowrap">{DAYS[s.day]}, T{s.start}–{s.end} <span className="text-muted">· {s.room}</span></div>)}</div>
}
const KindBadge = ({ k }: { k: 'LT' | 'TH' }) => <Badge tone={k === 'LT' ? 'blue' : 'green'}>{k}</Badge>

export function StudentDashboard() {
  const me = useMe()
  const loading = useLoading()
  const sem = semester(ui.semesterId)
  const regs = studentRegs(me.id, sem.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const cur = credits(me.id, sem.id)
  const week = regs.flatMap(regSlots).sort((a, b) => a.s.day - b.s.day || a.s.start - b.s.start)
  return (
    <Layout title="Tổng quan">
      <PageHeader title={`Xin chào, ${me.name}`} desc={<>MSSV {me.code} · {me.faculty} · Ngành {me.major}</>}
        actions={<><Button onClick={() => navigate('/student/classes')}>Đăng ký học phần</Button><Button variant="secondary" onClick={() => navigate('/student/schedule')}>Xem thời khóa biểu</Button></>} />
      <div className="space-y-6">
        <PeriodBanner />
        {loading ? <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div> : (
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label="Tổng tín chỉ đã đăng ký" value={cur} icon={<BookOpen className="h-5 w-5" />} sub={cur <= sem.maxCredits ? `Tối đa ${sem.maxCredits} tín chỉ` : 'Vượt mức tối đa'} />
            <Stat label="Số học phần đã đăng ký" value={regs.length} icon={<Layers className="h-5 w-5" />} sub={sem.name} />
            <Card className="p-5"><p className="text-sm text-muted">Tiến độ tín chỉ</p><p className="mb-3 mt-1 text-2xl font-semibold tabular-nums">{cur}<span className="text-base font-normal text-muted">/{sem.maxCredits}</span></p><CreditBar value={cur} max={sem.maxCredits} /></Card>
          </div>
        )}
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card title="Học phần đã đăng ký gần đây" action={<Link to="/student/registrations" className="text-sm font-medium text-primary hover:underline">Xem tất cả</Link>}>
            {loading ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div> : regs.length === 0 ? <Empty title="Chưa có học phần nào" text="Bạn chưa đăng ký học phần nào trong học kỳ này." action={<Button onClick={() => navigate('/student/classes')}>Tìm lớp học phần</Button>} /> : (
              <Table head={['Học phần', 'Lớp / Nhóm', 'TC', 'Đăng ký lúc']} minWidth={600}>
                {regs.slice(0, 5).map((r) => { const c = cls(r.classId)!; const co = course(c.courseId); return (
                  <tr key={r.id} className="hover:bg-slate-50"><Td><Link to={`/student/classes/${c.id}`} className="font-medium text-primary hover:underline">{co.name}</Link><div className="text-xs text-muted">{co.code}</div></Td><Td className="whitespace-nowrap">{bundleLabel(r.classId, r.practiceId)}</Td><Td>{co.credits}</Td><Td className="whitespace-nowrap text-muted">{fmtDT(r.createdAt)}</Td></tr>
                ) })}
              </Table>
            )}
          </Card>
          <Card title="Lịch học trong tuần" action={<Link to="/student/schedule" className="text-sm font-medium text-primary hover:underline">Thời khóa biểu</Link>}>
            {week.length === 0 ? <Empty title="Chưa có lịch học" icon={<CalendarDays className="h-6 w-6" />} /> : (
              <ul className="divide-y divide-line">
                {week.map((x, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-16 shrink-0 text-sm font-semibold text-primary">{DAYS[x.s.day]}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{course(x.courseId).name}</p><p className="text-[13px] text-muted">{x.code} · Tiết {x.s.start}–{x.s.end} · {x.s.room}</p></div>
                    <KindBadge k={x.kind} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  )
}

type Pick = { classId: string; practiceId?: string }
type BatchItem = Pick & { status: 'pending' | 'ok' | 'fail'; msg?: string; code?: string }
type Option = { co: Course; c: ClassSection; g?: PracticeGroup }

export function StudentClasses() {
  const me = useMe()
  const sem = semester(ui.semesterId)
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'major' | 'all'>('major')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  // One pick per theory class: ticking a practice group selects it together with its theory class.
  const [picked, setPicked] = useState<Record<string, Pick>>({})
  const [batch, setBatch] = useState<BatchItem[] | null>(null)
  const [running, setRunning] = useState(false)
  const loading = useLoading(500)
  const regs = studentRegs(me.id, sem.id)
  const regOf = (classId: string) => regs.find((r) => r.classId === classId)
  const open = semStatus(sem) === 'open'
  const locked = sessionSubmitted()
  const canAct = open && !locked

  const groups = db.classes
    .filter((c) => c.semesterId === sem.id)
    .map((c) => ({ co: course(c.courseId), c }))
    .filter(({ co, c }) => {
      const t = q.trim().toLowerCase()
      if (t && ![co.code, co.name, c.code, ...c.practice.map((g) => g.code)].some((x) => x.toLowerCase().includes(t))) return false
      // "Theo ngành": courses in the student's program (major-specific + shared). "Toàn trường": every class.
      if (scope === 'major' && co.majors.length && !co.majors.includes(me.major)) return false
      if (status === 'registered' && !regOf(c.id)) return false
      if (status === 'unregistered' && regOf(c.id)) return false
      return true
    })
    .sort((a, b) => a.c.code.localeCompare(b.c.code, 'vi', { numeric: true }))
  const size = 8
  const pages = Math.max(1, Math.ceil(groups.length / size))
  const pg = Math.min(page, pages)
  const shown = groups.slice((pg - 1) * size, pg * size)
  const cur = credits(me.id, sem.id)
  const pickList = Object.values(picked)
  const pickedCredits = pickList.reduce((n, p) => n + course(cls(p.classId)!.courseId).credits, 0)
  const filtered = q || status || scope !== 'major'
  const reset = () => { setQ(''); setScope('major'); setStatus(''); setPage(1) }

  const isPicked = ({ c, g }: Option) => !!picked[c.id] && picked[c.id].practiceId === g?.id
  const toggle = (o: Option) => setPicked((p) => {
    const n = { ...p }
    if (isPicked(o)) delete n[o.c.id]
    else n[o.c.id] = { classId: o.c.id, practiceId: o.g?.id }
    return n
  })

  // Each ticked course is submitted as an independent, all-or-nothing bundle request.
  const confirm = async () => {
    const items: BatchItem[] = pickList.map((p) => ({ ...p, status: 'pending' }))
    setBatch(items); setRunning(true)
    for (let i = 0; i < items.length; i++) {
      try { await register(me.id, items[i].classId, items[i].practiceId); items[i] = { ...items[i], status: 'ok' } }
      catch (e) { items[i] = { ...items[i], status: 'fail', msg: (e as Error).message, code: (e as ApiError).code } }
      setBatch([...items])
    }
    setRunning(false)
    setPicked({})
    if (items.some((x) => x.status === 'ok')) markSubmitted()
  }
  const anyOk = batch?.some((b) => b.status === 'ok')
  const closeBatch = () => setBatch(null)

  /** A tickable row: a theory-only class, or a practice group (its theory class follows). */
  const optionRow = (o: Option) => {
    const { co, c, g } = o
    const reg = regOf(c.id)
    const mine = !!reg && reg.classId === c.id && reg.practiceId === g?.id
    // A full theory class disables all its practice groups; no extra text needed.
    const reason = isFull(c) ? null : g ? practiceBlock(me.id, c.id, g) : null
    const full = isFull(c) || (!!g && isFull(g))
    const can = canAct && !reg && !isFull(c) && !reason
    const sel = isPicked(o)
    const warn = sel ? checkRegistration(me.id, c.id, g?.id).find((x) => !x.ok) : undefined
    const sessions = g ? g.sessions : c.sessions
    return (
      <tr key={c.id + (g?.id ?? '')} onClick={(e) => { if (can && !(e.target as HTMLElement).closest('input,a,button')) toggle(o) }}
        className={cx(mine ? 'bg-emerald-50 shadow-[inset_4px_0_0_#10b981]' : sel ? 'bg-primary-soft shadow-[inset_4px_0_0_#0b4f8a]' : !can ? 'bg-slate-50 text-slate-400' : 'cursor-pointer hover:bg-slate-50')}>
        <Td className="w-12">
          <input type="checkbox" className="h-5 w-5 cursor-pointer accent-[#0b4f8a] disabled:cursor-not-allowed" checked={mine || sel} disabled={!can} onChange={() => toggle(o)}
            aria-label={mine ? `Đã đăng ký ${co.name}` : `Chọn ${co.name} ${g ? g.code : c.code}`} />
        </Td>
        <Td className="whitespace-nowrap font-medium">{g ? <span className="inline-flex items-center gap-2"><span aria-hidden className="ml-2 text-slate-300">└</span>{g.code}</span> : c.code}</Td>
        <Td>
          <span className={cx(!g && 'font-medium', mine && 'text-emerald-900')}>{co.name}</span>
          {reason && !reg && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700"><Ban className="h-3.5 w-3.5 shrink-0" />{reason}</p>}
          {warn && <p className="mt-1 text-xs text-amber-800">Lưu ý: {warn.message}</p>}
        </Td>
        <Td><KindBadge k={g ? 'TH' : 'LT'} /></Td>
        <Td>{g ? '' : co.credits}</Td>
        <Td><Capacity c={g ?? c} /></Td>
        <Td className="whitespace-nowrap">{g ? g.lecturer : c.lecturer}</Td>
        <Td><SessionList sessions={sessions} />{g && g.sessions.length > 1 && <span className="text-xs font-medium text-primary">Học đủ {g.sessions.length} buổi</span>}</Td>
        <Td>{mine ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" />Đã đăng ký</Badge> : reg ? <Badge>{g ? 'Đã ĐK nhóm khác' : 'Đã đăng ký'}</Badge> : full ? <Badge>Hết chỗ</Badge> : <Badge>Chưa đăng ký</Badge>}</Td>
      </tr>
    )
  }

  return (
    <Layout title="Đăng ký học phần">
      <PageHeader title="Đăng ký học phần" desc={<>Học kỳ: <b className="text-ink">{sem.name}</b> · Tổng tín chỉ hiện tại: <b className="text-ink">{cur}</b>/{sem.maxCredits}</>} />
      <div className="mb-6"><PeriodBanner /></div>
      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Tìm kiếm</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Mã học phần, tên học phần hoặc mã lớp" className="pl-10" />
          </label>
          <PillToggle label="Phạm vi" value={scope} onChange={(v) => { setScope(v); setPage(1) }} options={[{ value: 'major', label: 'Theo ngành' }, { value: 'all', label: 'Toàn trường' }] as const} />
          <Select aria-label="Trạng thái" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="lg:w-48"><option value="">Mọi trạng thái</option><option value="registered">Đã đăng ký</option><option value="unregistered">Chưa đăng ký</option></Select>
          <Button variant="ghost" onClick={reset} disabled={!filtered}><FilterX className="h-4 w-4" />Xóa bộ lọc</Button>
        </div>
        <p className="mt-3 text-[13px] text-muted">Với học phần có thực hành, chỉ cần tick một nhóm thực hành — lớp lý thuyết tương ứng được đăng ký theo.</p>
      </Card>
      {open && locked && <div className="mb-4"><Alert tone="warning" title="Bạn đã gửi đăng ký trong phiên này">Phiên hiện tại chỉ cho phép xem. Để đăng ký hoặc hủy tiếp, hãy đăng xuất (hoặc chờ hết phiên) và đăng nhập lại.</Alert></div>}
      {!open && <div className="mb-4"><Alert tone="info" title="Không trong thời gian đăng ký">Hiện không trong thời gian đăng ký học phần. Bạn chỉ có thể xem danh sách lớp.</Alert></div>}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm">
          <span><b>{groups.length}</b> lớp học phần</span>
          <span className="flex items-center gap-4 text-muted"><span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded bg-emerald-200 ring-1 ring-emerald-500" />Đã đăng ký</span><span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded bg-slate-200" />Không thể chọn</span></span>
        </div>
        {loading ? <div className="space-y-3 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div> : groups.length === 0 ? (
          <Empty title="Không tìm thấy lớp phù hợp" text="Thử từ khóa khác hoặc xóa bộ lọc." action={<Button variant="secondary" onClick={reset}>Xóa bộ lọc</Button>} icon={<Search className="h-6 w-6" />} />
        ) : (
          <>
            <Table head={[<span className="sr-only">Chọn</span>, 'Mã lớp', 'Tên học phần', 'Loại', 'TC', 'Sĩ số', 'Giảng viên', 'Lịch học / Phòng', 'Trạng thái']} minWidth={1100}>
              {shown.map(({ co, c }) => {
                if (!c.practice.length) return optionRow({ co, c })
                const mine = !!regOf(c.id)
                return (
                  <Fragment key={c.id}>
                    <tr className={cx('border-t-2 border-line', mine ? 'bg-emerald-50' : isFull(c) ? 'bg-slate-50 text-slate-400' : 'bg-slate-50/70')}>
                      <Td />
                      <Td className="whitespace-nowrap font-semibold">{c.code}</Td>
                      <Td className="font-semibold">{co.name}</Td>
                      <Td><KindBadge k="LT" /></Td>
                      <Td>{co.credits}</Td>
                      <Td />
                      <Td className="whitespace-nowrap">{c.lecturer}</Td>
                      <Td><SessionList sessions={c.sessions} /></Td>
                      <Td>{mine ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" />Đã đăng ký</Badge> : isFull(c) ? <Badge>Hết chỗ</Badge> : <span className="text-xs text-muted">Chọn 1 nhóm TH</span>}</Td>
                    </tr>
                    {c.practice.map((g) => optionRow({ co, c, g }))}
                  </Fragment>
                )
              })}
            </Table>
            <Pagination page={pg} total={groups.length} size={size} onChange={setPage} />
          </>
        )}
      </Card>
      {canAct && (
        <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-lg">
          <p className="text-sm">
            Đã chọn <b>{pickList.length}</b> học phần · <b>{pickedCredits}</b> tín chỉ
            <span className="text-muted"> · Tổng dự kiến {cur + pickedCredits}/{sem.maxCredits} TC</span>
            {cur + pickedCredits > sem.maxCredits && <span className="ml-2 font-medium text-red-700">Vượt giới hạn tối đa</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!pickList.length} onClick={() => setPicked({})}>Bỏ chọn</Button>
            <Button disabled={!pickList.length} onClick={confirm}>Xác nhận đăng ký{pickList.length ? ` (${pickList.length})` : ''}</Button>
          </div>
        </div>
      )}
      {batch && (
        <Modal open closable={!running} onClose={closeBatch} title={running ? 'Đang xử lý đăng ký…' : 'Kết quả đăng ký'} footer={<Button onClick={closeBatch} disabled={running}>Đóng</Button>}>
          <ul className="divide-y divide-line">
            {batch.map((b) => { const c = cls(b.classId)!; return (
              <li key={b.classId + (b.practiceId ?? '')} className="flex gap-3 py-3 text-sm">
                {b.status === 'pending' ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" /> : b.status === 'ok' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
                <div><p className="font-medium">{course(c.courseId).name}</p><p className="text-[13px] text-muted">{bundleLabel(b.classId, b.practiceId)}</p><p className={b.status === 'fail' ? 'text-red-700' : 'text-muted'}>{b.status === 'pending' ? 'Đang gửi…' : b.status === 'ok' ? 'Đăng ký thành công.' : b.msg + ' Không thành phần nào được ghi nhận.'}</p></div>
              </li>
            ) })}
          </ul>
          {!running && anyOk && <Alert tone="info">Đăng ký đã hoàn tất. Trong phiên này bạn chỉ có thể xem thông tin; muốn đăng ký tiếp cần đăng xuất và đăng nhập lại.</Alert>}
        </Modal>
      )}
    </Layout>
  )
}

export function ClassDetail({ id }: { id: string }) {
  useDb()
  const s = useSession()!
  const c = cls(id)
  const back = '/student/classes'
  if (!c) return <Layout title="Chi tiết lớp" semester={false}><Card><Empty title="Không tìm thấy lớp học phần" action={<Button onClick={() => navigate(back)}>Quay lại danh sách</Button>} /></Card></Layout>
  const co = course(c.courseId)
  const sem = semester(c.semesterId)
  const reg = studentRegs(s.studentId!, sem.id).find((r) => r.classId === c.id)
  return (
    <Layout title="Chi tiết lớp học phần" semester={false}>
      <PageHeader crumbs={<><Link to={back} className="hover:text-primary">Đăng ký học phần</Link> <span aria-hidden>/</span> {co.code} {c.code}</>}
        title={co.name} desc={<>{co.code} · Lý thuyết {c.code} · {sem.name}</>}
        actions={<Button variant="secondary" onClick={() => navigate(back)}>Quay lại chọn lớp</Button>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card title="Thông tin lớp">
            <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
              {([['Mã học phần', co.code], ['Tên học phần', co.name], ['Lớp lý thuyết', c.code], ['Học kỳ', sem.name], ['Số tín chỉ', co.credits], ['Khoa', co.faculty], ['Giảng viên', c.lecturer]] as const).map(([k, v]) => (
                <div key={k}><dt className="text-muted">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card title={`Lịch lý thuyết (${c.sessions.length} buổi/tuần)`}>
            <Table head={['Thứ', 'Tiết', 'Phòng']} minWidth={360}>
              {c.sessions.map((x, i) => <tr key={i}><Td className="font-medium">{DAYS[x.day]}</Td><Td>Tiết {x.start}–{x.end}</Td><Td><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted" />{x.room}</span></Td></tr>)}
            </Table>
          </Card>
          {c.practice.length > 0 && (
            <Card title="Nhóm thực hành đi kèm (chọn 1 khi đăng ký)">
              <ul className="divide-y divide-line">
                {c.practice.map((p) => (
                  <li key={p.id} className={cx('flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm', reg?.practiceId === p.id && 'bg-emerald-50')}>
                    <div><p className="font-semibold">{p.code}{p.sessions.length > 1 && <span className="ml-2 text-xs font-medium text-primary">Học đủ {p.sessions.length} buổi</span>}{reg?.practiceId === p.id && <span className="ml-2"><Badge tone="green">Nhóm của bạn</Badge></span>}</p><p className="text-muted">{p.lecturer}</p><SessionList sessions={p.sessions} /></div>
                    <Capacity c={p} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Học phần tiên quyết">
            {co.prereqs.length === 0 ? <p className="p-5 text-sm text-muted">Không yêu cầu học phần tiên quyết.</p> : (
              <ul className="divide-y divide-line">
                {co.prereqs.map((p) => (
                  <li key={p} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span><b>{p}</b> · {course(p).name}</span>{passed(s.studentId!, p) ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" />Đã đạt</Badge> : <Badge tone="red"><XCircle className="h-3 w-3" />Chưa đạt</Badge>}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          {c.practice.length === 0 && <Card title="Sĩ số">
            <div className="grid grid-cols-3 divide-x divide-line text-center">
              {([['Hiện tại', c.enrolled], ['Sức chứa', c.capacity], ['Còn lại', Math.max(0, c.capacity - c.enrolled)]] as const).map(([k, v]) => <div key={k} className="p-4"><p className="text-2xl font-semibold tabular-nums">{v}</p><p className="text-xs text-muted">{k}</p></div>)}
            </div>
            <div className="flex items-center justify-between border-t border-line px-5 py-3"><Capacity c={c} />{reg ? <Badge tone="green">Đã đăng ký</Badge> : isFull(c) ? <Badge>Hết chỗ</Badge> : <Badge>Chưa đăng ký</Badge>}</div>
          </Card>}
          <Card title="Điều kiện đăng ký"><CheckList studentId={s.studentId!} classId={c.id} /><p className="border-t border-line px-5 py-3 text-[13px] text-muted">Kiểm tra trước chỉ mang tính tham khảo; kết quả cuối cùng do hệ thống xử lý khi xác nhận.</p></Card>
        </div>
      </div>
    </Layout>
  )
}

function RegistrationRow({ r, open, onCancel }: { r: Registration; open: boolean; onCancel: (id: string) => void }) {
  const [exp, setExp] = useState(false)
  const c = cls(r.classId)!
  const co = course(c.courseId)
  const g = practice(r.practiceId)
  const block = cancelCheck(r.id)
  const parts = [{ k: 'LT' as const, code: c.code, ss: c.sessions, who: c.lecturer, cap: c }, ...(g ? [{ k: 'TH' as const, code: g.code, ss: g.sessions, who: g.lecturer, cap: g }] : [])]
  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button onClick={() => setExp(!exp)} aria-expanded={exp} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronDown className={cx('h-5 w-5 shrink-0 text-muted transition-transform', exp && 'rotate-180')} />
          <span className="min-w-0">
            <span className="block font-semibold">{co.name} <span className="font-normal text-muted">· {co.code}</span></span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted"><span className="font-medium text-ink">{bundleLabel(r.classId, r.practiceId)}</span>· {co.credits} tín chỉ · Đăng ký lúc {fmtDT(r.createdAt)}</span>
          </span>
        </button>
        {open ? <Button size="sm" variant="secondary" className="text-red-600" onClick={() => onCancel(r.id)} title={block ?? undefined}>Hủy đăng ký</Button> : <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-muted"><Lock className="h-3.5 w-3.5" />Đã khóa</span>}
      </div>
      {exp && (
        <div className="px-5 pb-4">
          <Table head={['Thành phần', 'Mã', 'Giảng viên', 'Lịch / Phòng', 'Sĩ số']} minWidth={640}>
            {parts.map((x) => <tr key={x.k}><Td><KindBadge k={x.k} /></Td><Td className="font-medium">{x.code}</Td><Td>{x.who}</Td><Td><SessionList sessions={x.ss} /></Td><Td>{x.k === 'LT' && g ? '' : <Capacity c={x.cap} />}</Td></tr>)}
          </Table>
        </div>
      )}
    </li>
  )
}

export function StudentRegistrations() {
  const me = useMe()
  const sem = semester(ui.semesterId)
  const regs = studentRegs(me.id, sem.id)
  const cur = credits(me.id, sem.id)
  const flow = useCancelFlow()
  const st = semStatus(sem)
  const ok = cur <= sem.maxCredits
  return (
    <Layout title="Học phần đã đăng ký">
      <PageHeader title="Học phần đã đăng ký" desc={sem.name} actions={st === 'open' && <Button onClick={() => navigate('/student/classes')}>Đăng ký thêm</Button>} />
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="Tổng số học phần" value={regs.length} icon={<Layers className="h-5 w-5" />} />
          <Stat label="Tổng tín chỉ" value={`${cur}/${sem.maxCredits}`} icon={<BookOpen className="h-5 w-5" />} />
          <Stat label="Giới hạn tín chỉ tối đa" value={<span className={ok ? 'text-emerald-700' : 'text-red-700'}>{ok ? 'Trong giới hạn' : 'Vượt tối đa'}</span>} icon={<Gauge className="h-5 w-5" />} sub={`Tối đa ${sem.maxCredits} tín chỉ`} />
        </div>
        {st === 'open' && sessionSubmitted() && <Alert tone="warning" title="Thao tác hủy đang bị khóa trong phiên này">Bạn đã gửi đăng ký trong phiên này. Đăng xuất và đăng nhập lại để thay đổi.</Alert>}
        {st !== 'open' && <Alert tone="info" title="Thao tác hủy đang bị khóa">{st === 'closed' ? 'Đợt đăng ký của học kỳ này đã đóng nên không thể hủy đăng ký. Danh sách chỉ để xem.' : 'Đợt đăng ký của học kỳ này chưa mở.'}</Alert>}
        {st === 'open' && <Alert tone="info">Hủy đăng ký áp dụng cho cả lớp lý thuyết và nhóm thực hành đi kèm.</Alert>}
        <Card title="Danh sách học phần" action={regs.length > 0 && <span className="text-[13px] text-muted">Nhấn vào học phần để xem chi tiết</span>}>
          {regs.length === 0 ? <Empty title="Chưa đăng ký học phần nào" text="Tìm và đăng ký lớp học phần cho học kỳ này." action={<Button onClick={() => navigate('/student/classes')}>Tìm lớp học phần</Button>} /> : (
            <ul className="divide-y divide-line">{regs.map((r) => <RegistrationRow key={r.id} r={r} open={st === 'open' && !sessionSubmitted()} onCancel={flow.start} />)}</ul>
          )}
        </Card>
      </div>
      {flow.modal}
    </Layout>
  )
}

const palette = ['bg-blue-50 border-blue-400 text-blue-950', 'bg-emerald-50 border-emerald-400 text-emerald-950', 'bg-amber-50 border-amber-400 text-amber-950', 'bg-violet-50 border-violet-400 text-violet-950', 'bg-rose-50 border-rose-400 text-rose-950', 'bg-cyan-50 border-cyan-400 text-cyan-950', 'bg-lime-50 border-lime-400 text-lime-950']
const WEEK = [2, 3, 4, 5, 6, 7, 8]
const SlotBadge = ({ k }: { k: 'LT' | 'TH' }) => <span className="rounded bg-white/80 px-1 py-px text-[10px] font-bold ring-1 ring-current/20">{k}</span>

export function StudentSchedule() {
  const me = useMe()
  const sem = semester(ui.semesterId)
  const [view, setView] = useState<'grid' | 'list'>(() => (window.innerWidth < 768 ? 'list' : 'grid'))
  const regs = studentRegs(me.id, sem.id)
  // Same colour for every session of a course (theory + practice).
  const color = new Map(regs.map((r, i) => [cls(r.classId)!.courseId, palette[i % palette.length]]))
  const items: Slot[] = regs.flatMap(regSlots)
  const periods = Array.from({ length: 12 }, (_, i) => i + 1)
  return (
    <Layout title="Thời khóa biểu">
      <PageHeader title="Thời khóa biểu" desc={<>{sem.name} · Lịch lặp theo tuần, chỉ gồm các học phần đăng ký thành công</>}
        actions={<PillToggle label="Chế độ xem" value={view} onChange={setView} options={[{ value: 'grid', label: <><CalendarDays className="h-4 w-4" />Lịch tuần</> }, { value: 'list', label: <><List className="h-4 w-4" />Danh sách</> }] as const} />} />
      {items.length === 0 ? <Card><Empty title="Chưa có lịch học" text="Thời khóa biểu sẽ hiển thị sau khi bạn đăng ký học phần thành công." action={<Button onClick={() => navigate('/student/classes')}>Tìm lớp học phần</Button>} icon={<CalendarDays className="h-6 w-6" />} /></Card> : view === 'grid' ? (
        <Card className="overflow-x-auto">
          <div className="grid min-w-[980px]" style={{ gridTemplateColumns: '72px repeat(7, minmax(120px, 1fr))', gridTemplateRows: '44px repeat(12, 56px)' }}>
            <div className="border-b border-r border-line bg-slate-50" style={{ gridColumn: 1, gridRow: 1 }} />
            {WEEK.map((d, i) => <div key={d} className="grid place-items-center border-b border-line bg-slate-50 text-sm font-semibold" style={{ gridColumn: i + 2, gridRow: 1 }}>{DAYS[d]}</div>)}
            {periods.map((p) => <div key={p} className="flex items-center justify-center border-b border-r border-line text-xs font-medium text-muted" style={{ gridColumn: 1, gridRow: p + 1 }}>Tiết {p}</div>)}
            {periods.map((p) => WEEK.map((d, i) => <div key={p + '-' + d} className="border-b border-r border-line/60" style={{ gridColumn: i + 2, gridRow: p + 1 }} />))}
            {items.map((x, k) => { const co = course(x.courseId); const c = cls(x.classId)!; return (
              <button key={k} onClick={() => navigate(`/student/classes/${x.classId}`)} className={cx('z-10 m-1 overflow-hidden rounded-lg border border-l-4 p-2 text-left text-xs transition hover:shadow-md', color.get(x.courseId), x.kind === 'TH' && 'border-dashed')} style={{ gridColumn: x.s.day, gridRow: `${x.s.start + 1} / ${x.s.end + 2}` }} aria-label={`${co.name}, ${x.kind === 'LT' ? 'lý thuyết' : 'thực hành'} ${x.code}, ${sessionText(x.s)}, phòng ${x.s.room}`}>
                <p className="flex items-center gap-1 font-semibold leading-snug"><SlotBadge k={x.kind} />{co.name}</p>
                <p className="mt-0.5">{x.code} · Tiết {x.s.start}–{x.s.end}</p>
                <p className="mt-0.5 opacity-80">{x.s.room} · {x.kind === 'LT' ? c.lecturer : practice(x.practiceId)?.lecturer}</p>
              </button>
            ) })}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {WEEK.map((d) => { const list = items.filter((x) => x.s.day === d).sort((a, b) => a.s.start - b.s.start); if (!list.length) return null; return (
            <Card key={d} title={DAYS[d]}>
              <ul className="divide-y divide-line">
                {list.map((x, k) => (
                  <li key={k}><button onClick={() => navigate(`/student/classes/${x.classId}`)} className="flex min-h-11 w-full items-center gap-4 px-5 py-3 text-left hover:bg-slate-50">
                    <span className={cx('w-20 shrink-0 rounded-lg border px-2 py-1 text-center text-xs font-semibold', color.get(x.courseId))}>Tiết {x.s.start}–{x.s.end}</span>
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-2 font-medium"><KindBadge k={x.kind} />{course(x.courseId).name}</span><span className="block text-[13px] text-muted">{x.code} · {x.s.room} · {x.kind === 'LT' ? cls(x.classId)!.lecturer : practice(x.practiceId)?.lecturer}</span></span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
                  </button></li>
                ))}
              </ul>
            </Card>
          ) })}
        </div>
      )}
      <p className="mt-4 text-[13px] text-muted">LT: lý thuyết · TH: thực hành (viền nét đứt). Thời khóa biểu hiển thị theo tiết, không bao gồm lịch thi, lịch học bù hoặc lịch nghỉ.</p>
    </Layout>
  )
}

