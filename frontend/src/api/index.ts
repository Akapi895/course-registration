import { request } from './client'
import type { ClassCreate, ClassDetail, ClassList, ClassUpdate, CurrentUser, RegisterBatch, RegisteredClass, RegistrationPeriod, TimetableEntry } from './types'

export const login = (username: string, password: string, signal?: AbortSignal) => request<{ access_token: string }>('/api/auth/login', { method: 'POST', body: { username, password }, auth: false, signal })
export const logout = () => request<Record<string, never>>('/api/auth/logout', { method: 'POST' })
export const me = (signal?: AbortSignal) => request<CurrentUser>('/api/auth/me', { signal })
export const listClasses = (filters: { faculty?: string; major?: string } = {}, signal?: AbortSignal) => {
  const params = new URLSearchParams()
  if (filters.faculty?.trim()) params.set('faculty', filters.faculty.trim())
  if (filters.major?.trim()) params.set('major', filters.major.trim())
  return request<ClassList>(`/api/classes${params.size ? '?' + params : ''}`, { signal })
}
export const getClass = (id: number, signal?: AbortSignal) => request<ClassDetail>(`/api/classes/${id}`, { signal })
export const createClass = (body: ClassCreate) => request<{ id: number; class_code: string; status: 'active'; enrolled: number }>('/api/classes', { method: 'POST', body })
export const updateClass = (id: number, body: ClassUpdate) => request<{ id: number; class_code: string; lecturer_name: string; max_capacity: number }>(`/api/classes/${id}`, { method: 'PUT', body })
export const cancelClass = (id: number) => request<{ id: number; status: 'cancelled' }>(`/api/classes/${id}`, { method: 'DELETE' })
export const registerClasses = (classIds: number[]) => request<RegisterBatch>('/api/registrations', { method: 'POST', body: { class_ids: classIds } })
export const listRegistrations = (signal?: AbortSignal) => request<{ registrations: RegisteredClass[] }>('/api/registrations', { signal })
export const cancelRegistration = (id: number) => request<{ id: number; status: 'cancelled' }>(`/api/registrations/${id}`, { method: 'DELETE' })
export const getSchedules = (signal?: AbortSignal) => request<{ schedules: TimetableEntry[] }>('/api/schedules', { signal })
export const updateRegistrationPeriod = (body: RegistrationPeriod) => request<RegistrationPeriod>('/api/registration-period', { method: 'PUT', body })
