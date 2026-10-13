'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Upload as UploadIcon, Download, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { Field, Select, PrimaryButton, SecondaryButton } from '@/components/ui/form'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import type { ImportCategory } from '@/lib/types'
import { listWorksheets, readSheet, suggestWorksheetForCategory, type ParsedSheet, type WorksheetSummary } from '@/lib/import/parseFile'
import { fieldsForCategory, suggestMapping, type TargetField } from '@/lib/import/mapping'
import { validateRows, summarize, buildRejectedRowsCsv, type ValidatedRow } from '@/lib/import/validate'
import { commitImport } from '@/lib/import/commit'
import { downloadTextFile } from '@/lib/export'
import { formatPaise } from '@/lib/money'

type Step = 'select' | 'worksheet' | 'preview' | 'mapping' | 'review' | 'done'

const CATEGORY_OPTIONS: { value: ImportCategory; label: string }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'purchases', label: 'Purchases' },
]

export default function UploadPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('select')
  const [canteenId, setCanteenId] = useState('')
  const [category, setCategory] = useState<ImportCategory>('sales')
  const [file, setFile] = useState<File | null>(null)
  const [worksheets, setWorksheets] = useState<WorksheetSummary[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [headerRowOverride, setHeaderRowOverride] = useState<number | undefined>(undefined)
  const [parsed, setParsed] = useState<ParsedSheet | null>(null)
  const [mapping, setMapping] = useState<Record<number, TargetField>>({})
  const [validated, setValidated] = useState<ValidatedRow[]>([])
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [parseError, setParseError] = useState('')
  const [committedCount, setCommittedCount] = useState(0)
  const [allowNegativeAsRefund, setAllowNegativeAsRefund] = useState(false)

  const summary = useMemo(() => (validated.length ? summarize(validated) : null), [validated])
  const toImportCount = useMemo(
    () => validated.filter((r) => r.accepted && !skipped.has(r.rowIndex)).length,
    [validated, skipped]
  )
  const missingRequiredFields = useMemo(() => {
    const fields = fieldsForCategory(category)
    return fields.filter((f) => f.required).filter((f) => !Object.values(mapping).includes(f.field))
  }, [category, mapping])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const activeCanteens = data.canteens.filter((c) => c.active)

  function resetAll() {
    setStep('select')
    setFile(null)
    setWorksheets([])
    setSelectedSheet('')
    setHeaderRowOverride(undefined)
    setParsed(null)
    setMapping({})
    setValidated([])
    setSkipped(new Set())
    setParseError('')
    setCommittedCount(0)
    setAllowNegativeAsRefund(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFileChosen(f: File) {
    setParseError('')
    const name = f.name.toLowerCase()
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setParseError('Unsupported file type. Please choose a .csv, .xls, or .xlsx file.')
      return
    }
    setBusy(true)
    try {
      setFile(f)
      if (name.endsWith('.csv')) {
        // CSV files have a single implicit sheet — skip straight to reading it.
        const result = await readSheet(f)
        setParsed(result)
        setSelectedSheet(result.activeSheet)
        setMapping(suggestMapping(result.headers, category))
        setStep(result.headerDetectionUncertain ? 'worksheet' : 'preview')
      } else {
        const sheets = await listWorksheets(f)
        setWorksheets(sheets)
        const suggested = suggestWorksheetForCategory(sheets, category)
        setSelectedSheet(suggested ?? sheets.find((s) => !s.looksInformational)?.name ?? sheets[0]?.name ?? '')
        setStep('worksheet')
      }
    } catch (err) {
      setParseError(err instanceof Error ? `Could not read the file: ${err.message}` : 'Could not read the file.')
    } finally {
      setBusy(false)
    }
  }

  async function loadSelectedWorksheet(headerOverride?: number) {
    if (!file) return
    setBusy(true)
    setParseError('')
    try {
      const result = await readSheet(file, selectedSheet, headerOverride)
      if (result.headers.length === 0) {
        setParseError('This worksheet has no readable header row or data rows. Choose a different worksheet.')
        setBusy(false)
        return
      }
      setParsed(result)
      setHeaderRowOverride(headerOverride)
      setMapping(suggestMapping(result.headers, category))
      setStep('preview')
    } catch (err) {
      setParseError(err instanceof Error ? `Could not read the worksheet: ${err.message}` : 'Could not read the worksheet.')
    } finally {
      setBusy(false)
    }
  }

  function goToMapping() {
    setStep('mapping')
  }

  function runValidation() {
    if (!parsed || !data) return
    const rows = validateRows(parsed.rows, mapping, {
      category,
      canteenId,
      canteens: data.canteens,
      allowNegativeAsRefund,
    })
    setValidated(rows)
    setSkipped(new Set(rows.filter((r) => r.isDuplicateCandidate && r.errors.length === 0).map((r) => r.rowIndex)))
    setStep('review')
  }

  async function confirmImport() {
    if (!parsed || !file) return
    setBusy(true)
    try {
      const columnMappingNamed: Record<string, string> = {}
      parsed.headers.forEach((h, i) => {
        columnMappingNamed[h || `Column ${i + 1}`] = mapping[i] ?? 'skip'
      })
      const result = await commitImport({
        filename: file.name,
        category,
        canteenId,
        headers: parsed.headers,
        validatedRows: validated,
        columnMapping: columnMappingNamed,
        skippedRowIndexes: skipped,
      })
      setCommittedCount(result.insertedIds.length)
      setStep('done')
      await refresh()
      notify(`Import complete: ${result.insertedIds.length} record(s) saved`)
    } catch (err) {
      notify(err instanceof Error ? `Import failed: ${err.message}` : 'Import failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  function downloadRejected() {
    if (!parsed) return
    const csv = buildRejectedRowsCsv(validated, parsed.headers)
    const ok = downloadTextFile(`rejected-rows_${file?.name ?? 'import'}.csv`, csv, 'text/csv;charset=utf-8;')
    notify(ok ? 'Rejected rows downloaded' : 'Download failed', ok ? 'success' : 'error')
  }

  const fields = fieldsForCategory(category)
  const selectedSheetSummary = worksheets.find((s) => s.name === selectedSheet)

  return (
    <AppShell
      title="Upload Data"
      subtitle="Import complete Excel or CSV files. The entire file is read and validated, not just a preview."
      badge="Local data"
    >
      <Stepper step={step} />

      {step === 'select' && (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Canteen" hint="Used for every row, unless a mapped Canteen column resolves a row to a different existing canteen.">
              <Select value={canteenId} onChange={(e) => setCanteenId(e.target.value)}>
                <option value="">Select canteen</option>
                {activeCanteens.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Import category" hint="Only implemented categories are offered.">
              <Select value={category} onChange={(e) => setCategory(e.target.value as ImportCategory)}>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {activeCanteens.length === 0 && (
            <p className="mt-3 text-xs text-amber-700">Add an active canteen first (Canteens page) before importing.</p>
          )}

          <div className="mt-5">
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#dfe6df] bg-[#fbfcfb] py-12 text-center cursor-pointer hover:bg-[#f5f7f5]">
              <UploadIcon className="size-8 text-[#89958d]" />
              <span className="text-sm font-semibold text-[#2f3b33]">Click to choose a .csv, .xls, or .xlsx file</span>
              <span className="text-xs text-[#89958d]">The complete file is processed — there is no row limit on import.</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                disabled={!canteenId || busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFileChosen(f)
                }}
              />
            </label>
            {!canteenId && <p className="mt-2 text-xs text-[#89958d]">Select a canteen to enable file selection.</p>}
            {parseError && <p className="mt-2 text-xs text-red-600">{parseError}</p>}
            {busy && <p className="mt-2 text-xs text-[#89958d]">Reading file…</p>}
          </div>
        </section>
      )}

      {step === 'worksheet' && (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-6">
          <p className="mb-4 text-sm text-[#4c5b52]">
            This workbook has {worksheets.length || 1} worksheet{worksheets.length === 1 ? '' : 's'}. Choose the one that contains the{' '}
            {category} transactions — the first worksheet is <b>not</b> assumed to be correct.
          </p>

          {worksheets.length > 0 ? (
            <>
              <Field label="Choose worksheet">
                <Select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}>
                  {worksheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.approxRowCount} row{s.approxRowCount === 1 ? '' : 's'}
                      {s.looksInformational ? ' — looks like README/instructions' : ''})
                    </option>
                  ))}
                </Select>
              </Field>

              {selectedSheetSummary?.looksInformational && (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <b>{selectedSheetSummary.name}</b> looks like a README or instructions sheet, not transaction data. It can still be
                    opened for inspection, but it is very unlikely to contain real {category} records. Choose a different worksheet
                    before continuing.
                  </span>
                </p>
              )}

              {!selectedSheetSummary?.looksInformational && suggestWorksheetForCategory(worksheets, category) === selectedSheet && (
                <p className="mt-3 flex items-center gap-2 text-xs text-[#347246]">
                  <Info className="size-3.5" />
                  Suggested automatically for the &quot;{category}&quot; category — change it if this isn&apos;t right.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-[#89958d]">This is a CSV file with a single implicit sheet.</p>
          )}

          <div className="mt-5 flex justify-between">
            <SecondaryButton onClick={resetAll}>Cancel / choose a different file</SecondaryButton>
            <PrimaryButton onClick={() => loadSelectedWorksheet()} disabled={busy || !selectedSheet}>
              {busy ? 'Reading…' : 'Read worksheet'}
            </PrimaryButton>
          </div>
          {parseError && <p className="mt-3 text-xs text-red-600">{parseError}</p>}
        </section>
      )}

      {step === 'preview' && parsed && (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-6">
          <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <b>File:</b> {file?.name}
            </p>
            <p>
              <b>Worksheet:</b> {parsed.activeSheet}
            </p>
            <p>
              <b>Detected header row:</b> {parsed.headerRowIndex + 1}
            </p>
            <p>
              <b>Total data rows:</b> {parsed.rows.length}
            </p>
            <p>
              <b>Columns detected:</b> {parsed.headers.length}
            </p>
          </div>

          {parsed.headerDetectionUncertain && (
            <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <p className="mb-2 flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" />
                Header row could not be detected with confidence.
              </p>
              <p className="mb-2">
                Pick the correct header row manually (1-based row number as it appears in the original file), then re-read the
                worksheet.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  className="h-9 w-24 rounded-lg border border-amber-300 px-2 text-sm"
                  defaultValue={parsed.headerRowIndex + 1}
                  onChange={(e) => setHeaderRowOverride(Math.max(0, Number(e.target.value) - 1))}
                />
                <SecondaryButton onClick={() => loadSelectedWorksheet(headerRowOverride)}>Use this header row</SecondaryButton>
              </div>
            </div>
          )}

          <p className="mb-2 text-xs font-semibold text-[#89958d]">
            Preview of first {Math.min(20, parsed.rows.length)} rows (all {parsed.rows.length} rows will be validated and imported, not
            just these):
          </p>
          <div className="max-h-72 overflow-auto rounded-lg border border-[#eff2ef]">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-[#89958d]">
                  {parsed.headers.map((h, i) => (
                    <th key={i} className="whitespace-nowrap p-2">
                      {h || `Column ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 20).map((row, ri) => (
                  <tr key={ri} className="border-b border-[#eff2ef]">
                    {parsed.headers.map((_, ci) => (
                      <td key={ci} className="whitespace-nowrap p-2">
                        {String(row[ci] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <SecondaryButton onClick={resetAll}>Cancel</SecondaryButton>
              {worksheets.length > 0 && <SecondaryButton onClick={() => setStep('worksheet')}>Change worksheet</SecondaryButton>}
            </div>
            <PrimaryButton onClick={goToMapping}>Continue to column mapping</PrimaryButton>
          </div>
        </section>
      )}

      {step === 'mapping' && parsed && (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-6">
          <p className="mb-4 text-sm text-[#4c5b52]">
            Map each spreadsheet column to a field for the <b>{category}</b> category. Suggested mappings are pre-filled based on common
            header names — correct any that are wrong, and leave anything unrelated set to &quot;Do not import this column&quot;.
          </p>
          <div className="grid gap-3">
            {parsed.headers.map((h, i) => (
              <div key={i} className="grid grid-cols-2 items-center gap-3 rounded-lg border border-[#eff2ef] p-3 sm:grid-cols-3">
                <span className="text-sm font-semibold truncate">{h || `Column ${i + 1}`}</span>
                <span className="hidden text-xs text-[#89958d] sm:block">
                  e.g. &quot;{String(parsed.rows[0]?.[i] ?? '')}&quot;
                </span>
                <Select value={mapping[i] ?? 'skip'} onChange={(e) => setMapping({ ...mapping, [i]: e.target.value as TargetField })}>
                  <option value="skip">Do not import this column</option>
                  {fields.map((f) => (
                    <option key={f.field} value={f.field}>
                      {f.label}
                      {f.required ? ' (required)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          {missingRequiredFields.length > 0 && (
            <p className="mt-3 text-xs text-amber-700">
              <AlertTriangle className="mr-1 inline size-3.5" />
              Map all required fields ({missingRequiredFields.map((f) => f.label).join(', ')}) before continuing.
            </p>
          )}
          <label className="mt-4 flex items-center gap-2 text-xs text-[#4c5b52]">
            <input type="checkbox" checked={allowNegativeAsRefund} onChange={(e) => setAllowNegativeAsRefund(e.target.checked)} />
            Treat negative amounts as refunds/adjustments (flag for review) instead of rejecting them outright
          </label>
          <div className="mt-5 flex justify-between">
            <SecondaryButton onClick={() => setStep('preview')}>Back</SecondaryButton>
            <PrimaryButton onClick={runValidation} disabled={missingRequiredFields.length > 0}>
              Validate full dataset
            </PrimaryButton>
          </div>
        </section>
      )}

      {step === 'review' && summary && (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-6">
          <div className="mb-5 grid gap-2 rounded-lg bg-[#f5f7f5] p-4 text-xs text-[#4c5b52] sm:grid-cols-2">
            <p>
              <b>Filename:</b> {file?.name}
            </p>
            <p>
              <b>Worksheet:</b> {parsed?.activeSheet}
            </p>
            <p>
              <b>Detected header row:</b> {(parsed?.headerRowIndex ?? 0) + 1}
            </p>
            <p>
              <b>Total data rows:</b> {summary.totalRows}
            </p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total rows" value={summary.totalRows} />
            <StatCard label="Valid rows" value={summary.validRows} tone="good" />
            <StatCard label="Invalid rows" value={summary.invalidRows} tone="bad" />
            <StatCard label="Possible duplicates" value={summary.duplicateRows} tone="warn" />
          </div>

          <div className="mb-5 rounded-lg bg-[#f5f7f5] px-4 py-3 text-sm">
            <p className="mb-1">
              <b>{toImportCount}</b> row(s) will be imported ({category}). Rows with errors are always excluded — this importer uses{' '}
              <b>partial import</b>: valid rows are saved even if some rows in the same file are rejected.
            </p>
            {summary.invalidRows > 0 && (
              <SecondaryButton onClick={downloadRejected} className="mt-2">
                <Download className="size-4" />
                Download rejected rows (CSV)
              </SecondaryButton>
            )}
          </div>

          <p className="mb-2 text-xs font-semibold text-[#89958d]">Row-by-row results:</p>
          <div className="max-h-96 overflow-auto rounded-lg border border-[#eff2ef]">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-[#89958d]">
                  <th className="p-2">Row</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Canteen</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Notes</th>
                  <th className="p-2">Skip?</th>
                </tr>
              </thead>
              <tbody>
                {validated.map((r) => (
                  <tr key={r.rowIndex} className="border-b border-[#eff2ef]">
                    <td className="p-2">{r.rowIndex + 1}</td>
                    <td className="p-2">{r.normalized.date ?? '—'}</td>
                    <td className="p-2">
                      {r.normalized.resolvedCanteenId
                        ? data.canteens.find((c) => c.id === r.normalized.resolvedCanteenId)?.name ?? '—'
                        : '—'}
                    </td>
                    <td className="p-2 text-right">{r.normalized.amountPaise !== null ? formatPaise(r.normalized.amountPaise) : '—'}</td>
                    <td className="p-2">
                      {r.errors.length > 0 ? (
                        <span className="font-semibold text-red-600">Rejected</span>
                      ) : r.isDuplicateCandidate ? (
                        <span className="font-semibold text-amber-700">Possible duplicate</span>
                      ) : (
                        <span className="font-semibold text-[#347246]">Valid</span>
                      )}
                    </td>
                    <td className="p-2 text-[#89958d]">{[...r.errors, ...r.warnings].join('; ') || '—'}</td>
                    <td className="p-2">
                      {r.accepted && (
                        <input
                          type="checkbox"
                          checked={skipped.has(r.rowIndex)}
                          onChange={(e) => {
                            const next = new Set(skipped)
                            if (e.target.checked) next.add(r.rowIndex)
                            else next.delete(r.rowIndex)
                            setSkipped(next)
                          }}
                          aria-label={`Skip row ${r.rowIndex + 1}`}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex justify-between">
            <SecondaryButton onClick={() => setStep('mapping')}>Back to mapping</SecondaryButton>
            <PrimaryButton onClick={confirmImport} disabled={busy || toImportCount === 0}>
              {busy ? 'Importing…' : `Confirm import of ${toImportCount} row(s)`}
            </PrimaryButton>
          </div>
        </section>
      )}

      {step === 'done' && (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-10 text-[#347246]" />
          <h3 className="text-lg font-bold">Import complete</h3>
          <p className="mt-2 text-sm text-[#4c5b52]">{committedCount} record(s) were saved to the local database.</p>
          <p className="mt-1 text-xs text-[#89958d]">
            You can review or reverse this import anytime from Reports &amp; Exports → Import history.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <SecondaryButton onClick={resetAll}>Import another file</SecondaryButton>
            <Link href="/reports">
              <PrimaryButton>Go to import history</PrimaryButton>
            </Link>
          </div>
        </section>
      )}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'select', label: '1. Select' },
    { key: 'worksheet', label: '2. Worksheet' },
    { key: 'preview', label: '3. Preview' },
    { key: 'mapping', label: '4. Map columns' },
    { key: 'review', label: '5. Validate & review' },
    { key: 'done', label: '6. Done' },
  ]
  const currentIndex = steps.findIndex((s) => s.key === step)
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {steps.map((s, i) => (
        <div
          key={s.key}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            i === currentIndex ? 'bg-[#276f3d] text-white' : i < currentIndex ? 'bg-[#e8f6eb] text-[#347246]' : 'bg-[#f3f4f2] text-[#89958d]'
          }`}
        >
          {s.label}
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' | 'warn' }) {
  const color = tone === 'good' ? 'text-[#347246]' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-[#1b2520]'
  return (
    <div className="rounded-lg border border-[#eff2ef] bg-[#fbfcfb] p-3 text-center">
      <p className="text-[11px] font-semibold text-[#89958d]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
