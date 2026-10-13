import { describe, it, expect } from 'vitest'
import { filterSalesBySearch, filterExpensesBySearch, filterPurchasesBySearch } from '@/lib/search'
import type { ExpenseRecord, ImportRecord, PurchaseRecord, SalesRecord, StaffMember, Vendor } from '@/lib/types'

const vendor: Vendor = {
  id: 'vendor_1',
  name: 'Fresh Produce Co',
  contactPerson: '',
  phone: '',
  email: '',
  notes: '',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const staffMember: StaffMember = {
  id: 'staff_1',
  name: 'Rahul Sharma',
  canteenId: 'c1',
  role: 'Cook',
  phone: '',
  monthlySalaryPaise: 2000000,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const importRecord: ImportRecord = {
  id: 'import_1',
  filename: 'october-sales-report.xlsx',
  category: 'sales',
  canteenId: 'c1',
  importedAt: '2026-10-01T00:00:00.000Z',
  totalRows: 10,
  acceptedRows: 10,
  rejectedRows: 0,
  duplicateRows: 0,
  status: 'Imported',
  recordIds: [],
  columnMapping: {},
}

const ctx = { vendors: [vendor], staff: [staffMember], imports: [importRecord] }

function sale(partial: Partial<SalesRecord>): SalesRecord {
  return {
    id: 'sale_1',
    canteenId: 'c1',
    date: '2026-10-01',
    amountPaise: 10000,
    paymentMethod: 'Cash',
    reference: 'INV-001',
    description: 'Lunch counter sales',
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  }
}

function expense(partial: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    id: 'expense_1',
    canteenId: 'c1',
    date: '2026-10-01',
    amountPaise: 5000,
    category: 'Groceries & Raw Material',
    paymentMethod: 'Cash',
    reference: '',
    description: 'Vegetables purchase',
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  }
}

function purchase(partial: Partial<PurchaseRecord>): PurchaseRecord {
  return {
    id: 'purchase_1',
    canteenId: 'c1',
    vendorId: 'vendor_1',
    date: '2026-10-01',
    itemDescription: 'Rice sacks',
    quantity: 10,
    unitCostPaise: 10000,
    totalPaise: 100000,
    reference: '',
    paymentStatus: 'Unpaid',
    source: 'manual',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  }
}

describe('search across stored records (not just visible rows)', () => {
  it('an empty query matches everything', () => {
    const sales = [sale({}), sale({ id: 's2', description: 'Snacks' })]
    expect(filterSalesBySearch(sales, '', ctx)).toHaveLength(2)
  })

  it('matches sales by description', () => {
    const sales = [sale({ description: 'Lunch counter sales' }), sale({ id: 's2', description: 'Snack bar' })]
    expect(filterSalesBySearch(sales, 'snack', ctx)).toHaveLength(1)
  })

  it('matches sales by reference/invoice number', () => {
    const sales = [sale({ reference: 'INV-001' }), sale({ id: 's2', reference: 'INV-002' })]
    expect(filterSalesBySearch(sales, 'inv-002', ctx)).toHaveLength(1)
  })

  it('matches sales by the originating import filename', () => {
    const sales = [sale({ importId: 'import_1' }), sale({ id: 's2', importId: undefined })]
    expect(filterSalesBySearch(sales, 'october-sales-report', ctx)).toHaveLength(1)
  })

  it('matches expenses by category', () => {
    const expenses = [expense({ category: 'Groceries & Raw Material' }), expense({ id: 'e2', category: 'Rent' })]
    expect(filterExpensesBySearch(expenses, 'groceries', ctx)).toHaveLength(1)
  })

  it('matches expenses by vendor name', () => {
    const expenses = [expense({ vendorId: 'vendor_1' }), expense({ id: 'e2', vendorId: undefined })]
    expect(filterExpensesBySearch(expenses, 'fresh produce', ctx)).toHaveLength(1)
  })

  it('matches purchases by vendor name and item description', () => {
    const purchases = [purchase({ itemDescription: 'Rice sacks' }), purchase({ id: 'p2', itemDescription: 'Cooking oil', vendorId: 'other-vendor' })]
    expect(filterPurchasesBySearch(purchases, 'fresh produce', ctx)).toHaveLength(1)
    expect(filterPurchasesBySearch(purchases, 'cooking oil', ctx)).toHaveLength(1)
  })

  it('search is case-insensitive and trims whitespace', () => {
    const sales = [sale({ description: 'Lunch Counter Sales' })]
    expect(filterSalesBySearch(sales, '  LUNCH  ', ctx)).toHaveLength(1)
  })

  it('operates on the full given dataset, not a truncated slice', () => {
    const manySales = Array.from({ length: 500 }, (_, i) => sale({ id: `s${i}`, description: i === 499 ? 'needle-in-haystack' : `row ${i}` }))
    expect(filterSalesBySearch(manySales, 'needle-in-haystack', ctx)).toHaveLength(1)
  })
})
