// Validates every row of the full dataset (never just the preview). Produces
// a ValidatedRow per input row, clearly separating errors (row rejected)
// from warnings (row accepted but flagged) and never silently coercing bad
// dates/amounts to defaults.

import type { Canteen, ImportCategory, PaymentMethod } from '@/lib/types'
import { parseFlexibleDate } from '@/lib/dates'
import { parseAmountToPaise } from '@/lib/money'
import { normalizeExpenseCategory, normalizePaymentMethod, type TargetField } from '@/lib/import/mapping'

export interface NormalizedRow {
  date: string | null
  /** Canteen name as read from the sheet, if a Canteen column was mapped. */
  canteenName?: string
  /** Resolved canteen ID: from the mapped Canteen column (matched by name
   *  against existing canteens) if present, otherwise the import's
   *  pre-selected canteen. Null means it could not be resolved at all. */
  resolvedCanteenId: string | null
  amountPaise: number | null
  cashAmountPaise?: number | null
  upiAmountPaise?: number | null
  cardAmountPaise?: number | null
  paymentMethod: PaymentMethod
  description: string
  reference: string
  notes?: string
  category?: string
  vendorName?: string
  quantity?: number
  unitCostPaise?: number
}

export interface ValidatedRow {
  rowIndex: number // 0-based index within data rows
  raw: unknown[]
  normalized: NormalizedRow
  errors: string[]
  warnings: string[]
  isDuplicateCandidate: boolean
  duplicateOfRowIndex?: number
  accepted: boolean
}

function cellByField(row: unknown[], mapping: Record<number, TargetField>, field: TargetField): unknown {
  const idx = Object.entries(mapping).find(([, f]) => f === field)?.[0]
  if (idx === undefined) return undefined
  return row[Number(idx)]
}

/** Resolve a canteen name (as it appears in a spreadsheet) to an existing
 *  canteen's permanent ID by exact case-insensitive match, falling back to a
 *  trimmed substring match. Returns null (never invents a canteen) if no
 *  existing canteen matches. */
export function resolveCanteenByName(name: string, canteens: Canteen[]): string | null {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return null
  const exact = canteens.find((c) => c.name.trim().toLowerCase() === normalized)
  if (exact) return exact.id
  const partial = canteens.find((c) => c.name.trim().toLowerCase().includes(normalized) || normalized.includes(c.name.trim().toLowerCase()))
  return partial?.id ?? null
}

export function normalizeRow(
  row: unknown[],
  mapping: Record<number, TargetField>,
  context: { defaultCanteenId: string; canteens: Canteen[] }
): NormalizedRow {
  const dateRaw = cellByField(row, mapping, 'date')
  const canteenRaw = cellByField(row, mapping, 'canteen')
  const amountRaw = cellByField(row, mapping, 'amount')
  const cashRaw = cellByField(row, mapping, 'cashAmount')
  const upiRaw = cellByField(row, mapping, 'upiAmount')
  const cardRaw = cellByField(row, mapping, 'cardAmount')
  const paymentRaw = cellByField(row, mapping, 'paymentMethod')
  const descRaw = cellByField(row, mapping, 'description')
  const refRaw = cellByField(row, mapping, 'reference')
  const notesRaw = cellByField(row, mapping, 'notes')
  const categoryRaw = cellByField(row, mapping, 'category')
  const vendorRaw = cellByField(row, mapping, 'vendor')
  const qtyRaw = cellByField(row, mapping, 'quantity')
  const unitCostRaw = cellByField(row, mapping, 'unitCost')

  // A Canteen column being mapped at all means this row is expected to
  // specify its own canteen. If that specific cell is blank, treat it as a
  // missing canteen for this row rather than silently falling back to the
  // import's default canteen — otherwise a blank cell could be mistaken for
  // "use the default", masking genuinely incomplete source data.
  const canteenColumnMapped = canteenRaw !== undefined
  const canteenName = canteenColumnMapped ? String(canteenRaw).trim() : undefined
  let resolvedCanteenId: string | null
  if (canteenColumnMapped) {
    resolvedCanteenId = canteenName ? resolveCanteenByName(canteenName, context.canteens) : null
  } else {
    resolvedCanteenId = context.defaultCanteenId || null
  }

  // When an explicit total "amount" column isn't mapped but cash/UPI/card
  // split columns are, derive the total from their sum rather than treating
  // the row as having no amount at all.
  let amountPaise = parseAmountToPaise(amountRaw)
  const cashAmountPaise = cashRaw !== undefined ? parseAmountToPaise(cashRaw) : undefined
  const upiAmountPaise = upiRaw !== undefined ? parseAmountToPaise(upiRaw) : undefined
  const cardAmountPaise = cardRaw !== undefined ? parseAmountToPaise(cardRaw) : undefined
  if (amountPaise === null && (cashAmountPaise !== undefined || upiAmountPaise !== undefined || cardAmountPaise !== undefined)) {
    const parts = [cashAmountPaise, upiAmountPaise, cardAmountPaise].filter((v): v is number => v !== null && v !== undefined)
    if (parts.length > 0) amountPaise = parts.reduce((n, v) => n + v, 0)
  }

  return {
    date: parseFlexibleDate(dateRaw),
    canteenName,
    resolvedCanteenId,
    amountPaise,
    cashAmountPaise,
    upiAmountPaise,
    cardAmountPaise,
    paymentMethod: normalizePaymentMethod(paymentRaw),
    description: String(descRaw ?? '').trim(),
    reference: String(refRaw ?? '').trim(),
    notes: notesRaw !== undefined ? String(notesRaw).trim() : undefined,
    category: categoryRaw !== undefined ? normalizeExpenseCategory(categoryRaw) : undefined,
    vendorName: vendorRaw !== undefined ? String(vendorRaw).trim() : undefined,
    quantity: qtyRaw !== undefined ? Number(qtyRaw) : undefined,
    unitCostPaise: unitCostRaw !== undefined ? (parseAmountToPaise(unitCostRaw) ?? undefined) : undefined,
  }
}

