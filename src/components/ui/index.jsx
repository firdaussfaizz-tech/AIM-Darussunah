import { forwardRef } from 'react'

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-semibold tracking-tight text-[var(--color-ink)] sm:text-[32px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-[15px] text-[var(--color-ink-soft)]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className = '', padded = true }) {
  return (
    <div className={`rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] ${padded ? 'p-6' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function SectionCard({ title, description, actions, children, className = '' }) {
  return (
    <Card className={className} padded={false}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-6 py-4">
          <div>
            {title && <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-6">{children}</div>
    </Card>
  )
}

const buttonVariants = {
  primary: 'bg-[var(--color-navy)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-[var(--color-navy-light)]',
  gold: 'bg-[var(--color-gold)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:brightness-95',
  outline: 'border border-[var(--color-border)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-paper)]',
  ghost: 'text-[var(--color-navy)] hover:bg-[var(--color-navy-50)]',
  danger: 'bg-[var(--color-danger)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:brightness-95',
}

export const Button = forwardRef(function Button(
  { children, variant = 'primary', size = 'md', className = '', type = 'button', ...props },
  ref
) {
  const sizes = { sm: 'px-3.5 py-1.5 text-[13px]', md: 'px-5 py-2 text-[14px]', lg: 'px-6 py-2.5 text-[15px]' }
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})

export const Input = forwardRef(function Input({ label, error, className = '', containerClassName = '', ...props }, ref) {
  return (
    <label className={`block ${containerClassName}`}>
      {label && <span className="mb-1.5 block text-sm font-medium text-[var(--color-ink)]">{label}</span>}
      <input
        ref={ref}
        className={`w-full rounded-[12px] border border-[var(--color-border)] bg-white px-3.5 py-2.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.045)] text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-navy)] focus:outline-none focus:ring-2 focus:ring-[var(--color-navy-50)] ${className}`}
        {...props}
      />
      {error && <span className="mt-1 block text-xs text-[var(--color-danger)]">{error}</span>}
    </label>
  )
})

export const Select = forwardRef(function Select({ label, error, className = '', containerClassName = '', children, ...props }, ref) {
  return (
    <label className={`block ${containerClassName}`}>
      {label && <span className="mb-1.5 block text-sm font-medium text-[var(--color-ink)]">{label}</span>}
      <select
        ref={ref}
        className={`w-full rounded-[12px] border border-[var(--color-border)] bg-white px-3.5 py-2.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.045)] text-[15px] text-[var(--color-ink)] focus:border-[var(--color-navy)] focus:outline-none focus:ring-2 focus:ring-[var(--color-navy-50)] ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <span className="mt-1 block text-xs text-[var(--color-danger)]">{error}</span>}
    </label>
  )
})

export const Textarea = forwardRef(function Textarea({ label, error, className = '', containerClassName = '', ...props }, ref) {
  return (
    <label className={`block ${containerClassName}`}>
      {label && <span className="mb-1.5 block text-sm font-medium text-[var(--color-ink)]">{label}</span>}
      <textarea
        ref={ref}
        className={`w-full rounded-[12px] border border-[var(--color-border)] bg-white px-3.5 py-2.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.045)] text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-navy)] focus:outline-none focus:ring-2 focus:ring-[var(--color-navy-50)] ${className}`}
        {...props}
      />
      {error && <span className="mt-1 block text-xs text-[var(--color-danger)]">{error}</span>}
    </label>
  )
})

const badgeColors = {
  success: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  gold: 'bg-[var(--color-gold-soft)] text-[var(--color-gold)]',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  navy: 'bg-[var(--color-navy-50)] text-[var(--color-navy)]',
  neutral: 'bg-black/[0.05] text-[var(--color-ink-soft)]',
}

export function Badge({ children, color = 'neutral' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${badgeColors[color] || badgeColors.neutral}`}>
      {children}
    </span>
  )
}

export function Table({ columns, children }) {
  return (
    <div className="scroll-thin -mx-6 overflow-x-auto px-6">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[13px] font-medium text-[var(--color-ink-soft)]">
            {columns.map((col) => (
              <th key={col} className="whitespace-nowrap px-3 py-2.5 first:pl-0 last:pr-0">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Tr({ children, onClick }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-[var(--color-border)] last:border-0 ${onClick ? 'cursor-pointer hover:bg-[var(--color-paper)]' : ''}`}
    >
      {children}
    </tr>
  )
}

export function Td({ children, className = '' }) {
  return <td className={`px-3 py-3 first:pl-0 last:pr-0 ${className}`}>{children}</td>
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      {Icon && <Icon className="mb-1 h-9 w-9 text-[var(--color-ink-soft)]" strokeWidth={1.5} />}
      <p className="font-medium text-[var(--color-ink)]">{title}</p>
      {description && <p className="max-w-sm text-sm text-[var(--color-ink-soft)]">{description}</p>}
      {action}
    </div>
  )
}

export function StatCard({ label, value, sub }) {
  return (
    <Card>
      <p className="text-[13px] font-medium text-[var(--color-ink-soft)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-[34px] font-semibold leading-none tracking-tight text-[var(--color-ink)]">{value}</p>
      {sub && <p className="mt-2 text-[13px] text-[var(--color-ink-soft)]">{sub}</p>}
    </Card>
  )
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 backdrop-blur-sm p-4 pt-10 sm:pt-16">
      <div className={`glass w-full ${width} rounded-[var(--radius-window)] shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-white/40 px-6 py-4">
          <h3 className="text-[17px] font-semibold text-[var(--color-ink)]">{title}</h3>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.06] text-[var(--color-ink-soft)] hover:bg-black/[0.1]" aria-label="Tutup">
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

export function Spinner({ className = '' }) {
  return (
    <div className={`h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-navy)] ${className}`} />
  )
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  )
}
