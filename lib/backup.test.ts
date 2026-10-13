import { describe, it, expect, beforeEach } from 'vitest'
import { getDb } from '@/lib/db/schema'
import { createCanteen, createSale, createProfitSharingRule } from '@/lib/db/repository'
import { buildBackup, validateBackup, restoreBackup, resetDatabase } from '@/lib/backup'

beforeEach(async () => {
  const db = getDb()
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('backup and restore', () => {
  it('builds a backup containing all canteens, sales, and relationships', async () => {
    const canteen = await createCanteen({ name: 'Backup Canteen', address: '', contactPerson: '', phone: '', email: '', active: true })
    await createSale({ canteenId: canteen.id, date: '2026-10-01', amountPaise: 10000, paymentMethod: 'Cash', reference: '', description: 'test', source: 'manual' })

    const backup = await buildBackup()
    expect(backup.canteens).toHaveLength(1)
    expect(backup.sales).toHaveLength(1)
    expect(backup.sales[0].canteenId).toBe(canteen.id)
    expect(backup.schemaVersion).toBe(2)
  })

  it('includes configured profit-sharing rules in the backup', async () => {
    await createProfitSharingRule({ partyName: 'Owner A', percentage: 60, effectiveDate: '2026-01-01', notes: '', active: true })
    await createProfitSharingRule({ partyName: 'Owner B', percentage: 40, effectiveDate: '2026-01-01', notes: '', active: true })

    const backup = await buildBackup()
    expect(backup.profitSharingRules).toHaveLength(2)
    expect(backup.profitSharingRules!.reduce((n, r) => n + r.percentage, 0)).toBe(100)
  })

  it('validates a v1-style backup lacking profitSharingRules as backward compatible', () => {
    const result = validateBackup({
      schemaVersion: 1,
      canteens: [],
      sales: [],
      expenses: [],
      purchases: [],
      vendors: [],
      vendorPayments: [],
      collections: [],
      staff: [],
      salaryPayments: [],
      inventoryItems: [],
      inventoryMovements: [],
      imports: [],
      auditLog: [],
      settings: [],
      // profitSharingRules intentionally omitted, as a real v1 backup would.
    })
    expect(result.valid).toBe(true)
  })

  it('restoring a v1-style backup without profitSharingRules does not throw and leaves the table empty', async () => {
    const v1Backup = {
      schemaVersion: 1 as const,
      exportedAt: new Date().toISOString(),
      canteens: [],
      sales: [],
      expenses: [],
      purchases: [],
      vendors: [],
      vendorPayments: [],
      collections: [],
      staff: [],
      salaryPayments: [],
      inventoryItems: [],
      inventoryMovements: [],
      imports: [],
      auditLog: [],
      settings: [],
    }
    await expect(restoreBackup(v1Backup, 'replace')).resolves.not.toThrow()
    const db = getDb()
    expect(await db.profitSharingRules.count()).toBe(0)
  })

  it('rejects a structurally invalid backup instead of attempting a partial restore', () => {
    const result = validateBackup({ not: 'a backup' })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects a backup with records missing required fields', () => {
    const result = validateBackup({
      schemaVersion: 1,
      canteens: [{ id: '', name: '' }],
      sales: [],
      expenses: [],
      purchases: [],
      vendors: [],
      vendorPayments: [],
      collections: [],
      staff: [],
      salaryPayments: [],
      inventoryItems: [],
      inventoryMovements: [],
      imports: [],
      auditLog: [],
      settings: [],
    })
    expect(result.valid).toBe(false)
  })

  it('restore with "merge" keeps unrelated existing records untouched', async () => {
    const existingCanteen = await createCanteen({ name: 'Existing', address: '', contactPerson: '', phone: '', email: '', active: true })
    const backup = await buildBackup()
    // Simulate an external backup containing a different canteen.
    backup.canteens.push({
      id: 'canteen_external',
      name: 'Imported Canteen',
      address: '',
      contactPerson: '',
      phone: '',
      email: '',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await restoreBackup(backup, 'merge')

    const db = getDb()
    const canteens = await db.canteens.toArray()
    expect(canteens.some((c) => c.id === existingCanteen.id)).toBe(true)
    expect(canteens.some((c) => c.id === 'canteen_external')).toBe(true)
  })

  it('restore with "replace" clears existing data before restoring', async () => {
    await createCanteen({ name: 'Will be replaced', address: '', contactPerson: '', phone: '', email: '', active: true })
    const freshBackup = await buildBackup() // snapshot includes "Will be replaced"

    await resetDatabase()
    await createCanteen({ name: 'Should disappear after replace restore', address: '', contactPerson: '', phone: '', email: '', active: true })

    await restoreBackup(freshBackup, 'replace')

    const db = getDb()
    const canteens = await db.canteens.toArray()
    expect(canteens.some((c) => c.name === 'Should disappear after replace restore')).toBe(false)
    expect(canteens.some((c) => c.name === 'Will be replaced')).toBe(true)
  })

  it('resetDatabase clears every table', async () => {
    await createCanteen({ name: 'X', address: '', contactPerson: '', phone: '', email: '', active: true })
    await resetDatabase()
    const db = getDb()
    const counts = await Promise.all(db.tables.map((t) => t.count()))
    expect(counts.every((c) => c === 0)).toBe(true)
  })
})
