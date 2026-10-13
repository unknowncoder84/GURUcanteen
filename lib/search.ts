// Full-text search across stored records (not just the rows currently
// rendered in a table). Operates on the complete in-memory dataset already
// loaded by useAppData, so results always reflect every matching stored
// record regardless of how many rows a table happens to display.

import type { ExpenseRecord, ImportRecord, PurchaseRecord, SalesRecord, StaffMember, Vendor } from '@/lib/types'

function normalize(text: string): string {
  return text.toLowerCase().trim()
}

function includesQuery(haystack: string, query: string): boolean {
  return normalize(haystack).includes(normalize(query))
}

export interface SearchContext {
  vendors: Vendor[]
  staff: StaffMember[]
  imports: ImportRecord[]
}

function importFilenameFor(importId: string | undefined, imports: ImportRecord[]): string {
  if (!importId) return ''
  return imports.find((i) => i.id === importId)?.filename ?? ''
}

/** Matches a sales record on description, reference, category (n/a for
 *  sales), and the source import's filename. */
export function matchesSaleSearch(record: SalesRecord, query: string, ctx: SearchContext): boolean {
  if (!query.trim()) return true
  const filename = importFilenameFor(record.importId, ctx.imports)
  return [record.description, record.reference, filename, record.paymentMethod].some((field) => includesQuery(field ?? '', query))
}

/** Matches an expense record on description, reference, category, vendor
 *  name, and source import filename. */
export function matchesExpenseSearch(record: ExpenseRecord, query: string, ctx: SearchContext): boolean {
  if (!query.trim()) return true
  const vendorName = record.vendorId ? ctx.vendors.find((v) => v.id === record.vendorId)?.name ?? '' : ''
  const filename = importFilenameFor(record.importId, ctx.imports)
  return [record.description, record.reference, record.category, vendorName, filename, record.paymentMethod].some((field) =>
    includesQuery(field ?? '', query)
  )
}

/** Matches a purchase record on item description, reference, vendor name,
 *  and source import filename. */
export function matchesPurchaseSearch(record: PurchaseRecord, query: string, ctx: SearchContext): boolean {
  if (!query.trim()) return true
  const vendorName = ctx.vendors.find((v) => v.id === record.vendorId)?.name ?? ''
  const filename = importFilenameFor(record.importId, ctx.imports)
  return [record.itemDescription, record.reference, vendorName, filename].some((field) => includesQuery(field ?? '', query))
}

export function filterSalesBySearch(records: SalesRecord[], query: string, ctx: SearchContext): SalesRecord[] {
  if (!query.trim()) return records
  return records.filter((r) => matchesSaleSearch(r, query, ctx))
}

export function filterExpensesBySearch(records: ExpenseRecord[], query: string, ctx: SearchContext): ExpenseRecord[] {
  if (!query.trim()) return records
  return records.filter((r) => matchesExpenseSearch(r, query, ctx))
}

export function filterPurchasesBySearch(records: PurchaseRecord[], query: string, ctx: SearchContext): PurchaseRecord[] {
  if (!query.trim()) return records
  return records.filter((r) => matchesPurchaseSearch(r, query, ctx))
}
