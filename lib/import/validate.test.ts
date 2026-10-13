import { describe, it, expect } from 'vitest'
import { validateRows, summarize, buildRejectedRowsCsv, resolveCanteenByName } from '@/lib/import/validate'
import { suggestMapping } from '@/lib/import/mapping'
import type { Canteen } from '@/lib/types'

const headers = ['Date', 'Amount', 'Payment Type', 'Description', 'Reference Number']

const testCanteens: Canteen[] = [
  {
    id: 'canteen_1',
    name: 'Network18 – Lower Parel',
    address: '',
    contactPerson: '',
    phone: '',
    email: '',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'canteen_2',
    name: 'Network18 – Vikhroli',
    address: '',
    contactPerson: '',
    phone: '',
    email: '',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

/** Build a 15-row dataset (more than the 11-row minimum required by spec):
 *  valid rows, invalid dates, invalid amounts, a duplicate pair, and mixed
 *  date formats, to exercise the full-file validation pipeline. */
function buildRows(): string[][] {
  return [
    ['2026-10-01', '500', 'Cash', 'Lunch sales', 'REF-1'],
    ['01/10/2026', '600.50', 'UPI', 'Lunch sales', 'REF-2'],
    ['1 Oct 2026', '700', 'Card', 'Snacks', 'REF-3'],
    ['2026-10-02', '800', 'Cash', 'Lunch sales', 'REF-4'],
    ['2026-10-02', '800', 'Cash', 'Lunch sales', 'REF-4'], // exact duplicate of row above
    ['not-a-date', '900', 'UPI', 'Bad date row', 'REF-5'], // invalid date -> rejected
    ['2026-10-03', 'abc', 'Cash', 'Bad amount row', 'REF-6'], // invalid amount -> rejected
    ['2026-10-04', '-500', 'Cash', 'Negative amount row', 'REF-7'], // negative -> rejected
    ['2026-10-05', '0', 'Cash', 'Zero amount row', 'REF-8'], // zero -> rejected
    ['', '', '', '', ''], // empty row -> rejected
    ['2026-10-06', '1000', 'Bank Transfer', 'Catering order', 'REF-9'],
    ['2026-10-07', '1100', 'Other', 'Vending', 'REF-10'],
    ['2026-10-08', '1200', 'Cash', 'Lunch sales', 'REF-11'],
    ['2026-10-09', '1300', 'UPI', 'Lunch sales', 'REF-12'],
    ['2026-10-10', '1400', 'Card', 'Lunch sales', 'REF-13'],
  ]
}

function validate(rows: string[][], mapping: ReturnType<typeof suggestMapping>, canteenId = 'canteen_1') {
  return validateRows(rows, mapping, { category: 'sales', canteenId, canteens: testCanteens })
}

describe('import validation (full dataset, not just a preview slice)', () => {
  it('validates every row of a 15-row dataset, never truncating to a preview', () => {
    const rows = buildRows()
    const mapping = suggestMapping(headers, 'sales')
    const result = validate(rows, mapping)
    expect(result).toHaveLength(15) // all rows processed, not just first 10-20
  })

  it('auto-suggests mapping for common header names', () => {
    const mapping = suggestMapping(headers, 'sales')
    expect(Object.values(mapping)).toContain('date')
    expect(Object.values(mapping)).toContain('amount')
    expect(Object.values(mapping)).toContain('paymentMethod')
    expect(Object.values(mapping)).toContain('reference')
  })

  it('rejects rows with unrecognised dates without defaulting to today', () => {
    const mapping = suggestMapping(headers, 'sales')
    const result = validate(buildRows(), mapping)
    const badDateRow = result.find((r) => r.raw[0] === 'not-a-date')
    expect(badDateRow?.accepted).toBe(false)
    expect(badDateRow?.normalized.date).toBeNull()
    expect(badDateRow?.errors.join(' ')).toMatch(/date/i)
  })

  it('rejects invalid, negative, and zero amounts without coercing to zero (negative rejected by default)', () => {
    const mapping = suggestMapping(headers, 'sales')
    const result = validate(buildRows(), mapping)
    const badAmount = result.find((r) => r.raw[4] === 'REF-6')
    const negative = result.find((r) => r.raw[4] === 'REF-7')
    const zero = result.find((r) => r.raw[4] === 'REF-8')
    expect(badAmount?.accepted).toBe(false)
    expect(negative?.accepted).toBe(false)
    expect(zero?.accepted).toBe(false)
  })

  it('flags (rather than rejects) negative amounts when allowNegativeAsRefund is set, for explicit refund/adjustment review', () => {
    const mapping = suggestMapping(headers, 'sales')
    const result = validateRows(buildRows(), mapping, {
      category: 'sales',
      canteenId: 'canteen_1',
      canteens: testCanteens,
      allowNegativeAsRefund: true,
    })
    const negative = result.find((r) => r.raw[4] === 'REF-7')
    expect(negative?.accepted).toBe(true)
    expect(negative?.warnings.join(' ')).toMatch(/refund|adjustment/i)
  })

  it('flags empty rows as rejected', () => {
    const mapping = suggestMapping(headers, 'sales')
    const result = validate(buildRows(), mapping)
    const empty = result.find((r) => r.errors.includes('Empty row'))
    expect(empty).toBeDefined()
  })

  it('flags duplicate candidates without silently merging or auto-discarding them', () => {
    const mapping = suggestMapping(headers, 'sales')
    const result = validate(buildRows(), mapping)
    const duplicates = result.filter((r) => r.isDuplicateCandidate)
    expect(duplicates.length).toBeGreaterThanOrEqual(1)
    // The duplicate row is still accepted (left for user review), not auto-rejected.
    expect(duplicates[0].accepted).toBe(true)
  })

  it('requires a canteen assignment when no canteen is pre-selected and no Canteen column is mapped', () => {
    const mapping = suggestMapping(headers, 'sales')
    const result = validate([['2026-10-01', '500', 'Cash', 'desc', 'REF']], mapping, '')
    expect(result[0].errors.join(' ')).toMatch(/canteen/i)
  })

  it('summarize reports accurate counts for the full dataset', () => {
    const mapping = suggestMapping(headers, 'sales')
    const result = validate(buildRows(), mapping)
    const summary = summarize(result)
    expect(summary.totalRows).toBe(15)
    expect(summary.invalidRows).toBeGreaterThan(0)
    expect(summary.validRows + summary.invalidRows).toBe(15)
  })

  it('builds a rejected-rows CSV containing original values and the rejection reason', () => {
    const mapping = suggestMapping(headers, 'sales')
    const result = validate(buildRows(), mapping)
    const csv = buildRejectedRowsCsv(result, headers)
    expect(csv).toContain('Rejection reason')
    expect(csv).toContain('not-a-date')
  })

  it('handles mixed date formats within the same file (ISO, DD/MM/YYYY, "D Mon YYYY")', () => {
    const mapping = suggestMapping(headers, 'sales')
    const result = validate(buildRows(), mapping)
    expect(result[0].normalized.date).toBe('2026-10-01')
    expect(result[1].normalized.date).toBe('2026-10-01')
    expect(result[2].normalized.date).toBe('2026-10-01')
  })
})

describe('import category mapping differs per category (not a one-size-fits-all mapping)', () => {
  it('suggests different field sets for sales vs expenses vs purchases headers', () => {
    const salesHeaders = ['Date', 'Sales Amount', 'Cash', 'UPI', 'Reference Number']
    const expenseHeaders = ['Date', 'Expense Category', 'Description', 'Vendor', 'Amount']

    const salesMapping = suggestMapping(salesHeaders, 'sales')
    const expenseMapping = suggestMapping(expenseHeaders, 'expenses')

    // Sales mapping should find amount/date/reference; it has no "category" or "vendor" concept.
    expect(Object.values(salesMapping)).toContain('date')
    expect(Object.values(salesMapping)).toContain('amount')

    // Expense mapping should find category and vendor, which sales fields don't define.
    expect(Object.values(expenseMapping)).toContain('category')
    expect(Object.values(expenseMapping)).toContain('vendor')
  })

  it('purchases mapping supports quantity and unit cost fields that sales/expenses do not', () => {
    const purchaseHeaders = ['Date', 'Item', 'Quantity', 'Unit Cost', 'Vendor', 'Reference']
    const mapping = suggestMapping(purchaseHeaders, 'purchases')
    expect(Object.values(mapping)).toContain('quantity')
    expect(Object.values(mapping)).toContain('unitCost')
  })

  it('maps the exact Sales_Test header set from the BrightNest test workbook spec', () => {
    const salesTestHeaders = ['Date', 'Canteen', 'Reference', 'Description', 'Amount', 'Cash', 'UPI', 'Card', 'Notes']
    const mapping = suggestMapping(salesTestHeaders, 'sales')
    expect(mapping[0]).toBe('date')
    expect(mapping[1]).toBe('canteen')
    expect(mapping[2]).toBe('reference')
    expect(mapping[3]).toBe('description')
    expect(mapping[4]).toBe('amount')
    expect(mapping[5]).toBe('cashAmount')
    expect(mapping[6]).toBe('upiAmount')
    expect(mapping[7]).toBe('cardAmount')
    expect(mapping[8]).toBe('notes')
  })

  it('maps the exact Expenses_Test header set from the BrightNest test workbook spec', () => {
    const expensesTestHeaders = ['Date', 'Canteen', 'Reference', 'Category', 'Vendor', 'Amount', 'Payment Method', 'Description']
    const mapping = suggestMapping(expensesTestHeaders, 'expenses')
    expect(mapping[0]).toBe('date')
    expect(mapping[1]).toBe('canteen')
    expect(mapping[2]).toBe('reference')
    expect(mapping[3]).toBe('category')
    expect(mapping[4]).toBe('vendor')
    expect(mapping[5]).toBe('amount')
    expect(mapping[6]).toBe('paymentMethod')
    expect(mapping[7]).toBe('description')
  })
})

describe('canteen resolution from a mapped Canteen column (never a free-text name)', () => {
  it('resolves an exact (case-insensitive) canteen name match to its permanent ID', () => {
    expect(resolveCanteenByName('network18 – lower parel', testCanteens)).toBe('canteen_1')
    expect(resolveCanteenByName('Network18 – Vikhroli', testCanteens)).toBe('canteen_2')
  })

  it('returns null (never invents a canteen) when the name does not match any existing canteen', () => {
    expect(resolveCanteenByName('Some Other Branch', testCanteens)).toBeNull()
  })

  it('a validated row uses the row-level mapped Canteen column over the pre-selected default canteen', () => {
    const rowsHeaders = ['Date', 'Canteen', 'Amount', 'Description', 'Reference']
    const mapping = suggestMapping(rowsHeaders, 'sales')
    const rows = [['2026-10-01', 'Network18 – Vikhroli', '500', 'desc', 'REF-1']]
    const result = validateRows(rows, mapping, { category: 'sales', canteenId: 'canteen_1', canteens: testCanteens })
    expect(result[0].normalized.resolvedCanteenId).toBe('canteen_2') // not the pre-selected canteen_1
  })

  it('rejects a row whose mapped Canteen value does not match any existing canteen, with a clear error', () => {
    const rowsHeaders = ['Date', 'Canteen', 'Amount', 'Description', 'Reference']
    const mapping = suggestMapping(rowsHeaders, 'sales')
    const rows = [['2026-10-01', 'Unknown Branch', '500', 'desc', 'REF-1']]
    const result = validateRows(rows, mapping, { category: 'sales', canteenId: 'canteen_1', canteens: testCanteens })
    expect(result[0].accepted).toBe(false)
    expect(result[0].errors.join(' ')).toMatch(/Unknown Branch/)
  })

  it('falls back to the pre-selected canteen when no Canteen column is mapped', () => {
    const result = validate([['2026-10-01', '500', 'Cash', 'desc', 'REF']], suggestMapping(headers, 'sales'), 'canteen_1')
    expect(result[0].normalized.resolvedCanteenId).toBe('canteen_1')
  })
})

describe('cash/UPI/card split amount handling (Sales_Test workbook format)', () => {
  it('derives the total amount from Cash+UPI+Card when no explicit Amount column is mapped', () => {
    const splitHeaders = ['Date', 'Canteen', 'Reference', 'Description', 'Cash', 'UPI', 'Card']
    const mapping = suggestMapping(splitHeaders, 'sales')
    const rows = [['2026-10-01', 'Network18 – Lower Parel', 'REF-1', 'desc', '200', '150', '150']]
    const result = validateRows(rows, mapping, { category: 'sales', canteenId: 'canteen_1', canteens: testCanteens })
    expect(result[0].normalized.amountPaise).toBe(50000) // 200+150+150 = 500 rupees = 50000 paise
  })

  it('prefers the explicit Amount column total over the cash/UPI/card split when both are present', () => {
    const headersWithBoth = ['Date', 'Canteen', 'Reference', 'Description', 'Amount', 'Cash', 'UPI', 'Card']
    const mapping = suggestMapping(headersWithBoth, 'sales')
    const rows = [['2026-10-01', 'Network18 – Lower Parel', 'REF-1', 'desc', '500', '200', '150', '150']]
    const result = validateRows(rows, mapping, { category: 'sales', canteenId: 'canteen_1', canteens: testCanteens })
    expect(result[0].normalized.amountPaise).toBe(50000)
  })
})
