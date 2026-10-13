import { getDb } from '@/lib/db/schema'
import { generateId, nowIso } from '@/lib/id'
import { getSettings, updateSettings } from '@/lib/db/repository'
import type { Canteen, ExpenseRecord, SalesRecord } from '@/lib/types'
import { todayIst } from '@/lib/dates'

/** Ensure the two initial BrightNest canteens exist. Runs once; safe to call repeatedly. */
export async function ensureInitialCanteens(): Promise<void> {
  const db = getDb()
  const count = await db.canteens.count()
  if (count > 0) return

  const base: Omit<Canteen, 'id' | 'name' | 'address'> = {
    contactPerson: '',
    phone: '',
    email: '',
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  const canteens: Canteen[] = [
    { ...base, id: generateId('canteen'), name: 'Network18 – Lower Parel', address: 'Lower Parel, Mumbai' },
    { ...base, id: generateId('canteen'), name: 'Network18 – Vikhroli', address: 'Vikhroli, Mumbai' },
  ]

  await db.canteens.bulkAdd(canteens)
}

function offsetDate(daysAgo: number): string {
  const today = new Date(todayIst())
  today.setDate(today.getDate() - daysAgo)
  return today.toISOString().slice(0, 10)
}

/** Load a clearly labelled demo dataset so an empty dashboard isn't confusing.
 *  Marked with source: 'demo' so it can be identified and cleared separately. */
export async function loadDemoData(): Promise<void> {
  const db = getDb()
  const canteens = await db.canteens.toArray()
  if (canteens.length === 0) await ensureInitialCanteens()
  const activeCanteens = await db.canteens.toArray()

  const sales: SalesRecord[] = []
  const expenses: ExpenseRecord[] = []

  activeCanteens.forEach((canteen, ci) => {
    for (let i = 0; i < 14; i++) {
      const date = offsetDate(i)
      sales.push({
        id: generateId('sale'),
        canteenId: canteen.id,
        date,
        amountPaise: (8000 + ci * 1200 + (i % 5) * 350) * 100,
        paymentMethod: i % 3 === 0 ? 'Cash' : i % 3 === 1 ? 'UPI' : 'Card',
        reference: `DEMO-S-${ci}-${i}`,
        description: 'Demo lunch & snacks sales',
        source: 'demo',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
      if (i % 2 === 0) {
        expenses.push({
          id: generateId('expense'),
          canteenId: canteen.id,
          date,
          amountPaise: (3000 + ci * 400 + (i % 4) * 200) * 100,
          category: i % 4 === 0 ? 'Groceries & Raw Material' : i % 4 === 1 ? 'Utilities' : 'Maintenance',
          paymentMethod: i % 2 === 0 ? 'Cash' : 'UPI',
          reference: `DEMO-E-${ci}-${i}`,
          description: 'Demo operating expense',
          source: 'demo',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
      }
    }
  })

  await db.sales.bulkAdd(sales)
  await db.expenses.bulkAdd(expenses)
  await updateSettings({ demoDataLoaded: true })
}

/** Remove only records explicitly marked as demo data, leaving real business data untouched. */
export async function clearDemoData(): Promise<void> {
  const db = getDb()
  await db.transaction('rw', db.sales, db.expenses, async () => {
    const demoSales = await db.sales.where('source').equals('demo').primaryKeys()
    const demoExpenses = await db.expenses.where('source').equals('demo').primaryKeys()
    await db.sales.bulkDelete(demoSales)
    await db.expenses.bulkDelete(demoExpenses)
  })
  await updateSettings({ demoDataLoaded: false })
}

export async function hasAnyBusinessData(): Promise<boolean> {
  const db = getDb()
  const [salesCount, expenseCount] = await Promise.all([db.sales.count(), db.expenses.count()])
  return salesCount > 0 || expenseCount > 0
}

export async function initializeDatabase() {
  await ensureInitialCanteens()
  await getSettings()
}
