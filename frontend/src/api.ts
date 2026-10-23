// Service adapter. Mock implementation now; each function notes the REST endpoint
// (Go/PostgreSQL backend) it will map to. Functions marked "mock-only" have no agreed
// API contract yet and must not be assumed to exist on the backend.
// Frontend checks here are advisory; the backend is the final authority.
import { useSyncExternalStore } from 'react'
import { seed, DAYS, type Account, type ClassSection, type PracticeGroup, type Registration, type Semester, type Session, type Student, type DB } from './data'

export const db: DB = seed()
let version = 0
const listeners = new Set<() => void>()
const emit = () => { version++; listeners.forEach((l) => l()) }
export function useDb() {
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => version)
  return db
}
const wait = (ms = 700) => new Promise((r) => setTimeout(r, ms))
export class ApiError extends Error {
  code: string
  constructor(msg: string, code = 'BUSINESS') { super(msg); this.code = code }
}

// ---------- UI state ----------
export const ui = { semesterId: 'hk1-2526' }
export function setSemester(id: string) { ui.semesterId = id; emit() }

let session: Account | null = (() => {
  const u = sessionStorage.getItem('session')
  return u ? db.accounts.find((a) => a.username === u) ?? null : null
})()
export function useSession() { useDb(); return session }
/** Session time-to-live: 20 minutes from login. */
export const SESSION_TTL = 20 * 60 * 1000
/** After logging out, the account must wait this long before logging in again. */
export const RELOGIN_LOCK = 20 * 60 * 1000
export const loginLockedUntil = () => Number(localStorage.getItem('lockUntil') ?? 0)
/** True once the student has submitted registrations in this session; further registering requires a new session. */
export const sessionSubmitted = () => sessionStorage.getItem('submitted') === '1'
export function markSubmitted() { sessionStorage.setItem('submitted', '1'); emit() }
/** Student sessions expire after SESSION_TTL; admin sessions are not time-limited. */
export const sessionExpiresAt = () => (session?.role === 'admin' ? Infinity : Number(sessionStorage.getItem('loginAt') ?? 0) + SESSION_TTL)
/** Demo JWT. The real token comes from POST /api/auth/login; the client only stores and forwards it. */
export const token = () => sessionStorage.getItem('token')

// ---------- helpers ----------
export const course = (id: string) => db.courses.find((c) => c.id === id)!
export const cls = (id: string) => db.classes.find((c) => c.id === id)
export const practice = (id?: string) => (id ? db.classes.flatMap((c) => c.practice).find((p) => p.id === id) : undefined)
export const semester = (id: string) => db.semesters.find((s) => s.id === id)!
export const student = (id: string) => db.students.find((s) => s.id === id)!
export type SemStatus = 'upcoming' | 'open' | 'closed'
export function semStatus(s: Semester): SemStatus {
  return periodStatus(s)
}
/** Semester to advertise publicly (login page): open one first, else the next upcoming, else latest. */
export function currentPeriod() {
  return db.semesters.find((s) => semStatus(s) === 'open') ?? db.semesters.find((s) => semStatus(s) === 'upcoming') ?? db.semesters[0]
}
export const fmtDT = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
export const sessionText = (s: { day: number; start: number; end: number }) => `${DAYS[s.day]}, tiết ${s.start}–${s.end}`
export const bundleLabel = (classId: string, practiceId?: string) => {
  const p = practice(practiceId)
  return `LT ${cls(classId)!.code}${p ? ' + TH ' + p.code : ''}`
}
export function studentRegs(studentId: string, semesterId: string) {
  return db.registrations.filter((r) => r.studentId === studentId && cls(r.classId)?.semesterId === semesterId)
}
/** Credits are counted once per registration (theory + practice bundle). Only the maximum applies. */
export function credits(studentId: string, semesterId: string) {
  return studentRegs(studentId, semesterId).reduce((n, r) => n + course(cls(r.classId)!.courseId).credits, 0)
}
export const passed = (studentId: string, courseId: string) =>
  db.results.some((r) => r.studentId === studentId && r.courseId === courseId && r.passed)

