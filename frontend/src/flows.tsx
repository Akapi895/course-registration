import { useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { type ApiError, bundleLabel, cancelCheck, cancelRegistration, checkRegistration, cls, course, credits, db, practice, register, semester, sessionText, useDb } from './api'
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

/** Confirmation flow for registering one course bundle. Nothing is held or queued. */
export function useRegisterFlow(studentId: string) {
  useDb()
  const [sel, setSel] = useState<{ classId: string; practiceId?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string; code?: string } | null>(null)
  const close = () => { if (!busy) { setSel(null); setResult(null) } }
  const submit = async () => {
    if (busy || !sel) return
    setBusy(true); setResult(null)
    try {
      await register(studentId, sel.classId, sel.practiceId)
      setResult({ ok: true, msg: '' })
      toast(`Đã đăng ký ${course(cls(sel.classId)!.courseId).name}.`)
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message, code: (e as ApiError).code })
    } finally { setBusy(false) }
  }
  let modal = null
  if (sel) {
    const c = cls(sel.classId)!
    const co = course(c.courseId)
    const sem = semester(c.semesterId)
    const cur = credits(studentId, sem.id)
    const warn = checkRegistration(studentId, sel.classId, sel.practiceId).filter((x) => !x.ok)
    const retry = result && !result.ok && result.code === 'NETWORK'
    modal = (
      <Modal open onClose={close} closable={!busy}
        title={result?.ok ? 'Đăng ký thành công' : result ? 'Đăng ký không thành công' : 'Xác nhận đăng ký học phần'}
        footer={result && !retry ? <Button variant={result.ok ? 'primary' : 'secondary'} onClick={close}>Đóng</Button> : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>Quay lại</Button>
            <Button onClick={submit} loading={busy}>{busy ? 'Đang xử lý…' : retry ? 'Thử lại' : 'Xác nhận đăng ký'}</Button>
          </>
        )}>
        <div className="space-y-4">
          <BundleSummary classId={sel.classId} practiceId={sel.practiceId} />
          {result?.ok ? (
            <Alert tone="success" title="Đã ghi nhận cả bộ đăng ký">{bundleLabel(sel.classId, sel.practiceId)}. Tổng tín chỉ hiện tại: {cur}/{sem.maxCredits}.</Alert>
          ) : result ? (
            <Alert tone="error" title="Hệ thống từ chối đăng ký">{result.msg}{(result.code === 'seat' || result.code === 'practice') && ' Sĩ số đã được cập nhật lại.'}{!retry && ' Không thành phần nào được ghi nhận.'}</Alert>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 text-sm">
                <span className="text-muted">Tín chỉ tính một lần theo học phần · dự kiến sau đăng ký</span>
                <span className="whitespace-nowrap text-lg font-semibold tabular-nums">{cur} → {cur + co.credits}<span className="text-sm font-normal text-muted"> / {sem.maxCredits}</span></span>
              </div>
              {warn.length > 0 ? (
                <Alert tone="warning" title="Kiểm tra trước phát hiện vấn đề (tham khảo)">
                  <ul className="list-disc pl-4">{warn.map((w) => <li key={w.key}>{w.message}</li>)}</ul>
                </Alert>
              ) : <p className="text-[13px] text-muted">Lớp lý thuyết và nhóm thực hành được đăng ký cùng lúc: chỉ thành công khi mọi thành phần hợp lệ và còn chỗ.</p>}
            </>
          )}
        </div>
      </Modal>
    )
  }
  return { start: (classId: string, practiceId?: string) => { setResult(null); setSel({ classId, practiceId }) }, modal }
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
