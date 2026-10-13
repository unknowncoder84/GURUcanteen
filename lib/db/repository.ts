import { getDb } from '@/lib/db/schema'
import { generateId, nowIso } from '@/lib/id'
import type {
  AppSettings,
  AuditLogEntry,
  Canteen,
  CollectionRecord,
  ExpenseRecord,
  ImportRecord,
  InventoryItem,
  InventoryMovement,
  ProfitSharingRule,
  PurchaseRecord,
  SalaryPaymentRecord,
  SalesRecord,
  StaffMember,
  Vendor,
  VendorPaymentRecord,
} from '@/lib/types'

async function writeAudit(action: string, entityType: string, entityId: string, details: string) {
  const db = getDb()
  const entry: AuditLogEntry = {
    id: generateId('audit'),
    timestamp: nowIso(),
    action,
    entityType,
    entityId,
    details,
  }
  await db.auditLog.add(entry)
}

// ---------------------------------------------------------------------------
// Canteens
// ---------------------------------------------------------------------------
export async function listCanteens(): Promise<Canteen[]> {
  return getDb().canteens.toArray()
}

export async function createCanteen(input: Omit<Canteen, 'id' | 'createdAt' | 'updatedAt'>): Promise<Canteen> {
  const db = getDb()
  const canteen: Canteen = { ...input, id: generateId('canteen'), createdAt: nowIso(), updatedAt: nowIso() }
  await db.canteens.add(canteen)
  await writeAudit('create', 'canteen', canteen.id, `Created canteen "${canteen.name}"`)
  return canteen
}

export async function updateCanteen(id: string, patch: Partial<Omit<Canteen, 'id' | 'createdAt'>>): Promise<void> {
  const db = getDb()
  // The ID is never regenerated here, so renaming never disconnects history.
  await db.canteens.update(id, { ...patch, updatedAt: nowIso() })
  await writeAudit('update', 'canteen', id, `Updated canteen fields: ${Object.keys(patch).join(', ')}`)
}

export async function setCanteenActive(id: string, active: boolean): Promise<void> {
  await updateCanteen(id, { active })
  await writeAudit(active ? 'activate' : 'deactivate', 'canteen', id, `Canteen ${active ? 'activated' : 'deactivated'}`)
}

// ---------------------------------------------------------------------------
// Generic record helpers (reduces duplication across modules)
// ---------------------------------------------------------------------------
function tableFor<T>(name:
  | 'sales' | 'expenses' | 'purchases' | 'vendors' | 'vendorPayments' | 'collections'
  | 'staff' | 'salaryPayments' | 'inventoryItems' | 'inventoryMovements' | 'imports') {
  const db = getDb()
  return db[name] as unknown as import('dexie').Table<T, string>
}

export async function listAll<T>(name: Parameters<typeof tableFor>[0]): Promise<T[]> {
  return tableFor<T>(name).toArray()
}

export async function getById<T>(name: Parameters<typeof tableFor>[0], id: string): Promise<T | undefined> {
  return tableFor<T>(name).get(id)
}

