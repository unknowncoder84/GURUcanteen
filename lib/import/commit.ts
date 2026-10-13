// Commits a validated import to IndexedDB atomically (single Dexie
// transaction), records import history, and supports safe reversal.

import { getDb } from '@/lib/db/schema'
import { generateId, nowIso } from '@/lib/id'
import type { ExpenseRecord, ImportCategory, ImportRecord, PurchaseRecord, SalesRecord, Vendor } from '@/lib/types'
import type { ValidatedRow } from '@/lib/import/validate'
import { buildRejectedRowsCsv, summarize } from '@/lib/import/validate'
import { saveImportRecord, markImportReversed } from '@/lib/db/repository'

export interface CommitImportInput {
  filename: string
  category: ImportCategory
  canteenId: string
  headers: string[]
  validatedRows: ValidatedRow[]
  columnMapping: Record<string, string>
  /** Row indexes (within validatedRows) the user chose to skip, e.g. confirmed duplicates. */
  skippedRowIndexes: Set<number>
}

export interface CommitImportResult {
  importRecord: ImportRecord
  insertedIds: string[]
}

async function resolveVendorId(vendorName: string | undefined): Promise<string | undefined> {
  if (!vendorName) return undefined
  const db = getDb()
  const existing = await db.vendors.where('name').equalsIgnoreCase(vendorName).first()
  if (existing) return existing.id
  const vendor: Vendor = {
    id: generateId('vendor'),
    name: vendorName,
    contactPerson: '',
    phone: '',
    email: '',
    notes: 'Auto-created during import',
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  await db.vendors.add(vendor)
  return vendor.id
}

export async function commitImport(input: CommitImportInput): Promise<CommitImportResult> {
  const db = getDb()
  const { category, canteenId, validatedRows, skippedRowIndexes } = input

  const rowsToImport = validatedRows.filter((r) => r.accepted && !skippedRowIndexes.has(r.rowIndex))

  const importId = generateId('import')
  const insertedIds: string[] = []

  // Pre-resolve vendor names outside the atomic transaction (Dexie rw
  // transactions can include multiple tables; vendor lookups are safe here
  // since they are idempotent and keyed by name).
  const vendorCache = new Map<string, string | undefined>()
  if (category === 'expenses' || category === 'purchases') {
    for (const row of rowsToImport) {
      const vendorName = row.normalized.vendorName
      if (vendorName && !vendorCache.has(vendorName)) {
        vendorCache.set(vendorName, await resolveVendorId(vendorName))
      }
    }
  }

  try {
    await db.transaction('rw', db.sales, db.expenses, db.purchases, db.imports, async () => {
      for (const row of rowsToImport) {
        const n = row.normalized
        // Each row may resolve to a different canteen than the import's
        // pre-selected default (e.g. a mapped Canteen column naming a
        // different, existing canteen) — always use the permanent canteen
        // ID actually resolved for this specific row, never the free-text name.
        const rowCanteenId = n.resolvedCanteenId ?? canteenId
        const descriptionWithNotes = n.notes ? `${n.description || ''}${n.description ? ' — ' : ''}${n.notes}`.trim() : n.description
        if (category === 'sales') {
          const record: SalesRecord = {
            id: generateId('sale'),
            canteenId: rowCanteenId,
            date: n.date!,
            amountPaise: n.amountPaise!,
            paymentMethod: n.paymentMethod,
            reference: n.reference,
            description: descriptionWithNotes || 'Imported sale',
            source: 'imported',
            importId,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }
          await db.sales.add(record)
          insertedIds.push(record.id)
        } else if (category === 'expenses') {
          const record: ExpenseRecord = {
            id: generateId('expense'),
            canteenId: rowCanteenId,
            date: n.date!,
            amountPaise: n.amountPaise!,
            category: (n.category as ExpenseRecord['category']) ?? 'Other',
            paymentMethod: n.paymentMethod,
            vendorId: n.vendorName ? vendorCache.get(n.vendorName) : undefined,
            reference: n.reference,
            description: descriptionWithNotes || 'Imported expense',
            source: 'imported',
            importId,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }
          await db.expenses.add(record)
          insertedIds.push(record.id)
        } else {
          const quantity = n.quantity ?? 1
          const unitCostPaise = n.unitCostPaise ?? n.amountPaise!
          const record: PurchaseRecord = {
            id: generateId('purchase'),
            canteenId: rowCanteenId,
            vendorId: n.vendorName ? (vendorCache.get(n.vendorName) ?? '') : '',
            date: n.date!,
            itemDescription: descriptionWithNotes || 'Imported purchase',
            quantity,
            unitCostPaise,
            totalPaise: n.amountPaise!,
            reference: n.reference,
            paymentStatus: 'Unpaid',
            source: 'imported',
            importId,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }
          await db.purchases.add(record)
          insertedIds.push(record.id)
        }
      }
    })
  } catch (err) {
    // Record the failure state so there is no silent, untracked partial import.
    const failedSummary = summarize(validatedRows)
    const failedImport: ImportRecord = {
      id: importId,
      filename: input.filename,
      category,
      canteenId,
      importedAt: nowIso(),
      totalRows: failedSummary.totalRows,
      acceptedRows: 0,
      rejectedRows: failedSummary.totalRows,
      duplicateRows: failedSummary.duplicateRows,
      status: 'Failed',
      recordIds: [],
      columnMapping: input.columnMapping,
      rejectedRowsCsv: buildRejectedRowsCsv(validatedRows, input.headers),
    }
    await saveImportRecord(failedImport)
    throw err
  }

  const summary = summarize(validatedRows)
  const importRecord: ImportRecord = {
    id: importId,
    filename: input.filename,
    category,
    canteenId,
    importedAt: nowIso(),
    totalRows: summary.totalRows,
    acceptedRows: rowsToImport.length,
    rejectedRows: summary.invalidRows,
    duplicateRows: summary.duplicateRows,
    status: 'Imported',
    recordIds: insertedIds,
    columnMapping: input.columnMapping,
    rejectedRowsCsv: buildRejectedRowsCsv(validatedRows, input.headers),
  }
  await saveImportRecord(importRecord)

  return { importRecord, insertedIds }
}

export interface ReversalCheck {
  canReverse: boolean
  conflicts: string[]
}

/** Check whether an import can be safely reversed: flags records that have
 *  since been edited (updatedAt differs materially from createdAt) so the
 *  user can be warned before data is removed. */
export async function checkReversalConflicts(importRecord: ImportRecord): Promise<ReversalCheck> {
  const db = getDb()
  const conflicts: string[] = []
  const table = importRecord.category === 'sales' ? db.sales : importRecord.category === 'expenses' ? db.expenses : db.purchases

  for (const id of importRecord.recordIds) {
    const record = await table.get(id)
    if (!record) {
      conflicts.push(`Record ${id} was already deleted`)
      continue
    }
    if ('updatedAt' in record && 'createdAt' in record && record.updatedAt !== record.createdAt) {
      conflicts.push(`Record ${id} was edited after import and will still be removed`)
    }
  }
  return { canReverse: true, conflicts }
}

/** Reverse an import: deletes the records it created and marks the import
 *  as Reversed while preserving the import history entry itself. Never
 *  touches unrelated records. */
export async function reverseImport(importRecord: ImportRecord): Promise<void> {
  const db = getDb()
  const table = importRecord.category === 'sales' ? db.sales : importRecord.category === 'expenses' ? db.expenses : db.purchases

  await db.transaction('rw', db.sales, db.expenses, db.purchases, db.imports, async () => {
    await (table as import('dexie').Table<unknown, string>).bulkDelete(importRecord.recordIds)
  })
  await markImportReversed(importRecord.id)
}
