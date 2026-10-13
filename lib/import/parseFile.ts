// Reads the ENTIRE selected file (CSV or Excel) into memory. The preview UI
// only ever truncates what is *displayed*; the full `rows` array returned
// here is what gets validated and imported, so large files are never
// silently truncated.
//
// IMPORTANT: this module never assumes the first worksheet is the correct
// one to import, and never assumes row 1 is the header row. Both are
// detected (or left for the user to choose) explicitly — see
// listWorksheets(), detectHeaderRow(), and readSheet() below.

import * as XLSX from 'xlsx'
import Papa from 'papaparse'

export interface WorksheetSummary {
  name: string
  /** Approximate number of non-empty rows in the sheet (including any
   *  header/title rows), so the user can tell at a glance which sheet looks
   *  like real tabular data vs a short README/cover sheet. */
  approxRowCount: number
  /** True if the sheet name or its content looks like documentation rather
   *  than a transaction sheet (e.g. "README", "Instructions", "Notes"). */
  looksInformational: boolean
}

export interface ParsedSheet {
  sheetNames: string[]
  activeSheet: string
  headers: string[]
  rows: string[][] // full data rows (excludes header row), as raw strings
  /** 0-based index of the row within the raw sheet matrix that was used as
   *  the header. Exposed so the UI can show "Detected header row: N" and
   *  let the user override it. */
  headerRowIndex: number
  /** True when header detection was not confident and a fallback (row 0)
   *  was used — the UI should prompt the user to confirm/change it. */
  headerDetectionUncertain: boolean
}

const INFORMATIONAL_SHEET_NAME_HINTS = ['readme', 'instructions', 'notes', 'guide', 'info', 'about', 'cover']

/** Headers we recognise as plausible transaction-sheet column labels. Used
 *  both to score candidate header rows and to flag informational sheets. */
const KNOWN_HEADER_WORDS = [
  'date', 'canteen', 'reference', 'ref', 'description', 'amount', 'cash', 'upi', 'card',
  'category', 'vendor', 'payment', 'notes', 'quantity', 'qty', 'unit cost', 'rate', 'price',
  'staff', 'salary', 'item', 'invoice', 'bill', 'details', 'particulars', 'total', 'narration',
]

function cellText(cell: unknown): string {
  return String(cell ?? '').trim()
}

function rowIsEmpty(row: unknown[]): boolean {
  return row.every((cell) => cellText(cell) === '')
}

/** Score how "header-like" a row is: count of cells that are short,
 *  non-empty, and match a known header word or look like a plausible column
 *  label (short text, no sentence punctuation). Long prose rows (titles,
 *  README paragraphs) score near zero because they are a single long cell
 *  rather than several short labelled cells. */
function scoreHeaderRow(row: unknown[]): number {
  const nonEmptyCells = row.filter((c) => cellText(c) !== '')
  if (nonEmptyCells.length < 2) return 0 // a title/paragraph is usually one cell

  let score = 0
  for (const cell of nonEmptyCells) {
    const text = cellText(cell).toLowerCase()
    if (text.length > 40) continue // long prose, not a column label
    if (/[.!?]{1}\s/.test(text)) continue // sentence punctuation mid-text, not a label
    if (KNOWN_HEADER_WORDS.some((w) => text === w || text.includes(w))) score += 2
    else if (text.length > 0 && text.length <= 25) score += 1 // plausible short label
  }
  return score
}

/** Detect the most likely header row within the first N rows of a sheet
 *  matrix. Returns the row index and whether detection is confident. Never
 *  assumes row 0 is correct — title/README rows before the real header are
 *  skipped. */
export function detectHeaderRow(matrix: unknown[][], searchWindow = 15): { index: number; confident: boolean } {
  const nonEmptyIndexed = matrix
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !rowIsEmpty(row))
    .slice(0, searchWindow)

  if (nonEmptyIndexed.length === 0) return { index: 0, confident: false }

  let best = nonEmptyIndexed[0]
  let bestScore = scoreHeaderRow(best.row)
  for (const candidate of nonEmptyIndexed.slice(1)) {
    const s = scoreHeaderRow(candidate.row)
    if (s > bestScore) {
      bestScore = s
      best = candidate
    }
  }

  // Require at least two recognised/plausible header-like cells before
  // trusting the detection; otherwise fall back to the first non-empty row
  // but mark it as uncertain so the UI can ask the user to confirm.
  return { index: best.index, confident: bestScore >= 2 }
}

/** Heuristic check for whether a sheet is informational (README/instructions)
 *  rather than a transaction sheet: short sheet name match, or the sheet's
 *  best-scoring row still fails the header confidence check and the sheet
 *  consists mostly of single-cell prose rows. */
