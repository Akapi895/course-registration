import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import logo from '../assets/logo.png'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Logo({ size = 48 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size }}>
      <img src={logo} alt="Logo Trường Đại học Công nghệ" width={size} height={size} className="h-full w-full scale-[1.04] object-cover" />
    </span>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'; loading?: boolean; size?: 'md' | 'sm' }
export function Button({ variant = 'primary', loading, size = 'md', className, children, disabled, type = 'button', ...p }: BtnProps) {
  const v = {
    primary: 'bg-primary text-white hover:bg-primary-dark active:bg-primary-dark',
    secondary: 'bg-white text-ink border border-line hover:bg-slate-50 hover:border-slate-300',
    ghost: 'text-primary hover:bg-primary-soft',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  }[variant]
  return (
    <button
      {...p}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50', size === 'md' ? 'min-h-11 px-5 text-sm' : 'min-h-9 px-4 text-[13px]', v, className)}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Field({ label, error, hint, children, required, id }: { label: string; error?: string; hint?: string; children: ReactNode; required?: boolean; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label} {required && <span className="text-red-600" aria-hidden>*</span>}
      </label>
      {children}
      {error ? <p id={id + '-err'} className="flex items-center gap-1 text-[13px] text-red-600"><XCircle className="h-3.5 w-3.5 shrink-0" />{error}</p> : hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </div>
  )
}
const inputCls = (err?: string) =>
  cx('min-h-11 w-full rounded-full border bg-white px-4 text-sm text-ink placeholder:text-slate-400 transition focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-muted', err ? 'border-red-400 focus:ring-red-200' : 'border-line focus:border-primary focus:ring-primary/20')
export function Input({ error, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return <input {...p} aria-invalid={!!error || undefined} aria-describedby={error ? p.id + '-err' : undefined} className={cx(inputCls(error), className)} />
}
export function Select({ error, className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  return <select {...p} aria-invalid={!!error || undefined} className={cx(inputCls(error), 'pr-10', className)}>{children}</select>
}

const tones = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  orange: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-primary-soft text-primary ring-blue-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
}
export type Tone = keyof typeof tones
export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone])}>{children}</span>
}
export function seatState(c: { enrolled: number; max_capacity: number }) {
  const left = c.max_capacity - c.enrolled
  return left <= 0 ? 'full' : left / c.max_capacity <= 0.1 || left <= 3 ? 'almost' : 'open'
}
export function Capacity({ c }: { c: { enrolled: number; max_capacity: number } }) {
  const pct = Math.min(100, (c.enrolled / c.max_capacity) * 100)
  const s = seatState(c)
  return (
    <div className="min-w-[72px]">
      <div className="text-sm font-medium tabular-nums">{c.enrolled}/{c.max_capacity}</div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100" role="progressbar" aria-valuenow={c.enrolled} aria-valuemax={c.max_capacity} aria-label="Sĩ số">
        <div className={cx('h-full rounded-full', s === 'full' ? 'bg-slate-400' : 'bg-primary')} style={{ width: pct + '%' }} />
      </div>
    </div>
  )
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
export function Table({ head, children, minWidth = 800 }: { head: ReactNode[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-line bg-slate-50/70 text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => <th key={i} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx('px-4 py-3 align-top', className)}>{children}</td>

export function Pagination({ page, total, size, onChange }: { page: number; total: number; size: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size))
  const from = total ? (page - 1) * size + 1 : 0
  return (
    <nav aria-label="Phân trang" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
      <span>Hiển thị {from}–{Math.min(total, page * size)} trên {total} kết quả</span>
      <div className="flex items-center gap-1">
        <button className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước"><ChevronLeft className="h-4 w-4" /></button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
          <button key={p} onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined} className={cx('h-10 min-w-10 rounded-lg px-2 font-medium', p === page ? 'bg-primary text-white' : 'text-ink hover:bg-slate-100')}>{p}</button>
        ))}
        <button className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-40" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Trang sau"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </nav>
  )
}