export async function removeById(name: Parameters<typeof tableFor>[0], id: string): Promise<void> {
  await tableFor(name).delete(id)
  await writeAudit('delete', name, id, `Deleted ${name} record`)
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
export async function createSale(input: Omit<SalesRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<SalesRecord> {
  const record: SalesRecord = { ...input, id: generateId('sale'), createdAt: nowIso(), updatedAt: nowIso() }
  await getDb().sales.add(record)
  await writeAudit('create', 'sales', record.id, `Sale ${record.amountPaise / 100} for canteen ${record.canteenId}`)
  return record
}

export async function updateSale(id: string, patch: Partial<Omit<SalesRecord, 'id' | 'createdAt'>>): Promise<void> {
  await getDb().sales.update(id, { ...patch, updatedAt: nowIso() })
  await writeAudit('update', 'sales', id, 'Updated sale record')
}

export async function bulkCreateSales(records: SalesRecord[]): Promise<void> {
  await getDb().sales.bulkAdd(records)
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
export async function createExpense(input: Omit<ExpenseRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExpenseRecord> {
  const record: ExpenseRecord = { ...input, id: generateId('expense'), createdAt: nowIso(), updatedAt: nowIso() }
  await getDb().expenses.add(record)
  await writeAudit('create', 'expenses', record.id, `Expense ${record.amountPaise / 100} for canteen ${record.canteenId}`)
  return record
}

export async function updateExpense(id: string, patch: Partial<Omit<ExpenseRecord, 'id' | 'createdAt'>>): Promise<void> {
  await getDb().expenses.update(id, { ...patch, updatedAt: nowIso() })
  await writeAudit('update', 'expenses', id, 'Updated expense record')
}

export async function bulkCreateExpenses(records: ExpenseRecord[]): Promise<void> {
  await getDb().expenses.bulkAdd(records)
}

// ---------------------------------------------------------------------------
// Vendors & Purchases
// ---------------------------------------------------------------------------
export async function createVendor(input: Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vendor> {
  const record: Vendor = { ...input, id: generateId('vendor'), createdAt: nowIso(), updatedAt: nowIso() }
  await getDb().vendors.add(record)
  await writeAudit('create', 'vendor', record.id, `Created vendor "${record.name}"`)
  return record
}

export async function updateVendor(id: string, patch: Partial<Omit<Vendor, 'id' | 'createdAt'>>): Promise<void> {
  await getDb().vendors.update(id, { ...patch, updatedAt: nowIso() })
  await writeAudit('update', 'vendor', id, 'Updated vendor record')
}

export async function createPurchase(input: Omit<PurchaseRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<PurchaseRecord> {
  const record: PurchaseRecord = { ...input, id: generateId('purchase'), createdAt: nowIso(), updatedAt: nowIso() }
  await getDb().purchases.add(record)
  await writeAudit('create', 'purchase', record.id, `Purchase ${record.totalPaise / 100} from vendor ${record.vendorId}`)
  return record
}

export async function updatePurchase(id: string, patch: Partial<Omit<PurchaseRecord, 'id' | 'createdAt'>>): Promise<void> {
  await getDb().purchases.update(id, { ...patch, updatedAt: nowIso() })
  await writeAudit('update', 'purchase', id, 'Updated purchase record')
}

export async function bulkCreatePurchases(records: PurchaseRecord[]): Promise<void> {
  await getDb().purchases.bulkAdd(records)
}

export async function createVendorPayment(input: Omit<VendorPaymentRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<VendorPaymentRecord> {
  const record: VendorPaymentRecord = { ...input, id: generateId('vendorpay'), createdAt: nowIso(), updatedAt: nowIso() }
  await getDb().vendorPayments.add(record)
  await writeAudit('create', 'vendorPayment', record.id, `Vendor payment ${record.amountPaise / 100}`)
  return record
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------
export async function createCollection(input: Omit<CollectionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CollectionRecord> {
  const record: CollectionRecord = { ...input, id: generateId('collection'), createdAt: nowIso(), updatedAt: nowIso() }
  await getDb().collections.add(record)
  await writeAudit('create', 'collection', record.id, 'Created collection record')
  return record
}

export async function updateCollection(id: string, patch: Partial<Omit<CollectionRecord, 'id' | 'createdAt'>>): Promise<void> {
  await getDb().collections.update(id, { ...patch, updatedAt: nowIso() })
  await writeAudit('update', 'collection', id, 'Updated collection record')
}

// ---------------------------------------------------------------------------
// Staff & Salaries
// ---------------------------------------------------------------------------
export async function createStaff(input: Omit<StaffMember, 'id' | 'createdAt' | 'updatedAt'>): Promise<StaffMember> {
  const record: StaffMember = { ...input, id: generateId('staff'), createdAt: nowIso(), updatedAt: nowIso() }
  await getDb().staff.add(record)
  await writeAudit('create', 'staff', record.id, `Added staff "${record.name}"`)
  return record
}

export async function updateStaff(id: string, patch: Partial<Omit<StaffMember, 'id' | 'createdAt'>>): Promise<void> {
  await getDb().staff.update(id, { ...patch, updatedAt: nowIso() })
  await writeAudit('update', 'staff', id, 'Updated staff record')
}

export async function createSalaryPayment(input: Omit<SalaryPaymentRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<SalaryPaymentRecord> {
  const record: SalaryPaymentRecord = { ...input, id: generateId('salarypay'), createdAt: nowIso(), updatedAt: nowIso() }
  await getDb().salaryPayments.add(record)
  await writeAudit('create', 'salaryPayment', record.id, `Salary payment ${record.amountPaidPaise / 100}`)
  return record
}

export async function updateSalaryPayment(id: string, patch: Partial<Omit<SalaryPaymentRecord, 'id' | 'createdAt'>>): Promise<void> {
  await getDb().salaryPayments.update(id, { ...patch, updatedAt: nowIso() })
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
export async function createInventoryItem(input: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<InventoryItem> {
  const record: InventoryItem = { ...input, id: generateId('item'), createdAt: nowIso(), updatedAt: nowIso() }
  await getDb().inventoryItems.add(record)
  await writeAudit('create', 'inventoryItem', record.id, `Added inventory item "${record.name}"`)
  return record
}

export async function updateInventoryItem(id: string, patch: Partial<Omit<InventoryItem, 'id' | 'createdAt'>>): Promise<void> {
  await getDb().inventoryItems.update(id, { ...patch, updatedAt: nowIso() })
}

export async function createInventoryMovement(input: Omit<InventoryMovement, 'id' | 'createdAt'>): Promise<InventoryMovement> {
  const record: InventoryMovement = { ...input, id: generateId('movement'), createdAt: nowIso() }
  await getDb().inventoryMovements.add(record)
  await writeAudit('create', 'inventoryMovement', record.id, `${record.type} ${record.quantity}`)
  return record
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
export async function saveImportRecord(record: ImportRecord): Promise<void> {
  await getDb().imports.add(record)
  await writeAudit('import', 'import', record.id, `Imported ${record.filename}: ${record.acceptedRows}/${record.totalRows} accepted`)
}

export async function markImportReversed(id: string): Promise<void> {
  await getDb().imports.update(id, { status: 'Reversed' })
  await writeAudit('reverse', 'import', id, 'Import reversed')
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getSettings(): Promise<AppSettings> {
  const db = getDb()
  const existing = await db.settings.get('app')
  if (existing) return existing
  const defaults: AppSettings = {
    id: 'app',
    businessName: 'BrightNest Food Solutions',
    currency: 'INR',
    dateFormat: 'DD/MM/YYYY',
    demoDataLoaded: false,
  }
  await db.settings.put(defaults)
  return defaults
}

export async function updateSettings(patch: Partial<Omit<AppSettings, 'id'>>): Promise<AppSettings> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  await getDb().settings.put(next)
  return next
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export async function listAuditLog(limit = 200): Promise<AuditLogEntry[]> {
  const all = await getDb().auditLog.orderBy('timestamp').reverse().limit(limit).toArray()
  return all
}

// ---------------------------------------------------------------------------
// Profit-sharing rules
// ---------------------------------------------------------------------------
export async function listProfitSharingRules(): Promise<ProfitSharingRule[]> {
  return getDb().profitSharingRules.toArray()
}

export async function createProfitSharingRule(
  input: Omit<ProfitSharingRule, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ProfitSharingRule> {
  const record: ProfitSharingRule = { ...input, id: generateId('share'), createdAt: nowIso(), updatedAt: nowIso() }
  await getDb().profitSharingRules.add(record)
  await writeAudit('create', 'profitSharingRule', record.id, `Added profit-sharing party "${record.partyName}" at ${record.percentage}%`)
  return record
}

export async function updateProfitSharingRule(id: string, patch: Partial<Omit<ProfitSharingRule, 'id' | 'createdAt'>>): Promise<void> {
  await getDb().profitSharingRules.update(id, { ...patch, updatedAt: nowIso() })
  await writeAudit('update', 'profitSharingRule', id, 'Updated profit-sharing rule')
}

export async function removeProfitSharingRule(id: string): Promise<void> {
  await getDb().profitSharingRules.delete(id)
  await writeAudit('delete', 'profitSharingRule', id, 'Deleted profit-sharing rule')
}

export { writeAudit }
