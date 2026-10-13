// Local PDF report generation using jsPDF. Builds a real PDF document with
// only the sections the owner selected, populated from actual filtered
// records — never a screenshot of the dashboard. Nothing is sent over the
// network; the PDF is generated and downloaded entirely in the browser.

import { jsPDF } from 'jspdf'
import type {
  AppData,
} from '@/lib/hooks/useAppData'
import { computeFinancialSummary, filterSales, filterExpenses, groupByCanteen, groupByDate, sumBy, type CalculationFilter } from '@/lib/calculations'
import { computeAllVendorBalances, computeAllSalaryBalances } from '@/lib/balances'
import { computeClosingStock } from '@/lib/inventory'
import { formatPaise, paiseToRupees } from '@/lib/money'
import { validateSharingRules, computeDistribution } from '@/lib/profitSharing'

export type ReportSectionKey =
  | 'business_summary'
  | 'sales_by_canteen'
  | 'expenses_by_category'
  | 'payment_method_breakdown'
  | 'daily_trend'
  | 'vendor_outstanding'
  | 'salary_outstanding'
  | 'purchase_summary'
  | 'reconciliation'
  | 'inventory_summary'
  | 'profit_sharing'
  | 'recent_transactions'
  | 'import_history'
  | 'data_quality_warnings'
  | 'notes'

export interface ReportSectionDefinition {
  key: ReportSectionKey
  label: string
  /** Returns false (section should be labelled unavailable) when there is
   *  not enough data/implementation to produce a meaningful section. */
  isAvailable: (data: AppData) => boolean
  unavailableReason?: (data: AppData) => string
}

export const REPORT_SECTIONS: ReportSectionDefinition[] = [
  { key: 'business_summary', label: 'Business summary (sales, expenses, profit, margin)', isAvailable: () => true },
  { key: 'sales_by_canteen', label: 'Sales breakdown by canteen', isAvailable: (d) => d.canteens.length > 0 },
  { key: 'expenses_by_category', label: 'Expenses by category', isAvailable: () => true },
  { key: 'payment_method_breakdown', label: 'Cash / UPI / card / other payment breakdown', isAvailable: () => true },
  { key: 'daily_trend', label: 'Daily sales trend', isAvailable: () => true },
  {
    key: 'vendor_outstanding',
    label: 'Vendor outstanding balances',
    isAvailable: (d) => d.vendors.length > 0,
    unavailableReason: () => 'No vendors recorded yet.',
  },
  {
    key: 'salary_outstanding',
    label: 'Salary outstanding balances',
    isAvailable: (d) => d.staff.length > 0,
    unavailableReason: () => 'No staff recorded yet.',
  },
  {
    key: 'purchase_summary',
    label: 'Purchase summary',
    isAvailable: (d) => d.purchases.length > 0,
    unavailableReason: () => 'No purchases recorded yet.',
  },
  {
    key: 'reconciliation',
    label: 'Collections and reconciliation',
    isAvailable: (d) => d.collections.length > 0,
    unavailableReason: () => 'No collection records exist, so sales cannot be reconciled against collections.',
  },
  {
    key: 'inventory_summary',
    label: 'Inventory summary',
    isAvailable: (d) => d.inventoryItems.length > 0,
    unavailableReason: () => 'No inventory items recorded yet.',
  },
  {
    key: 'profit_sharing',
    label: 'Profit-sharing calculation',
    isAvailable: (d) => validateSharingRules(d.profitSharingRules).valid,
    unavailableReason: () => 'No valid profit-sharing agreement is configured (active shares must total exactly 100%).',
  },
  { key: 'recent_transactions', label: 'Recent transactions', isAvailable: () => true },
  { key: 'import_history', label: 'Import history', isAvailable: (d) => d.imports.length > 0, unavailableReason: () => 'No imports on file yet.' },
  { key: 'data_quality_warnings', label: 'Data-quality warnings', isAvailable: () => true },
  { key: 'notes', label: 'Notes and explanations', isAvailable: () => true },
]

export interface ReportConfig {
  businessName: string
  reportTitle: string
  canteenScope: 'combined' | string // 'combined' or a specific canteen id
  compareCanteens: boolean
  startDate?: string
  endDate?: string
  periodLabel: string
  sections: Set<ReportSectionKey>
  compact: boolean
  includeTransactionTable: boolean
  includeCharts: boolean
  includeNotes: boolean
  orientation: 'portrait' | 'landscape'
  notesText: string
}

