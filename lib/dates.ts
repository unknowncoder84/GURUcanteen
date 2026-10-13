// Date helpers that consistently use the Asia/Kolkata business calendar day,
// avoiding UTC conversions that could shift the intended local date.

const IST_TIME_ZONE = 'Asia/Kolkata'

/** Today's date as YYYY-MM-DD in the Asia/Kolkata calendar. */
export function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Validate a YYYY-MM-DD date string (strict, no auto-correction). */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12) return false
  const daysInMonth = new Date(y, m, 0).getDate()
  if (d < 1 || d > daysInMonth) return false
  return true
}

/** Attempt to parse common spreadsheet date formats into YYYY-MM-DD.
 *  Returns null (never a fabricated "today") if the format is not recognised. */
export function parseFlexibleDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null

  // Excel serial date number (days since 1899-12-30)
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const ms = epoch.getTime() + raw * 86400000
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    }
    return null
  }

  const text = String(raw).trim()
  if (!text) return null

  // YYYY-MM-DD or YYYY/MM/DD
  let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) {
    const [, y, mo, d] = m
    return isValidIsoDate(`${y}-${pad(+mo)}-${pad(+d)}`) ? `${y}-${pad(+mo)}-${pad(+d)}` : null
  }

  // DD-MM-YYYY or DD/MM/YYYY
  m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    const iso = `${y}-${pad(+mo)}-${pad(+d)}`
    return isValidIsoDate(iso) ? iso : null
  }

  // DD-MM-YY or DD/MM/YY (2 digit year, assume 2000s)
  m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/)
  if (m) {
    const [, d, mo, y] = m
    const year = 2000 + Number(y)
    const iso = `${year}-${pad(+mo)}-${pad(+d)}`
    return isValidIsoDate(iso) ? iso : null
  }

  // "12 Jan 2024", "Jan 12 2024", "12 January 2024"
  const monthNames: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }
  m = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/)
  if (m) {
    const [, d, monName, y] = m
    const mo = monthNames[monName.slice(0, 3).toLowerCase()]
    if (mo) {
      const iso = `${y}-${pad(mo)}-${pad(+d)}`
      return isValidIsoDate(iso) ? iso : null
    }
  }
  m = text.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const [, monName, d, y] = m
    const mo = monthNames[monName.slice(0, 3).toLowerCase()]
    if (mo) {
      const iso = `${y}-${pad(mo)}-${pad(+d)}`
      return isValidIsoDate(iso) ? iso : null
    }
  }

  return null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function startOfDay(dateIso: string): string {
  return dateIso
}

export function isDateInRange(dateIso: string, startIso?: string, endIso?: string): boolean {
  if (startIso && dateIso < startIso) return false
  if (endIso && dateIso > endIso) return false
  return true
}

export type DateRangePreset =
  | 'today' | 'yesterday'
  | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'this_financial_year'
  | 'custom' | 'all'

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Monday of the ISO week containing the given date (Monday-based week). */
function mondayOf(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  const day = d.getUTCDay() || 7 // Sunday => 7
  d.setUTCDate(d.getUTCDate() - day + 1)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function resolveDateRange(preset: DateRangePreset, customStart?: string, customEnd?: string): { start?: string; end?: string } {
  const today = todayIst()
  if (preset === 'all') return {}
  if (preset === 'today') return { start: today, end: today }
  if (preset === 'yesterday') {
    const y = addDaysIso(today, -1)
    return { start: y, end: y }
  }
  if (preset === 'this_week') {
    return { start: mondayOf(today), end: today }
  }
  if (preset === 'last_week') {
    const thisMonday = mondayOf(today)
    const lastMonday = addDaysIso(thisMonday, -7)
    const lastSunday = addDaysIso(thisMonday, -1)
    return { start: lastMonday, end: lastSunday }
  }
  if (preset === 'this_month') {
    return { start: today.slice(0, 8) + '01', end: today }
  }
  if (preset === 'last_month') {
    const firstOfThisMonth = today.slice(0, 8) + '01'
    const lastDayOfPrevMonth = addDaysIso(firstOfThisMonth, -1)
    const firstOfPrevMonth = lastDayOfPrevMonth.slice(0, 8) + '01'
    return { start: firstOfPrevMonth, end: lastDayOfPrevMonth }
  }
  if (preset === 'this_financial_year') {
    // Indian financial year: 1 April to 31 March.
    const year = Number(today.slice(0, 4))
    const month = Number(today.slice(5, 7))
    const fyStartYear = month >= 4 ? year : year - 1
    return { start: `${fyStartYear}-04-01`, end: today }
  }
  return { start: customStart, end: customEnd }
}
