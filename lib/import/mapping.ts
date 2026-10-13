// Column mapping: suggests a mapping from spreadsheet headers to application
// fields, but never assumes correctness — the user can always override it.

import type { ImportCategory, PaymentMethod } from '@/lib/types'
import { PAYMENT_METHODS, EXPENSE_CATEGORIES } from '@/lib/types'

export type TargetField =
  | 'date'
  | 'canteen'
  | 'amount'
  | 'cashAmount'
  | 'upiAmount'
  | 'cardAmount'
  | 'paymentMethod'
  | 'description'
  | 'reference'
  | 'category'
  | 'vendor'
  | 'quantity'
  | 'unitCost'
  | 'notes'
  | 'skip'

export interface FieldDefinition {
  field: TargetField
  label: string
  required: boolean
}

export function fieldsForCategory(category: ImportCategory): FieldDefinition[] {
  if (category === 'sales') {
    return [
      { field: 'date', label: 'Transaction date', required: true },
      { field: 'canteen', label: 'Canteen', required: false },
      { field: 'amount', label: 'Sales amount', required: true },
      { field: 'cashAmount', label: 'Cash amount', required: false },
      { field: 'upiAmount', label: 'UPI amount', required: false },
      { field: 'cardAmount', label: 'Card amount', required: false },
      { field: 'paymentMethod', label: 'Payment method', required: false },
      { field: 'description', label: 'Description', required: false },
      { field: 'reference', label: 'Reference number', required: false },
      { field: 'notes', label: 'Notes', required: false },
    ]
  }
  if (category === 'expenses') {
    return [
      { field: 'date', label: 'Transaction date', required: true },
      { field: 'canteen', label: 'Canteen', required: false },
      { field: 'amount', label: 'Expense amount', required: true },
      { field: 'category', label: 'Expense category', required: false },
      { field: 'paymentMethod', label: 'Payment method', required: false },
      { field: 'vendor', label: 'Vendor', required: false },
      { field: 'description', label: 'Description', required: false },
      { field: 'reference', label: 'Reference number', required: false },
      { field: 'notes', label: 'Notes', required: false },
    ]
  }
  // purchases
  return [
    { field: 'date', label: 'Date', required: true },
    { field: 'canteen', label: 'Canteen', required: false },
    { field: 'amount', label: 'Total amount', required: true },
    { field: 'description', label: 'Item / description', required: false },
    { field: 'quantity', label: 'Quantity', required: false },
    { field: 'unitCost', label: 'Unit cost', required: false },
    { field: 'vendor', label: 'Vendor', required: false },
    { field: 'reference', label: 'Reference number', required: false },
    { field: 'notes', label: 'Notes', required: false },
  ]
}

const HEADER_HINTS: Record<TargetField, string[]> = {
  date: ['date', 'transaction date', 'txn date', 'day'],
  canteen: ['canteen', 'location', 'outlet', 'branch'],
  amount: ['sales amount', 'expense amount', 'total amount', 'amount', 'sales', 'total', 'value'],
  cashAmount: ['cash amount', 'cash'],
  upiAmount: ['upi amount', 'upi'],
  cardAmount: ['card amount', 'card'],
  paymentMethod: ['payment type', 'payment method', 'mode', 'payment mode'],
  description: ['description', 'details', 'item', 'particular', 'particulars', 'narration'],
  reference: ['reference number', 'reference', 'ref no', 'ref', 'invoice no', 'bill no'],
  category: ['expense category', 'category', 'type'],
  vendor: ['vendor', 'supplier', 'party'],
  quantity: ['quantity', 'qty'],
  unitCost: ['unit cost', 'rate', 'price', 'unit price'],
  notes: ['notes', 'remarks', 'comment', 'comments'],
  skip: [],
}

/** Suggest a header -> field mapping. Returns a map keyed by header index.
 *  For each header, every candidate field's hints are scored by the length
 *  of the matched hint text (longer, more specific matches win), so a
 *  header like "Expense Category" matches the dedicated `category` hint
 *  "expense category" rather than incidentally matching `amount`'s "expense"
 *  substring. Exact hint matches always outrank substring matches. */
export function suggestMapping(headers: string[], category: ImportCategory): Record<number, TargetField> {
  const fields = fieldsForCategory(category)
  const mapping: Record<number, TargetField> = {}
  const usedFields = new Set<TargetField>()

  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().trim()
    let bestField: TargetField | null = null
    let bestScore = -1

    for (const def of fields) {
      if (usedFields.has(def.field)) continue
      const hints = HEADER_HINTS[def.field]
      for (const hint of hints) {
        const isExact = normalized === hint
        const isSubstring = !isExact && normalized.includes(hint)
        if (!isExact && !isSubstring) continue
        // Exact matches get a large bonus so they always beat any substring
        // match; among substring matches, the longer (more specific) hint wins.
        const score = (isExact ? 1000 : 0) + hint.length
        if (score > bestScore) {
          bestScore = score
          bestField = def.field
        }
      }
    }

    mapping[index] = bestField ?? 'skip'
    if (bestField) usedFields.add(bestField)
  })

  return mapping
}

export function normalizePaymentMethod(raw: unknown): PaymentMethod {
  const text = String(raw ?? '').trim().toLowerCase()
  if (!text) return 'Other'
  if (text.includes('cash')) return 'Cash'
  if (text.includes('upi')) return 'UPI'
  if (text.includes('card')) return 'Card'
  if (text.includes('bank') || text.includes('neft') || text.includes('transfer')) return 'Bank Transfer'
  const match = PAYMENT_METHODS.find((m) => m.toLowerCase() === text)
  return match ?? 'Other'
}

export function normalizeExpenseCategory(raw: unknown): typeof EXPENSE_CATEGORIES[number] {
  const text = String(raw ?? '').trim().toLowerCase()
  const match = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === text || text.includes(c.toLowerCase().slice(0, 5)))
  return match ?? 'Other'
}
