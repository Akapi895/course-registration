import { useCallback, useEffect, useState, type FormEvent } from 'react'
import * as api from '../api'
import { ApiError } from '../api/client'
import { useRequest } from '../hooks/useRequest'
import { Button, Card, ErrorNotice, Field, Input, RequestStatus, toast } from './ui'

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