function useFocusTrap(open: boolean, onClose: () => void, closable: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const canClose = useRef(closable)
  canClose.current = closable
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current!
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])'))
    el.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canClose.current) closeRef.current()
      if (e.key === 'Tab') {
        const f = focusables()
        if (!f.length) return
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus() }
  }, [open])
  return ref
}
export function Modal({ open, onClose, title, children, footer, closable = true, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; closable?: boolean; size?: 'md' | 'lg' | 'xl' }) {
  const ref = useFocusTrap(open, onClose, closable)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && closable && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-xl', size === 'xl' ? 'sm:max-w-5xl' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} disabled={!closable} className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-slate-100 disabled:opacity-40" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  )
}
export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useFocusTrap(open, onClose, true)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Menu điều hướng" className="relative h-full w-[280px] max-w-[85vw] bg-white shadow-xl outline-none">{children}</div>
    </div>
  )
}

// ---------- Toast ----------
type T = { id: number; tone: 'success' | 'error' | 'info'; text: string }
let toasts: T[] = []
const tl = new Set<() => void>()
export function toast(text: string, tone: T['tone'] = 'success') {
  const t = { id: Date.now() + Math.random(), tone, text }
  toasts = [...toasts, t]; tl.forEach((l) => l())
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); tl.forEach((l) => l()) }, 4500)
}
export function Toaster() {
  const list = useSyncExternalStore((l) => { tl.add(l); return () => { tl.delete(l) } }, () => toasts)
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      {list.map((t) => (
        <div key={t.id} role="status" className="toast-in pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm shadow-lg">
          {t.tone === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : t.tone === 'error' ? <XCircle className="h-5 w-5 shrink-0 text-red-600" /> : <Info className="h-5 w-5 shrink-0 text-primary" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}

export function Alert({ tone = 'info', title, children, action }: { tone?: 'info' | 'warning' | 'error' | 'success'; title?: string; children?: ReactNode; action?: ReactNode }) {
  const m = {
    info: ['bg-primary-soft border-blue-200 text-ink', Info, 'text-primary'],
    warning: ['bg-amber-50 border-amber-200 text-amber-900', AlertTriangle, 'text-amber-600'],
    error: ['bg-red-50 border-red-200 text-red-900', XCircle, 'text-red-600'],
    success: ['bg-emerald-50 border-emerald-200 text-emerald-900', CheckCircle2, 'text-emerald-600'],
  } as const
  const [cls, Icon, ic] = m[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-xl border p-4 text-sm', cls)}>
      <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', ic)} aria-hidden />
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {action}
    </div>
  )
}
export const Skeleton = ({ className }: { className?: string }) => <div className={cx('skeleton rounded-lg', className)} />
export function ErrorNotice({ error, retry, title = 'Không thể hoàn tất yêu cầu' }: { error: unknown; retry?: () => void; title?: string }) {
  return <Alert tone="error" title={title} action={retry && <Button size="sm" variant="secondary" onClick={retry}>Thử lại</Button>}>
    {error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.'}
  </Alert>
}
export function RequestStatus({ loading, error, retry }: { loading: boolean; error: unknown; retry: () => void }) {
  return loading ? <div role="status" aria-label="Đang tải dữ liệu" className="space-y-3 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : error ? <ErrorNotice error={error} retry={retry} /> : null
}
export const fmtDT = (iso: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
export function Empty({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          {sub && <div className="mt-1 text-[13px] text-muted">{sub}</div>}
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary">{icon}</div>
      </div>
    </Card>
  )
}
export function CreditBar({ value, max }: { value: number; max: number }) {
  const scale = Math.max(max, value, 1)
  return (
    <div>
      <div className="relative h-3 rounded-full bg-slate-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label="Tín chỉ đã đăng ký">
        <div className={cx('h-full rounded-full', value > max ? 'bg-red-500' : 'bg-emerald-500')} style={{ width: Math.min(100, (value / scale) * 100) + '%' }} />
      </div>
      <div className="relative mt-1.5 h-4 text-xs text-muted">
        <span className="absolute left-0">0</span>
        <span className="absolute right-0">Tối đa {max}</span>
      </div>
    </div>
  )
}
export function PageHeader({ title, desc, actions, crumbs }: { title: string; desc?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs && <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted">{crumbs}</nav>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {desc && <div className="mt-1 text-sm text-muted">{desc}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Sliding pill toggle. The indicator glides between equal-width options. */
export function PillToggle<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-grid rounded-full bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span aria-hidden className="absolute bottom-1 left-1 top-1 rounded-full bg-primary shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${i * 100}%)` }} />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={cx('relative z-10 flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-medium transition-colors duration-300', o.value === value ? 'text-white' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
