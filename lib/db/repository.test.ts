import { describe, it, expect, beforeEach } from 'vitest'
import { getDb } from '@/lib/db/schema'
import {
  createCanteen,
  updateCanteen,
  setCanteenActive,
  createSale,
  updateSale,
  createExpense,
  updateExpense,
  createVendor,
  createPurchase,
  createVendorPayment,
} from '@/lib/db/repository'

beforeEach(async () => {
  const db = getDb()
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('canteen management', () => {
  it('keeps the same permanent ID when a canteen is renamed', async () => {
    const canteen = await createCanteen({ name: 'Original Name', address: '', contactPerson: '', phone: '', email: '', active: true })
    const originalId = canteen.id

    await updateCanteen(canteen.id, { name: 'Renamed Canteen' })

    const db = getDb()
    const reloaded = await db.canteens.get(originalId)
    expect(reloaded?.id).toBe(originalId)
    expect(reloaded?.name).toBe('Renamed Canteen')
  })

  it('keeps historical transactions linked to the canteen ID after a rename', async () => {
    const canteen = await createCanteen({ name: 'Lower Parel', address: '', contactPerson: '', phone: '', email: '', active: true })
    const sale = await createSale({
      canteenId: canteen.id,
      date: '2026-10-01',
      amountPaise: 50000,
      paymentMethod: 'Cash',
      reference: '',
      description: 'Lunch sales',
      source: 'manual',
    })

    await updateCanteen(canteen.id, { name: 'Lower Parel (Renamed)' })

    const db = getDb()
    const reloadedSale = await db.sales.get(sale.id)
    expect(reloadedSale?.canteenId).toBe(canteen.id)
  })

  it('deactivating a canteen does not delete it or its historical records', async () => {
    const canteen = await createCanteen({ name: 'To Deactivate', address: '', contactPerson: '', phone: '', email: '', active: true })
    await createSale({ canteenId: canteen.id, date: '2026-10-01', amountPaise: 10000, paymentMethod: 'Cash', reference: '', description: 'x', source: 'manual' })

    await setCanteenActive(canteen.id, false)

    const db = getDb()
    const reloaded = await db.canteens.get(canteen.id)
    expect(reloaded).toBeDefined()
    expect(reloaded?.active).toBe(false)
    const sales = await db.sales.where('canteenId').equals(canteen.id).toArray()
    expect(sales).toHaveLength(1)
  })
})

describe('sales and expenses CRUD', () => {
  it('creates and edits a sale record', async () => {
    const canteen = await createCanteen({ name: 'C1', address: '', contactPerson: '', phone: '', email: '', active: true })
    const sale = await createSale({ canteenId: canteen.id, date: '2026-10-01', amountPaise: 10000, paymentMethod: 'Cash', reference: '', description: 'Original', source: 'manual' })
    await updateSale(sale.id, { description: 'Updated description', amountPaise: 20000 })

    const db = getDb()
    const reloaded = await db.sales.get(sale.id)
    expect(reloaded?.description).toBe('Updated description')
    expect(reloaded?.amountPaise).toBe(20000)
  })

  it('creates and edits an expense record', async () => {
    const canteen = await createCanteen({ name: 'C1', address: '', contactPerson: '', phone: '', email: '', active: true })
    const expense = await createExpense({
      canteenId: canteen.id,
      date: '2026-10-01',
      amountPaise: 5000,
      category: 'Utilities',
      paymentMethod: 'Cash',
      reference: '',
      description: 'Electricity',
      source: 'manual',
    })
    await updateExpense(expense.id, { category: 'Maintenance' })

    const db = getDb()
    const reloaded = await db.expenses.get(expense.id)
    expect(reloaded?.category).toBe('Maintenance')
  })
})

describe('vendor payment double-counting prevention', () => {
  it('a vendor payment settling an existing purchase is a distinct record from the purchase, not a second expense entry', async () => {
    const canteen = await createCanteen({ name: 'C1', address: '', contactPerson: '', phone: '', email: '', active: true })
    const vendor = await createVendor({ name: 'Vendor A', contactPerson: '', phone: '', email: '', notes: '', active: true })
    const purchase = await createPurchase({
      canteenId: canteen.id,
      vendorId: vendor.id,
      date: '2026-10-01',
      itemDescription: 'Rice',
      quantity: 10,
      unitCostPaise: 10000,
      totalPaise: 100000,
      reference: '',
      paymentStatus: 'Unpaid',
      source: 'manual',
    })
    await createVendorPayment({
      vendorId: vendor.id,
      canteenId: canteen.id,
      purchaseId: purchase.id,
      date: '2026-10-02',
      amountPaise: 100000,
      paymentMethod: 'Cash',
      reference: '',
      notes: '',
      isAdvance: false,
    })

    const db = getDb()
    const expenses = await db.expenses.toArray()
    // No expense record should have been created merely from settling a purchase.
    expect(expenses).toHaveLength(0)
    const payments = await db.vendorPayments.toArray()
    expect(payments).toHaveLength(1)
  })
})
