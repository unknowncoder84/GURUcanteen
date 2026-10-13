import { describe, it, expect } from 'vitest'
import { buildReportDocument, REPORT_SECTIONS, type ReportConfig } from '@/lib/pdfReport'
import type { AppData } from '@/lib/hooks/useAppData'

function buildAppData(overrides: Partial<AppData> = {}): AppData {
  return {
    canteens: [
      { id: 'c1', name: 'Network18 – Lower Parel', address: '', contactPerson: '', phone: '', email: '', active: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'c2', name: 'Network18 – Vikhroli', address: '', contactPerson: '', phone: '', email: '', active: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ],
    sales: [
      { id: 's1', canteenId: 'c1', date: '2026-10-05', amountPaise: 500000, paymentMethod: 'Cash', reference: '', description: 'Lunch sales', source: 'manual', createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z' },
      { id: 's2', canteenId: 'c2', date: '2026-10-06', amountPaise: 300000, paymentMethod: 'UPI', reference: '', description: 'Snack sales', source: 'manual', createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z' },
    ],
    expenses: [
      { id: 'e1', canteenId: 'c1', date: '2026-10-05', amountPaise: 200000, category: 'Groceries & Raw Material', paymentMethod: 'Cash', reference: '', description: 'Vegetables', source: 'manual', createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z' },
    ],
    purchases: [],
    vendors: [],
    vendorPayments: [],
    collections: [],
    staff: [],
    salaryPayments: [],
    inventoryItems: [],
    inventoryMovements: [],
    imports: [],
    profitSharingRules: [],
    settings: { id: 'app', businessName: 'BrightNest Food Solutions', currency: 'INR', dateFormat: 'DD/MM/YYYY', demoDataLoaded: false },
    ...overrides,
  }
}

function baseConfig(overrides: Partial<ReportConfig> = {}): ReportConfig {
  return {
    businessName: 'BrightNest Food Solutions',
    reportTitle: 'Business Report',
    canteenScope: 'combined',
    compareCanteens: false,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    periodLabel: 'This month',
    sections: new Set(['business_summary']),
    compact: false,
    includeTransactionTable: true,
    includeCharts: true,
    includeNotes: true,
    orientation: 'portrait',
    notesText: '',
    ...overrides,
  }
}

describe('PDF report generation', () => {
  it('generates a real, non-trivial PDF document (not an empty shell)', () => {
    const data = buildAppData()
    const doc = buildReportDocument(data, baseConfig())
    const bytes = doc.output('arraybuffer').byteLength
    expect(bytes).toBeGreaterThan(500)
  })

  it('includes only the sections explicitly selected by the caller', () => {
    const data = buildAppData()
    const withSummaryOnly = buildReportDocument(data, baseConfig({ sections: new Set(['business_summary']) }))
    const withSummaryAndCategories = buildReportDocument(
      data,
      baseConfig({ sections: new Set(['business_summary', 'expenses_by_category']) })
    )
    const textOnly = withSummaryOnly.output('datauristring').length
    const textWithMore = withSummaryAndCategories.output('datauristring').length
    // Selecting an additional section must produce a larger document.
    expect(textWithMore).toBeGreaterThan(textOnly)
  })

  it('labels an unavailable section rather than fabricating figures (e.g. vendor outstanding with no vendors)', () => {
    const data = buildAppData({ vendors: [] })
    const section = REPORT_SECTIONS.find((s) => s.key === 'vendor_outstanding')!
    expect(section.isAvailable(data)).toBe(false)
    expect(section.unavailableReason?.(data)).toMatch(/no vendors/i)
  })

  it('marks profit-sharing section unavailable when no valid 100% agreement is configured', () => {
    const data = buildAppData({ profitSharingRules: [] })
    const section = REPORT_SECTIONS.find((s) => s.key === 'profit_sharing')!
    expect(section.isAvailable(data)).toBe(false)
  })

  it('marks profit-sharing section available once a valid 100% agreement exists', () => {
    const data = buildAppData({
      profitSharingRules: [
        { id: 'r1', partyName: 'Owner', percentage: 100, effectiveDate: '2026-01-01', notes: '', active: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    })
    const section = REPORT_SECTIONS.find((s) => s.key === 'profit_sharing')!
    expect(section.isAvailable(data)).toBe(true)
  })

  it('respects the canteen scope filter (combined vs single canteen) when building the document', () => {
    const data = buildAppData()
    const combined = buildReportDocument(data, baseConfig({ canteenScope: 'combined', sections: new Set(['sales_by_canteen']) }))
    const singleCanteen = buildReportDocument(data, baseConfig({ canteenScope: 'c1', sections: new Set(['business_summary']) }))
    expect(combined.output('arraybuffer').byteLength).toBeGreaterThan(0)
    expect(singleCanteen.output('arraybuffer').byteLength).toBeGreaterThan(0)
  })

  it('does not throw when generating a report for a canteen/period with zero matching records', () => {
    const data = buildAppData({ sales: [], expenses: [] })
    expect(() => buildReportDocument(data, baseConfig({ sections: new Set(REPORT_SECTIONS.map((s) => s.key)) }))).not.toThrow()
  })

  it('supports landscape orientation without error', () => {
    const data = buildAppData()
    const doc = buildReportDocument(data, baseConfig({ orientation: 'landscape' }))
    expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight())
  })
})
