import { useCallback, useRef, useState } from 'react'
import * as api from '../api'
import type { RegisteredClass, Registration } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { useRequest } from '../hooks/useRequest'
import { ScheduleList } from './Schedule'
import { Alert, Button, Capacity, Card, ErrorNotice, Modal, RequestStatus, toast } from './ui'

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
