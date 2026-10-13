// Central financial calculation service.
// All pages MUST use these functions instead of implementing their own
// formulas, so sales/expense/profit figures are always consistent.
//
// Documented business rules:
// - Recognised sales = sum of non-reversed SalesRecord rows in range.
// - Operating expenses = sum of non-reversed ExpenseRecord rows in range,
//   EXCLUDING rows flagged isLiabilitySettlement (those are vendor payments
//   that settle a Purchase already accounted for, so they are not counted
//   again as a fresh operating expense).
// - Operating profit = Recognised sales - Operating expenses.
// - Profit margin = Operating profit / Recognised sales * 100, or "—" if
//   sales are zero (never divide by zero).
// - Collections are a separate reconciliation concept and are NEVER added to
//   sales. Vendor payments that are not liability settlements are not added
//   as new expenses twice.
// This is an operational estimate, not an audited profit & loss statement:
// it does not implement accrual accounting, COGS from inventory valuation,
// or shared cost allocation.

import type { ExpenseRecord, SalesRecord } from '@/lib/types'
import { isDateInRange } from '@/lib/dates'

export interface CalculationFilter {
  canteenId?: string // undefined or 'all' means all canteens
  startDate?: string
  endDate?: string
}

function matchesFilter(canteenId: string, date: string, filter: CalculationFilter): boolean {
  if (filter.canteenId && filter.canteenId !== 'all' && canteenId !== filter.canteenId) return false
  if (!isDateInRange(date, filter.startDate, filter.endDate)) return false
  return true
}

export function filterSales(sales: SalesRecord[], filter: CalculationFilter): SalesRecord[] {
  return sales.filter((r) => !r.reversed && matchesFilter(r.canteenId, r.date, filter))
}

export function filterExpenses(expenses: ExpenseRecord[], filter: CalculationFilter): ExpenseRecord[] {
  return expenses.filter((r) => !r.reversed && matchesFilter(r.canteenId, r.date, filter))
}

export function sumSalesPaise(sales: SalesRecord[], filter: CalculationFilter): number {
  return filterSales(sales, filter).reduce((n, r) => n + r.amountPaise, 0)
}

/** Operating expenses, excluding vendor-payment rows that merely settle an
 *  already-recognised purchase liability (prevents double counting). */
export function sumOperatingExpensesPaise(expenses: ExpenseRecord[], filter: CalculationFilter): number {
  return filterExpenses(expenses, filter)
    .filter((r) => !r.isLiabilitySettlement)
    .reduce((n, r) => n + r.amountPaise, 0)
}

export interface FinancialSummary {
  salesPaise: number
  expensesPaise: number
  profitPaise: number
  marginPercent: number | null // null means "—" (sales are zero)
}

export function computeFinancialSummary(
  sales: SalesRecord[],
  expenses: ExpenseRecord[],
  filter: CalculationFilter
): FinancialSummary {
  const salesPaise = sumSalesPaise(sales, filter)
  const expensesPaise = sumOperatingExpensesPaise(expenses, filter)
  const profitPaise = salesPaise - expensesPaise
  const marginPercent = salesPaise === 0 ? null : (profitPaise / salesPaise) * 100
  return { salesPaise, expensesPaise, profitPaise, marginPercent }
}

/** Percentage change between two periods, handling zero/missing previous data. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null // null = "—" (no meaningful baseline)
  return ((current - previous) / previous) * 100
}

export function groupByCanteen<T extends { canteenId: string }>(records: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const r of records) {
    const list = map.get(r.canteenId) ?? []
    list.push(r)
    map.set(r.canteenId, list)
  }
  return map
}

export function groupByDate<T extends { date: string }>(records: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const r of records) {
    const list = map.get(r.date) ?? []
    list.push(r)
    map.set(r.date, list)
  }
  return map
}

export function sumBy<T>(records: T[], pick: (r: T) => number): number {
  return records.reduce((n, r) => n + pick(r), 0)
}

/** Build a daily trend series (date -> total paise) sorted ascending by date. */
export function buildDailyTrend<T extends { date: string }>(records: T[], pick: (r: T) => number): { date: string; valuePaise: number }[] {
  const grouped = groupByDate(records)
  return Array.from(grouped.entries())
    .map(([date, rows]) => ({ date, valuePaise: sumBy(rows, pick) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}
