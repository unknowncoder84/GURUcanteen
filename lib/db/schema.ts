import Dexie, { type Table } from 'dexie'
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

// BrightNest local database. Real IndexedDB object stores (not a single JSON
// blob) with indexes for the fields we filter/search on most often.
export class BrightNestDb extends Dexie {
  canteens!: Table<Canteen, string>
  sales!: Table<SalesRecord, string>
  expenses!: Table<ExpenseRecord, string>
  purchases!: Table<PurchaseRecord, string>
  vendors!: Table<Vendor, string>
  vendorPayments!: Table<VendorPaymentRecord, string>
  collections!: Table<CollectionRecord, string>
  staff!: Table<StaffMember, string>
  salaryPayments!: Table<SalaryPaymentRecord, string>
  inventoryItems!: Table<InventoryItem, string>
  inventoryMovements!: Table<InventoryMovement, string>
  imports!: Table<ImportRecord, string>
  auditLog!: Table<AuditLogEntry, string>
  settings!: Table<AppSettings, string>
  profitSharingRules!: Table<ProfitSharingRule, string>

  constructor() {
    super('brightnest-db')

    this.version(1).stores({
      canteens: 'id, name, active',
      sales: 'id, canteenId, date, paymentMethod, source, importId',
      expenses: 'id, canteenId, date, category, paymentMethod, vendorId, source, importId',
      purchases: 'id, canteenId, vendorId, date, paymentStatus, source, importId',
      vendors: 'id, name, active',
      vendorPayments: 'id, vendorId, canteenId, purchaseId, date',
      collections: 'id, canteenId, date, paymentMethod, reviewed',
      staff: 'id, canteenId, active',
      salaryPayments: 'id, staffId, canteenId, period',
      inventoryItems: 'id, canteenId, category, active',
      inventoryMovements: 'id, itemId, canteenId, date, type',
      imports: 'id, category, canteenId, importedAt, status',
      auditLog: 'id, timestamp, entityType, entityId',
      settings: 'id',
    })

    // Version 2: adds the profit-sharing rules table. Existing stores are
    // carried forward unchanged (Dexie keeps prior stores automatically when
    // you only add a new store), so no data migration is required.
    this.version(2).stores({
      canteens: 'id, name, active',
      sales: 'id, canteenId, date, paymentMethod, source, importId',
      expenses: 'id, canteenId, date, category, paymentMethod, vendorId, source, importId',
      purchases: 'id, canteenId, vendorId, date, paymentStatus, source, importId',
      vendors: 'id, name, active',
      vendorPayments: 'id, vendorId, canteenId, purchaseId, date',
      collections: 'id, canteenId, date, paymentMethod, reviewed',
      staff: 'id, canteenId, active',
      salaryPayments: 'id, staffId, canteenId, period',
      inventoryItems: 'id, canteenId, category, active',
      inventoryMovements: 'id, itemId, canteenId, date, type',
      imports: 'id, category, canteenId, importedAt, status',
      auditLog: 'id, timestamp, entityType, entityId',
      settings: 'id',
      profitSharingRules: 'id, active, effectiveDate',
    })
  }
}

let dbInstance: BrightNestDb | null = null

/** Lazily create a single Dexie instance (browser only). */
export function getDb(): BrightNestDb {
  if (typeof window === 'undefined') {
    throw new Error('BrightNestDb can only be used in the browser')
  }
  if (!dbInstance) {
    dbInstance = new BrightNestDb()
  }
  return dbInstance
}
