'use client'

import type { ReactNode } from 'react'

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#dfe6df] bg-[#fbfcfb] py-14 text-center">
      <p className="text-sm font-semibold text-[#2f3b33]">{title}</p>
      {description && <p className="max-w-sm text-xs text-[#89958d]">{description}</p>}
      {action}
    </div>
  )
}
