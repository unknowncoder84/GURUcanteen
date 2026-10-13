import { describe, it, expect } from 'vitest'
import { parseAmountToPaise, isValidPositiveAmount, formatPaise, rupeesToPaise } from '@/lib/money'

describe('money helpers', () => {
  it('parses plain decimal amounts to integer paise without float drift', () => {
    expect(parseAmountToPaise('19.99')).toBe(1999)
    expect(rupeesToPaise(19.99)).toBe(1999)
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30) // guards against 0.30000000000000004
  })

  it('strips currency symbols and thousand separators', () => {
    expect(parseAmountToPaise('₹1,23,456.78')).toBe(12345678)
  })

  it('handles accounting-style negative amounts in parentheses', () => {
    expect(parseAmountToPaise('(123.45)')).toBe(-12345)
  })

  it('rejects malformed amounts instead of silently coercing to zero', () => {
    expect(parseAmountToPaise('abc')).toBeNull()
    expect(parseAmountToPaise('')).toBeNull()
    expect(parseAmountToPaise(undefined)).toBeNull()
    expect(parseAmountToPaise('12.34.56')).toBeNull()
  })

  it('isValidPositiveAmount rejects zero, negative, and null', () => {
    expect(isValidPositiveAmount(0)).toBe(false)
    expect(isValidPositiveAmount(-100)).toBe(false)
    expect(isValidPositiveAmount(null)).toBe(false)
    expect(isValidPositiveAmount(100)).toBe(true)
  })

  it('formats paise using Indian digit grouping', () => {
    expect(formatPaise(12345678)).toBe('₹1,23,456.78')
  })
})
