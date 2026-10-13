// Shared domain types for BrightNest Food Solutions local dashboard.
// Money is stored as integer paise (1 rupee = 100 paise) everywhere to avoid
// floating point rounding errors. Use rupeesToPaise / paiseToRupees to convert
// at the UI boundary only.

export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Other'

export type RecordSource = 'manual' | 'imported' | 'demo'

export interface Canteen {
  id: string
  name: string
  address: string
  contactPerson: string
  phone: string
  email: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface SalesRecord {
  id: string
  canteenId: string
  date: string // YYYY-MM-DD, Asia/Kolkata calendar day
  amountPaise: number
  paymentMethod: PaymentMethod
  reference: string
  description: string
  source: RecordSource
  importId?: string
  reversed?: boolean
  createdAt: string
  updatedAt: string
}

export type ExpenseCategory =
  | 'Groceries & Raw Material'
  | 'Utilities'
  | 'Rent'
  | 'Salaries'
  | 'Maintenance'
  | 'Transport'
  | 'Vendor Payment'
  | 'Other'

export interface ExpenseRecord {
  id: string
  canteenId: string
  date: string
  amountPaise: number
  category: ExpenseCategory
  paymentMethod: PaymentMethod
  vendorId?: string
  reference: string
  description: string
  source: RecordSource
  importId?: string
  reversed?: boolean
  /** true if this expense is simply settling an existing purchase liability
   *  (i.e. a vendor payment that is already reflected in Purchases) so the
   *  calculation engine can avoid double counting it as a fresh operating expense. */
  isLiabilitySettlement?: boolean
  createdAt: string
  updatedAt: string
}

export type PaymentStatus = 'Unpaid' | 'Partially Paid' | 'Paid'

export interface Vendor {
  id: string
  name: string
  contactPerson: string
  phone: string
  email: string
  notes: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface PurchaseRecord {
  id: string
  canteenId: string
  vendorId: string
  date: string
  itemDescription: string
  quantity: number
  unitCostPaise: number
  totalPaise: number
  reference: string
  paymentStatus: PaymentStatus
  source: RecordSource
  importId?: string
  reversed?: boolean
  createdAt: string
  updatedAt: string
}

export interface VendorPaymentRecord {
  id: string
  vendorId: string
  canteenId: string
  purchaseId?: string // optional link to a specific purchase being settled
  date: string
  amountPaise: number
  paymentMethod: PaymentMethod
  reference: string
  notes: string
  isAdvance: boolean
  createdAt: string
  updatedAt: string
}

export interface CollectionRecord {
  id: string
  canteenId: string
  date: string
  paymentMethod: PaymentMethod
  expectedPaise: number
  actualPaise: number
  notes: string
  reference: string
  reviewed: boolean
  linkedSalesIds: string[]
  createdAt: string
  updatedAt: string
}

export interface StaffMember {
  id: string
  name: string
  canteenId: string
  role: string
  phone: string
  monthlySalaryPaise: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface SalaryPaymentRecord {
  id: string
  staffId: string
  canteenId: string
  period: string // YYYY-MM
  amountDuePaise: number
  amountPaidPaise: number
  date: string
  paymentMethod: PaymentMethod
  notes: string
  createdAt: string
  updatedAt: string
}

export type InventoryUnit = 'kg' | 'g' | 'l' | 'ml' | 'pcs' | 'box' | 'packet' | 'other'

export interface InventoryItem {
  id: string
  canteenId: string
  name: string
  category: string
  unit: InventoryUnit
  openingStock: number
  lowStockThreshold: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export type InventoryMovementType = 'received' | 'consumed' | 'adjustment'

export interface InventoryMovement {
  id: string
  itemId: string
  canteenId: string
  date: string
  type: InventoryMovementType
  quantity: number // positive for received, positive for consumed (subtracted), signed for adjustment
  notes: string
  createdAt: string
}

export type ImportCategory = 'sales' | 'expenses' | 'purchases'

export type ImportStatus = 'Imported' | 'Reversed' | 'Failed'

export interface ImportRecord {
  id: string
  filename: string
  category: ImportCategory
  canteenId: string
  importedAt: string
  totalRows: number
  acceptedRows: number
  rejectedRows: number
  duplicateRows: number
  status: ImportStatus
  recordIds: string[]
  columnMapping: Record<string, string>
  rejectedRowsCsv?: string
}

export interface AuditLogEntry {
  id: string
  timestamp: string
  action: string
  entityType: string
  entityId: string
  details: string
}

export interface AppSettings {
  id: 'app'
  businessName: string
  currency: 'INR'
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  demoDataLoaded: boolean
}

/** A configured profit-sharing party. The owner must explicitly define these
 *  — nothing is assumed or hardcoded (e.g. never assume a 50/50 split). */
export interface ProfitSharingRule {
  id: string
  partyName: string
  percentage: number // 0-100, up to 2 decimal places
  effectiveDate: string // YYYY-MM-DD
  notes: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other']

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Groceries & Raw Material',
  'Utilities',
  'Rent',
  'Salaries',
  'Maintenance',
  'Transport',
  'Vendor Payment',
  'Other',
]
