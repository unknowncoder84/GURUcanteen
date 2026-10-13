'use client'

import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { Canteen, ExpenseCategory, ImportRecord, PaymentMethod, StaffMember, Vendor } from '@/lib/types'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/types'
import type { DateRangePreset } from '@/lib/dates'
import { CanteenFilter, DateRangeFilter } from '@/components/filters'
import { Input, Select } from '@/components/ui/form'

export interface GlobalFilterState {
  canteenId: string
  preset: DateRangePreset
  customStart: string
  customEnd: string
  query: string
  category: string // 'all' or an ExpenseCategory
  paymentMethod: string // 'all' or a PaymentMethod
  vendorId: string // 'all' or a vendor id
  staffId: string // 'all' or a staff id
  importId: string // 'all' or an import batch id
}

export function defaultGlobalFilterState(): GlobalFilterState {
  return {
    canteenId: 'all',
    preset: 'this_month',
    customStart: '',
    customEnd: '',
    query: '',
    category: 'all',
    paymentMethod: 'all',
    vendorId: 'all',
    staffId: 'all',
    importId: 'all',
  }
}

export function isFilterActive(state: GlobalFilterState): boolean {
  const defaults = defaultGlobalFilterState()
  return (
    state.canteenId !== defaults.canteenId ||
    state.preset !== defaults.preset ||
    state.query.trim() !== '' ||
    state.category !== defaults.category ||
    state.paymentMethod !== defaults.paymentMethod ||
    state.vendorId !== defaults.vendorId ||
    state.staffId !== defaults.staffId ||
    state.importId !== defaults.importId
  )
}

/** Reusable global filter bar: common filters (canteen, date range, search)
 *  are always visible; less-frequent filters (category, payment method,
 *  vendor, staff, import batch) live in a collapsible "Advanced filters"
 *  panel so the dashboard doesn't get crowded. All filters operate on the
 *  caller's full stored dataset, not just currently rendered rows — the
 *  caller is expected to apply `state` via lib/calculations.ts + lib/search.ts
 *  filters and pass back the resulting count/total for display. */
export function GlobalFilterBar({
  canteens,
  vendors,
  staff,
  imports,
  state,
  onChange,
  onClear,
  resultCount,
  resultTotalLabel,
  showCategory = true,
  showPaymentMethod = true,
  showVendor = false,
  showStaff = false,
  showImportBatch = true,
}: {
  canteens: Canteen[]
  vendors: Vendor[]
  staff: StaffMember[]
  imports: ImportRecord[]
  state: GlobalFilterState
  onChange: (next: GlobalFilterState) => void
  onClear: () => void
  resultCount: number
  resultTotalLabel?: string
  showCategory?: boolean
  showPaymentMethod?: boolean
  showVendor?: boolean
  showStaff?: boolean
  showImportBatch?: boolean
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const active = isFilterActive(state)

  return (
    <div className="mb-5 rounded-xl border border-[#e3e9e3] bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <CanteenFilter canteens={canteens} value={state.canteenId} onChange={(v) => onChange({ ...state, canteenId: v })} />
          <DateRangeFilter
            preset={state.preset}
            onPresetChange={(v) => onChange({ ...state, preset: v })}
            customStart={state.customStart}
            customEnd={state.customEnd}
            onCustomStartChange={(v) => onChange({ ...state, customStart: v })}
            onCustomEndChange={(v) => onChange({ ...state, customEnd: v })}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#89958d]" />
            <Input
              value={state.query}
              onChange={(e) => onChange({ ...state, query: e.target.value })}
              placeholder="Search description, reference, vendor, staff, filename..."
              className="w-64 pl-9"
              aria-label="Search records"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#dfe6df] px-3 py-2 text-xs font-semibold text-[#2f3b33] hover:bg-[#f5f7f5]"
          >
            <SlidersHorizontal className="size-3.5" />
            Advanced filters
          </button>
          {active && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50"
            >
              <X className="size-3.5" />
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {advancedOpen && (
        <div className="mt-4 grid gap-3 border-t border-[#eff2ef] pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {showCategory && (
            <Select value={state.category} onChange={(e) => onChange({ ...state, category: e.target.value })} aria-label="Filter by expense category">
              <option value="all">All categories</option>
              {EXPENSE_CATEGORIES.map((c: ExpenseCategory) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
          {showPaymentMethod && (
            <Select value={state.paymentMethod} onChange={(e) => onChange({ ...state, paymentMethod: e.target.value })} aria-label="Filter by payment method">
              <option value="all">All payment methods</option>
              {PAYMENT_METHODS.map((m: PaymentMethod) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          )}
          {showVendor && (
            <Select value={state.vendorId} onChange={(e) => onChange({ ...state, vendorId: e.target.value })} aria-label="Filter by vendor">
              <option value="all">All vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          )}
          {showStaff && (
            <Select value={state.staffId} onChange={(e) => onChange({ ...state, staffId: e.target.value })} aria-label="Filter by staff member">
              <option value="all">All staff</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          {showImportBatch && (
            <Select value={state.importId} onChange={(e) => onChange({ ...state, importId: e.target.value })} aria-label="Filter by import batch">
              <option value="all">All sources (manual + imported)</option>
              {imports.map((imp) => (
                <option key={imp.id} value={imp.id}>
                  {imp.filename} ({imp.importedAt.slice(0, 10)})
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#eff2ef] pt-3 text-xs text-[#69766e]">
        <span>
          <b className="text-[#1b2520]">{resultCount}</b> result{resultCount === 1 ? '' : 's'}
        </span>
        {resultTotalLabel && <span className="font-semibold text-[#1b2520]">{resultTotalLabel}</span>}
        {active && <span className="rounded-full bg-[#e8f6eb] px-2 py-0.5 font-semibold text-[#347246]">Filters active</span>}
      </div>
    </div>
  )
}
