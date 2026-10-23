// Mock data & types. All values are demo samples and may change.
export type Role = 'student' | 'admin'
export interface Account { username: string; password: string; role: Role; studentId?: string; name: string }
export interface Student { id: string; code: string; name: string; username?: string; faculty: string; major: string }
export interface Semester { id: string; name: string; openAt: string; closeAt: string; maxCredits: number }
export interface Course { id: string; code: string; name: string; credits: number; faculty: string; majors: string[]; prereqs: string[] }
export interface Session { day: number; start: number; end: number; room: string }
/** Practice group (nhóm thực hành) linked to one theory class. */
export interface PracticeGroup { id: string; code: string; lecturer: string; capacity: number; enrolled: number; sessions: Session[]; demo?: 'race' }
/** Theory class (lớp lý thuyết). `practice` lists the groups allowed to pair with it. */
export interface ClassSection {
  id: string; courseId: string; semesterId: string; code: string; lecturer: string; capacity: number; enrolled: number; sessions: Session[]
  practice: PracticeGroup[]
  demo?: 'race' | 'network'
}
/** One registration = one course bundle (theory class + optional practice group). */
/** One registration window (đợt đăng ký) of a semester, with its edit history. */
export interface RegPeriod {
  id: string; semesterId: string; name: string; openAt: string; closeAt: string; createdAt: string; updatedAt: string
  revisions: { at: string; openAt: string; closeAt: string }[]
}
export interface Registration { id: string; studentId: string; classId: string; practiceId?: string; createdAt: string }
export interface CourseResult { studentId: string; courseId: string; passed: boolean }

// Demo policy – configurable, not confirmed by the SRS.
export const policy = {
  /** Allow deleting a class that already has registrations (demo: blocked). */
  allowDeleteClassWithRegistrations: false,
  /** Lock course, semester and schedule of a class that has registrations (demo: locked). */
  lockScheduleWhenRegistered: true,
}
/** Student profile fields an admin may edit (pending the official PUT /api/students/{id} contract). */
export const STUDENT_EDITABLE_FIELDS = ['name'] as const

