// Inventory stock-balance calculations derived from movements, so the
// closing stock is always a reproducible function of recorded history
// rather than a mutable field that can drift.

import type { InventoryItem, InventoryMovement } from '@/lib/types'

export function computeClosingStock(item: InventoryItem, movements: InventoryMovement[]): number {
  const itemMovements = movements.filter((m) => m.itemId === item.id)
  let stock = item.openingStock
  for (const m of itemMovements) {
    if (m.type === 'received') stock += m.quantity
    else if (m.type === 'consumed') stock -= m.quantity
    else stock += m.quantity // adjustment: signed value
  }
  return stock
}

export function isLowStock(item: InventoryItem, closingStock: number): boolean {
  return closingStock <= item.lowStockThreshold
}

/** Validate that a consumption/adjustment movement will not drive stock
 *  negative, unless explicitly authorised. */
export function wouldGoNegative(item: InventoryItem, movements: InventoryMovement[], newMovement: { type: InventoryMovement['type']; quantity: number }): boolean {
  const current = computeClosingStock(item, movements)
  if (newMovement.type === 'received') return false
  const delta = newMovement.type === 'consumed' ? -newMovement.quantity : newMovement.quantity
  return current + delta < 0
}
