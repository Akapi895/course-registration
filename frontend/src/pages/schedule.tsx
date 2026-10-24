import { useState } from 'react'
import { ArrowRight, CalendarDays, List } from 'lucide-react'
import Layout from '../components/Layout'
import * as api from '../api'
import { DAYS } from '../api/types'
import { useRequest } from '../hooks/useRequest'
import { navigate } from '../router'
import { useClassDetail } from '../components/ClassDetailModal'
import { Button, Card, Empty, PageHeader, PillToggle, RequestStatus, cx } from '../components/ui'

const palette = ['bg-blue-50 border-blue-400 text-blue-950', 'bg-emerald-50 border-emerald-400 text-emerald-950', 'bg-amber-50 border-amber-400 text-amber-950', 'bg-violet-50 border-violet-400 text-violet-950', 'bg-rose-50 border-rose-400 text-rose-950', 'bg-cyan-50 border-cyan-400 text-cyan-950', 'bg-lime-50 border-lime-400 text-lime-950']
const WEEK = [2, 3, 4, 5, 6, 7]

export function StudentSchedule() {
  const resource = useRequest(api.getSchedules)
  const detail = useClassDetail()
  const [view, setView] = useState<'grid' | 'list'>(() => (window.innerWidth < 768 ? 'list' : 'grid'))
  const items = resource.data?.schedules ?? []
  // Same colour for every session of a course.
  const color = new Map<string, string>()
  for (const x of items) if (!color.has(x.course_code)) color.set(x.course_code, palette[color.size % palette.length])
  const periods = Array.from({ length: Math.max(12, ...items.map((x) => x.end_period)) }, (_, i) => i + 1)
  const label = (x: (typeof items)[number]) => `${x.course_name}, lớp ${x.class_code}, ${DAYS[x.day_of_week]}, tiết ${x.start_period}–${x.end_period}, phòng ${x.room}`
  return (
    <Layout title="Thời khóa biểu">
      <PageHeader title="Thời khóa biểu" desc="Lịch lặp theo tuần, chỉ gồm các học phần đăng ký thành công"
        actions={<PillToggle label="Chế độ xem" value={view} onChange={setView} options={[{ value: 'grid', label: <><CalendarDays className="h-4 w-4" />Lịch tuần</> }, { value: 'list', label: <><List className="h-4 w-4" />Danh sách</> }] as const} />} />
      <RequestStatus {...resource} retry={resource.reload} />
      {!resource.loading && !resource.error && (items.length === 0 ? <Card><Empty title="Chưa có lịch học" text="Thời khóa biểu sẽ hiển thị sau khi bạn đăng ký học phần thành công." action={<Button onClick={() => navigate('/student/classes')}>Tìm lớp học phần</Button>} icon={<CalendarDays className="h-6 w-6" />} /></Card> : view === 'grid' ? (
        <Card className="overflow-x-auto">
          <div className="grid min-w-[860px]" style={{ gridTemplateColumns: '72px repeat(6, minmax(120px, 1fr))', gridTemplateRows: `44px repeat(${periods.length}, 56px)` }}>
            <div className="border-b border-r border-line bg-slate-50" style={{ gridColumn: 1, gridRow: 1 }} />
            {WEEK.map((d, i) => <div key={d} className="grid place-items-center border-b border-line bg-slate-50 text-sm font-semibold" style={{ gridColumn: i + 2, gridRow: 1 }}>{DAYS[d]}</div>)}
            {periods.map((p) => <div key={p} className="flex items-center justify-center border-b border-r border-line text-xs font-medium text-muted" style={{ gridColumn: 1, gridRow: p + 1 }}>Tiết {p}</div>)}
            {periods.map((p) => WEEK.map((d, i) => <div key={p + '-' + d} className="border-b border-r border-line/60" style={{ gridColumn: i + 2, gridRow: p + 1 }} />))}
            {items.map((x, k) => (
              <button key={k} onClick={() => detail.show(x.class_id)} className={cx('z-10 m-1 overflow-hidden rounded-lg border border-l-4 p-2 text-left text-xs transition hover:shadow-md', color.get(x.course_code))} style={{ gridColumn: x.day_of_week, gridRow: `${x.start_period + 1} / ${x.end_period + 2}` }} aria-label={label(x)}>
                <p className="font-semibold leading-snug">{x.course_name}</p>
                <p className="mt-0.5">{x.class_code} · Tiết {x.start_period}–{x.end_period}</p>
                <p className="mt-0.5 opacity-80">{x.room}</p>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {WEEK.map((d) => {
            const list = items.filter((x) => x.day_of_week === d).sort((a, b) => a.start_period - b.start_period)
            if (!list.length) return null
            return (
              <Card key={d} title={DAYS[d]}>
                <ul className="divide-y divide-line">
                  {list.map((x, k) => (
                    <li key={k}><button onClick={() => detail.show(x.class_id)} className="flex min-h-11 w-full items-center gap-4 px-5 py-3 text-left hover:bg-slate-50" aria-label={label(x)}>
                      <span className={cx('w-20 shrink-0 rounded-lg border px-2 py-1 text-center text-xs font-semibold', color.get(x.course_code))}>Tiết {x.start_period}–{x.end_period}</span>
                      <span className="min-w-0 flex-1"><span className="block font-medium">{x.course_name}</span><span className="block text-[13px] text-muted">{x.class_code} · {x.room}</span></span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
                    </button></li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      ))}
      <p className="mt-4 text-[13px] text-muted">Thời khóa biểu hiển thị theo tiết, không bao gồm lịch thi, lịch học bù hoặc lịch nghỉ.</p>
      {detail.modal}
    </Layout>
  )
}
