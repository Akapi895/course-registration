import { DAYS, type ClassSchedule } from '../api/types'
import { Table, Td } from './ui'

export function ScheduleList({ schedules }: { schedules: ClassSchedule[] }) {
  return <ul className="space-y-1 text-sm">{schedules.map((s, i) => <li key={i}>{DAYS[s.day_of_week]} · Tiết {s.start_period}–{s.end_period} · {s.room}</li>)}</ul>
}
export function ScheduleTable({ schedules }: { schedules: ClassSchedule[] }) {
  return <Table head={['Thứ', 'Tiết bắt đầu', 'Tiết kết thúc', 'Phòng']} minWidth={450}>{schedules.map((s, i) => <tr key={i}><Td>{DAYS[s.day_of_week]}</Td><Td>{s.start_period}</Td><Td>{s.end_period}</Td><Td>{s.room}</Td></tr>)}</Table>
}
