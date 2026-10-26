import { MapPin } from 'lucide-react'
import { DAYS, type ClassSchedule } from '../api/types'
import { Table, Td } from './ui'

/** Compact one-line-per-session list: `Thứ Hai, T1–3 · phòng`. */
export function SessionList({ sessions }: { sessions: ClassSchedule[] }) {
  return <div className="space-y-0.5">{sessions.map((s, i) => <div key={i} className="whitespace-nowrap">{DAYS[s.day_of_week]}, T{s.start_period}–{s.end_period} <span className="text-muted">· {s.room}</span></div>)}</div>
}
export function ScheduleList({ schedules }: { schedules: ClassSchedule[] }) {
  return <ul className="space-y-1 text-sm">{schedules.map((s, i) => <li key={i}>{DAYS[s.day_of_week]} · Tiết {s.start_period}–{s.end_period} · {s.room}</li>)}</ul>
}
export function ScheduleTable({ schedules }: { schedules: ClassSchedule[] }) {
  return <Table head={[{ label: 'Thứ', className: 'w-24' }, { label: 'Tiết', className: 'w-28' }, { label: 'Phòng', className: 'w-auto' }]} minWidth={360}>{schedules.map((s, i) => <tr key={i}><Td className="font-medium">{DAYS[s.day_of_week]}</Td><Td>Tiết {s.start_period}–{s.end_period}</Td><Td><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted" />{s.room}</span></Td></tr>)}</Table>
}
