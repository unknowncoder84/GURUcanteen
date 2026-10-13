'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Brand, SidebarNav } from '@/components/layout/sidebar'

export function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="rounded-lg p-2 text-[#1b2520] hover:bg-[#f5f7f5] lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-[270px] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#edf0ed] pr-4">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Close navigation menu" className="rounded-lg p-2 hover:bg-[#f5f7f5]">
                <X className="size-5" />
              </button>
            </div>
            <div className="overflow-y-auto">
              <SidebarNav onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
