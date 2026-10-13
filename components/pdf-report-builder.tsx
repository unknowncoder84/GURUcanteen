'use client'

import { useMemo, useState } from 'react'
import { FileDown } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Field, Input, Select, Textarea, PrimaryButton, SecondaryButton } from '@/components/ui/form'
import type { AppData } from '@/lib/hooks/useAppData'
import { resolveDateRange, type DateRangePreset } from '@/lib/dates'
import { REPORT_SECTIONS, buildReportDocument, saveReportDocument, type ReportSectionKey } from '@/lib/pdfReport'
import { buildFilename } from '@/lib/export'

const PERIOD_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom range' },
]

const DEFAULT_SECTIONS: ReportSectionKey[] = ['business_summary', 'sales_by_canteen', 'expenses_by_category', 'payment_method_breakdown']

export function PdfReportBuilder({ data, onClose }: { data: AppData; onClose: () => void }) {
  const [businessName, setBusinessName] = useState(data.settings.businessName)
  const [reportTitle, setReportTitle] = useState('Business Report')
  const [periodPreset, setPeriodPreset] = useState<DateRangePreset>('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [canteenScope, setCanteenScope] = useState<'combined' | string>('combined')
  const [compareCanteens, setCompareCanteens] = useState(false)
  const [sections, setSections] = useState<Set<ReportSectionKey>>(new Set(DEFAULT_SECTIONS))
  const [compact, setCompact] = useState(false)
  const [includeTransactionTable, setIncludeTransactionTable] = useState(true)
  const [includeCharts, setIncludeCharts] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(true)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [notesText, setNotesText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedMessage, setGeneratedMessage] = useState('')

  const range = useMemo(() => resolveDateRange(periodPreset, customStart, customEnd), [periodPreset, customStart, customEnd])
  const periodLabel = useMemo(() => {
    const presetLabel = PERIOD_PRESETS.find((p) => p.value === periodPreset)?.label ?? periodPreset
    if (periodPreset === 'custom') return `${range.start ?? '…'} to ${range.end ?? '…'}`
    return presetLabel
  }, [periodPreset, range])

  function toggleSection(key: ReportSectionKey) {
    const next = new Set(sections)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSections(next)
  }

  function generate() {
    setGenerating(true)
    setGeneratedMessage('')
    try {
      const doc = buildReportDocument(data, {
        businessName: businessName.trim() || 'BrightNest Food Solutions',
        reportTitle: reportTitle.trim() || 'Business Report',
        canteenScope,
        compareCanteens,
        startDate: range.start,
        endDate: range.end,
        periodLabel,
        sections,
        compact,
        includeTransactionTable,
        includeCharts,
        includeNotes,
        orientation,
        notesText,
      })
      const filename = buildFilename('brightnest-report', 'pdf', periodPreset)
      saveReportDocument(doc, filename)
      setGeneratedMessage(`PDF generated: ${filename}`)
    } catch (err) {
      setGeneratedMessage(err instanceof Error ? `Could not generate PDF: ${err.message}` : 'Could not generate PDF.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal title="Create PDF report" onClose={onClose} wide>
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name">
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </Field>
          <Field label="Report title">
            <Input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Report period">
            <Select value={periodPreset} onChange={(e) => setPeriodPreset(e.target.value as DateRangePreset)}>
              {PERIOD_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          {periodPreset === 'custom' && (
            <>
              <Field label="Start date">
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </Field>
              <Field label="End date">
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Canteen selection">
            <Select
              value={compareCanteens ? 'compare' : canteenScope}
              onChange={(e) => {
                if (e.target.value === 'compare') {
                  setCompareCanteens(true)
                  setCanteenScope('combined')
                } else {
                  setCompareCanteens(false)
                  setCanteenScope(e.target.value)
                }
              }}
            >
              <option value="combined">Combined report</option>
              {data.canteens.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} only
                </option>
              ))}
              <option value="compare">Compare both canteens</option>
            </Select>
          </Field>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-[#4c5b52]">Report sections</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {REPORT_SECTIONS.map((section) => {
              const available = section.isAvailable(data)
              return (
                <label
                  key={section.key}
                  className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                    available ? 'border-[#eff2ef] cursor-pointer hover:bg-[#f5f7f5]' : 'border-[#eff2ef] opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={sections.has(section.key)}
                    disabled={!available}
                    onChange={() => toggleSection(section.key)}
                  />
                  <span>
                    {section.label}
                    {!available && (
                      <span className="mt-0.5 block text-[11px] text-amber-700">
                        Unavailable: {section.unavailableReason?.(data) ?? 'Not enough data.'}
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="grid gap-3 border-t border-[#eff2ef] pt-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
            Compact summary (vs detailed report)
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={includeTransactionTable} onChange={(e) => setIncludeTransactionTable(e.target.checked)} />
            Include transaction tables
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={includeCharts} onChange={(e) => setIncludeCharts(e.target.checked)} />
            Include trend tables
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
            Include notes
          </label>
          <Field label="Layout">
            <Select value={orientation} onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </Select>
          </Field>
        </div>

        {includeNotes && (
          <Field label="Notes to include in the PDF (optional)">
            <Textarea value={notesText} onChange={(e) => setNotesText(e.target.value)} placeholder="Any context or explanation for the reader of this report..." />
          </Field>
        )}

        <div className="rounded-lg bg-[#f5f7f5] p-3 text-xs text-[#4c5b52]">
          <b>Preview summary:</b> {reportTitle || 'Business Report'} for {periodLabel} ·{' '}
          {canteenScope === 'combined' && !compareCanteens
            ? 'All canteens combined'
            : compareCanteens
              ? 'Comparing both canteens'
              : data.canteens.find((c) => c.id === canteenScope)?.name}{' '}
          · {sections.size} section(s) selected · {orientation} · {compact ? 'compact' : 'detailed'}
        </div>

        {generatedMessage && <p className="text-xs text-[#347246]">{generatedMessage}</p>}

        <div className="flex justify-between gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={generate} disabled={generating || sections.size === 0}>
            <FileDown className="size-4" />
            {generating ? 'Generating…' : 'Generate PDF'}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  )
}
