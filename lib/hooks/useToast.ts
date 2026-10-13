'use client'

import { useCallback, useRef, useState } from 'react'

export interface ToastMessage {
  id: number
  text: string
  tone: 'success' | 'error' | 'info'
}

let counter = 0

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'success') => {
    const id = ++counter
    setToasts((prev) => [...prev, { id, text, tone }])
    const timer = setTimeout(() => dismiss(id), 3200)
    timers.current.set(id, timer)
  }, [dismiss])

  return { toasts, notify, dismiss }
}
