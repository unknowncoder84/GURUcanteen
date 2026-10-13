'use client'

import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[#4c5b52]">
      <span>{label}</span>
      {children}
      {hint && !error && <span className="text-[11px] font-normal text-[#89958d]">{hint}</span>}
      {error && <span className="text-[11px] font-normal text-red-600">{error}</span>}
    </label>
  )
}

const baseInputClass =
  'h-10 w-full rounded-lg border border-[#dfe6df] bg-white px-3 text-sm text-[#1b2520] outline-none focus:border-[#347246] focus:ring-2 focus:ring-[#347246]/20'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${baseInputClass} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${baseInputClass} ${props.className ?? ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${baseInputClass} min-h-20 resize-y py-2 ${props.className ?? ''}`} />
}

export function PrimaryButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#276f3d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#20733c] disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-[#dfe6df] bg-white px-4 py-2.5 text-sm font-semibold text-[#2f3b33] transition hover:bg-[#f5f7f5] disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function IconButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex size-9 items-center justify-center rounded-lg text-[#4c5b52] transition hover:bg-[#f5f7f5] ${className ?? ''}`}
    >
      {children}
    </button>
  )
}