export type Slot = { s: Session; kind: 'LT' | 'TH'; code: string; classId: string; courseId: string; practiceId?: string }
export function bundleSlots(classId: string, practiceId?: string): Slot[] {
  const c = cls(classId)!
  const p = practice(practiceId)
  return [
    ...c.sessions.map((s) => ({ s, kind: 'LT' as const, code: c.code, classId, courseId: c.courseId })),
    ...(p ? p.sessions.map((s) => ({ s, kind: 'TH' as const, code: p.code, classId, courseId: c.courseId, practiceId: p.id })) : []),
  ]
}
export const regSlots = (r: Registration) => bundleSlots(r.classId, r.practiceId)
// Start and end periods are inclusive: 1–3 does not overlap 4–6.
const overlap = (a: { day: number; start: number; end: number }, b: typeof a) => a.day === b.day && a.start <= b.end && b.start <= a.end
const slotText = (x: Slot) => `${course(x.courseId).name} (${x.kind} ${x.code}) — ${sessionText(x.s)}`

/** First schedule conflict between candidate sessions and the student's other registrations. */
function findConflict(studentId: string, semesterId: string, classId: string, sessions: Session[]) {
  for (const r of studentRegs(studentId, semesterId)) {
    if (r.classId === classId) continue
    for (const x of regSlots(r)) if (sessions.some((b) => overlap(x.s, b))) return x
  }
  return null
}

/** Why a practice group cannot be picked together with the given theory class (null = selectable). */
export function practiceBlock(studentId: string, classId: string, g: PracticeGroup): string | null {
  const c = cls(classId)!
  if (g.enrolled >= g.capacity) return 'Nhóm đã hết chỗ.'
  const inner = c.sessions.find((a) => g.sessions.some((b) => overlap(a, b)))
  if (inner) return `Trùng lịch với lớp lý thuyết — ${sessionText(inner)}.`
  const x = findConflict(studentId, c.semesterId, c.id, g.sessions)
  return x ? `Trùng lịch với ${slotText(x)}.` : null
}

export interface Check { key: string; label: string; ok: boolean; message: string }
/** Pre-check for registering a whole bundle. Advisory only. */
export function checkRegistration(studentId: string, classId: string, practiceId?: string): Check[] {
  const c = cls(classId)!
  const co = course(c.courseId)
  const sem = semester(c.semesterId)
  const regs = studentRegs(studentId, c.semesterId)
  // Duplicate = the same class already registered. Other classes of the same course are not blocked here.
  const same = regs.find((r) => r.classId === classId)
  const missing = co.prereqs.filter((p) => !passed(studentId, p))
  const g = practice(practiceId)
  const x = findConflict(studentId, c.semesterId, c.id, [...c.sessions, ...(g?.sessions ?? [])])
  const total = credits(studentId, c.semesterId) + co.credits
  const st = semStatus(sem)
  const checks: Check[] = [
    { key: 'dup', label: 'Chưa đăng ký lớp này', ok: !same, message: same ? 'Bạn đã đăng ký lớp học phần này.' : 'Chưa đăng ký lớp học phần này.' },
    { key: 'time', label: 'Thời gian đăng ký', ok: st === 'open', message: st === 'open' ? `Đang mở đến ${fmtDT(sem.closeAt)}.` : 'Hiện không trong thời gian đăng ký học phần.' },
    { key: 'seat', label: 'Chỗ trống lớp lý thuyết', ok: c.enrolled < c.capacity, message: c.enrolled < c.capacity ? `${c.code} còn ${c.capacity - c.enrolled} chỗ (tham khảo).` : 'Lớp học phần đã hết chỗ. Vui lòng chọn lớp khác.' },
  ]
  if (c.practice.length)
    checks.push({ key: 'practice', label: 'Nhóm thực hành', ok: !!g && g.enrolled < g.capacity, message: !g ? 'Vui lòng chọn 1 nhóm thực hành đi kèm.' : g.enrolled < g.capacity ? `${g.code} còn ${g.capacity - g.enrolled} chỗ (tham khảo).` : `Nhóm thực hành ${g.code} đã hết chỗ. Vui lòng chọn nhóm khác.` })
  checks.push(
    { key: 'prereq', label: 'Học phần tiên quyết', ok: missing.length === 0, message: missing.length ? `Bạn chưa đạt học phần tiên quyết: ${missing.map((m) => course(m).name).join(', ')}.` : co.prereqs.length ? 'Đã đạt tất cả học phần tiên quyết.' : 'Không yêu cầu tiên quyết.' },
    { key: 'schedule', label: 'Lịch học', ok: !x, message: x ? `Lịch học trùng với lớp ${slotText(x)}.` : 'Không trùng với lịch đã đăng ký.' },
    { key: 'credit', label: 'Giới hạn tín chỉ', ok: total <= sem.maxCredits, message: total <= sem.maxCredits ? `Sau đăng ký: ${total}/${sem.maxCredits} tín chỉ.` : 'Đăng ký lớp này sẽ vượt giới hạn tín chỉ học kỳ.' },
  )
  return checks
}
const order = ['dup', 'time', 'seat', 'practice', 'prereq', 'schedule', 'credit']

