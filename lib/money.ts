// Decimal-safe money helpers. All amounts are stored as integer paise.
// This file is the single source of truth for currency conversion and
// formatting so pages never implement their own rounding logic.

/** Convert a rupee amount (string or number, possibly with decimals) to integer paise. */
export function rupeesToPaise(value: number | string): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return NaN
  // Round to avoid binary floating point artefacts like 19.999999999998
  return Math.round(n * 100)
}

export function paiseToRupees(paise: number): number {
  return paise / 100
}

/** Format integer paise as Indian currency, e.g. ₹1,23,456.78 */
export function formatPaise(paise: number): string {
  const rupees = paiseToRupees(paise)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(rupees)
}

/** Format integer paise as a plain number string (no currency symbol), e.g. 1,23,456.78 */
export function formatPaiseNumber(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(paiseToRupees(paise))
}

/** Parse a free-text amount (from spreadsheets) into integer paise, or null if invalid. */
export function parseAmountToPaise(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  let text = String(raw).trim()
  if (!text) return null
  // Reject obviously non-numeric strings early
  text = text.replace(/[₹,\s]/g, '')
  // Handle accounting negatives like (123.45)
  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const n = Number(text)
  if (!Number.isFinite(n)) return null
  const paise = Math.round((negative ? -n : n) * 100)
  return paise
}

export function isValidPositiveAmount(paise: number | null): paise is number {
  return paise !== null && Number.isFinite(paise) && paise > 0
}
