import { CalendarRange } from 'lucide-react'
import type { Semester } from '../api/types'
import { Badge, cx, fmtDT } from './ui'

/**
 * Registration-period banner. Pass the current `semester` for the full banner (name, window, status);
 * without it, only `title`, `open` and optional dates are shown.
 */
export function PeriodBanner({ semester, title = 'Đợt đăng ký', open = false, opensAt, closesAt }: { semester?: Semester | null; title?: string; open?: boolean; opensAt?: string; closesAt?: string }) {
  const isOpen = semester ? semester.registration_open : open
  const from = semester?.registration_opens_at ?? opensAt
  const to = semester?.registration_closes_at ?? closesAt
  const upcoming = !!semester && !isOpen && Date.now() < +new Date(semester.registration_opens_at)
  return (
    <div className={cx('flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-5 py-4', isOpen ? 'border-blue-200 bg-primary-soft' : 'border-line bg-white')}>
      <div className="flex items-center gap-3">
        <CalendarRange className="h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold">{semester ? `Đợt đăng ký · ${semester.name}` : title}</p>
          {from && to && <p className="text-[13px] text-muted">Mở {fmtDT(from)} – Đóng {fmtDT(to)} (giờ Việt Nam)</p>}
        </div>
      </div>
      {isOpen ? <Badge tone="green">Đang mở</Badge> : upcoming ? <Badge tone="orange">Chưa mở</Badge> : <Badge>{semester ? 'Đã đóng' : 'Không mở'}</Badge>}
    </div>
  )
}
