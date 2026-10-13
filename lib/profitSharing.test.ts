import { describe, it, expect } from 'vitest'
import { validateSharingRules, computeDistribution } from '@/lib/profitSharing'
import type { ProfitSharingRule } from '@/lib/types'

function rule(partial: Partial<ProfitSharingRule>): ProfitSharingRule {
  return {
    id: 'share_1',
    partyName: 'Owner A',
    percentage: 50,
    effectiveDate: '2026-01-01',
    notes: '',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('profit-sharing rule validation', () => {
  it('reports "No profit-sharing agreement configured." when there are no rules', () => {
    const result = validateSharingRules([])
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('No profit-sharing agreement configured.')
  })

  it('reports "No profit-sharing agreement configured." when all rules are inactive', () => {
    const result = validateSharingRules([rule({ active: false, percentage: 100 })])
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('No profit-sharing agreement configured.')
  })

  it('is invalid when active percentages do not sum to exactly 100%', () => {
    const result = validateSharingRules([rule({ id: 'a', percentage: 40 }), rule({ id: 'b', percentage: 40 })])
    expect(result.valid).toBe(false)
    expect(result.totalPercentage).toBe(80)
    expect(result.errors.some((e) => e.includes('100%'))).toBe(true)
  })

  it('is valid when active percentages sum to exactly 100%', () => {
    const result = validateSharingRules([rule({ id: 'a', percentage: 60 }), rule({ id: 'b', percentage: 40 })])
    expect(result.valid).toBe(true)
    expect(result.totalPercentage).toBe(100)
    expect(result.errors).toHaveLength(0)
  })

  it('ignores inactive rules when summing percentages', () => {
    const result = validateSharingRules([
      rule({ id: 'a', percentage: 60 }),
      rule({ id: 'b', percentage: 40 }),
      rule({ id: 'c', percentage: 50, active: false }),
    ])
    expect(result.valid).toBe(true)
    expect(result.totalPercentage).toBe(100)
  })

  it('rejects a rule with a zero, negative, or out-of-range percentage', () => {
    expect(validateSharingRules([rule({ percentage: 0 })]).valid).toBe(false)
    expect(validateSharingRules([rule({ percentage: -10 })]).valid).toBe(false)
    expect(validateSharingRules([rule({ percentage: 150 })]).valid).toBe(false)
  })

  it('rejects a rule with no party name', () => {
    const result = validateSharingRules([rule({ partyName: '  ', percentage: 100 })])
    expect(result.valid).toBe(false)
  })

  it('does not assume an equal split — two parties with no explicit percentages configured are invalid, not auto-50/50', () => {
    // Simulate "no percentage set" as 0, which must fail validation rather
    // than silently being treated as an implicit 50/50 split.
    const result = validateSharingRules([rule({ id: 'a', percentage: 0 }), rule({ id: 'b', percentage: 0 })])
    expect(result.valid).toBe(false)
  })
})

describe('profit distribution calculation (decimal-safe, deterministic rounding)', () => {
  it('splits an exact amount with no rounding needed', () => {
    const rules = [rule({ id: 'a', partyName: 'A', percentage: 60 }), rule({ id: 'b', partyName: 'B', percentage: 40 })]
    const dist = computeDistribution(rules, 10000) // ₹100.00
    expect(dist.shares.find((s) => s.ruleId === 'a')!.amountPaise).toBe(6000)
    expect(dist.shares.find((s) => s.ruleId === 'b')!.amountPaise).toBe(4000)
    expect(dist.totalAllocatedPaise).toBe(10000)
    expect(dist.roundingAdjustmentPaise).toBe(0)
  })

  it('allocates paise-level rounding remainders deterministically so shares sum exactly to the distributable amount', () => {
    // 1/3 + 1/3 + 1/3 of 100 paise cannot divide evenly; the three floors sum
    // to 99, and the single leftover paise must be allocated to exactly one
    // party so the total is exactly 100, never 99 or 101.
    const rules = [
      rule({ id: 'a', partyName: 'A', percentage: 33.33 }),
      rule({ id: 'b', partyName: 'B', percentage: 33.33 }),
      rule({ id: 'c', partyName: 'C', percentage: 33.34 }),
    ]
    const dist = computeDistribution(rules, 100)
    const total = dist.shares.reduce((n, s) => n + s.amountPaise, 0)
    expect(total).toBe(100)
    expect(dist.totalAllocatedPaise).toBe(100)
  })

  it('is deterministic: running the same inputs twice produces identical per-party amounts', () => {
    const rules = [
      rule({ id: 'a', partyName: 'A', percentage: 33.33 }),
      rule({ id: 'b', partyName: 'B', percentage: 33.33 }),
      rule({ id: 'c', partyName: 'C', percentage: 33.34 }),
    ]
    const first = computeDistribution(rules, 100001)
    const second = computeDistribution(rules, 100001)
    expect(first.shares).toEqual(second.shares)
  })

  it('returns zero shares for a zero or negative distributable amount instead of throwing', () => {
    const rules = [rule({ id: 'a', percentage: 100 })]
    const dist = computeDistribution(rules, 0)
    expect(dist.shares.every((s) => s.amountPaise === 0)).toBe(true)
    const negDist = computeDistribution(rules, -500)
    expect(negDist.distributableAmountPaise).toBe(0)
  })

  it('excludes inactive rules from the distribution entirely', () => {
    const rules = [rule({ id: 'a', percentage: 100 }), rule({ id: 'b', percentage: 50, active: false })]
    const dist = computeDistribution(rules, 10000)
    expect(dist.shares).toHaveLength(1)
    expect(dist.shares[0].ruleId).toBe('a')
    expect(dist.shares[0].amountPaise).toBe(10000)
  })
})
