import { useCallback, useState } from 'react'
import { CheckCircle2, Pencil, Trash2, XCircle } from 'lucide-react'
import * as api from '../api'
import { ApiError } from '../api/client'
import type { ClassDetail } from '../api/types'
import { useRequest } from '../hooks/useRequest'
import { ScheduleTable } from './Schedule'
import { Badge, Button, Capacity, Card, Empty, Modal, RequestStatus } from './ui'

/** Admin extras: the popup then offers edit and cancel buttons and skips the student-only registration lookup. */
export interface ClassAdminActions { onEdit: (c: ClassDetail) => void; onCancel: (c: ClassDetail) => void }

/** Popup with the details of one class: info, seats, schedule and prerequisites. */
export function ClassDetailModal({ classId, onClose, admin }: { classId: number; onClose: () => void; admin?: ClassAdminActions }) {
  const resource = useRequest(useCallback(async (signal: AbortSignal) => {
    // Listing registrations is a student-only endpoint, so admins only load the class.
    if (admin) return { c: await api.getClass(classId, signal), registered: undefined }
    const [c, regs] = await Promise.all([api.getClass(classId, signal), api.listRegistrations(signal)])
    return { c, registered: regs.registrations.some((r) => r.class_id === c.id && r.status === 'registered') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, !!admin]))
  const notFound = resource.error instanceof ApiError && resource.error.status === 404
  const c = resource.data?.c
  const registered = resource.data?.registered
  const cancelled = c?.status === 'cancelled'
  const footer = <>
    {admin && c && <Button variant="secondary" className="text-red-600" disabled={cancelled} onClick={() => admin.onCancel(c)}><Trash2 className="h-4 w-4" />Hủy lớp</Button>}
    {admin && c && <Button variant="secondary" disabled={cancelled} onClick={() => admin.onEdit(c)}><Pencil className="h-4 w-4" />Chỉnh sửa</Button>}
    <Button variant={admin ? 'primary' : 'secondary'} onClick={onClose}>Đóng</Button>
  </>
  return (
    <Modal open size="xl" onClose={onClose} title={c ? `${c.course_name} · ${c.class_code}` : 'Chi tiết lớp học phần'} footer={footer}>
      {notFound ? <Empty title="Không tìm thấy lớp học phần" /> : <RequestStatus {...resource} retry={resource.reload} />}
      {c && !resource.loading && !resource.error && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-5">
            <Card title="Thông tin lớp" action={cancelled && <Badge tone="red">Lớp đã hủy</Badge>}>
              <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-3">
                {([['Tên học phần', c.course_name, true], ['Mã học phần', c.course_code], ['Lớp học phần', c.class_code], ['Số tín chỉ', c.credits], ['Học kỳ', c.semester_name], ['Khoa', c.faculty], ['Ngành', c.major ?? 'Toàn trường'], ['Giảng viên', c.lecturer_name]] as const).map(([k, v, wide]) => (
                  <div key={k} className={wide ? 'sm:col-span-2' : undefined}><dt className="text-muted">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
                ))}
              </dl>
            </Card>
            <Card title={`Lịch học (${c.schedules.length} buổi/tuần)`}><ScheduleTable schedules={c.schedules} /></Card>
          </div>
          <div className="space-y-5">
            <Card title="Sĩ số">
              <div className="grid grid-cols-3 divide-x divide-line text-center">
                {([['Hiện tại', c.enrolled], ['Sức chứa', c.max_capacity], ['Còn lại', Math.max(0, c.max_capacity - c.enrolled)]] as const).map(([k, v]) => <div key={k} className="p-4"><p className="text-2xl font-semibold tabular-nums">{v}</p><p className="text-xs text-muted">{k}</p></div>)}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3"><Capacity c={c} />{registered === undefined ? (c.enrolled >= c.max_capacity ? <Badge>Hết chỗ</Badge> : null) : registered ? <Badge tone="green">Đã đăng ký</Badge> : c.enrolled >= c.max_capacity ? <Badge>Hết chỗ</Badge> : <Badge>Chưa đăng ký</Badge>}</div>
            </Card>
            <Card title="Học phần tiên quyết">
              {c.prerequisites.length === 0 ? <p className="p-5 text-sm text-muted">Không yêu cầu học phần tiên quyết.</p> : (
                <ul className="divide-y divide-line">
                  {c.prerequisites.map((p) => (
                    <li key={p.course_id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <span className="min-w-0"><b>{p.course_code}</b> · {p.course_name}</span>
                      {p.passed === undefined ? null : p.passed ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" />Đã đạt</Badge> : <Badge tone="red"><XCircle className="h-3 w-3" />Chưa đạt</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** `show(id)` opens the popup; render `modal` once in the page. */
export function useClassDetail() {
  const [classId, setClassId] = useState<number | null>(null)
  return { show: (id: number) => setClassId(id), modal: classId !== null && <ClassDetailModal classId={classId} onClose={() => setClassId(null)} /> }
}