export function looksInformationalSheet(sheetName: string, matrix: unknown[][]): boolean {
  const normalizedName = sheetName.toLowerCase().trim()
  if (INFORMATIONAL_SHEET_NAME_HINTS.some((hint) => normalizedName.includes(hint))) return true

  const nonEmptyRows = matrix.filter((row) => !rowIsEmpty(row))
  if (nonEmptyRows.length === 0) return false

  const singleCellRows = nonEmptyRows.filter((row) => row.filter((c) => cellText(c) !== '').length === 1).length
  const mostlyProse = singleCellRows / nonEmptyRows.length > 0.6
  const { confident } = detectHeaderRow(matrix)
  return mostlyProse && !confident
}

function sheetToMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' }) as unknown[][]
}

/** List every worksheet in the workbook with an approximate row count and an
 *  "informational sheet" flag, so the UI can show a worksheet picker instead
 *  of silently importing the first sheet. */
export async function listWorksheets(file: File): Promise<WorksheetSummary[]> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    return [{ name: 'Sheet1', approxRowCount: 0, looksInformational: false }]
  }
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false })
  return workbook.SheetNames.map((name) => {
    const matrix = sheetToMatrix(workbook.Sheets[name])
    const nonEmpty = matrix.filter((row) => !rowIsEmpty(row))
    return {
      name,
      approxRowCount: nonEmpty.length,
      looksInformational: looksInformationalSheet(name, matrix),
    }
  })
}

/** Suggest the most likely worksheet name for a given import category, by
 *  matching the category name against sheet names (e.g. "sales" ->
 *  "Sales_Test"). Returns null if nothing matches — never invents a sheet
 *  name that isn't actually present in the workbook. */
export function suggestWorksheetForCategory(sheets: WorksheetSummary[], category: string): string | null {
  const candidates = sheets.filter((s) => !s.looksInformational)
  const categoryWords: Record<string, string[]> = {
    sales: ['sales'],
    expenses: ['expense'],
    purchases: ['purchase'],
    vendors: ['vendor'],
    salaries: ['salary', 'salaries'],
    inventory: ['inventory'],
  }
  const words = categoryWords[category] ?? [category]
  const match = candidates.find((s) => words.some((w) => s.name.toLowerCase().includes(w)))
  return match?.name ?? null
}

/** Read a specific worksheet (or the whole CSV) and detect the header row.
 *  `headerRowOverride` lets the user manually pick the header row when
 *  automatic detection is not confident. */
export async function readSheet(file: File, sheetName?: string, headerRowOverride?: number): Promise<ParsedSheet> {
  const isCsv = file.name.toLowerCase().endsWith('.csv')

  let matrix: unknown[][]
  let sheetNames: string[]
  let active: string

  if (isCsv) {
    const text = await file.text()
    const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' })
    matrix = (result.data as string[][]).filter((r) => r.length > 0)
    sheetNames = ['Sheet1']
    active = 'Sheet1'
  } else {
    const buffer = await file.arrayBuffer()
    // Pass a Uint8Array rather than a raw ArrayBuffer: SheetJS's zip/format
    // auto-detection is more reliable across environments (browser vs
    // Node-based test runners) when given a typed array view.
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false })
    sheetNames = workbook.SheetNames
    active = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0]
    matrix = sheetToMatrix(workbook.Sheets[active])
  }

  const nonEmptyIndexed = matrix.map((row, index) => ({ row, index })).filter(({ row }) => !rowIsEmpty(row))
  if (nonEmptyIndexed.length === 0) {
    return { sheetNames, activeSheet: active, headers: [], rows: [], headerRowIndex: 0, headerDetectionUncertain: true }
  }

  let headerRowIndex: number
  let confident: boolean
  if (headerRowOverride !== undefined) {
    headerRowIndex = headerRowOverride
    confident = true
  } else {
    const detection = detectHeaderRow(matrix)
    headerRowIndex = detection.index
    confident = detection.confident
  }

  const headerRow = matrix[headerRowIndex] ?? []
  const dataRows = nonEmptyIndexed.filter(({ index }) => index > headerRowIndex).map(({ row }) => row)

  return {
    sheetNames,
    activeSheet: active,
    headers: headerRow.map((h, i) => {
      const text = cellText(h)
      return text || `Column ${i + 1}`
    }),
    rows: dataRows.map((row) => row.map((cell) => (cell === undefined ? '' : (cell as unknown)) as unknown as string)),
    headerRowIndex,
    headerDetectionUncertain: !confident,
  }
}

/** Back-compat wrapper kept for any existing callers/tests: reads the sheet
 *  with automatic header detection. Prefer readSheet() for new code since it
 *  exposes headerRowIndex/headerDetectionUncertain. */
export async function parseWorkbook(file: File, sheetName?: string): Promise<ParsedSheet> {
  return readSheet(file, sheetName)
}
