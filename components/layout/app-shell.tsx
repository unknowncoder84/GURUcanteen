'use client'

import type { ReactNode } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileNav } from '@/components/layout/mobile-nav'

export function AppShell({
  title,
  subtitle,
  badge,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  badge?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#1b2520]">
      <Sidebar />
      <div className="lg:pl-[250px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-[#e3e9e3] bg-white/95 px-5 backdrop-blur-sm sm:px-8">
          <div className="flex items-center gap-3">
            <MobileNav />
            <div>
              <p className="text-[12px] text-[#839088]">Local business workspace</p>
              <h1 className="text-[18px] font-bold sm:text-[20px]">Good day, Rishi</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
        <main className="mx-auto max-w-[1420px] px-5 py-7 sm:px-8 lg:px-10">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              {badge && (
                <div className="mb-2 inline-flex rounded-full bg-[#e8f6eb] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#347246]">
                  {badge}
                </div>
              )}
              <h2 className="text-[24px] font-bold tracking-[-.03em] sm:text-[28px]">{title}</h2>
              {subtitle && <p className="mt-1 text-[13px] text-[#7b877f]">{subtitle}</p>}
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8f6] text-sm text-[#65736a]">
      Loading your local workspace…
    </div>
  )
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8f6] px-6 text-center text-sm text-red-600">
      Could not load the local database: {message}
    </div>
  )
}