const MARGIN = 14

/** Build and return the jsPDF document (not yet saved) so callers can save,
 *  preview the byte size, or test content without triggering a download. */
export function buildReportDocument(data: AppData, config: ReportConfig): jsPDF {
  const doc = new jsPDF({ orientation: config.orientation, unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = MARGIN

  function ensureSpace(lines = 1) {
    const lineHeight = config.compact ? 5 : 6.5
    if (y + lines * lineHeight > doc.internal.pageSize.getHeight() - MARGIN) {
      doc.addPage()
      y = MARGIN
    }
  }

  function heading(text: string, size = 13) {
    ensureSpace(2)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(size)
    doc.text(text, MARGIN, y)
    y += size === 13 ? 7 : 6
    doc.setFont('helvetica', 'normal')
  }

  function paragraph(text: string, size = 10) {
    const maxWidth = pageWidth - MARGIN * 2
    const lines = doc.splitTextToSize(text, maxWidth)
    doc.setFontSize(size)
    for (const line of lines) {
      ensureSpace(1)
      doc.text(line, MARGIN, y)
      y += config.compact ? 5 : 6
    }
  }

  function table(headers: string[], rows: (string | number)[][], colWidths?: number[]) {
    const maxWidth = pageWidth - MARGIN * 2
    const widths = colWidths ?? headers.map(() => maxWidth / headers.length)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    ensureSpace(1)
    let x = MARGIN
    headers.forEach((h, i) => {
      doc.text(String(h), x, y)
      x += widths[i]
    })
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setDrawColor(220)
    doc.line(MARGIN, y - 3.5, pageWidth - MARGIN, y - 3.5)
    for (const row of rows) {
      ensureSpace(1)
      x = MARGIN
      row.forEach((cell, i) => {
        doc.text(String(cell), x, y)
        x += widths[i]
      })
      y += config.compact ? 4.5 : 5.5
    }
    y += 2
  }

  function unavailable(reason: string) {
    doc.setTextColor(150, 100, 0)
    paragraph(`Not available: ${reason}`, 9)
    doc.setTextColor(0, 0, 0)
  }

  const filter: CalculationFilter = {
    canteenId: config.canteenScope === 'combined' ? 'all' : config.canteenScope,
    startDate: config.startDate,
    endDate: config.endDate,
  }

  // --- Header -------------------------------------------------------------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(config.businessName, MARGIN, y)
  y += 7
  doc.setFontSize(12)
  doc.text(config.reportTitle, MARGIN, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100)
  const scopeLabel =
    config.canteenScope === 'combined'
      ? 'All canteens (combined)'
      : data.canteens.find((c) => c.id === config.canteenScope)?.name ?? config.canteenScope
  doc.text(`Period: ${config.periodLabel}  ·  Canteen: ${scopeLabel}  ·  Currency: INR`, MARGIN, y)
  y += 5
  doc.text(`Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (Asia/Kolkata)`, MARGIN, y)
  y += 7
  doc.setTextColor(0)
  doc.setDrawColor(180)
  doc.line(MARGIN, y, pageWidth - MARGIN, y)
  y += 6

  const sales = filterSales(data.sales, filter)
  const expenses = filterExpenses(data.expenses, filter)
  const summary = computeFinancialSummary(data.sales, data.expenses, filter)

  if (config.sections.has('business_summary')) {
    heading('Business summary')
    paragraph(`Recognised sales: ${formatPaise(summary.salesPaise)}`)
    paragraph(`Operating expenses: ${formatPaise(summary.expensesPaise)}`)
    paragraph(`Operating profit: ${formatPaise(summary.profitPaise)}`)
    paragraph(`Profit margin: ${summary.marginPercent === null ? '—' : summary.marginPercent.toFixed(1) + '%'}`)
    paragraph('This is an operational estimate (recognised sales minus recognised operating expenses), not an audited profit & loss statement.', 8)
    y += 2
  }

  if (config.sections.has('sales_by_canteen')) {
    heading('Sales breakdown by canteen')
    const rows = data.canteens.map((c) => {
      const s = computeFinancialSummary(data.sales, data.expenses, { ...filter, canteenId: c.id })
      return [c.name, formatPaise(s.salesPaise), formatPaise(s.expensesPaise), formatPaise(s.profitPaise)]
    })
    if (config.includeTransactionTable) {
      table(['Canteen', 'Sales', 'Expenses', 'Profit'], rows)
    }
  }

  if (config.sections.has('expenses_by_category')) {
    heading('Expenses by category')
    const map = new Map<string, number>()
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amountPaise)
    const rows = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, paise]) => [cat, formatPaise(paise)])
    if (rows.length === 0) unavailable('No expenses in the selected period.')
    else if (config.includeTransactionTable) table(['Category', 'Total'], rows)
  }

  if (config.sections.has('payment_method_breakdown')) {
    heading('Payment method breakdown (sales)')
    const map = new Map<string, number>()
    for (const s of sales) map.set(s.paymentMethod, (map.get(s.paymentMethod) ?? 0) + s.amountPaise)
    const rows = Array.from(map.entries()).map(([method, paise]) => [method, formatPaise(paise)])
    if (rows.length === 0) unavailable('No sales in the selected period.')
    else table(['Method', 'Total'], rows)
  }

  if (config.sections.has('daily_trend')) {
    heading('Daily sales trend')
    const grouped = groupByDate(sales)
    const rows = Array.from(grouped.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, rows]) => [date, formatPaise(sumBy(rows, (r) => r.amountPaise))])
    if (rows.length === 0) unavailable('No sales in the selected period.')
    else if (config.includeCharts || config.includeTransactionTable) table(['Date', 'Sales'], rows)
  }

  if (config.sections.has('vendor_outstanding')) {
    heading('Vendor outstanding balances')
    if (data.vendors.length === 0) {
      unavailable('No vendors recorded yet.')
    } else {
      const balances = computeAllVendorBalances(data.vendors, data.purchases, data.vendorPayments).filter((b) => b.outstandingPaise > 0)
      if (balances.length === 0) paragraph('No outstanding vendor balances.')
      else
        table(
          ['Vendor', 'Purchased', 'Paid', 'Outstanding'],
          balances.map((b) => [
            data.vendors.find((v) => v.id === b.vendorId)?.name ?? b.vendorId,
            formatPaise(b.totalPurchasedPaise),
            formatPaise(b.totalPaidPaise),
            formatPaise(b.outstandingPaise),
          ])
        )
    }
  }

  if (config.sections.has('salary_outstanding')) {
    heading('Salary outstanding balances')
    if (data.staff.length === 0) {
      unavailable('No staff recorded yet.')
    } else {
      const balances = computeAllSalaryBalances(data.staff, data.salaryPayments).filter((b) => b.outstandingPaise > 0)
      if (balances.length === 0) paragraph('No outstanding salary balances.')
      else
        table(
          ['Staff', 'Due', 'Paid', 'Outstanding'],
          balances.map((b) => [
            data.staff.find((s) => s.id === b.staffId)?.name ?? b.staffId,
            formatPaise(b.totalDuePaise),
            formatPaise(b.totalPaidPaise),
            formatPaise(b.outstandingPaise),
          ])
        )
    }
  }

  if (config.sections.has('purchase_summary')) {
    heading('Purchase summary')
    const purchasesInRange = data.purchases.filter(
      (p) => (filter.canteenId === 'all' || p.canteenId === filter.canteenId) && (!filter.startDate || p.date >= filter.startDate) && (!filter.endDate || p.date <= filter.endDate)
    )
    if (purchasesInRange.length === 0) unavailable('No purchases recorded in the selected period.')
    else {
      const total = sumBy(purchasesInRange, (p) => p.totalPaise)
      paragraph(`Total purchases: ${formatPaise(total)} across ${purchasesInRange.length} record(s).`)
      if (config.includeTransactionTable) {
        table(
          ['Date', 'Vendor', 'Item', 'Total'],
          purchasesInRange.slice(0, 30).map((p) => [p.date, data.vendors.find((v) => v.id === p.vendorId)?.name ?? '—', p.itemDescription, formatPaise(p.totalPaise)])
        )
      }
    }
  }

  if (config.sections.has('reconciliation')) {
    heading('Collections and reconciliation')
    if (data.collections.length === 0) {
      unavailable('No collection records exist, so sales cannot be reconciled against collections.')
    } else {
      const inRange = data.collections.filter(
        (c) => (filter.canteenId === 'all' || c.canteenId === filter.canteenId) && (!filter.startDate || c.date >= filter.startDate) && (!filter.endDate || c.date <= filter.endDate)
      )
      if (inRange.length === 0) paragraph('No collection records in the selected period.')
      else
        table(
          ['Date', 'Method', 'Expected', 'Actual', 'Discrepancy'],
          inRange.map((c) => [c.date, c.paymentMethod, formatPaise(c.expectedPaise), formatPaise(c.actualPaise), formatPaise(c.actualPaise - c.expectedPaise)])
        )
    }
  }

  if (config.sections.has('inventory_summary')) {
    heading('Inventory summary')
    if (data.inventoryItems.length === 0) {
      unavailable('No inventory items recorded yet.')
    } else {
      table(
        ['Item', 'Unit', 'Closing stock', 'Status'],
        data.inventoryItems.map((item) => {
          const closing = computeClosingStock(item, data.inventoryMovements)
          return [item.name, item.unit, closing, closing <= item.lowStockThreshold ? 'Low stock' : 'OK']
        })
      )
      paragraph('Inventory cost is not included in the profit calculation above.', 8)
    }
  }

  if (config.sections.has('profit_sharing')) {
    heading('Profit-sharing calculation')
    const validation = validateSharingRules(data.profitSharingRules)
    if (!validation.valid) {
      unavailable('No valid profit-sharing agreement configured (active shares must total exactly 100%).')
    } else {
      const dist = computeDistribution(data.profitSharingRules, Math.max(0, summary.profitPaise))
      paragraph(`Amount eligible for distribution (operating profit, provisional estimate): ${formatPaise(dist.distributableAmountPaise)}`)
      table(
        ['Party', 'Percentage', 'Amount'],
        dist.shares.map((s) => [s.partyName, `${s.percentage}%`, formatPaise(s.amountPaise)])
      )
      paragraph('This is a provisional estimate derived from the operating profit figure above, not an audited or legally approved distribution.', 8)
    }
  }

  if (config.sections.has('recent_transactions') && config.includeTransactionTable) {
    heading('Recent transactions')
    const recentSales = [...sales].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15)
    if (recentSales.length === 0) unavailable('No sales in the selected period.')
    else table(['Date', 'Description', 'Amount'], recentSales.map((s) => [s.date, s.description, formatPaise(s.amountPaise)]))
  }

  if (config.sections.has('import_history')) {
    heading('Import history')
    if (data.imports.length === 0) {
      unavailable('No imports on file yet.')
    } else {
      table(
        ['Filename', 'Category', 'Date', 'Accepted', 'Status'],
        data.imports.slice(0, 20).map((imp) => [imp.filename, imp.category, imp.importedAt.slice(0, 10), `${imp.acceptedRows}/${imp.totalRows}`, imp.status])
      )
    }
  }

  if (config.sections.has('data_quality_warnings')) {
    heading('Data-quality warnings')
    const warnings: string[] = []
    const failedImports = data.imports.filter((i) => i.status === 'Failed')
    if (failedImports.length > 0) warnings.push(`${failedImports.length} import(s) failed and were not applied.`)
    const highRejection = data.imports.filter((i) => i.totalRows > 0 && i.rejectedRows / i.totalRows > 0.2)
    if (highRejection.length > 0) warnings.push(`${highRejection.length} import(s) had more than 20% of rows rejected.`)
    if (data.vendors.length === 0 && data.purchases.length > 0) warnings.push('Purchases exist without any vendor records.')
    if (warnings.length === 0) paragraph('No data-quality warnings detected for the current dataset.')
    else warnings.forEach((w) => paragraph(`• ${w}`))
  }

  if (config.sections.has('notes') && config.includeNotes && config.notesText.trim()) {
    heading('Notes and explanations')
    paragraph(config.notesText)
  }

  return doc
}

export function saveReportDocument(doc: jsPDF, filename: string): void {
  doc.save(filename)
}
