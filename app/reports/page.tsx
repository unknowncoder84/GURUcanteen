'use client'

import { useMemo, useState } from 'react'
import { Download, Printer, RotateCcw, FileDown } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { CanteenFilter, DateRangeFilter } from '@/components/filters'
import { ConfirmDialog } from '@/components/ui/modal'
import { PrimaryButton, SecondaryButton } from '@/components/ui/form'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import { resolveDateRange, type DateRangePreset } from '@/lib/dates'
import { filterSales, filterExpenses, computeFinancialSummary, groupByDate, groupByCanteen, sumBy } from '@/lib/calculations'
import { computeAllVendorBalances, computeAllSalaryBalances } from '@/lib/balances'
import { computeClosingStock } from '@/lib/inventory'
import { formatPaise, paiseToRupees } from '@/lib/money'
import { downloadCsv, downloadExcel, buildFilename } from '@/lib/export'
import { checkReversalConflicts, reverseImport } from '@/lib/import/commit'
import type { ImportRecord } from '@/lib/types'
import { PdfReportBuilder } from '@/components/pdf-report-builder'

type ReportKey =
  | 'daily_sales' | 'monthly_sales' | 'daily_expenses' | 'monthly_expenses'
  | 'profit_summary' | 'canteen_comparison' | 'payment_method_summary'
  | 'vendor_outstanding' | 'salary_outstanding' | 'reconciliation'
  | 'inventory' | 'import_history'

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'daily_sales', label: 'Daily sales' },
  { key: 'monthly_sales', label: 'Monthly sales' },
  { key: 'daily_expenses', label: 'Daily expenses' },
  { key: 'monthly_expenses', label: 'Monthly expenses' },
  { key: 'profit_summary', label: 'Operating profit summary' },
  { key: 'canteen_comparison', label: 'Canteen comparison' },
  { key: 'payment_method_summary', label: 'Payment method summary' },
  { key: 'vendor_outstanding', label: 'Vendor outstanding balances' },
  { key: 'salary_outstanding', label: 'Salary outstanding balances' },
  { key: 'reconciliation', label: 'Reconciliation report' },
  { key: 'inventory', label: 'Inventory report' },
  { key: 'import_history', label: 'Import history' },
]

