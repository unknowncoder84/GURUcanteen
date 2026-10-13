import { describe, it, expect } from 'vitest'
import { computeFinancialSummary, percentChange, sumSalesPaise, sumOperatingExpensesPaise } from '@/lib/calculations'
import type { ExpenseRecord, SalesRecord } from '@/lib/types'

function sale(partial: Partial<SalesRecord>): SalesRecord {
  return {
    id: 'sale_1',
    canteenId: 'c1',
    date: '2026-10-01',
    amountPaise: 100000,
    paymentMethod: 'Cash',
    reference: '',
    description: 'test',
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  }
}

function expense(partial: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 'expense_1',
    canteenId: 'c1',
    date: '2026-10-01',
    amountPaise: 50000,
    category: 'Other',
    paymentMethod: 'Cash',
    reference: '',
    description: 'test',
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  }
}

describe('financial calculations', () => {
  it('computes sales, expenses, profit, and margin from records', () => {
    const sales = [sale({ amountPaise: 100000 }), sale({ id: 's2', amountPaise: 50000, canteenId: 'c2' })]
    const expenses = [expense({ amountPaise: 40000 })]
    const summary = computeFinancialSummary(sales, expenses, {})
    expect(summary.salesPaise).toBe(150000)
    expect(summary.expensesPaise).toBe(40000)
    expect(summary.profitPaise).toBe(110000)
    expect(summary.marginPercent).toBeCloseTo((110000 / 150000) * 100)
  })

  it('returns null margin when sales are zero (never divides by zero)', () => {
    const summary = computeFinancialSummary([], [expense({ amountPaise: 1000 })], {})
    expect(summary.salesPaise).toBe(0)
    expect(summary.marginPercent).toBeNull()
  })

  it('excludes reversed sales and expenses from totals', () => {
    const sales = [sale({ amountPaise: 100000 }), sale({ id: 's2', amountPaise: 50000, reversed: true })]
    expect(sumSalesPaise(sales, {})).toBe(100000)
  })

  it('filters by canteen', () => {
    const sales = [sale({ canteenId: 'c1', amountPaise: 100000 }), sale({ id: 's2', canteenId: 'c2', amountPaise: 50000 })]
    expect(sumSalesPaise(sales, { canteenId: 'c1' })).toBe(100000)
    expect(sumSalesPaise(sales, { canteenId: 'all' })).toBe(150000)
  })

  it('filters by date range', () => {
    const sales = [sale({ date: '2026-10-01', amountPaise: 100000 }), sale({ id: 's2', date: '2026-09-01', amountPaise: 50000 })]
    expect(sumSalesPaise(sales, { startDate: '2026-10-01', endDate: '2026-10-31' })).toBe(100000)
  })

  it('excludes liability-settlement expense rows from operating expenses to avoid double counting vendor payments', () => {
    const expenses = [
      expense({ amountPaise: 40000, isLiabilitySettlement: false }),
      expense({ id: 'e2', amountPaise: 20000, isLiabilitySettlement: true }),
    ]
    expect(sumOperatingExpensesPaise(expenses, {})).toBe(40000)
  })

  it('percentChange handles a zero previous-period baseline without dividing by zero', () => {
    expect(percentChange(100, 0)).toBeNull()
    expect(percentChange(0, 0)).toBe(0)
    expect(percentChange(150, 100)).toBeCloseTo(50)
  })
})

describe('combined dashboard totals vs per-canteen comparison (owner dashboard views)', () => {
  it('combined totals equal the sum of each canteen computed independently for the same date range', () => {
    const sales = [
      sale({ id: 's1', canteenId: 'c1', amountPaise: 100000, date: '2026-10-05' }),
      sale({ id: 's2', canteenId: 'c2', amountPaise: 70000, date: '2026-10-05' }),
    ]
    const expenses = [
      expense({ id: 'e1', canteenId: 'c1', amountPaise: 30000, date: '2026-10-05' }),
      expense({ id: 'e2', canteenId: 'c2', amountPaise: 20000, date: '2026-10-05' }),
    ]
    const combined = computeFinancialSummary(sales, expenses, { canteenId: 'all', startDate: '2026-10-01', endDate: '2026-10-31' })
    const c1 = computeFinancialSummary(sales, expenses, { canteenId: 'c1', startDate: '2026-10-01', endDate: '2026-10-31' })
    const c2 = computeFinancialSummary(sales, expenses, { canteenId: 'c2', startDate: '2026-10-01', endDate: '2026-10-31' })
    expect(combined.salesPaise).toBe(c1.salesPaise + c2.salesPaise)
    expect(combined.expensesPaise).toBe(c1.expensesPaise + c2.expensesPaise)
    expect(combined.profitPaise).toBe(c1.profitPaise + c2.profitPaise)
  })

  it('comparison view uses the same date range for both canteens (no mixed periods)', () => {
    const sales = [
      sale({ id: 's1', canteenId: 'c1', amountPaise: 100000, date: '2026-10-05' }),
      sale({ id: 's2', canteenId: 'c2', amountPaise: 70000, date: '2026-09-05' }), // outside the shared range
    ]
    const sharedRange = { startDate: '2026-10-01', endDate: '2026-10-31' }
    const c1 = computeFinancialSummary(sales, [], { canteenId: 'c1', ...sharedRange })
    const c2 = computeFinancialSummary(sales, [], { canteenId: 'c2', ...sharedRange })
    expect(c1.salesPaise).toBe(100000)
    expect(c2.salesPaise).toBe(0) // correctly excluded since it falls outside the shared range
  })

  it('a canteen with zero transactions in the selected period shows a clean zero, not an error', () => {
    const summary = computeFinancialSummary([], [], { canteenId: 'c-empty', startDate: '2026-10-01', endDate: '2026-10-31' })
    expect(summary.salesPaise).toBe(0)
    expect(summary.expensesPaise).toBe(0)
    expect(summary.profitPaise).toBe(0)
    expect(summary.marginPercent).toBeNull()
  })
})
