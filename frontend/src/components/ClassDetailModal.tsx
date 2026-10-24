import { useCallback, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import * as api from '../api'
import { ApiError } from '../api/client'
import { useRequest } from '../hooks/useRequest'
import { ScheduleTable } from './Schedule'
import { Badge, Button, Capacity, Card, Empty, Modal, RequestStatus } from './ui'

/** Popup with the details of one class: info, seats, schedule and prerequisites. */
export function ClassDetailModal({ classId, onClose }: { classId: number; onClose: () => void }) {
  const resource = useRequest(useCallback(async (signal: AbortSignal) => {
    const [c, regs] = await Promise.all([api.getClass(classId, signal), api.listRegistrations(signal)])
    return { c, registered: regs.registrations.some((r) => r.class_id === c.id && r.status === 'registered') }
  }, [classId]))
  const notFound = resource.error instanceof ApiError && resource.error.status === 404
  const c = resource.data?.c
  const registered = resource.data?.registered
  return (
    <Modal open size="xl" onClose={onClose} title={c ? `${c.course_name} · ${c.class_code}` : 'Chi tiết lớp học phần'} footer={<Button variant="secondary" onClick={onClose}>Đóng</Button>}>
      {notFound ? <Empty title="Không tìm thấy lớp học phần" /> : <RequestStatus {...resource} retry={resource.reload} />}
      {c && !resource.loading && !resource.error && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-5">
            <Card title="Thông tin lớp" action={c.status === 'cancelled' && <Badge tone="red">Lớp đã hủy</Badge>}>
              <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-3">
                {([['Tên học phần', c.course_name, true], ['Mã học phần', c.course_code], ['Lớp học phần', c.class_code], ['Số tín chỉ', c.credits], ['Học kỳ', c.semester_name], ['Khoa', c.faculty, true], ['Giảng viên', c.lecturer_name]] as const).map(([k, v, wide]) => (
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
              <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3"><Capacity c={c} />{registered ? <Badge tone="green">Đã đăng ký</Badge> : c.enrolled >= c.max_capacity ? <Badge>Hết chỗ</Badge> : <Badge>Chưa đăng ký</Badge>}</div>
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
