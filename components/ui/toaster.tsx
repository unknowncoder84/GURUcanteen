'use client'

import type { ToastMessage } from '@/lib/hooks/useToast'

export function Toaster({ toasts, dismiss }: { toasts: ToastMessage[]; dismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => dismiss(t.id)}
          className={`cursor-pointer rounded-lg px-4 py-3 text-xs font-semibold text-white shadow-lg ${
            t.tone === 'error' ? 'bg-red-600' : t.tone === 'info' ? 'bg-[#2f3b33]' : 'bg-[#1f6034]'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
