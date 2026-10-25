import { CalendarRange } from 'lucide-react'
import type { Semester } from '../api/types'
import { Badge, cx, fmtDT } from './ui'

/**
 * Registration-period banner. Pass the current `semester` for the full banner (name, window, status);
 * without it, only `title`, `open` and optional dates are shown.
 */
export function PeriodBanner({ semester, title = 'Thời gian đăng ký học phần', open = false, opensAt, closesAt }: { semester?: Semester | null; title?: string; open?: boolean; opensAt?: string; closesAt?: string }) {
  const isOpen = semester ? semester.registration_open : open
  const from = semester?.registration_opens_at ?? opensAt
  const to = semester?.registration_closes_at ?? closesAt
  const upcoming = !!semester && !isOpen && Date.now() < +new Date(semester.registration_opens_at)
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border px-5 py-4', isOpen ? 'border-blue-200 bg-primary-soft' : 'border-line bg-white')}>
      <div className="flex items-center gap-3">
        <CalendarRange className="h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {from && to && <p className="text-[13px] text-muted">Từ {fmtDT(from)} đến {fmtDT(to)}</p>}
        </div>
      </div>
      {isOpen ? (
        <Badge tone="green"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />Đang diễn ra</Badge>
      ) : upcoming ? (
        <Badge tone="orange">Sắp diễn ra</Badge>
      ) : (
        <Badge>{semester ? 'Đã kết thúc' : 'Không mở'}</Badge>
      )}
    </div>
  )
}
