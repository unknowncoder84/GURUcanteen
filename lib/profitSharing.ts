// Profit-sharing distribution calculations. Kept separate from
// calculations.ts (revenue/expense recognition) because distribution is a
// distinct concept: it answers "how should an already-computed operating
// profit be split between configured parties", not "what is the profit".
//
// Documented rules:
// - Operating profit is NEVER automatically treated as distributable cash.
//   The owner must explicitly configure sharing parties and percentages.
// - A distribution can only be computed once the active rules sum to
//   exactly 100% (validated with validateSharingRules). Otherwise the UI
//   must show "No profit-sharing agreement configured." and refuse to
//   produce a final allocation.
// - Money is decimal-safe (integer paise). Per-party shares are computed by
//   flooring each party's paise share, then deterministically distributing
//   the leftover 1-paise remainders (largest fractional remainder first, tie
//   broken by rule order) so the parts always sum exactly to the
//   distributable amount with no silent rounding loss.
// - This is a provisional estimate: the application does not implement full
//   accrual accounting, so "amount eligible for distribution" defaults to
//   operating profit for the period unless the caller supplies an explicit
//   adjustment.

import type { ProfitSharingRule } from '@/lib/types'

export interface SharingRuleValidation {
  valid: boolean
  totalPercentage: number
  errors: string[]
}

/** Validate that the given (active) rules sum to exactly 100% (within a
 *  small floating-point tolerance), and that no rule has an out-of-range
 *  or non-numeric percentage. */
export function validateSharingRules(rules: ProfitSharingRule[]): SharingRuleValidation {
  const errors: string[] = []
  const activeRules = rules.filter((r) => r.active)

  if (activeRules.length === 0) {
    return { valid: false, totalPercentage: 0, errors: ['No profit-sharing agreement configured.'] }
  }

  for (const rule of activeRules) {
    if (!rule.partyName.trim()) errors.push('Every party must have a name.')
    if (!Number.isFinite(rule.percentage) || rule.percentage <= 0 || rule.percentage > 100) {
      errors.push(`"${rule.partyName || 'Unnamed party'}" has an invalid percentage (must be greater than 0 and at most 100).`)
    }
  }

  const totalPercentage = activeRules.reduce((n, r) => n + r.percentage, 0)
  const rounded = Math.round(totalPercentage * 100) / 100
  if (Math.abs(rounded - 100) > 0.01) {
    errors.push(`Active shares total ${rounded}%, not 100%. Adjust percentages so they add up to exactly 100% before confirming a distribution.`)
  }

  return { valid: errors.length === 0, totalPercentage: rounded, errors }
}

export interface PartyShare {
  ruleId: string
  partyName: string
  percentage: number
  amountPaise: number
}

export interface DistributionResult {
  distributableAmountPaise: number
  shares: PartyShare[]
  roundingAdjustmentPaise: number // sum of all 1-paise adjustments applied, for transparency
  totalAllocatedPaise: number // always equals distributableAmountPaise when valid
}

/** Compute each active party's paise share of a distributable amount.
 *  Rules MUST already pass validateSharingRules (sum to 100%) — callers are
 *  responsible for checking that before calling this, and must not present a
 *  result from an unvalidated or partial rule set as final. */
export function computeDistribution(rules: ProfitSharingRule[], distributableAmountPaise: number): DistributionResult {
  const activeRules = rules.filter((r) => r.active)
  if (distributableAmountPaise <= 0 || activeRules.length === 0) {
    return {
      distributableAmountPaise: Math.max(0, distributableAmountPaise),
      shares: activeRules.map((r) => ({ ruleId: r.id, partyName: r.partyName, percentage: r.percentage, amountPaise: 0 })),
      roundingAdjustmentPaise: 0,
      totalAllocatedPaise: 0,
    }
  }

  // Step 1: floor each party's exact share.
  const raw = activeRules.map((r) => {
    const exact = (distributableAmountPaise * r.percentage) / 100
    return { rule: r, exact, floor: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })

  const flooredTotal = raw.reduce((n, r) => n + r.floor, 0)
  let leftoverPaise = distributableAmountPaise - flooredTotal

  // Step 2: distribute the leftover paise deterministically — largest
  // fractional remainder first, ties broken by original rule order — so the
  // parts always sum exactly to distributableAmountPaise.
  const order = raw
    .map((r, index) => ({ ...r, index }))
    .sort((a, b) => (b.remainder !== a.remainder ? b.remainder - a.remainder : a.index - b.index))

  const bonusByRuleId = new Map<string, number>()
  for (let i = 0; i < order.length && leftoverPaise > 0; i++) {
    bonusByRuleId.set(order[i].rule.id, 1)
    leftoverPaise -= 1
  }

  const shares: PartyShare[] = raw.map((r) => ({
    ruleId: r.rule.id,
    partyName: r.rule.partyName,
    percentage: r.rule.percentage,
    amountPaise: r.floor + (bonusByRuleId.get(r.rule.id) ?? 0),
  }))

  const totalAllocatedPaise = shares.reduce((n, s) => n + s.amountPaise, 0)
  const roundingAdjustmentPaise = totalAllocatedPaise - flooredTotal

  return { distributableAmountPaise, shares, roundingAdjustmentPaise, totalAllocatedPaise }
}
