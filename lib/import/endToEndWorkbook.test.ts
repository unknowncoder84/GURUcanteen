// Full end-to-end verification against the real BrightNest_Test_Import_Workbook.xlsx
// fixture: read -> map -> validate -> commit -> persisted records -> dashboard
// totals. This is the actual regression test for the reported bug (README
// misread as Sales/Expenses data) and for the subsequent fixes (worksheet
// picker, header detection, canteen-by-name resolution, cash/UPI/card split).

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getDb } from '@/lib/db/schema'
import { createCanteen } from '@/lib/db/repository'
import { readSheet, suggestWorksheetForCategory, listWorksheets } from '@/lib/import/parseFile'
import { suggestMapping } from '@/lib/import/mapping'
import { validateRows, summarize } from '@/lib/import/validate'
import { commitImport } from '@/lib/import/commit'
import { computeFinancialSummary } from '@/lib/calculations'
import type { Canteen } from '@/lib/types'

const FIXTURE_PATH = path.resolve(__dirname, '../../test-fixtures/BrightNest_Test_Import_Workbook.xlsx')

function loadFixtureAsFile(): File {
  const bytes = readFileSync(FIXTURE_PATH)
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const file = new File([bytes], 'BrightNest_Test_Import_Workbook.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => arrayBuffer.slice(0) })
  Object.defineProperty(file, 'text', { value: async () => bytes.toString('utf-8') })
  return file
}

let file: File

beforeAll(() => {
  file = loadFixtureAsFile()
})

beforeEach(async () => {
  const db = getDb()
  await Promise.all(db.tables.map((t) => t.clear()))
})

async function makeTwoCanteens(): Promise<Canteen[]> {
  const lowerParel = await createCanteen({ name: 'Network18 – Lower Parel', address: '', contactPerson: '', phone: '', email: '', active: true })
  const vikhroli = await createCanteen({ name: 'Network18 – Vikhroli', address: '', contactPerson: '', phone: '', email: '', active: true })
  return [lowerParel, vikhroli]
}

describe('end-to-end import of the real test workbook: Sales_Test', () => {
  it('imports all 24 sales rows and the accepted-row count matches the valid row count', async () => {
    const canteens = await makeTwoCanteens()
    const sheets = await listWorksheets(file)
    expect(suggestWorksheetForCategory(sheets, 'sales')).toBe('Sales_Test')

    const parsed = await readSheet(file, 'Sales_Test')
    expect(parsed.rows).toHaveLength(24)

    const mapping = suggestMapping(parsed.headers, 'sales')
    const validated = validateRows(parsed.rows, mapping, {
      category: 'sales',
      canteenId: canteens[0].id,
      canteens,
    })
    const summary = summarize(validated)
    expect(summary.totalRows).toBe(24)
    expect(summary.validRows).toBe(24) // all 24 rows are well-formed in Sales_Test

    const result = await commitImport({
      filename: 'BrightNest_Test_Import_Workbook.xlsx',
      category: 'sales',
      canteenId: canteens[0].id,
      headers: parsed.headers,
      validatedRows: validated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    expect(result.insertedIds).toHaveLength(24)
    expect(result.importRecord.status).toBe('Imported')
    expect(result.importRecord.acceptedRows).toBe(24)
  })

  it('persists each sale under the correct resolved canteen (not all forced into one canteen)', async () => {
    const canteens = await makeTwoCanteens()
    const parsed = await readSheet(file, 'Sales_Test')
    const mapping = suggestMapping(parsed.headers, 'sales')
    const validated = validateRows(parsed.rows, mapping, { category: 'sales', canteenId: canteens[0].id, canteens })

    await commitImport({
      filename: 'BrightNest_Test_Import_Workbook.xlsx',
      category: 'sales',
      canteenId: canteens[0].id,
      headers: parsed.headers,
      validatedRows: validated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    const db = getDb()
    const sales = await db.sales.toArray()
    const lowerParelSales = sales.filter((s) => s.canteenId === canteens[0].id)
    const vikhroliSales = sales.filter((s) => s.canteenId === canteens[1].id)
    expect(lowerParelSales.length).toBe(12) // 12 days, one row per canteen per day
    expect(vikhroliSales.length).toBe(12)
  })

  it('after import, the dashboard financial summary for the sales total matches the fixture-specified INR 2,65,200', async () => {
    const canteens = await makeTwoCanteens()
    const parsed = await readSheet(file, 'Sales_Test')
    const mapping = suggestMapping(parsed.headers, 'sales')
    const validated = validateRows(parsed.rows, mapping, { category: 'sales', canteenId: canteens[0].id, canteens })

    await commitImport({
      filename: 'BrightNest_Test_Import_Workbook.xlsx',
      category: 'sales',
      canteenId: canteens[0].id,
      headers: parsed.headers,
      validatedRows: validated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    const db = getDb()
    const sales = await db.sales.toArray()
    const summary = computeFinancialSummary(sales, [], { startDate: '2026-10-01', endDate: '2026-10-12' })
    expect(summary.salesPaise).toBe(26520000) // INR 2,65,200.00 in paise
  })

  it('shows real sales records (e.g. SALE-1001) in the parsed preview rows, never README text', async () => {
    const parsed = await readSheet(file, 'Sales_Test')
    const refs = parsed.rows.map((r) => String(r[2]))
    expect(refs).toContain('SALE-1001')
  })
})

describe('end-to-end import of the real test workbook: Expenses_Test', () => {
  it('imports all 24 expense rows', async () => {
    const canteens = await makeTwoCanteens()
    const sheets = await listWorksheets(file)
    expect(suggestWorksheetForCategory(sheets, 'expenses')).toBe('Expenses_Test')

    const parsed = await readSheet(file, 'Expenses_Test')
    expect(parsed.rows).toHaveLength(24)

    const mapping = suggestMapping(parsed.headers, 'expenses')
    const validated = validateRows(parsed.rows, mapping, { category: 'expenses', canteenId: canteens[0].id, canteens })
    const summary = summarize(validated)
    expect(summary.validRows).toBe(24)

    const result = await commitImport({
      filename: 'BrightNest_Test_Import_Workbook.xlsx',
      category: 'expenses',
      canteenId: canteens[0].id,
      headers: parsed.headers,
      validatedRows: validated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    expect(result.insertedIds).toHaveLength(24)
  })

  it('after import, the dashboard financial summary for the expense total matches the fixture-specified INR 44,400', async () => {
    const canteens = await makeTwoCanteens()
    const parsed = await readSheet(file, 'Expenses_Test')
    const mapping = suggestMapping(parsed.headers, 'expenses')
    const validated = validateRows(parsed.rows, mapping, { category: 'expenses', canteenId: canteens[0].id, canteens })

    await commitImport({
      filename: 'BrightNest_Test_Import_Workbook.xlsx',
      category: 'expenses',
      canteenId: canteens[0].id,
      headers: parsed.headers,
      validatedRows: validated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    const db = getDb()
    const expenses = await db.expenses.toArray()
    const summary = computeFinancialSummary([], expenses, { startDate: '2026-10-01', endDate: '2026-10-12' })
    expect(summary.expensesPaise).toBe(4440000) // INR 44,400.00 in paise
  })
})

describe('end-to-end: combined operating profit across both imported sheets matches INR 2,20,800', () => {
  it('computes sales minus recognised operating expenses from the two real imports', async () => {
    const canteens = await makeTwoCanteens()

    const salesParsed = await readSheet(file, 'Sales_Test')
    const salesMapping = suggestMapping(salesParsed.headers, 'sales')
    const salesValidated = validateRows(salesParsed.rows, salesMapping, { category: 'sales', canteenId: canteens[0].id, canteens })
    await commitImport({
      filename: 'BrightNest_Test_Import_Workbook.xlsx',
      category: 'sales',
      canteenId: canteens[0].id,
      headers: salesParsed.headers,
      validatedRows: salesValidated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    const expensesParsed = await readSheet(file, 'Expenses_Test')
    const expensesMapping = suggestMapping(expensesParsed.headers, 'expenses')
    const expensesValidated = validateRows(expensesParsed.rows, expensesMapping, { category: 'expenses', canteenId: canteens[0].id, canteens })
    await commitImport({
      filename: 'BrightNest_Test_Import_Workbook.xlsx',
      category: 'expenses',
      canteenId: canteens[0].id,
      headers: expensesParsed.headers,
      validatedRows: expensesValidated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    const db = getDb()
    const [sales, expenses] = await Promise.all([db.sales.toArray(), db.expenses.toArray()])
    const summary = computeFinancialSummary(sales, expenses, { startDate: '2026-10-01', endDate: '2026-10-12' })

    expect(summary.salesPaise).toBe(26520000)
    expect(summary.expensesPaise).toBe(4440000)
    expect(summary.profitPaise).toBe(22080000) // INR 2,20,800.00 in paise
  })
})

describe('end-to-end: Import_Test_Cases sheet (invalid dates, invalid amounts, missing canteen, duplicates)', () => {
  it('rejects the deliberately invalid rows and flags the duplicate, keeping only genuinely valid rows', async () => {
    const canteens = await makeTwoCanteens()
    const parsed = await readSheet(file, 'Import_Test_Cases')
    const mapping = suggestMapping(parsed.headers, 'sales')
    const validated = validateRows(parsed.rows, mapping, { category: 'sales', canteenId: canteens[0].id, canteens })

    const byReference = (ref: string) => validated.find((r) => String(r.raw[2]) === ref)

    expect(byReference('CASE-1')?.accepted).toBe(true) // valid row
    expect(byReference('CASE-2')?.accepted).toBe(false) // invalid date
    expect(byReference('CASE-3')?.accepted).toBe(false) // invalid amount
    expect(byReference('CASE-4')?.accepted).toBe(false) // missing canteen
    const duplicates = validated.filter((r) => String(r.raw[2]) === 'CASE-5')
    expect(duplicates).toHaveLength(2)
    expect(duplicates[1].isDuplicateCandidate).toBe(true) // second CASE-5 flagged as duplicate
    expect(byReference('CASE-6')?.accepted).toBe(false) // negative amount, rejected by default
  })

  it('a partial import of Import_Test_Cases only commits the valid, non-skipped rows', async () => {
    const canteens = await makeTwoCanteens()
    const parsed = await readSheet(file, 'Import_Test_Cases')
    const mapping = suggestMapping(parsed.headers, 'sales')
    const validated = validateRows(parsed.rows, mapping, { category: 'sales', canteenId: canteens[0].id, canteens })

    const result = await commitImport({
      filename: 'BrightNest_Test_Import_Workbook.xlsx',
      category: 'sales',
      canteenId: canteens[0].id,
      headers: parsed.headers,
      validatedRows: validated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    // Only CASE-1 and the first CASE-5 (duplicate original) should commit;
    // the second CASE-5 is a duplicate candidate but still "accepted" per
    // current rules (left for user review) unless explicitly skipped.
    const db = getDb()
    const sales = await db.sales.toArray()
    expect(sales.length).toBeGreaterThan(0)
    expect(sales.length).toBeLessThan(parsed.rows.length) // some rows were genuinely rejected
    expect(result.importRecord.rejectedRows).toBeGreaterThan(0)
  })
})
