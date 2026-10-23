import { useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { cancelCheck, cancelRegistration, checkRegistration, cls, course, credits, db, practice, semester, sessionText, useDb } from './api'
import { Alert, Badge, Button, Modal, toast } from './ui'

/** Lists every component of a course bundle: theory class and practice group. */
export function BundleSummary({ classId, practiceId }: { classId: string; practiceId?: string }) {
  const c = cls(classId)!
  const co = course(c.courseId)
  const g = practice(practiceId)
  const part = (kind: 'LT' | 'TH', code: string, sessions: typeof c.sessions, seats: string, lecturer?: string) => (
    <div className="rounded-xl border border-line p-3 text-sm">
      <div className="flex items-center gap-2"><Badge tone={kind === 'LT' ? 'blue' : 'green'}>{kind}</Badge><b>{kind === 'LT' ? 'Lý thuyết' : 'Thực hành'} {code}</b>{seats && <span className="ml-auto text-xs text-muted">Sĩ số {seats}</span>}</div>
      {lecturer && <p className="mt-1 text-muted">{lecturer}</p>}
      <ul className="mt-1 space-y-0.5">{sessions.map((s, i) => <li key={i}>{sessionText(s)} · <span className="text-muted">{s.room}</span></li>)}</ul>
      {kind === 'TH' && sessions.length > 1 && <p className="mt-1 text-xs font-medium text-primary">Học đủ {sessions.length} buổi</p>}
    </div>
  )
  return (
    <div className="space-y-2">
      <p className="font-semibold">{co.code} · {co.name} <span className="font-normal text-muted">· {co.credits} tín chỉ</span></p>
      {part('LT', c.code, c.sessions, c.practice.length ? '' : `${c.enrolled}/${c.capacity}`, c.lecturer)}
      {g && part('TH', g.code, g.sessions, `${g.enrolled}/${g.capacity}`, g.lecturer)}
    </div>
  )
}

export function useCancelFlow() {
  useDb()
  const [regId, setRegId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const close = () => { if (!busy) { setRegId(null); setErr('') } }
  let modal = null
  const reg = regId ? db.registrations.find((r) => r.id === regId) : undefined
  if (reg) {
    const c = cls(reg.classId)!
    const co = course(c.courseId)
    const sem = semester(c.semesterId)
    const cur = credits(reg.studentId, sem.id)
    const pre = cancelCheck(reg.id)
    modal = (
      <Modal open onClose={close} closable={!busy} title="Hủy đăng ký học phần"
        footer={err ? <Button variant="secondary" onClick={close}>Đóng</Button> : <>
          <Button variant="secondary" onClick={close} disabled={busy}>Quay lại</Button>
          <Button variant="danger" loading={busy} onClick={async () => {
            setBusy(true); setErr('')
            try { await cancelRegistration(reg.id); toast(`Đã hủy đăng ký ${co.name}.`); setBusy(false); setRegId(null) }
            catch (e) { setErr((e as Error).message); setBusy(false) }
          }}>Hủy cả học phần</Button>
        </>}>
        <div className="space-y-4">
          <BundleSummary classId={c.id} practiceId={reg.practiceId} />
          {reg.practiceId && <p className="text-[13px] text-muted">Thao tác hủy áp dụng cho cả lớp lý thuyết và nhóm thực hành.</p>}
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 text-sm">
            <span className="text-muted">Tổng tín chỉ dự kiến sau hủy</span>
            <span className="text-lg font-semibold tabular-nums">{cur} → {cur - co.credits}</span>
          </div>
          {err ? <Alert tone="error" title="Hủy đăng ký bị từ chối">{err}</Alert> : pre ? <Alert tone="warning" title="Yêu cầu có thể bị từ chối">{pre}</Alert> : null}
        </div>
      </Modal>
    )
  }
  return { start: (id: string) => { setErr(''); setRegId(id) }, modal }
}

export function CheckList({ studentId, classId }: { studentId: string; classId: string }) {
  return (
    <ul className="divide-y divide-line">
      {checkRegistration(studentId, classId).filter((c) => c.key !== 'practice').map((c) => (
        <li key={c.key} className="flex gap-3 px-5 py-3 text-sm">
          {c.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-label="Đạt" /> : c.key === 'credit' || c.key === 'schedule' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-label="Cảnh báo" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-label="Không đạt" />}
          <div><p className="font-medium">{c.label}</p><p className="text-muted">{c.message}</p></div>
        </li>
      ))}
    </ul>
  )
}