export function isRowEmpty(row: unknown[]): boolean {
  return row.every((cell) => String(cell ?? '').trim() === '')
}

export interface ValidateOptions {
  category: ImportCategory
  /** Pre-selected canteen for the whole import. Used for every row unless
   *  that row maps a Canteen column that resolves to a different, existing
   *  canteen (see resolveCanteenByName). */
  canteenId: string
  /** Full canteen list, required to resolve a mapped Canteen column by name
   *  into a permanent canteen ID rather than storing a free-text name. */
  canteens: Canteen[]
  /** Allow negative amounts for categories/workflows where a negative value
   *  represents an explicit refund/adjustment rather than a plain error.
   *  When false (the default), negative amounts are rejected outright. */
  allowNegativeAsRefund?: boolean
}

export function validateRows(
  rows: unknown[][],
  mapping: Record<number, TargetField>,
  options: ValidateOptions
): ValidatedRow[] {
  const results: ValidatedRow[] = []
  const seenKeys = new Map<string, number>() // dedupe key -> first rowIndex
  const context = { defaultCanteenId: options.canteenId, canteens: options.canteens }

  rows.forEach((row, rowIndex) => {
    const errors: string[] = []
    const warnings: string[] = []

    if (isRowEmpty(row)) {
      results.push({
        rowIndex,
        raw: row,
        normalized: normalizeRow(row, mapping, context),
        errors: ['Empty row'],
        warnings,
        isDuplicateCandidate: false,
        accepted: false,
      })
      return
    }

    const normalized = normalizeRow(row, mapping, context)

    if (!normalized.resolvedCanteenId) {
      if (normalized.canteenName) {
        errors.push(`Canteen "${normalized.canteenName}" does not match any existing canteen`)
      } else {
        errors.push('No canteen assigned for this import')
      }
    }
    if (!normalized.date) {
      errors.push('Missing or unrecognised date format')
    }
    if (normalized.amountPaise === null) {
      errors.push('Missing or invalid numeric amount')
    } else if (normalized.amountPaise < 0) {
      if (options.allowNegativeAsRefund) {
        warnings.push('Negative amount: flagged as a refund/adjustment for explicit review')
      } else {
        errors.push('Negative amounts are not permitted for this import (use a refund/adjustment workflow)')
      }
    } else if (normalized.amountPaise === 0) {
      errors.push('Amount must be greater than zero')
    }

    if (options.category === 'expenses' && !normalized.category) {
      warnings.push('Category not recognised; defaulted to "Other"')
    }

    // Duplicate detection: canteen + date + amount + reference (if present).
    // If no reference, fall back to canteen+date+amount+description, which
    // means genuinely repeated transactions on the same day with the same
    // description/amount are flagged for manual review rather than silently
    // merged or silently accepted.
    const dedupeKey = [
      normalized.resolvedCanteenId ?? options.canteenId,
      normalized.date ?? '',
      normalized.amountPaise ?? '',
      normalized.reference || normalized.description || `row-${rowIndex}`,
    ].join('|')

    let isDuplicateCandidate = false
    let duplicateOfRowIndex: number | undefined
    if (seenKeys.has(dedupeKey)) {
      isDuplicateCandidate = true
      duplicateOfRowIndex = seenKeys.get(dedupeKey)
      warnings.push(`Possible duplicate of row ${(duplicateOfRowIndex ?? 0) + 1}`)
    } else {
      seenKeys.set(dedupeKey, rowIndex)
    }

    results.push({
      rowIndex,
      raw: row,
      normalized,
      errors,
      warnings,
      isDuplicateCandidate,
      duplicateOfRowIndex,
      accepted: errors.length === 0,
    })
  })

  return results
}

export function summarize(rows: ValidatedRow[]) {
  const totalRows = rows.length
  const invalidRows = rows.filter((r) => r.errors.length > 0).length
  const duplicateRows = rows.filter((r) => r.isDuplicateCandidate && r.errors.length === 0).length
  const validRows = rows.filter((r) => r.errors.length === 0).length
  return { totalRows, validRows, invalidRows, duplicateRows }
}

/** Build a CSV of rejected rows including original values and the reason, for download. */
export function buildRejectedRowsCsv(rows: ValidatedRow[], headers: string[]): string {
  const rejected = rows.filter((r) => r.errors.length > 0)
  const headerLine = [...headers, 'Rejection reason'].map(csvEscape).join(',')
  const lines = rejected.map((r) => [...r.raw.map((c) => c ?? ''), r.errors.join('; ')].map(csvEscape).join(','))
  return [headerLine, ...lines].join('\n')
}

function csvEscape(value: unknown): string {
  const str = String(value ?? '')
  // Prevent spreadsheet formula injection in exported CSVs.
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str
  return `"${safe.replaceAll('"', '""')}"`
}
