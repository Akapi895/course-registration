export type Role = 'student' | 'admin'
export interface CurrentUser {
  id: number
  username: string
  role: Role
  full_name: string
  student_code: string | null
}
export interface StudentProfile {
  id: number
  full_name: string
  student_code: string | null
  faculty: string | null
  major: string | null
}
export interface Student extends StudentProfile { username: string }
export type StudentInput = Pick<StudentProfile, 'full_name' | 'faculty' | 'major'>
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
  credits: number
  enrolled: number
  max_capacity: number
  registration_open: boolean
}
export interface ClassDetail extends ClassSummary {
  course_id: number
  semester_id: number
  lecturer_name: string
  status: 'active' | 'cancelled'
  schedules: ClassSchedule[]
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
