'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { navItems } from '@/components/layout/nav-items'

export function Brand() {
  return (
    <div className="flex h-[76px] items-center gap-3 border-b border-[#edf0ed] px-6">
      <div className="flex size-9 items-center justify-center rounded-xl bg-[#d9f1df] text-[#20733c]">
        <Building2 className="size-5" />
      </div>
      <div>
        <p className="text-[15px] font-bold leading-none text-[#1b2520]">BrightNest</p>
        <p className="text-[11px] text-[#84918a]">Food Solutions</p>
      </div>
    </div>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-1 p-4">
      {navItems.map(({ label, href, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition ${
              active ? 'bg-[#e8f6eb] text-[#20733c]' : 'text-[#69766e] hover:bg-[#f5f7f5]'
            }`}
          >
            <Icon className="size-[17px]" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[250px] flex-col border-r border-[#e3e9e3] bg-white lg:flex">
      <Brand />
      <SidebarNav />
      <div className="mt-auto p-4 text-[11px] text-[#8b978f]">
        Local workspace
        <br />
        Data stays on this computer
      </div>
    </aside>
  )
}
