// Full JSON backup and restore. Preserves record IDs, canteen IDs,
// relationships, import history, audit history, and settings. Validates
// backups thoroughly before restoring and never partially overwrites data
// without explicit confirmation from the caller.

import { getDb } from '@/lib/db/schema'
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

export interface BackupPayload {
  schemaVersion: 1 | 2
  exportedAt: string
  canteens: Canteen[]
  sales: SalesRecord[]
  expenses: ExpenseRecord[]
  purchases: PurchaseRecord[]
  vendors: Vendor[]
  vendorPayments: VendorPaymentRecord[]
  collections: CollectionRecord[]
  staff: StaffMember[]
  salaryPayments: SalaryPaymentRecord[]
  inventoryItems: InventoryItem[]
  inventoryMovements: InventoryMovement[]
  imports: ImportRecord[]
  auditLog: AuditLogEntry[]
  settings: AppSettings[]
  /** Added in schemaVersion 2. May be absent on older (v1) backup files. */
  profitSharingRules?: ProfitSharingRule[]
}

export async function buildBackup(): Promise<BackupPayload> {
  const db = getDb()
  const [
    canteens, sales, expenses, purchases, vendors, vendorPayments,
    collections, staff, salaryPayments, inventoryItems, inventoryMovements,
    imports, auditLog, settings, profitSharingRules,
  ] = await Promise.all([
    db.canteens.toArray(), db.sales.toArray(), db.expenses.toArray(), db.purchases.toArray(),
    db.vendors.toArray(), db.vendorPayments.toArray(), db.collections.toArray(), db.staff.toArray(),
    db.salaryPayments.toArray(), db.inventoryItems.toArray(), db.inventoryMovements.toArray(),
    db.imports.toArray(), db.auditLog.toArray(), db.settings.toArray(), db.profitSharingRules.toArray(),
  ])
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    canteens, sales, expenses, purchases, vendors, vendorPayments,
    collections, staff, salaryPayments, inventoryItems, inventoryMovements,
    imports, auditLog, settings, profitSharingRules,
  }
}

export interface BackupValidationResult {
  valid: boolean
  errors: string[]
  summary?: Record<string, number>
}

const REQUIRED_ARRAY_KEYS: (keyof Omit<BackupPayload, 'profitSharingRules' | 'schemaVersion' | 'exportedAt'>)[] = [
  'canteens', 'sales', 'expenses', 'purchases', 'vendors', 'vendorPayments',
  'collections', 'staff', 'salaryPayments', 'inventoryItems', 'inventoryMovements',
  'imports', 'auditLog', 'settings',
]

export function validateBackup(data: unknown): BackupValidationResult {
  const errors: string[] = []
  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['File is not a valid JSON object'] }
  }
  const obj = data as Record<string, unknown>

  if (obj.schemaVersion !== 1 && obj.schemaVersion !== 2) {
    errors.push('Unrecognised or missing schemaVersion (expected 1 or 2)')
  }
  for (const key of REQUIRED_ARRAY_KEYS) {
    if (!Array.isArray(obj[key])) {
      errors.push(`Missing or invalid "${key}" array`)
    }
  }
  // profitSharingRules is optional for backward compatibility with v1 backups,
  // but if present it must be an array.
  if (obj.profitSharingRules !== undefined && !Array.isArray(obj.profitSharingRules)) {
    errors.push('Invalid "profitSharingRules" array')
  }
  if (errors.length > 0) {
    return { valid: false, errors }
  }

  const payload = obj as unknown as BackupPayload
  // Spot-check required ID fields exist on canteens and sales to catch
  // corrupted/foreign backup files.
  if (payload.canteens.some((c) => !c.id || !c.name)) {
    errors.push('One or more canteen records are missing an id or name')
  }
  if (payload.sales.some((s) => !s.id || !s.canteenId || typeof s.amountPaise !== 'number')) {
    errors.push('One or more sales records are missing required fields')
  }

  const summary = Object.fromEntries(REQUIRED_ARRAY_KEYS.map((k) => [k, (payload[k] as unknown[]).length]))
  summary.profitSharingRules = (payload.profitSharingRules ?? []).length

  return { valid: errors.length === 0, errors, summary }
}

export type RestoreStrategy = 'replace' | 'merge'

/** Restore a validated backup. "replace" clears all local tables first;
 *  "merge" upserts by ID, leaving unrelated existing records untouched. */
export async function restoreBackup(payload: BackupPayload, strategy: RestoreStrategy): Promise<void> {
  const db = getDb()
  const allTables = [
    db.canteens, db.sales, db.expenses, db.purchases, db.vendors, db.vendorPayments,
    db.collections, db.staff, db.salaryPayments, db.inventoryItems, db.inventoryMovements,
    db.imports, db.auditLog, db.settings, db.profitSharingRules,
  ]

  await db.transaction(
    'rw',
    allTables,
    async () => {
      if (strategy === 'replace') {
        await Promise.all([
          db.canteens.clear(), db.sales.clear(), db.expenses.clear(), db.purchases.clear(),
          db.vendors.clear(), db.vendorPayments.clear(), db.collections.clear(), db.staff.clear(),
          db.salaryPayments.clear(), db.inventoryItems.clear(), db.inventoryMovements.clear(),
          db.imports.clear(), db.auditLog.clear(), db.settings.clear(), db.profitSharingRules.clear(),
        ])
      }
      await Promise.all([
        db.canteens.bulkPut(payload.canteens),
        db.sales.bulkPut(payload.sales),
        db.expenses.bulkPut(payload.expenses),
        db.purchases.bulkPut(payload.purchases),
        db.vendors.bulkPut(payload.vendors),
        db.vendorPayments.bulkPut(payload.vendorPayments),
        db.collections.bulkPut(payload.collections),
        db.staff.bulkPut(payload.staff),
        db.salaryPayments.bulkPut(payload.salaryPayments),
        db.inventoryItems.bulkPut(payload.inventoryItems),
        db.inventoryMovements.bulkPut(payload.inventoryMovements),
        db.imports.bulkPut(payload.imports),
        db.auditLog.bulkPut(payload.auditLog),
        db.settings.bulkPut(payload.settings),
        // profitSharingRules may be absent on older (v1) backups.
        db.profitSharingRules.bulkPut(payload.profitSharingRules ?? []),
      ])
    }
  )
}

/** Full local database reset (used by Settings > Reset database). */
export async function resetDatabase(): Promise<void> {
  const db = getDb()
  const allTables = [
    db.canteens, db.sales, db.expenses, db.purchases, db.vendors, db.vendorPayments,
    db.collections, db.staff, db.salaryPayments, db.inventoryItems, db.inventoryMovements,
    db.imports, db.auditLog, db.settings, db.profitSharingRules,
  ]
  await db.transaction(
    'rw',
    allTables,
    async () => {
      await Promise.all([
        db.canteens.clear(), db.sales.clear(), db.expenses.clear(), db.purchases.clear(),
        db.vendors.clear(), db.vendorPayments.clear(), db.collections.clear(), db.staff.clear(),
        db.salaryPayments.clear(), db.inventoryItems.clear(), db.inventoryMovements.clear(),
        db.imports.clear(), db.auditLog.clear(), db.settings.clear(), db.profitSharingRules.clear(),
      ])
    }
  )
}
