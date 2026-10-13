'use client'

import type { Canteen } from '@/lib/types'
import type { DateRangePreset } from '@/lib/dates'
import { Select, Input } from '@/components/ui/form'

export function CanteenFilter({
  canteens,
  value,
  onChange,
  includeInactive = true,
}: {
  canteens: Canteen[]
  value: string
  onChange: (value: string) => void
  includeInactive?: boolean
}) {
  const visible = includeInactive ? canteens : canteens.filter((c) => c.active)
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter by canteen" className="h-10 w-auto">
      <option value="all">All Canteens</option>
      {visible.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {!c.active ? ' (inactive)' : ''}
        </option>
      ))}
    </Select>
  )
}

const presets: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_financial_year', label: 'This financial year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
]

export function DateRangeFilter({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
}: {
  preset: DateRangePreset
  onPresetChange: (value: DateRangePreset) => void
  customStart: string
  customEnd: string
  onCustomStartChange: (value: string) => void
  onCustomEndChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={preset}
        onChange={(e) => onPresetChange(e.target.value as DateRangePreset)}
        aria-label="Filter by date range"
        className="h-10 w-auto"
      >
        {presets.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
      {preset === 'custom' && (
        <>
          <Input type="date" value={customStart} onChange={(e) => onCustomStartChange(e.target.value)} aria-label="Start date" className="w-auto" />
          <span className="text-xs text-[#89958d]">to</span>
          <Input type="date" value={customEnd} onChange={(e) => onCustomEndChange(e.target.value)} aria-label="End date" className="w-auto" />
        </>
      )}
    </div>
  )
}
