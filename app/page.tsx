'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, TrendingUp, TrendingDown, Minus, FileDown } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { EmptyState } from '@/components/ui/empty-state'
import { PrimaryButton, SecondaryButton } from '@/components/ui/form'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import { resolveDateRange } from '@/lib/dates'
import { computeFinancialSummary, filterExpenses, filterSales, buildDailyTrend } from '@/lib/calculations'
import { computeAllVendorBalances, computeAllSalaryBalances } from '@/lib/balances'
import { filterSalesBySearch, filterExpensesBySearch } from '@/lib/search'
import { formatPaise } from '@/lib/money'
import { loadDemoData, clearDemoData } from '@/lib/db/seed'
import { DashboardViewSwitcher, type ViewSwitcherValue } from '@/components/dashboard-view-switcher'
import { GlobalFilterBar, defaultGlobalFilterState, isFilterActive, type GlobalFilterState } from '@/components/global-filter-bar'
import { PdfReportBuilder } from '@/components/pdf-report-builder'
import { loadPreferences, savePreferences } from '@/lib/preferences'
import type { ImportRecord, StaffMember, Vendor } from '@/lib/types'

export default function OverviewPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const [view, setView] = useState<ViewSwitcherValue>({ view: 'combined', canteenId: 'all' })
  const [filters, setFilters] = useState<GlobalFilterState>(defaultGlobalFilterState())
  const [pdfOpen, setPdfOpen] = useState(false)
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  // Restore the harmless preferred-view preference once on mount. Filters
  // themselves are intentionally session-only (not persisted), so switching
  // tabs/views never silently changes what the owner is currently looking at
  // between visits in a confusing way — only the *view mode* is remembered.
  useEffect(() => {
    const prefs = loadPreferences()
    if (prefs.dashboardView) {
      setView({ view: prefs.dashboardView, canteenId: prefs.dashboardCanteenId ?? 'all' })
    }
    setPrefsLoaded(true)
  }, [])

  useEffect(() => {
    if (!prefsLoaded) return
    savePreferences({ dashboardView: view.view, dashboardCanteenId: view.canteenId })
  }, [view, prefsLoaded])

  const range = useMemo(() => resolveDateRange(filters.preset, filters.customStart, filters.customEnd), [filters.preset, filters.customStart, filters.customEnd])

  // The view switcher and the global filter bar's canteen filter both narrow
  // "which canteen", so for the combined/canteen views we resolve a single
  // effective canteen filter: the view switcher wins when it has selected a
  // specific canteen, otherwise the filter bar's own canteen choice applies.
  const effectiveCanteenId = view.view === 'canteen' ? view.canteenId : filters.canteenId

  const searchCtx = useMemo(
    () => ({ vendors: data?.vendors ?? [], staff: data?.staff ?? [], imports: data?.imports ?? [] }),
    [data]
  )

  const baseFilter = useMemo(
    () => ({ canteenId: effectiveCanteenId, startDate: range.start, endDate: range.end }),
    [effectiveCanteenId, range]
  )

  const matchedSales = useMemo(() => {
    if (!data) return []
    let rows = filterSales(data.sales, baseFilter)
    if (filters.paymentMethod !== 'all') rows = rows.filter((r) => r.paymentMethod === filters.paymentMethod)
    if (filters.importId !== 'all') rows = rows.filter((r) => r.importId === filters.importId)
    return filterSalesBySearch(rows, filters.query, searchCtx)
  }, [data, baseFilter, filters.paymentMethod, filters.importId, filters.query, searchCtx])

  const matchedExpenses = useMemo(() => {
    if (!data) return []
    let rows = filterExpenses(data.expenses, baseFilter)
    if (filters.category !== 'all') rows = rows.filter((r) => r.category === filters.category)
    if (filters.paymentMethod !== 'all') rows = rows.filter((r) => r.paymentMethod === filters.paymentMethod)
    if (filters.vendorId !== 'all') rows = rows.filter((r) => r.vendorId === filters.vendorId)
    if (filters.importId !== 'all') rows = rows.filter((r) => r.importId === filters.importId)
    return filterExpensesBySearch(rows, filters.query, searchCtx)
  }, [data, baseFilter, filters.category, filters.paymentMethod, filters.vendorId, filters.importId, filters.query, searchCtx])

  const summary = useMemo(() => {
    if (!data) return null
    return computeFinancialSummary(matchedSales, matchedExpenses, {})
  }, [data, matchedSales, matchedExpenses])

  const trend = useMemo(() => buildDailyTrend(matchedSales, (r) => r.amountPaise).slice(-14), [matchedSales])

  const vendorBalances = useMemo(() => {
    if (!data) return []
    return computeAllVendorBalances(data.vendors, data.purchases, data.vendorPayments).filter((b) => b.outstandingPaise > 0)
  }, [data])

  const salaryBalances = useMemo(() => {
    if (!data) return []
    return computeAllSalaryBalances(data.staff, data.salaryPayments).filter((b) => b.outstandingPaise > 0)
  }, [data])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const hasAnyRecords = data.sales.length > 0 || data.expenses.length > 0
  const maxTrend = Math.max(1, ...trend.map((t) => t.valuePaise))

  function clearFilters() {
    setFilters(defaultGlobalFilterState())
  }

  return (
    <AppShell
      title="Business overview"
      subtitle="Stored privately in IndexedDB on this computer. No cloud connection is used."
      badge="Local data"
      actions={
        <div className="flex gap-2">
          <SecondaryButton onClick={() => setPdfOpen(true)}>
            <FileDown className="size-4" />
            Create PDF report
          </SecondaryButton>
          <Link href="/upload">
            <PrimaryButton>
              <Plus className="size-4" />
              Upload data
            </PrimaryButton>
          </Link>
        </div>
      }
    >
      <div className="mb-5">
        <DashboardViewSwitcher canteens={data.canteens} value={view} onChange={setView} />
      </div>

      <GlobalFilterBar
        canteens={data.canteens}
        vendors={data.vendors}
        staff={data.staff}
        imports={data.imports}
        state={filters}
        onChange={setFilters}
        onClear={clearFilters}
        resultCount={matchedSales.length + matchedExpenses.length}
        resultTotalLabel={summary ? `Filtered profit: ${formatPaise(summary.profitPaise)}` : undefined}
        showVendor
        showStaff
      />

      {!hasAnyRecords ? (
        <EmptyState
          title="No records yet"
          description="Add your first sale or expense, or load a clearly labelled demo dataset to explore the dashboard."
          action={
            <div className="flex gap-2">
              <Link href="/sales">
                <PrimaryButton>Add a sale</PrimaryButton>
              </Link>
              <SecondaryButton
                onClick={async () => {
                  await loadDemoData()
                  await refresh()
                  notify('Demo dataset loaded. Clear it anytime from Settings.', 'info')
                }}
              >
                Load demo dataset
              </SecondaryButton>
            </div>
          }
        />
      ) : view.view === 'comparison' ? (
        <ComparisonView data={data} filters={filters} range={range} searchCtx={searchCtx} />
      ) : matchedSales.length === 0 && matchedExpenses.length === 0 && isFilterActive(filters) ? (
        <EmptyState
          title="No records match your filters"
          description="Try widening the date range, clearing the search box, or removing an advanced filter."
          action={<SecondaryButton onClick={clearFilters}>Clear all filters</SecondaryButton>}
        />
      ) : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric title="Total sales" value={formatPaise(summary!.salesPaise)} />
            <Metric title="Operating expenses" value={formatPaise(summary!.expensesPaise)} />
            <Metric
              title="Operating profit"
              value={formatPaise(summary!.profitPaise)}
              tone={summary!.profitPaise >= 0 ? 'positive' : 'negative'}
            />
            <Metric
              title="Profit margin"
              value={summary!.marginPercent === null ? '—' : `${summary!.marginPercent.toFixed(1)}%`}
            />
          </div>

          <div className="mb-5 grid gap-5 xl:grid-cols-2">
            <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
              <h3 className="mb-4 font-bold">Sales trend (last 14 days with data)</h3>
              {trend.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#89958d]">No sales in this range yet.</p>
              ) : (
                <div className="flex h-40 items-end gap-1.5">
                  {trend.map((t) => (
                    <div key={t.date} className="group relative flex-1" title={`${t.date}: ${formatPaise(t.valuePaise)}`}>
                      <div
                        className="rounded-t bg-[#4fa66b] transition-all"
                        style={{ height: `${Math.max(4, (t.valuePaise / maxTrend) * 140)}px` }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
              <h3 className="mb-4 font-bold">Canteen comparison</h3>
              {data.canteens.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#89958d]">No canteens yet.</p>
              ) : (
                data.canteens.map((c) => {
                  const cSummary = computeFinancialSummary(data.sales, data.expenses, {
                    canteenId: c.id,
                    startDate: range.start,
                    endDate: range.end,
                  })
                  return (
                    <div key={c.id} className="mb-3 flex items-center justify-between text-xs">
                      <span className="font-medium">{c.name}</span>
                      <span className={cSummary.profitPaise >= 0 ? 'font-bold text-[#347246]' : 'font-bold text-red-600'}>
                        {formatPaise(cSummary.profitPaise)}
                      </span>
                    </div>
                  )
                })
              )}
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold">Recent sales</h3>
                <Link href="/sales" className="text-xs font-semibold text-[#347246]">
                  View all
                </Link>
              </div>
              {matchedSales.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#89958d]">No sales match the current filters.</p>
              ) : (
                [...matchedSales]
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .slice(0, 6)
                  .map((r) => (
                    <div className="flex justify-between border-b border-[#eff2ef] py-3 text-xs last:border-0" key={r.id}>
                      <span>
                        {r.description}
                        <small className="ml-2 text-[#9aa49d]">{r.date}</small>
                      </span>
                      <b>{formatPaise(r.amountPaise)}</b>
                    </div>
                  ))
              )}
            </section>

            <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold">Recent expenses</h3>
                <Link href="/expenses" className="text-xs font-semibold text-[#347246]">
                  View all
                </Link>
              </div>
              {matchedExpenses.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#89958d]">No expenses match the current filters.</p>
              ) : (
                [...matchedExpenses]
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .slice(0, 6)
                  .map((r) => (
                    <div className="flex justify-between border-b border-[#eff2ef] py-3 text-xs last:border-0" key={r.id}>
                      <span>
                        {r.description}
                        <small className="ml-2 text-[#9aa49d]">
                          {r.date} · {r.category}
                        </small>
                      </span>
                      <b>{formatPaise(r.amountPaise)}</b>
                    </div>
                  ))
              )}
            </section>
          </div>

          {(vendorBalances.length > 0 || salaryBalances.length > 0 || data.imports.length > 0) && (
            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              {vendorBalances.length > 0 && (
                <AlertCard
                  title="Outstanding vendor balances"
                  rows={vendorBalances.map((b) => ({
                    label: data.vendors.find((v) => v.id === b.vendorId)?.name ?? 'Unknown vendor',
                    value: formatPaise(b.outstandingPaise),
                  }))}
                  href="/vendors"
                />
              )}
              {salaryBalances.length > 0 && (
                <AlertCard
                  title="Outstanding salary balances"
                  rows={salaryBalances.map((b) => ({
                    label: data.staff.find((s) => s.id === b.staffId)?.name ?? 'Unknown staff',
                    value: formatPaise(b.outstandingPaise),
                  }))}
                  href="/staff"
                />
              )}
              <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
                <h3 className="mb-3 font-bold">Recent uploads</h3>
                {data.imports.length === 0 ? (
                  <p className="text-xs text-[#89958d]">No imports yet.</p>
                ) : (
                  data.imports.slice(0, 4).map((u) => (
                    <div key={u.id} className="mb-2 flex justify-between text-xs last:mb-0">
                      <span className="truncate">{u.filename}</span>
                      <span className="text-[#347246]">
                        {u.acceptedRows}/{u.totalRows}
                      </span>
                    </div>
                  ))
                )}
              </section>
            </div>
          )}

          {data.settings.demoDataLoaded && (
            <div className="mt-5 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <span>Demo data is currently loaded alongside any real records you&apos;ve added.</span>
              <button
                onClick={async () => {
                  await clearDemoData()
                  await refresh()
                  notify('Demo data cleared')
                }}
                className="font-semibold underline"
              >
                Clear demo data
              </button>
            </div>
          )}
        </>
      )}

      {pdfOpen && <PdfReportBuilder data={data} onClose={() => setPdfOpen(false)} />}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}

function Metric({ title, value, tone }: { title: string; value: string; tone?: 'positive' | 'negative' }) {
  const Icon = tone === 'positive' ? TrendingUp : tone === 'negative' ? TrendingDown : Minus
  return (
    <div className="rounded-xl border border-[#e3e9e3] bg-white p-5">
      <p className="text-[11px] font-semibold text-[#89958d]">{title}</p>
      <div className="mt-3 flex items-center gap-2">
        <p className="text-[22px] font-bold sm:text-[24px]">{value}</p>
        {tone && <Icon className={`size-4 ${tone === 'positive' ? 'text-[#347246]' : 'text-red-600'}`} />}
      </div>
    </div>
  )
}

function AlertCard({ title, rows, href }: { title: string; rows: { label: string; value: string }[]; href: string }) {
  return (
    <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold">{title}</h3>
        <Link href={href} className="text-xs font-semibold text-[#347246]">
          View
        </Link>
      </div>
      {rows.slice(0, 5).map((r, i) => (
        <div key={i} className="mb-2 flex justify-between text-xs last:mb-0">
          <span className="truncate">{r.label}</span>
          <span className="font-semibold text-amber-700">{r.value}</span>
        </div>
      ))}
    </section>
  )
}

/** Side-by-side comparison of Lower Parel / Vikhroli (or however many
 *  canteens exist) using the same selected date range for both, as required:
 *  sales, expenses, profit, margin, payment-method breakdown, expense
 *  categories, daily trend, and vendor/salary dues where supported. */
function ComparisonView({
  data,
  filters,
  range,
  searchCtx,
}: {
  data: NonNullable<ReturnType<typeof useAppData>['data']>
  filters: GlobalFilterState
  range: { start?: string; end?: string }
  searchCtx: { vendors: Vendor[]; staff: StaffMember[]; imports: ImportRecord[] }
}) {
  const vendorBalances = computeAllVendorBalances(data.vendors, data.purchases, data.vendorPayments)
  const salaryBalances = computeAllSalaryBalances(data.staff, data.salaryPayments)

  if (data.canteens.length === 0) {
    return <EmptyState title="No canteens to compare" description="Add at least one canteen from the Canteens page." />
  }

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${Math.min(data.canteens.length, 2)}, minmax(0, 1fr))` }}>
      {data.canteens.map((c) => {
        const canteenFilter = { canteenId: c.id, startDate: range.start, endDate: range.end }
        let sales = filterSales(data.sales, canteenFilter)
        let expenses = filterExpenses(data.expenses, canteenFilter)
        if (filters.paymentMethod !== 'all') {
          sales = sales.filter((s) => s.paymentMethod === filters.paymentMethod)
          expenses = expenses.filter((e) => e.paymentMethod === filters.paymentMethod)
        }
        if (filters.category !== 'all') expenses = expenses.filter((e) => e.category === filters.category)
        sales = filterSalesBySearch(sales, filters.query, searchCtx)
        expenses = filterExpensesBySearch(expenses, filters.query, searchCtx)

        const summary = computeFinancialSummary(sales, expenses, {})
        const paymentMap = new Map<string, number>()
        for (const s of sales) paymentMap.set(s.paymentMethod, (paymentMap.get(s.paymentMethod) ?? 0) + s.amountPaise)
        const categoryMap = new Map<string, number>()
        for (const e of expenses) categoryMap.set(e.category, (categoryMap.get(e.category) ?? 0) + e.amountPaise)

        const canteenVendorDue = vendorBalances.filter((b) => b.outstandingPaise > 0 && data.purchases.some((p) => p.canteenId === c.id && p.vendorId === b.vendorId))
        const canteenSalaryDue = salaryBalances.filter((b) => b.outstandingPaise > 0 && data.staff.some((s) => s.id === b.staffId && s.canteenId === c.id))

        return (
          <section key={c.id} className="rounded-xl border border-[#e3e9e3] bg-white p-5">
            <h3 className="mb-4 text-base font-bold">{c.name}</h3>
            {sales.length === 0 && expenses.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#89958d]">No transactions for this canteen in the selected period.</p>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <SmallMetric label="Sales" value={formatPaise(summary.salesPaise)} />
                  <SmallMetric label="Expenses" value={formatPaise(summary.expensesPaise)} />
                  <SmallMetric label="Profit" value={formatPaise(summary.profitPaise)} tone={summary.profitPaise >= 0 ? 'good' : 'bad'} />
                  <SmallMetric label="Margin" value={summary.marginPercent === null ? '—' : `${summary.marginPercent.toFixed(1)}%`} />
                </div>

                <p className="mb-1 text-[11px] font-bold text-[#89958d]">Payment methods</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {Array.from(paymentMap.entries()).map(([m, paise]) => (
                    <span key={m} className="rounded-full bg-[#f3f4f2] px-2 py-1 text-[11px]">
                      {m}: {formatPaise(paise)}
                    </span>
                  ))}
                  {paymentMap.size === 0 && <span className="text-[11px] text-[#89958d]">No sales recorded.</span>}
                </div>

                <p className="mb-1 text-[11px] font-bold text-[#89958d]">Expense categories</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {Array.from(categoryMap.entries()).map(([cat, paise]) => (
                    <span key={cat} className="rounded-full bg-[#f3f4f2] px-2 py-1 text-[11px]">
                      {cat}: {formatPaise(paise)}
                    </span>
                  ))}
                  {categoryMap.size === 0 && <span className="text-[11px] text-[#89958d]">No expenses recorded.</span>}
                </div>

                <p className="mb-1 text-[11px] font-bold text-[#89958d]">Vendor dues (linked to this canteen&apos;s purchases)</p>
                <p className="mb-3 text-xs">
                  {canteenVendorDue.length === 0 ? 'None outstanding.' : formatPaise(canteenVendorDue.reduce((n, b) => n + b.outstandingPaise, 0))}
                </p>

                <p className="mb-1 text-[11px] font-bold text-[#89958d]">Salary dues (staff assigned to this canteen)</p>
                <p className="text-xs">
                  {canteenSalaryDue.length === 0 ? 'None outstanding.' : formatPaise(canteenSalaryDue.reduce((n, b) => n + b.outstandingPaise, 0))}
                </p>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}

function SmallMetric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-[#347246]' : tone === 'bad' ? 'text-red-600' : 'text-[#1b2520]'
  return (
    <div className="rounded-lg bg-[#f5f7f5] p-2.5">
      <p className="text-[10px] font-semibold text-[#89958d]">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  )
}
