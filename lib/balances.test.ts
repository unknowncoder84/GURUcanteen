import { describe, it, expect } from 'vitest'
import { computeVendorBalance, computeSalaryBalance } from '@/lib/balances'
import type { PurchaseRecord, SalaryPaymentRecord, VendorPaymentRecord } from '@/lib/types'

function purchase(partial: Partial<PurchaseRecord>): PurchaseRecord {
  return {
    id: 'p1',
    canteenId: 'c1',
    vendorId: 'v1',
    date: '2026-10-01',
    itemDescription: 'Rice',
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

function payment(partial: Partial<VendorPaymentRecord>): VendorPaymentRecord {
  return {
    id: 'vp1',
    vendorId: 'v1',
    canteenId: 'c1',
    date: '2026-10-02',
    amountPaise: 50000,
    paymentMethod: 'Cash',
    reference: '',
    notes: '',
    isAdvance: false,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    ...partial,
  }
}

describe('vendor balances', () => {
  it('computes outstanding balance as purchases minus settlement payments', () => {
    const balance = computeVendorBalance('v1', [purchase({ totalPaise: 100000 })], [payment({ amountPaise: 40000 })])
    expect(balance.totalPurchasedPaise).toBe(100000)
    expect(balance.totalPaidPaise).toBe(40000)
    expect(balance.outstandingPaise).toBe(60000)
  })

  it('tracks advance payments separately and nets them against outstanding (prepaid credit)', () => {
    const balance = computeVendorBalance(
      'v1',
      [purchase({ totalPaise: 100000 })],
      [payment({ amountPaise: 30000, isAdvance: true })]
    )
    // Advances reduce the outstanding liability (prepaid credit) while still
    // being reported separately via advancePaise, distinct from settlement payments.
    expect(balance.outstandingPaise).toBe(70000)
    expect(balance.advancePaise).toBe(30000)
    expect(balance.totalPaidPaise).toBe(0) // advance is not counted as a settlement payment
  })

  it('never returns a negative outstanding balance even if overpaid', () => {
    const balance = computeVendorBalance('v1', [purchase({ totalPaise: 50000 })], [payment({ amountPaise: 90000 })])
    expect(balance.outstandingPaise).toBe(0)
  })

  it('excludes reversed purchases from the balance', () => {
    const balance = computeVendorBalance('v1', [purchase({ totalPaise: 100000, reversed: true })], [])
    expect(balance.totalPurchasedPaise).toBe(0)
  })
})

describe('salary balances', () => {
  function salaryPayment(partial: Partial<SalaryPaymentRecord>): SalaryPaymentRecord {
    return {
      id: 'sp1',
      staffId: 's1',
      canteenId: 'c1',
      period: '2026-10',
      amountDuePaise: 2000000,
      amountPaidPaise: 1500000,
      date: '2026-10-05',
      paymentMethod: 'Bank Transfer',
      notes: '',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
      ...partial,
    }
  }

  it('computes outstanding salary from due minus paid', () => {
    const balance = computeSalaryBalance('s1', [salaryPayment({})])
    expect(balance.outstandingPaise).toBe(500000)
  })

  it('does not double count across multiple partial payments for different periods', () => {
    const balance = computeSalaryBalance('s1', [
      salaryPayment({ period: '2026-09', amountDuePaise: 2000000, amountPaidPaise: 2000000 }),
      salaryPayment({ period: '2026-10', amountDuePaise: 2000000, amountPaidPaise: 1000000 }),
    ])
    expect(balance.totalDuePaise).toBe(4000000)
    expect(balance.totalPaidPaise).toBe(3000000)
    expect(balance.outstandingPaise).toBe(1000000)
  })
})
