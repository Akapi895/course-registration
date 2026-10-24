import { useRef, useState } from 'react'
import * as api from '../api'
import type { RegisteredClass } from '../api/types'
import { Alert, Button, Modal, toast } from './ui'

/** Cancel dialog for one registration; `credits` is the student's current total, shown as `x → y`. */
export function useCancelFlow(onCancelled: () => void, credits: number) {
  const [registration, setRegistration] = useState<RegisteredClass | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState('')
  const close = () => { if (!busy) { setRegistration(null); setError('') } }
  const submit = async () => {
    if (!registration || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try { await api.cancelRegistration(registration.id); toast(`Đã hủy đăng ký ${registration.course_name}.`); setRegistration(null); onCancelled() }
    catch (cause) { setError((cause as Error).message) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const r = registration
  return {
    start: (value: RegisteredClass) => { setRegistration(value); setError('') },
    modal: r && (
      <Modal open onClose={close} closable={!busy} title="Hủy đăng ký học phần"
        footer={error ? <Button variant="secondary" onClick={close}>Đóng</Button> : <>
          <Button variant="secondary" onClick={close} disabled={busy}>Quay lại</Button>
          <Button variant="danger" loading={busy} onClick={submit}>Hủy đăng ký</Button>
        </>}>
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-3 text-sm">
            <p className="font-semibold">{r.course_code} · {r.course_name} <span className="font-normal text-muted">· {r.credits} tín chỉ</span></p>
            <p className="mt-1 text-muted">Lớp {r.class_code}</p>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 text-sm">
            <span className="text-muted">Tổng tín chỉ dự kiến sau hủy</span>
            <span className="text-lg font-semibold tabular-nums">{credits} → {credits - r.credits}</span>
          </div>
          {error && <Alert tone="error" title="Hủy đăng ký bị từ chối">{error}</Alert>}
        </div>
      </Modal>
    ),
  }
}
