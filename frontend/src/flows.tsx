import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import * as api from './api'
import { useAuth } from './AuthProvider'
import { ApiError } from './http'
import { DAYS, type ClassSchedule, type RegisteredClass, type Registration } from './types'
import { useRequest } from './useRequest'
import { Alert, Button, Capacity, Card, ErrorNotice, Field, Input, Modal, RequestStatus, Table, Td, toast } from './ui'

export function ScheduleList({ schedules }: { schedules: ClassSchedule[] }) {
  return <ul className="space-y-1 text-sm">{schedules.map((s, i) => <li key={i}>{DAYS[s.day_of_week]} · Tiết {s.start_period}–{s.end_period} · {s.room}</li>)}</ul>
}
export function ScheduleTable({ schedules }: { schedules: ClassSchedule[] }) {
  return <Table head={['Thứ', 'Tiết bắt đầu', 'Tiết kết thúc', 'Phòng']} minWidth={450}>{schedules.map((s, i) => <tr key={i}><Td>{DAYS[s.day_of_week]}</Td><Td>{s.start_period}</Td><Td>{s.end_period}</Td><Td>{s.room}</Td></tr>)}</Table>
}

export function RegistrationFinalization() {
  const auth = useAuth()
  const notice = auth.registrationNotice
  if (!notice) return null
  return <div className="mx-auto max-w-xl space-y-5 p-6 py-12"><Card title="Đăng ký học phần thành công"><div className="space-y-5 p-5">
    <Alert tone="success">Đã đăng ký {notice.classCode}, mã đăng ký {notice.registrationId}. Chỉ còn hoàn tất logout phiên hiện tại.</Alert>
    <p className="text-sm text-muted">Thử lại ở đây chỉ gửi logout, không gửi thêm yêu cầu đăng ký. Thời gian chờ 20 phút đã bắt đầu từ lúc đăng ký thành công.</p>
    {notice.storageWarning && <Alert tone="warning">Trình duyệt không lưu được đầy đủ trạng thái chờ. Tải lại trang có thể làm mất trạng thái này.</Alert>}
    {auth.finalizationError ? <ErrorNotice error={auth.finalizationError} /> : null}
    <Button loading={auth.finishingRegistration} onClick={() => { void auth.finishRegistration(notice.classCode, notice.registrationId).catch(() => {}) }}>Thử đăng xuất lại</Button>
  </div></Card></div>
}

