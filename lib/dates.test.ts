import { describe, it, expect } from 'vitest'
import { isValidIsoDate, parseFlexibleDate, isDateInRange, resolveDateRange } from '@/lib/dates'

describe('date helpers', () => {
  it('validates strict ISO dates without auto-correcting bad ones', () => {
    expect(isValidIsoDate('2026-10-13')).toBe(true)
    expect(isValidIsoDate('2026-02-30')).toBe(false) // Feb never has 30 days
    expect(isValidIsoDate('2026-13-01')).toBe(false) // invalid month
    expect(isValidIsoDate('13-10-2026')).toBe(false) // wrong format
  })

  it('parses common spreadsheet date formats', () => {
    expect(parseFlexibleDate('2026-10-13')).toBe('2026-10-13')
    expect(parseFlexibleDate('13/10/2026')).toBe('2026-10-13')
    expect(parseFlexibleDate('13-10-26')).toBe('2026-10-13')
    expect(parseFlexibleDate('13 Oct 2026')).toBe('2026-10-13')
    expect(parseFlexibleDate('Oct 13, 2026')).toBe('2026-10-13')
  })

  it('parses Excel serial date numbers', () => {
    // Excel serial 45678 corresponds to a real date; just assert it is a valid ISO result, never "today" fallback.
    const result = parseFlexibleDate(45678)
    expect(result).not.toBeNull()
    expect(isValidIsoDate(result!)).toBe(true)
  })

  it('returns null for unrecognised formats instead of fabricating a date', () => {
    expect(parseFlexibleDate('not a date')).toBeNull()
    expect(parseFlexibleDate('')).toBeNull()
    expect(parseFlexibleDate(null)).toBeNull()
    expect(parseFlexibleDate(undefined)).toBeNull()
  })

  it('isDateInRange respects open-ended and closed ranges', () => {
    expect(isDateInRange('2026-10-13', '2026-10-01', '2026-10-31')).toBe(true)
    expect(isDateInRange('2026-09-30', '2026-10-01', '2026-10-31')).toBe(false)
    expect(isDateInRange('2026-10-13')).toBe(true)
  })

  it('resolveDateRange "all" preset has no bounds', () => {
    expect(resolveDateRange('all')).toEqual({})
  })

  it('resolveDateRange "custom" preset passes through given bounds', () => {
    expect(resolveDateRange('custom', '2026-01-01', '2026-01-31')).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })
})

describe('new date range presets (owner dashboard filter bar)', () => {
  it('"yesterday" resolves to a single day immediately before today', () => {
    const today = resolveDateRange('today').start!
    const yesterday = resolveDateRange('yesterday')
    expect(yesterday.start).toBe(yesterday.end)
    expect(yesterday.start! < today).toBe(true)
  })

  it('"this_week" starts on or before today and ends today', () => {
    const today = resolveDateRange('today').start!
    const thisWeek = resolveDateRange('this_week')
    expect(thisWeek.end).toBe(today)
    expect(thisWeek.start! <= today).toBe(true)
  })

  it('"last_week" is strictly before "this_week" and spans exactly 7 days', () => {
    const thisWeek = resolveDateRange('this_week')
    const lastWeek = resolveDateRange('last_week')
    expect(lastWeek.end! < thisWeek.start!).toBe(true)
    const start = new Date(`${lastWeek.start}T00:00:00Z`)
    const end = new Date(`${lastWeek.end}T00:00:00Z`)
    const days = Math.round((end.getTime() - start.getTime()) / 86400000)
    expect(days).toBe(6) // Monday..Sunday inclusive = 7 days total, 6 days apart
  })

  it('"this_month" starts on the 1st of the current month', () => {
    const thisMonth = resolveDateRange('this_month')
    expect(thisMonth.start!.endsWith('-01')).toBe(true)
  })

  it('"last_month" is strictly before "this_month" and starts on the 1st', () => {
    const thisMonth = resolveDateRange('this_month')
    const lastMonth = resolveDateRange('last_month')
    expect(lastMonth.start!.endsWith('-01')).toBe(true)
    expect(lastMonth.end! < thisMonth.start!).toBe(true)
  })

  it('"this_financial_year" starts on 1 April and ends today', () => {
    const fy = resolveDateRange('this_financial_year')
    const today = resolveDateRange('today').start!
    expect(fy.start!.endsWith('-04-01')).toBe(true)
    expect(fy.end).toBe(today)
    expect(fy.start! <= today).toBe(true)
  })
})
