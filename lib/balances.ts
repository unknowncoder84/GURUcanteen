// Vendor outstanding balance and staff salary outstanding balance logic.
// Kept separate from calculations.ts (sales/expense P&L) because these are
// liability balances, not revenue/expense recognition.

import type { PurchaseRecord, SalaryPaymentRecord, StaffMember, VendorPaymentRecord } from '@/lib/types'

export interface VendorBalance {
  vendorId: string
  totalPurchasedPaise: number
  totalPaidPaise: number
  outstandingPaise: number
  advancePaise: number
}

/** Outstanding = purchases attributable to the vendor minus payments made to
 *  that vendor (excluding payments explicitly marked as advances, which are
 *  tracked separately and not netted against existing liabilities). */
export function computeVendorBalance(
  vendorId: string,
  purchases: PurchaseRecord[],
  payments: VendorPaymentRecord[]
): VendorBalance {
  const vendorPurchases = purchases.filter((p) => p.vendorId === vendorId && !p.reversed)
  const vendorPayments = payments.filter((p) => p.vendorId === vendorId)

  const totalPurchasedPaise = vendorPurchases.reduce((n, p) => n + p.totalPaise, 0)
  const settlementPayments = vendorPayments.filter((p) => !p.isAdvance)
  const advancePayments = vendorPayments.filter((p) => p.isAdvance)

  const totalPaidPaise = settlementPayments.reduce((n, p) => n + p.amountPaise, 0)
  const advancePaise = advancePayments.reduce((n, p) => n + p.amountPaise, 0)

  const outstandingPaise = Math.max(0, totalPurchasedPaise - totalPaidPaise - advancePaise)

  return { vendorId, totalPurchasedPaise, totalPaidPaise, outstandingPaise, advancePaise }
}

/** Maximum amount that can be recorded as a non-advance settlement payment
 *  right now, so the UI can block accidental overpayment. */
export function maxSettlementPaise(balance: VendorBalance): number {
  return balance.outstandingPaise
}

export interface SalaryBalance {
  staffId: string
  totalDuePaise: number
  totalPaidPaise: number
  outstandingPaise: number
}

export function computeSalaryBalance(staffId: string, payments: SalaryPaymentRecord[]): SalaryBalance {
  const staffPayments = payments.filter((p) => p.staffId === staffId)
  const totalDuePaise = staffPayments.reduce((n, p) => n + p.amountDuePaise, 0)
  const totalPaidPaise = staffPayments.reduce((n, p) => n + p.amountPaidPaise, 0)
  return { staffId, totalDuePaise, totalPaidPaise, outstandingPaise: Math.max(0, totalDuePaise - totalPaidPaise) }
}

export function computeAllSalaryBalances(staff: StaffMember[], payments: SalaryPaymentRecord[]): SalaryBalance[] {
  return staff.map((s) => computeSalaryBalance(s.id, payments))
}

export function computeAllVendorBalances(vendors: { id: string }[], purchases: PurchaseRecord[], payments: VendorPaymentRecord[]): VendorBalance[] {
  return vendors.map((v) => computeVendorBalance(v.id, purchases, payments))
}