// day index: 2..8 (8 = Chủ nhật)
export const DAYS = ['', '', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']

export const SHARED = 'Khối kiến thức chung'
export const FACULTIES: Record<string, string[]> = {
  'Khoa Công nghệ thông tin': ['Khoa học máy tính', 'Công nghệ thông tin', 'Hệ thống thông tin'],
  'Khoa Điện tử – Viễn thông': ['Kỹ thuật điện tử viễn thông', 'Kỹ thuật máy tính'],
  'Khoa Cơ học kỹ thuật và Tự động hóa': ['Kỹ thuật robot', 'Cơ kỹ thuật'],
}

const day = 86400000
const iso = (offset: number) => new Date(Math.floor((Date.now() + offset) / 3600000) * 3600000).toISOString()

export function seed() {
  const semesters: Semester[] = [
    { id: 'hk1-2526', name: 'Học kỳ 1 năm học 2025–2026', openAt: iso(-3 * day), closeAt: iso(9 * day), maxCredits: 26 },
    { id: 'hk2-2425', name: 'Học kỳ 2 năm học 2024–2025', openAt: iso(-200 * day), closeAt: iso(-186 * day), maxCredits: 26 },
  ]
  const IT = 'Khoa Công nghệ thông tin'
  const EE = 'Khoa Điện tử – Viễn thông'
  const courses: Course[] = [
    { id: 'INT1001', code: 'INT1001', name: 'Nhập môn lập trình', credits: 3, faculty: IT, majors: [], prereqs: [] },
    { id: 'INT2210', code: 'INT2210', name: 'Cấu trúc dữ liệu và giải thuật', credits: 3, faculty: IT, majors: ['Khoa học máy tính', 'Công nghệ thông tin'], prereqs: ['INT1001'] },
    { id: 'INT2211', code: 'INT2211', name: 'Cơ sở dữ liệu', credits: 3, faculty: IT, majors: ['Khoa học máy tính', 'Công nghệ thông tin', 'Hệ thống thông tin'], prereqs: [] },
    { id: 'INT2204', code: 'INT2204', name: 'Lập trình hướng đối tượng', credits: 3, faculty: IT, majors: ['Khoa học máy tính', 'Công nghệ thông tin'], prereqs: ['INT1001'] },
    { id: 'INT2212', code: 'INT2212', name: 'Kiến trúc máy tính', credits: 3, faculty: IT, majors: ['Khoa học máy tính', 'Kỹ thuật máy tính'], prereqs: [] },
    { id: 'INT2208', code: 'INT2208', name: 'Công nghệ phần mềm', credits: 3, faculty: IT, majors: ['Công nghệ thông tin', 'Hệ thống thông tin'], prereqs: [] },
    { id: 'INT3306', code: 'INT3306', name: 'Phát triển ứng dụng Web', credits: 3, faculty: IT, majors: ['Công nghệ thông tin'], prereqs: ['INT2211'] },
    { id: 'INT3401', code: 'INT3401', name: 'Trí tuệ nhân tạo', credits: 3, faculty: IT, majors: ['Khoa học máy tính'], prereqs: ['INT2210'] },
    { id: 'INT3507', code: 'INT3507', name: 'Thực tập doanh nghiệp', credits: 8, faculty: IT, majors: ['Khoa học máy tính', 'Công nghệ thông tin'], prereqs: [] },
    { id: 'ELT2035', code: 'ELT2035', name: 'Tín hiệu và hệ thống', credits: 3, faculty: EE, majors: ['Kỹ thuật điện tử viễn thông', 'Kỹ thuật máy tính'], prereqs: [] },
    { id: 'MAT1041', code: 'MAT1041', name: 'Giải tích 1', credits: 4, faculty: SHARED, majors: [], prereqs: [] },
    { id: 'MAT1042', code: 'MAT1042', name: 'Giải tích 2', credits: 4, faculty: SHARED, majors: [], prereqs: ['MAT1041'] },
    { id: 'MAT1093', code: 'MAT1093', name: 'Đại số', credits: 4, faculty: SHARED, majors: [], prereqs: [] },
    { id: 'PHI1006', code: 'PHI1006', name: 'Triết học Mác – Lênin', credits: 3, faculty: SHARED, majors: [], prereqs: [] },
    { id: 'FLF1107', code: 'FLF1107', name: 'Tiếng Anh B1', credits: 5, faculty: SHARED, majors: [], prereqs: [] },
    { id: 'PES1015', code: 'PES1015', name: 'Giáo dục thể chất', credits: 1, faculty: SHARED, majors: [], prereqs: [] },
  ]
  const S = 'hk1-2526'
  const P = 'hk2-2425'
  const c = (id: string, courseId: string, semesterId: string, code: string, lecturer: string, capacity: number, enrolled: number, sessions: Session[], practice: PracticeGroup[] = [], demo?: ClassSection['demo']): ClassSection =>
    ({ id, courseId, semesterId, code, lecturer, capacity, enrolled, sessions, practice, demo })
  const g = (id: string, code: string, capacity: number, enrolled: number, sessions: Session[], demo?: PracticeGroup['demo']): PracticeGroup => ({ id, code, lecturer: '', capacity, enrolled, sessions, demo })
  const classes: ClassSection[] = [
    c('c01', 'INT2211', S, 'LT01', 'TS. Nguyễn Văn Hùng', 60, 45, [{ day: 3, start: 1, end: 3, room: '301-G2' }], [
      g('c01p1', 'TH01', 30, 24, [{ day: 5, start: 7, end: 9, room: 'PM 201-G2' }]),
      g('c01p2', 'TH02', 30, 21, [{ day: 6, start: 1, end: 3, room: 'PM 202-G2' }]),
    ]),
    c('c02', 'INT2211', S, 'LT02', 'ThS. Lê Thị Hoa', 60, 52, [{ day: 5, start: 4, end: 6, room: '105-G2' }], [
      g('c02p1', 'TH03', 30, 26, [{ day: 4, start: 7, end: 9, room: 'PM 201-G2' }]),
      g('c02p2', 'TH04', 30, 26, [{ day: 7, start: 1, end: 3, room: 'PM 203-G2' }]),
    ]),
    c('c03', 'INT2212', S, 'LT01', 'PGS.TS. Trần Quốc Bảo', 50, 30, [{ day: 4, start: 4, end: 6, room: '202-E3' }]),
    c('c04', 'PHI1006', S, 'LT03', 'TS. Phạm Thu Trang', 120, 96, [{ day: 2, start: 1, end: 3, room: 'Hội trường 3-G2' }]),
    c('c05', 'FLF1107', S, 'LT12', 'ThS. Đỗ Thanh Mai', 35, 28, [{ day: 2, start: 7, end: 9, room: '401-GĐ' }, { day: 6, start: 7, end: 8, room: '402-GĐ' }]),
    // One theory class + two alternative practice shifts.
    c('c06', 'INT1001', S, 'LT01', 'TS. Hoàng Đức Minh', 80, 40, [{ day: 3, start: 7, end: 9, room: '208-G2' }], [
      g('c06p1', 'TH01', 40, 22, [{ day: 5, start: 1, end: 2, room: 'PM 305-G2' }]),
      g('c06p2', 'TH02', 40, 18, [{ day: 6, start: 4, end: 5, room: 'PM 306-G2' }]),
    ]),
    c('c07', 'INT2210', S, 'LT01', 'PGS.TS. Vũ Thị Lan', 60, 35, [{ day: 4, start: 1, end: 3, room: '309-GĐ' }], [
      g('c07p1', 'TH01', 30, 15, [{ day: 7, start: 7, end: 9, room: 'PM 307-G2' }]),
    ]),
    c('c08', 'INT2204', S, 'LT02', 'TS. Ngô Minh Tuấn', 50, 50, [{ day: 6, start: 1, end: 3, room: '107-G2' }]),
    c('c09', 'MAT1042', S, 'LT01', 'TS. Bùi Văn Thắng', 70, 20, [{ day: 3, start: 2, end: 4, room: '210-GĐ' }]),
    c('c10', 'MAT1042', S, 'LT02', 'ThS. Đặng Hải Yến', 60, 59, [{ day: 5, start: 4, end: 6, room: '103-G2' }], [], 'race'),
    c('c11', 'INT3306', S, 'LT01', 'TS. Lý Quang Huy', 45, 41, [{ day: 2, start: 4, end: 6, room: 'PM 201-G2' }]),
    c('c12', 'ELT2035', S, 'LT01', 'TS. Phan Văn Long', 50, 12, [{ day: 4, start: 7, end: 9, room: '304-E3' }], [], 'network'),
    c('c13', 'INT3507', S, 'LT01', 'TS. Nguyễn Thị Ngọc', 40, 10, [{ day: 7, start: 1, end: 5, room: 'Doanh nghiệp đối tác' }]),
    c('c14', 'INT3401', S, 'LT01', 'PGS.TS. Lê Hoàng Sơn', 60, 53, [{ day: 5, start: 10, end: 12, room: '301-GĐ' }]),
    c('c15', 'PES1015', S, 'LT08', 'ThS. Trịnh Văn Dũng', 40, 39, [{ day: 7, start: 7, end: 8, room: 'Sân thể thao' }]),
    // Practice demo: two mandatory sessions, full group, conflicting group, group that fills up on confirm.
    c('c16', 'INT2208', S, 'LT01', 'TS. Đinh Thị Thu Hà', 60, 15, [{ day: 6, start: 4, end: 6, room: '201-G2' }], [
      g('c16p1', 'TH01', 25, 12, [{ day: 2, start: 10, end: 11, room: 'PM 301-G2' }, { day: 4, start: 10, end: 11, room: 'PM 302-G2' }]),
      g('c16p2', 'TH02', 25, 25, [{ day: 3, start: 10, end: 12, room: 'PM 303-G2' }]),
      g('c16p3', 'TH03', 25, 10, [{ day: 2, start: 7, end: 9, room: 'PM 304-G2' }]),
      g('c16p4', 'TH04', 25, 24, [{ day: 5, start: 10, end: 12, room: 'PM 305-G2' }], 'race'),
    ]),
    c('c17', 'MAT1093', S, 'LT05', 'TS. Vương Mạnh Cường', 80, 62, [{ day: 7, start: 10, end: 12, room: '102-GĐ' }]),
    c('p01', 'INT1001', P, 'LT02', 'TS. Hoàng Đức Minh', 80, 78, [{ day: 2, start: 1, end: 3, room: '208-G2' }], [
      g('p01p1', 'TH01', 40, 39, [{ day: 4, start: 1, end: 2, room: 'PM 305-G2' }]),
    ]),
    c('p02', 'MAT1041', P, 'LT03', 'TS. Bùi Văn Thắng', 70, 66, [{ day: 4, start: 4, end: 6, room: '210-GĐ' }]),
    c('p03', 'MAT1093', P, 'LT02', 'TS. Vương Mạnh Cường', 80, 70, [{ day: 6, start: 1, end: 3, room: '102-GĐ' }]),
  ]
  // Class codes follow the school's format: theory "INT2211 1", practice groups "INT2211 1 (1)".
  // Practice groups may be taught by a different lecturer than the theory class.
  const assistants = ['ThS. Nguyễn Thu Hằng', 'CN. Trần Minh Đức', 'ThS. Phạm Quang Vinh', 'CN. Lê Ngọc Ánh', 'ThS. Hoàng Gia Bảo']
  let k = 0
  for (const x of classes) {
    x.code = `${x.courseId} ${parseInt(x.code.slice(2), 10)}`
    x.practice.forEach((p, i) => { p.code = `${x.code} (${i + 1})`; p.lecturer = assistants[k++ % assistants.length] })
  }
  const students: Student[] = [
    { id: 's1', code: '22021234', name: 'Nguyễn Minh Anh', username: 'sinhvien', faculty: IT, major: 'Khoa học máy tính' },
    { id: 's2', code: '22021001', name: 'Trần Thị Bích Ngọc', faculty: IT, major: 'Công nghệ thông tin' },
    { id: 's3', code: '22022045', name: 'Lê Hoàng Phúc', faculty: EE, major: 'Kỹ thuật máy tính' },
    { id: 's4', code: '23021190', name: 'Phạm Gia Huy', faculty: IT, major: 'Hệ thống thông tin' },
    { id: 's5', code: '23023311', name: 'Vũ Thảo Linh', faculty: 'Khoa Cơ học kỹ thuật và Tự động hóa', major: 'Kỹ thuật robot' },
  ]
  const accounts: Account[] = [
    { username: 'sinhvien', password: '123456', role: 'student', studentId: 's1', name: 'Nguyễn Minh Anh' },
    { username: 'admin', password: 'admin123', role: 'admin', name: 'Chuyên viên Đào tạo' },
  ]
  const t = (h: number) => new Date(Date.now() - h * 3600000).toISOString()
  const old = new Date(Date.now() - 195 * day).toISOString()
  const registrations: Registration[] = [
    { id: 'r1', studentId: 's1', classId: 'c01', practiceId: 'c01p1', createdAt: t(60) },
    { id: 'r2', studentId: 's1', classId: 'c03', createdAt: t(58) },
    { id: 'r3', studentId: 's1', classId: 'c04', createdAt: t(40) },
    { id: 'r4', studentId: 's1', classId: 'c05', createdAt: t(20) },
    { id: 'r5', studentId: 's1', classId: 'p01', practiceId: 'p01p1', createdAt: old },
    { id: 'r6', studentId: 's1', classId: 'p02', createdAt: old },
    { id: 'r7', studentId: 's2', classId: 'c01', practiceId: 'c01p2', createdAt: t(50) },
    { id: 'r8', studentId: 's2', classId: 'c11', createdAt: t(30) },
    { id: 'r9', studentId: 's3', classId: 'c12', createdAt: t(10) },
  ]
  const results: CourseResult[] = [
    { studentId: 's1', courseId: 'INT1001', passed: false },
    { studentId: 's1', courseId: 'MAT1041', passed: true },
    { studentId: 's1', courseId: 'MAT1093', passed: true },
    { studentId: 's2', courseId: 'INT1001', passed: true },
    { studentId: 's2', courseId: 'INT2211', passed: true },
    { studentId: 's2', courseId: 'MAT1041', passed: true },
    { studentId: 's3', courseId: 'MAT1041', passed: true },
  ]
  const periods: RegPeriod[] = semesters.map((s) => {
    const created = new Date(+new Date(s.openAt) - 10 * day).toISOString()
    return { id: 'rp-' + s.id, semesterId: s.id, name: 'Đợt 1', openAt: s.openAt, closeAt: s.closeAt, createdAt: created, updatedAt: created, revisions: [] }
  })
  return { semesters, courses, classes, students, accounts, registrations, results, periods }
}
export type DB = ReturnType<typeof seed>