export default function ReportsPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const [canteenId, setCanteenId] = useState('all')
  const [preset, setPreset] = useState<DateRangePreset>('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [report, setReport] = useState<ReportKey>('profit_summary')
  const [reversing, setReversing] = useState<ImportRecord | null>(null)
  const [reversalConflicts, setReversalConflicts] = useState<string[]>([])
  const [pdfOpen, setPdfOpen] = useState(false)

  const range = useMemo(() => resolveDateRange(preset, customStart, customEnd), [preset, customStart, customEnd])
  const rangeLabel = `${range.start ?? 'all'}_to_${range.end ?? 'all'}`

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const filter = { canteenId, startDate: range.start, endDate: range.end }
  const sales = filterSales(data.sales, filter)
  const expenses = filterExpenses(data.expenses, filter)

  function canteenName(id: string) {
    return data!.canteens.find((c) => c.id === id)?.name ?? id
  }

  // --- Build table data for the selected report -----------------------
  type TableData = { title: string; headers: string[]; rows: (string | number)[][]; note?: string }

  function buildTable(): TableData {
    switch (report) {
      case 'daily_sales': {
        const grouped = groupByDate(sales)
        const rows = Array.from(grouped.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([date, rows]) => [date, rows.length, paiseToRupees(sumBy(rows, (r) => r.amountPaise))])
        return { title: 'Daily sales', headers: ['Date', 'Transactions', 'Total (INR)'], rows }
      }
      case 'monthly_sales': {
        const map = new Map<string, typeof sales>()
        for (const s of sales) {
          const month = s.date.slice(0, 7)
          map.set(month, [...(map.get(month) ?? []), s])
        }
        const rows = Array.from(map.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([month, rows]) => [month, rows.length, paiseToRupees(sumBy(rows, (r) => r.amountPaise))])
        return { title: 'Monthly sales', headers: ['Month', 'Transactions', 'Total (INR)'], rows }
      }
      case 'daily_expenses': {
        const grouped = groupByDate(expenses)
        const rows = Array.from(grouped.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([date, rows]) => [date, rows.length, paiseToRupees(sumBy(rows, (r) => r.amountPaise))])
        return { title: 'Daily expenses', headers: ['Date', 'Transactions', 'Total (INR)'], rows }
      }
      case 'monthly_expenses': {
        const map = new Map<string, typeof expenses>()
        for (const e of expenses) {
          const month = e.date.slice(0, 7)
          map.set(month, [...(map.get(month) ?? []), e])
        }
        const rows = Array.from(map.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([month, rows]) => [month, rows.length, paiseToRupees(sumBy(rows, (r) => r.amountPaise))])
        return { title: 'Monthly expenses', headers: ['Month', 'Transactions', 'Total (INR)'], rows }
      }
      case 'profit_summary': {
        const s = computeFinancialSummary(data!.sales, data!.expenses, filter)
        return {
          title: 'Operating profit summary',
          headers: ['Metric', 'Value'],
          rows: [
            ['Recognised sales', paiseToRupees(s.salesPaise)],
            ['Operating expenses', paiseToRupees(s.expensesPaise)],
            ['Operating profit', paiseToRupees(s.profitPaise)],
            ['Profit margin (%)', s.marginPercent === null ? '—' : s.marginPercent.toFixed(2)],
          ],
          note: 'Operational estimate only: recognised sales minus recognised operating expenses. Not an audited profit & loss statement.',
        }
      }
      case 'canteen_comparison': {
        const rows = data!.canteens.map((c) => {
          const s = computeFinancialSummary(data!.sales, data!.expenses, { ...filter, canteenId: c.id })
          return [c.name, paiseToRupees(s.salesPaise), paiseToRupees(s.expensesPaise), paiseToRupees(s.profitPaise), s.marginPercent === null ? '—' : s.marginPercent.toFixed(2)]
        })
        return { title: 'Canteen comparison', headers: ['Canteen', 'Sales (INR)', 'Expenses (INR)', 'Profit (INR)', 'Margin (%)'], rows }
      }
      case 'payment_method_summary': {
        const map = new Map<string, number>()
        for (const s of sales) map.set(s.paymentMethod, (map.get(s.paymentMethod) ?? 0) + s.amountPaise)
        const rows = Array.from(map.entries()).map(([method, paise]) => [method, paiseToRupees(paise)])
        return { title: 'Payment method summary (sales)', headers: ['Payment method', 'Total (INR)'], rows }
      }
      case 'vendor_outstanding': {
        const balances = computeAllVendorBalances(data!.vendors, data!.purchases, data!.vendorPayments)
        const rows = balances.map((b) => [
          data!.vendors.find((v) => v.id === b.vendorId)?.name ?? b.vendorId,
          paiseToRupees(b.totalPurchasedPaise),
          paiseToRupees(b.totalPaidPaise),
          paiseToRupees(b.outstandingPaise),
        ])
        return { title: 'Vendor outstanding balances', headers: ['Vendor', 'Total purchased (INR)', 'Total paid (INR)', 'Outstanding (INR)'], rows }
      }
      case 'salary_outstanding': {
        const balances = computeAllSalaryBalances(data!.staff, data!.salaryPayments)
        const rows = balances.map((b) => [
          data!.staff.find((s) => s.id === b.staffId)?.name ?? b.staffId,
          paiseToRupees(b.totalDuePaise),
          paiseToRupees(b.totalPaidPaise),
          paiseToRupees(b.outstandingPaise),
        ])
        return {
          title: 'Salary outstanding balances',
          headers: ['Staff', 'Total due (INR)', 'Total paid (INR)', 'Outstanding (INR)'],
          rows,
          note: data!.staff.length === 0 ? 'No staff records exist yet. Add staff from Staff & Salaries.' : undefined,
        }
      }
      case 'reconciliation': {
        if (data!.collections.length === 0) {
          return { title: 'Reconciliation report', headers: ['Note'], rows: [], note: 'No collection records exist yet, so sales cannot be reconciled against collections. Record collections from the Collections page.' }
        }
        const rows = data!.collections
          .filter((c) => (canteenId === 'all' || c.canteenId === canteenId) && (!range.start || c.date >= range.start) && (!range.end || c.date <= range.end))
          .map((c) => [c.date, canteenName(c.canteenId), c.paymentMethod, paiseToRupees(c.expectedPaise), paiseToRupees(c.actualPaise), paiseToRupees(c.actualPaise - c.expectedPaise), c.reviewed ? 'Yes' : 'No'])
        return { title: 'Reconciliation report', headers: ['Date', 'Canteen', 'Method', 'Expected (INR)', 'Actual (INR)', 'Discrepancy (INR)', 'Reviewed'], rows }
      }
      case 'inventory': {
        if (data!.inventoryItems.length === 0) {
          return { title: 'Inventory report', headers: ['Note'], rows: [], note: 'No inventory items exist yet. Add items from the Inventory page.' }
        }
        const rows = data!.inventoryItems.map((item) => {
          const closing = computeClosingStock(item, data!.inventoryMovements)
          return [item.name, item.category, item.unit, item.openingStock, closing, closing <= item.lowStockThreshold ? 'Low stock' : 'OK']
        })
        return { title: 'Inventory report', headers: ['Item', 'Category', 'Unit', 'Opening stock', 'Closing stock', 'Status'], rows }
      }
      case 'import_history': {
        const rows = data!.imports.map((imp) => [imp.filename, imp.category, canteenName(imp.canteenId), imp.importedAt.slice(0, 10), imp.totalRows, imp.acceptedRows, imp.rejectedRows, imp.duplicateRows, imp.status])
        return { title: 'Import history', headers: ['Filename', 'Category', 'Canteen', 'Date', 'Total rows', 'Accepted', 'Rejected', 'Duplicates', 'Status'], rows }
      }
    }
  }

  const table = buildTable()

  function exportCsv() {
    const ok = downloadCsv(buildFilename(report, 'csv', rangeLabel), table.headers, table.rows)
    notify(ok ? 'Report exported (CSV)' : 'Export failed', ok ? 'success' : 'error')
  }

  function exportExcel() {
    const ok = downloadExcel(buildFilename(report, 'xlsx', rangeLabel), table.headers, table.rows)
    notify(ok ? 'Report exported (Excel)' : 'Export failed', ok ? 'success' : 'error')
  }

  function printReport() {
    window.print()
  }

  async function openReversalCheck(imp: ImportRecord) {
    const check = await checkReversalConflicts(imp)
    setReversalConflicts(check.conflicts)
    setReversing(imp)
  }

  async function confirmReversal() {
    if (!reversing) return
    await reverseImport(reversing)
    await refresh()
    setReversing(null)
    notify('Import reversed. The import history entry is preserved and marked Reversed.')
  }

  return (
    <AppShell title="Reports & Exports" subtitle="Generate reports from your actual stored records and export or print them." badge="Local data">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between print:hidden">
        <div className="flex flex-wrap gap-2">
          <select
            className="h-10 rounded-lg border border-[#dfe6df] px-3 text-sm"
            value={report}
            onChange={(e) => setReport(e.target.value as ReportKey)}
            aria-label="Select report"
          >
            {REPORTS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <CanteenFilter canteens={data.canteens} value={canteenId} onChange={setCanteenId} />
          <DateRangeFilter preset={preset} onPresetChange={setPreset} customStart={customStart} customEnd={customEnd} onCustomStartChange={setCustomStart} onCustomEndChange={setCustomEnd} />
        </div>
        <div className="flex gap-2">
          <SecondaryButton onClick={exportCsv} disabled={table.rows.length === 0}>
            <Download className="size-4" />
            CSV
          </SecondaryButton>
          <SecondaryButton onClick={exportExcel} disabled={table.rows.length === 0}>
            <Download className="size-4" />
            Excel
          </SecondaryButton>
          <SecondaryButton onClick={printReport}>
            <Printer className="size-4" />
            Print / Save as PDF
          </SecondaryButton>
          <PrimaryButton onClick={() => setPdfOpen(true)}>
            <FileDown className="size-4" />
            Create PDF report
          </PrimaryButton>
        </div>
      </div>

      <section className="rounded-xl border border-[#e3e9e3] bg-white p-5 print:border-none print:p-0">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-bold">{table.title}</h3>
          <span className="text-xs text-[#89958d]">
            {canteenId === 'all' ? 'All canteens' : canteenName(canteenId)} · {range.start ?? 'All time'} to {range.end ?? 'present'}
          </span>
        </div>
        {table.note && <p className="mb-3 text-xs text-amber-700">{table.note}</p>}
        {table.rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#89958d]">No data available for this report and filter selection.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-[#89958d]">
                  {table.headers.map((h) => (
                    <th key={h} className="p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-[#eff2ef]">
                    {row.map((cell, ci) => (
                      <td key={ci} className="p-2">
                        {String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {report === 'import_history' && data.imports.length > 0 && (
        <section className="mt-5 rounded-xl border border-[#e3e9e3] bg-white p-5 print:hidden">
          <h3 className="mb-3 font-bold">Reverse an import</h3>
          <p className="mb-3 text-xs text-[#89958d]">
            Reversing deletes only the records that specific import created. The import history entry is kept and marked Reversed.
          </p>
          {data.imports
            .filter((imp) => imp.status === 'Imported')
            .map((imp) => (
              <div key={imp.id} className="flex items-center justify-between border-b border-[#eff2ef] py-2 text-xs last:border-0">
                <span>
                  {imp.filename} · {imp.acceptedRows} records · {imp.importedAt.slice(0, 10)}
                </span>
                <SecondaryButton onClick={() => openReversalCheck(imp)} className="text-amber-700">
                  <RotateCcw className="size-3.5" />
                  Reverse
                </SecondaryButton>
              </div>
            ))}
          {data.imports.every((imp) => imp.status !== 'Imported') && <p className="text-xs text-[#89958d]">No active imports to reverse.</p>}
        </section>
      )}

      {reversing && (
        <ConfirmDialog
          title="Reverse import"
          message={
            reversalConflicts.length > 0
              ? `Warning — some records from "${reversing.filename}" were edited after import or are already missing:\n${reversalConflicts.join('\n')}\n\nThey will still be removed if you continue. Unrelated records are never touched.`
              : `This will delete the ${reversing.recordIds.length} record(s) created by "${reversing.filename}" and mark the import as Reversed. The import history entry is preserved.`
          }
          confirmLabel="Reverse import"
          danger
          onConfirm={confirmReversal}
          onCancel={() => setReversing(null)}
        />
      )}

      {pdfOpen && <PdfReportBuilder data={data} onClose={() => setPdfOpen(false)} />}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}