// ---------- Auth ----------
/** POST /api/auth/login */
export async function login(username: string, password: string) {
  await wait(800)
  const a = db.accounts.find((x) => x.username === username.trim() && x.password === password)
  if (!a) throw new ApiError('Tên đăng nhập hoặc mật khẩu không đúng.')
  session = a
  sessionStorage.setItem('session', a.username)
  sessionStorage.setItem('loginAt', String(Date.now()))
  sessionStorage.setItem('token', 'demo.' + btoa(JSON.stringify({ sub: a.username, role: a.role, ...(a.role === 'admin' ? {} : { exp: Date.now() + SESSION_TTL }) })) + '.sig')
  if (a.role === 'student') ui.semesterId = currentPeriod().id
  emit()
  return a
}
/** Clears the JWT and all client-side session data. */
export function clearSession() {
  session = null
  ;['session', 'loginAt', 'submitted', 'token'].forEach((k) => sessionStorage.removeItem(k))
  emit()
}
/** POST /api/auth/logout, then clear client data. Token revocation is the backend's concern and is not simulated. */
export async function logout() {
  try { await wait(300) } finally { clearSession() }
}
/** mock-only: account registration endpoint is not defined in the API contract */
export async function registerAccount(f: { name: string; code: string; username: string; faculty: string; major: string; password: string }) {
  await wait(900)
  const errors: Record<string, string> = {}
  if (db.accounts.some((a) => a.username === f.username.trim())) errors.username = 'Tên đăng nhập đã tồn tại.'
  if (db.students.some((s) => s.code === f.code.trim())) errors.code = 'Mã số sinh viên đã tồn tại.'
  if (Object.keys(errors).length) throw Object.assign(new ApiError('Thông tin đã tồn tại'), { fields: errors })
  const id = 's' + Date.now()
  db.students.push({ id, code: f.code.trim(), name: f.name.trim(), username: f.username.trim(), faculty: f.faculty, major: f.major })
  db.accounts.push({ username: f.username.trim(), password: f.password, role: 'student', studentId: id, name: f.name.trim() })
  emit()
}

// ---------- Students ----------
/** PUT /api/students/{id} */
export async function updateStudent(id: string, patch: Partial<Pick<Student, 'name'>>) {
  await wait(600)
  Object.assign(student(id), patch)
  const acc = db.accounts.find((a) => a.studentId === id)
  if (acc && patch.name) acc.name = patch.name
  emit()
}

// ---------- Registrations ----------
const attempts = new Set<string>()
/**
 * POST /api/registrations — registers the whole bundle atomically.
 * Either the theory class and the practice group are both recorded, or nothing is.
 */
