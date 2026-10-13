'use client'

// Central data hook: loads all tables from IndexedDB once, exposes a
// `refresh()` so pages can keep React state synchronised with the database
// after every mutation (create/update/delete/import/restore).

import { useCallback, useEffect, useState } from 'react'
import { getDb } from '@/lib/db/schema'
import { initializeDatabase } from '@/lib/db/seed'
import type {
  AppSettings,
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

export interface AppData {
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
  profitSharingRules: ProfitSharingRule[]
  settings: AppSettings
}

async function loadAll(): Promise<AppData> {
  await initializeDatabase()
  const db = getDb()
  const [
    canteens, sales, expenses, purchases, vendors, vendorPayments,
    collections, staff, salaryPayments, inventoryItems, inventoryMovements,
    imports, profitSharingRules, settingsRow,
  ] = await Promise.all([
    db.canteens.toArray(), db.sales.toArray(), db.expenses.toArray(), db.purchases.toArray(),
    db.vendors.toArray(), db.vendorPayments.toArray(), db.collections.toArray(), db.staff.toArray(),
    db.salaryPayments.toArray(), db.inventoryItems.toArray(), db.inventoryMovements.toArray(),
    db.imports.toArray(), db.profitSharingRules.toArray(), db.settings.get('app'),
  ])
  const settings: AppSettings = settingsRow ?? {
    id: 'app',
    businessName: 'BrightNest Food Solutions',
    currency: 'INR',
    dateFormat: 'DD/MM/YYYY',
    demoDataLoaded: false,
  }
  return {
    canteens, sales, expenses, purchases, vendors, vendorPayments,
    collections, staff, salaryPayments, inventoryItems, inventoryMovements,
    imports, profitSharingRules, settings,
  }
}

export function useAppData() {
  const [data, setData] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await loadAll()
      setData(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load local database')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
