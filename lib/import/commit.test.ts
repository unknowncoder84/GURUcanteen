import { describe, it, expect, beforeEach } from 'vitest'
import { getDb } from '@/lib/db/schema'
import { createCanteen } from '@/lib/db/repository'
import { validateRows } from '@/lib/import/validate'
import { suggestMapping } from '@/lib/import/mapping'
import { commitImport, checkReversalConflicts, reverseImport } from '@/lib/import/commit'

const headers = ['Date', 'Amount', 'Payment Type', 'Description', 'Reference Number']

async function freshCanteen() {
  return createCanteen({ name: 'Test Canteen', address: '', contactPerson: '', phone: '', email: '', active: true })
}

beforeEach(async () => {
  const db = getDb()
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('import commit and reversal', () => {
  it('commits all accepted rows from a full dataset atomically and records import history', async () => {
    const canteen = await freshCanteen()
    const rows = [
      ['2026-10-01', '500', 'Cash', 'Sale A', 'REF-1'],
      ['2026-10-02', '600', 'UPI', 'Sale B', 'REF-2'],
      ['2026-10-03', '700', 'Card', 'Sale C', 'REF-3'],
      ['bad-date', '800', 'Cash', 'Bad row', 'REF-4'],
    ]
    const mapping = suggestMapping(headers, 'sales')
    const validated = validateRows(rows, mapping, { category: 'sales', canteenId: canteen.id, canteens: [canteen] })

    const result = await commitImport({
      filename: 'test.csv',
      category: 'sales',
      canteenId: canteen.id,
      headers,
      validatedRows: validated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    expect(result.insertedIds).toHaveLength(3) // only the 3 valid rows
    expect(result.importRecord.status).toBe('Imported')
    expect(result.importRecord.totalRows).toBe(4)
    expect(result.importRecord.acceptedRows).toBe(3)
    expect(result.importRecord.rejectedRows).toBe(1)

    const db = getDb()
    const sales = await db.sales.toArray()
    expect(sales).toHaveLength(3)
    expect(sales.every((s) => s.canteenId === canteen.id)).toBe(true)
    expect(sales.every((s) => s.source === 'imported')).toBe(true)
  })

  it('respects skippedRowIndexes (e.g. user chose to skip a confirmed duplicate)', async () => {
    const canteen = await freshCanteen()
    const rows = [
      ['2026-10-01', '500', 'Cash', 'Sale A', 'REF-1'],
      ['2026-10-01', '500', 'Cash', 'Sale A', 'REF-1'], // duplicate
    ]
    const mapping = suggestMapping(headers, 'sales')
    const validated = validateRows(rows, mapping, { category: 'sales', canteenId: canteen.id, canteens: [canteen] })
    const duplicateRowIndex = validated.find((r) => r.isDuplicateCandidate)!.rowIndex

    const result = await commitImport({
      filename: 'dup.csv',
      category: 'sales',
      canteenId: canteen.id,
      headers,
      validatedRows: validated,
      columnMapping: {},
      skippedRowIndexes: new Set([duplicateRowIndex]),
    })

    expect(result.insertedIds).toHaveLength(1)
  })

  it('reverses an import: deletes only its own records and marks the import Reversed, preserving history', async () => {
    const canteen = await freshCanteen()
    const rows = [
      ['2026-10-01', '500', 'Cash', 'Sale A', 'REF-1'],
      ['2026-10-02', '600', 'UPI', 'Sale B', 'REF-2'],
    ]
    const mapping = suggestMapping(headers, 'sales')
    const validated = validateRows(rows, mapping, { category: 'sales', canteenId: canteen.id, canteens: [canteen] })
    const result = await commitImport({
      filename: 'reverse-me.csv',
      category: 'sales',
      canteenId: canteen.id,
      headers,
      validatedRows: validated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    const db = getDb()
    // Add an unrelated manual sale that must survive the reversal untouched.
    await db.sales.add({
      id: 'manual_untouched',
      canteenId: canteen.id,
      date: '2026-10-05',
      amountPaise: 99900,
      paymentMethod: 'Cash',
      reference: '',
      description: 'Manual sale, not from import',
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const check = await checkReversalConflicts(result.importRecord)
    expect(check.canReverse).toBe(true)

    await reverseImport(result.importRecord)

    const remainingSales = await db.sales.toArray()
    expect(remainingSales).toHaveLength(1)
    expect(remainingSales[0].id).toBe('manual_untouched')

    const importRecord = await db.imports.get(result.importRecord.id)
    expect(importRecord?.status).toBe('Reversed')
  })

  it('persists each row under its own resolved canteen when a Canteen column maps rows to different existing canteens', async () => {
    const canteenA = await createCanteen({ name: 'Lower Parel', address: '', contactPerson: '', phone: '', email: '', active: true })
    const canteenB = await createCanteen({ name: 'Vikhroli', address: '', contactPerson: '', phone: '', email: '', active: true })
    const canteenHeaders = ['Date', 'Canteen', 'Amount', 'Description', 'Reference']
    const mapping = suggestMapping(canteenHeaders, 'sales')
    const rows = [
      ['2026-10-01', 'Lower Parel', '500', 'Sale A', 'REF-1'],
      ['2026-10-01', 'Vikhroli', '600', 'Sale B', 'REF-2'],
    ]
    const validated = validateRows(rows, mapping, {
      category: 'sales',
      canteenId: canteenA.id, // pre-selected default
      canteens: [canteenA, canteenB],
    })

    const result = await commitImport({
      filename: 'multi-canteen.csv',
      category: 'sales',
      canteenId: canteenA.id,
      headers: canteenHeaders,
      validatedRows: validated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    expect(result.insertedIds).toHaveLength(2)
    const db = getDb()
    const sales = await db.sales.toArray()
    expect(sales.find((s) => s.reference === 'REF-1')?.canteenId).toBe(canteenA.id)
    expect(sales.find((s) => s.reference === 'REF-2')?.canteenId).toBe(canteenB.id) // not the pre-selected default
  })

  it('detects a reversal conflict when a record was edited after import', async () => {
    const canteen = await freshCanteen()
    const rows = [['2026-10-01', '500', 'Cash', 'Sale A', 'REF-1']]
    const mapping = suggestMapping(headers, 'sales')
    const validated = validateRows(rows, mapping, { category: 'sales', canteenId: canteen.id, canteens: [canteen] })
    const result = await commitImport({
      filename: 'edit-after.csv',
      category: 'sales',
      canteenId: canteen.id,
      headers,
      validatedRows: validated,
      columnMapping: {},
      skippedRowIndexes: new Set(),
    })

    const db = getDb()
    await db.sales.update(result.insertedIds[0], { updatedAt: new Date().toISOString(), description: 'Edited after import' })

    const check = await checkReversalConflicts(result.importRecord)
    expect(check.conflicts.length).toBeGreaterThan(0)
  })
})