export function RegisterClassModal({ classId, onClose }: { classId: number; onClose: () => void }) {
  const resource = useRequest(useCallback((signal) => api.getClass(classId, signal), [classId]))
  const { finishRegistration } = useAuth()
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<unknown>(null)
  const [registered, setRegistered] = useState<Registration | null>(null)
  const submit = async () => {
    if (inFlight.current || !resource.data) return
    inFlight.current = true; setBusy(true); setError(null)
    try {
      let result = registered
      if (!result) {
        result = await api.register(classId)
        setRegistered(result)
      }
      await finishRegistration(resource.data.class_code, result.id)
    } catch (cause) { setError(cause) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const c = resource.data
  return <Modal open onClose={onClose} closable={!busy && !registered} title="Đăng ký lớp học phần" footer={<>
    {!registered && <Button variant="secondary" onClick={onClose} disabled={busy}>Quay lại</Button>}
    <Button onClick={submit} loading={busy} disabled={!c || resource.loading || !!resource.error}>{registered ? 'Thử đăng xuất lại' : 'Xác nhận đăng ký'}</Button>
  </>}>
    <div className="space-y-4">
      <RequestStatus {...resource} retry={resource.reload} />
      {c && !resource.loading && !resource.error && <><h3 className="font-semibold">{c.course_code} · {c.course_name}</h3><p className="text-sm">Lớp {c.class_code} · {c.credits} tín chỉ · {c.lecturer_name}</p><Capacity c={c} /><ScheduleList schedules={c.schedules} />
        {!c.registration_open && <Alert tone="warning">Học kỳ hiện không mở đăng ký. Máy chủ sẽ kiểm tra và trả lý do từ chối.</Alert>}
      </>}
      {registered ? <Alert tone="success" title="Lớp đã đăng ký thành công">Mã đăng ký: {registered.id}. Đang hoàn tất đăng xuất phiên hiện tại; thử đăng xuất lại sẽ không gửi thêm yêu cầu đăng ký.</Alert> : <Alert>Đăng ký một lớp mỗi lần. Máy chủ kiểm tra sĩ số, thời gian, tiên quyết, trùng lịch và giới hạn tín chỉ. Sau thành công, frontend tự đăng xuất và chờ 20 phút trên trình duyệt này.</Alert>}
      {error ? <ErrorNotice error={error} /> : null}
    </div>
  </Modal>
}

export function useCancelFlow(onCancelled: () => void) {
  const [registration, setRegistration] = useState<RegisteredClass | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<unknown>(null)
  const close = () => { if (!busy) { setRegistration(null); setError(null) } }
  const submit = async () => {
    if (!registration || inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null)
    try { await api.cancelRegistration(registration.id); toast(`Đã hủy đăng ký ${registration.class_code}.`); setRegistration(null); onCancelled() }
    catch (cause) { setError(cause) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return {
    start: (value: RegisteredClass) => { setRegistration(value); setError(null) },
    modal: registration && <Modal open title="Hủy đăng ký học phần" onClose={close} closable={!busy} footer={<><Button variant="secondary" onClick={close} disabled={busy}>Quay lại</Button><Button variant="danger" onClick={submit} loading={busy}>Xác nhận hủy đăng ký</Button></>}>
      <div className="space-y-4"><p><b>{registration.course_name}</b> · {registration.class_code}</p><p className="text-sm text-muted">Hủy mã đăng ký {registration.id}. Máy chủ kiểm tra quyền sở hữu, trạng thái và thời gian đăng ký, sau đó cập nhật sĩ số.</p>{error ? <ErrorNotice error={error} /> : null}</div>
    </Modal>,
  }
}

export function StudentProfileEditor({ studentId, onSaved }: { studentId: number; onSaved?: () => void }) {
  const resource = useRequest(useCallback((signal) => api.getStudent(studentId, signal), [studentId]))
  const [form, setForm] = useState({ full_name: '', faculty: '', major: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    if (resource.data) { const s = resource.data; setForm({ full_name: s.full_name, faculty: s.faculty ?? '', major: s.major ?? '' }); setError(null) }
  }, [resource.data])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!form.full_name.trim()) { setError(new ApiError('Họ và tên là bắt buộc.', 'VALIDATION_ERROR')); return }
    setBusy(true); setError(null)
    try {
      await api.updateStudent(studentId, { full_name: form.full_name.trim(), faculty: form.faculty.trim() || null, major: form.major.trim() || null })
      toast('Đã cập nhật hồ sơ sinh viên.'); resource.reload(); onSaved?.()
    } catch (cause) { setError(cause) }
    finally { setBusy(false) }
  }
  const s = resource.data
  return <Card title="Thông tin sinh viên">
    <RequestStatus {...resource} retry={resource.reload} />
    {s && !resource.loading && !resource.error && <form onSubmit={submit} className="space-y-5 p-5">
      <dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-muted">ID tài khoản</dt><dd>{s.id}</dd></div><div><dt className="text-muted">Tên đăng nhập</dt><dd>{s.username}</dd></div><div><dt className="text-muted">Mã sinh viên</dt><dd>{s.student_code ?? '—'}</dd></div></dl>
      <Field id="profile-full-name" label="Họ và tên" required><Input id="profile-full-name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field id="profile-faculty" label="Khoa"><Input id="profile-faculty" value={form.faculty} onChange={(e) => setForm({ ...form, faculty: e.target.value })} /></Field><Field id="profile-major" label="Ngành"><Input id="profile-major" value={form.major} onChange={(e) => setForm({ ...form, major: e.target.value })} /></Field></div>
      {error ? <ErrorNotice error={error} /> : null}
      <div className="flex justify-end"><Button type="submit" loading={busy}>Lưu hồ sơ</Button></div>
    </form>}
  </Card>
}
