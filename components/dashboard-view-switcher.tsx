'use client'

import Link from 'next/link'
import { Scale } from 'lucide-react'
import type { Canteen } from '@/lib/types'

export type DashboardView = 'combined' | 'canteen' | 'comparison'

export interface ViewSwitcherValue {
  view: DashboardView
  /** Only meaningful when view === 'canteen'. */
  canteenId: string
}

/** Segmented control for Combined / per-canteen / Comparison, plus a link to
 *  the dedicated Profit & Sharing page (a separate route, not a dashboard
 *  mode, since it has its own configuration workflow). Switching views never
 *  resets the caller's date range or other filters — those are owned by the
 *  parent page and simply get re-applied under the new view. */
export function DashboardViewSwitcher({
  canteens,
  value,
  onChange,
}: {
  canteens: Canteen[]
  value: ViewSwitcherValue
  onChange: (next: ViewSwitcherValue) => void
}) {
  const options: { key: string; label: string; isActive: boolean; onClick: () => void }[] = [
    {
      key: 'combined',
      label: 'Combined Overview',
      isActive: value.view === 'combined',
      onClick: () => onChange({ view: 'combined', canteenId: 'all' }),
    },
    ...canteens.map((c) => ({
      key: `canteen:${c.id}`,
      label: c.name,
      isActive: value.view === 'canteen' && value.canteenId === c.id,
      onClick: () => onChange({ view: 'canteen', canteenId: c.id }),
    })),
    {
      key: 'comparison',
      label: 'Comparison View',
      isActive: value.view === 'comparison',
      onClick: () => onChange({ view: 'comparison', canteenId: value.canteenId }),
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Dashboard view">
      <div className="flex flex-wrap gap-1 rounded-xl border border-[#e3e9e3] bg-[#f5f7f5] p-1">
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={opt.isActive}
            onClick={opt.onClick}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              opt.isActive ? 'bg-white text-[#20733c] shadow-sm' : 'text-[#69766e] hover:bg-white/60'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <Link
        href="/profit-sharing"
        className="inline-flex items-center gap-1.5 rounded-xl border border-[#dfe6df] bg-white px-3 py-2 text-xs font-semibold text-[#2f3b33] transition hover:bg-[#f5f7f5]"
      >
        <Scale className="size-3.5" />
        Profit &amp; Sharing
      </Link>
    </div>
  )
}