export async function register(studentId: string, classId: string, practiceId?: string) {
  await wait(1000)
  const c: ClassSection = cls(classId)!
  const g = practice(practiceId)
  const key = studentId + classId + (practiceId ?? '')
  if (c.demo === 'network' && !attempts.has(key)) { attempts.add(key); throw new ApiError('Không thể kết nối. Vui lòng thử lại.', 'NETWORK') }
  // Race demos: another student takes the last seat right before this request is processed.
  if (c.demo === 'race' && !attempts.has(key)) { attempts.add(key); c.enrolled = c.capacity; emit() }
  if (g?.demo === 'race' && !attempts.has(key)) { attempts.add(key); g.enrolled = g.capacity; emit() }
  if (c.practice.length && (!g || !c.practice.includes(g))) throw new ApiError('Vui lòng chọn 1 nhóm thực hành đi kèm lớp lý thuyết.', 'practice')
  const fail = checkRegistration(studentId, classId, practiceId).filter((x) => !x.ok).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))[0]
  if (fail) throw new ApiError(fail.message, fail.key)
  c.enrolled++
  if (g) g.enrolled++
  db.registrations.push({ id: 'r' + Date.now(), studentId, classId, practiceId, createdAt: new Date().toISOString() })
  emit()
}
export function cancelCheck(regId: string): string | null {
  const r = db.registrations.find((x) => x.id === regId)!
  const c = cls(r.classId)!
  const sem = semester(c.semesterId)
  if (semStatus(sem) !== 'open') return 'Đợt đăng ký đã đóng hoặc chưa mở nên không thể hủy đăng ký.'
  return null
}
/** DELETE /api/registrations/{id} — cancels the whole bundle. */
export async function cancelRegistration(regId: string) {
  await wait(900)
  const msg = cancelCheck(regId)
  if (msg) throw new ApiError(msg)
  const r = db.registrations.find((x) => x.id === regId)!
  cls(r.classId)!.enrolled--
  const g = practice(r.practiceId)
  if (g) g.enrolled--
  db.registrations = db.registrations.filter((x) => x.id !== regId)
  emit()
}
// ---------- Admin: classes ----------
/**
 * mock-only: admin class list including classes outside the registration period.
 * GET /api/classes in the SRS only covers classes open for registration; the extended query is pending.
 */
export function adminListClasses(f: { q?: string; semesterId?: string; faculty?: string; major?: string }) {
  const t = (f.q ?? '').trim().toLowerCase()
  return db.classes.filter((c) => {
    const co = course(c.courseId)
    if (f.semesterId && c.semesterId !== f.semesterId) return false
    if (f.faculty && co.faculty !== f.faculty) return false
    if (f.major && !co.majors.includes(f.major)) return false
    if (t && ![c.code, co.code, co.name].some((x) => x.toLowerCase().includes(t))) return false
    return true
  })
}
export type ClassInput = Pick<ClassSection, 'courseId' | 'semesterId' | 'code' | 'lecturer' | 'capacity' | 'sessions'>
/** POST /api/classes · PUT /api/classes/{id}. Enrolled count is never sent; the backend computes it. */
export async function saveClass(data: ClassInput, id?: string) {
  await wait(700)
  if (db.classes.some((c) => c.id !== id && c.semesterId === data.semesterId && c.code.trim().toLowerCase() === data.code.trim().toLowerCase()))
    throw Object.assign(new ApiError('Mã lớp đã tồn tại trong học kỳ.', 'VALIDATION'), { fields: { code: 'Mã lớp đã tồn tại trong học kỳ này.' } })
  if (id) {
    const c = cls(id)!
    if (data.capacity < c.enrolled) throw Object.assign(new ApiError('Sức chứa không được thấp hơn sĩ số hiện tại.', 'VALIDATION'), { fields: { capacity: `Không được thấp hơn sĩ số hiện tại (${c.enrolled}).` } })
    Object.assign(c, data)
  } else db.classes.push({ ...data, id: 'c' + Date.now(), enrolled: 0, practice: [] })
  emit()
}
/** DELETE /api/classes/{id}. Demo policy: only classes without registrations can be deleted. */
export async function deleteClass(id: string, allowWithRegistrations: boolean) {
  await wait(600)
  const c = cls(id)!
  if (!allowWithRegistrations && (c.enrolled > 0 || db.registrations.some((r) => r.classId === id)))
    throw new ApiError('Lớp đã có sinh viên đăng ký nên không thể xóa theo chính sách hiện tại.')
  db.classes = db.classes.filter((x) => x.id !== id)
  emit()
}

