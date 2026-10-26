export type Role = 'student' | 'admin'
export interface CurrentUser {
  id: number
  username: string
  role: Role
  full_name: string
  student_code: string | null
  faculty: string | null
  major: string | null
}
export interface ClassSchedule {
  day_of_week: number
  start_period: number
  end_period: number
  room: string
}
export interface ClassSummary {
  id: number
  class_code: string
  course_code: string
  course_name: string
  lecturer_name: string
  credits: number
  enrolled: number
  max_capacity: number
}
/** Current semester returned with the class list. */
export interface Semester {
  id: number
  name: string
  max_credits: number
  registration_opens_at: string
  registration_closes_at: string
  registration_open: boolean
}
export interface ClassList {
  semester: Semester | null
  classes: ClassSummary[]
}
/** `passed` is present only when a student asks, and tells whether that student passed the course. */
export interface Prerequisite {
  course_id: number
  course_code: string
  course_name: string
  passed?: boolean
}
export interface ClassDetail extends ClassSummary {
  course_id: number
  faculty: string
  major: string | null
  semester_id: number
  semester_name: string
  status: 'active' | 'cancelled'
  schedules: ClassSchedule[]
  prerequisites: Prerequisite[]
}
export interface ClassUpdate {
  class_code: string
  lecturer_name: string
  max_capacity: number
  schedules: ClassSchedule[]
}
export interface ClassCreate extends ClassUpdate { course_id: number; semester_id: number }
export interface Registration {
  id: number
  class_id: number
  status: 'registered' | 'cancelled'
  registered_at: string
}
/** Outcome of one class in a POST /api/registrations request. */
export type RegisterResult =
  | { class_id: number; status: 'registered'; id: number; registered_at: string }
  | { class_id: number; status: 'failed'; code: string; message: string }
export interface RegisterBatch {
  registered_count: number
  failed_count: number
  results: RegisterResult[]
}
export interface RegisteredClass extends Registration {
  class_code: string
  course_code: string
  course_name: string
  credits: number
}
export interface TimetableEntry extends ClassSchedule {
  class_id: number
  class_code: string
  course_code: string
  course_name: string
}
export interface RegistrationPeriod {
  semester_id: number
  registration_opens_at: string
  registration_closes_at: string
}
export const DAYS: Record<number, string> = { 2: 'Thứ Hai', 3: 'Thứ Ba', 4: 'Thứ Tư', 5: 'Thứ Năm', 6: 'Thứ Sáu', 7: 'Thứ Bảy' }
