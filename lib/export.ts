// Export helpers for CSV, Excel, and JSON backups. All exports contain the
// actual filtered dataset, not placeholders, and filenames are meaningful.

import * as XLSX from 'xlsx'

/** Escape a CSV cell and guard against spreadsheet formula injection
 *  (a leading =, +, -, @ can be interpreted as a formula by Excel/Sheets). */
export function csvEscape(value: unknown): string {
  const str = String(value ?? '')
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str
  return `"${safe.replaceAll('"', '""')}"`
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(csvEscape).join(',')
  const dataLines = rows.map((row) => row.map(csvEscape).join(','))
  return [headerLine, ...dataLines].join('\n')
}

export function downloadTextFile(filename: string, content: string, mimeType: string): boolean {
  try {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return true
  } catch {
    return false
  }
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): boolean {
  return downloadTextFile(filename, rowsToCsv(headers, rows), 'text/csv;charset=utf-8;')
}

export function downloadExcel(filename: string, headers: string[], rows: unknown[][], sheetName = 'Sheet1'): boolean {
  try {
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    XLSX.writeFile(workbook, filename)
    return true
  } catch {
    return false
  }
}

export function downloadJson(filename: string, data: unknown): boolean {
  return downloadTextFile(filename, JSON.stringify(data, null, 2), 'application/json')
}

/** Build a timestamped, meaningful filename, e.g. "sales-register_2026-10-13.csv" */
export function buildFilename(base: string, extension: string, dateRangeLabel?: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const suffix = dateRangeLabel ? `_${dateRangeLabel}` : ''
  return `${base}${suffix}_${stamp}.${extension}`
}