// ---------- Admin: students ----------
/** mock-only: the SRS has no student list/search endpoint yet. */
export function adminSearchStudents(f: { q?: string; faculty?: string; major?: string }) {
  const t = (f.q ?? '').trim().toLowerCase()
  return db.students.filter((s) => (!f.faculty || s.faculty === f.faculty) && (!f.major || s.major === f.major) && (!t || s.code.includes(t) || s.name.toLowerCase().includes(t) || (s.username ?? '').toLowerCase().includes(t)))
}

// ---------- Admin: registration periods ----------
/** mock-only read: the SRS does not define an endpoint for listing periods yet. Newest first. */
export function listRegistrationPeriods(semesterId: string) {
  return db.periods.filter((p) => p.semesterId === semesterId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export function periodStatus(p: { openAt: string; closeAt: string }): SemStatus {
  const n = Date.now()
  return n < +new Date(p.openAt) ? 'upcoming' : n > +new Date(p.closeAt) ? 'closed' : 'open'
}
/** The semester's effective window: the open period, else the next upcoming one, else the latest closed one. */
function syncSemester(semesterId: string) {
  const list = db.periods.filter((p) => p.semesterId === semesterId)
  const eff = list.find((p) => periodStatus(p) === 'open')
    ?? list.filter((p) => periodStatus(p) === 'upcoming').sort((a, b) => a.openAt.localeCompare(b.openAt))[0]
    ?? list.sort((a, b) => b.closeAt.localeCompare(a.closeAt))[0]
  if (eff) Object.assign(semester(semesterId), { openAt: eff.openAt, closeAt: eff.closeAt })
}
function validatePeriod(semesterId: string, openAt: string, closeAt: string, exceptId?: string) {
  if (+new Date(openAt) >= +new Date(closeAt)) throw Object.assign(new ApiError('Thời điểm mở phải trước thời điểm đóng.', 'VALIDATION'), { fields: { close: 'Thời điểm mở phải trước thời điểm đóng.' } })
  const clash = db.periods.find((p) => p.id !== exceptId && p.semesterId === semesterId && +new Date(openAt) < +new Date(p.closeAt) && +new Date(p.openAt) < +new Date(closeAt))
  if (clash) throw new ApiError(`Khoảng thời gian bị chồng lên ${clash.name} (${fmtDT(clash.openAt)} – ${fmtDT(clash.closeAt)}).`, 'VALIDATION')
}
/** PUT /api/registration-period — configure a new window. Payload shape is a placeholder, not the official contract. */
export async function createRegistrationPeriod(semesterId: string, openAt: string, closeAt: string) {
  await wait(700)
  validatePeriod(semesterId, openAt, closeAt)
  const now = new Date().toISOString()
  const n = db.periods.filter((p) => p.semesterId === semesterId).length + 1
  db.periods.push({ id: 'rp' + Date.now(), semesterId, name: `Đợt ${n}`, openAt, closeAt, createdAt: now, updatedAt: now, revisions: [] })
  syncSemester(semesterId)
  emit()
}
/** mock-only: edit an existing window; the previous values are kept in its history. */
export async function updateRegistrationPeriod(periodId: string, openAt: string, closeAt: string) {
  await wait(700)
  const p = db.periods.find((x) => x.id === periodId)!
  validatePeriod(p.semesterId, openAt, closeAt, periodId)
  const now = new Date().toISOString()
  p.revisions.unshift({ at: now, openAt: p.openAt, closeAt: p.closeAt })
  Object.assign(p, { openAt, closeAt, updatedAt: now })
  syncSemester(p.semesterId)
  emit()
}
export { DAYS }
