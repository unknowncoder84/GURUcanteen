'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Download } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { CanteenFilter, DateRangeFilter } from '@/components/filters'
import { Modal, ConfirmDialog } from '@/components/ui/modal'
import { Field, Input, Textarea, PrimaryButton, SecondaryButton } from '@/components/ui/form'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import { createProfitSharingRule, removeProfitSharingRule, updateProfitSharingRule } from '@/lib/db/repository'
import type { ProfitSharingRule } from '@/lib/types'
import { resolveDateRange, todayIst, isValidIsoDate, type DateRangePreset } from '@/lib/dates'
import { computeFinancialSummary } from '@/lib/calculations'
import { validateSharingRules, computeDistribution } from '@/lib/profitSharing'
import { formatPaise } from '@/lib/money'
import { downloadCsv, buildFilename } from '@/lib/export'

type Draft = { partyName: string; percentage: string; effectiveDate: string; notes: string; active: boolean }
function emptyDraft(): Draft {
  return { partyName: '', percentage: '', effectiveDate: todayIst(), notes: '', active: true }
}

export default function ProfitSharingPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const [canteenId, setCanteenId] = useState('all')
  const [preset, setPreset] = useState<DateRangePreset>('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState<ProfitSharingRule | null>(null)

  const range = useMemo(() => resolveDateRange(preset, customStart, customEnd), [preset, customStart, customEnd])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const rules = data.profitSharingRules
  const validation = validateSharingRules(rules)

  const summary = computeFinancialSummary(data.sales, data.expenses, { canteenId, startDate: range.start, endDate: range.end })
  const distributableAmountPaise = Math.max(0, summary.profitPaise)
  const distribution = validation.valid ? computeDistribution(rules, distributableAmountPaise) : null

  const openAdd = () => {
    setDraft(emptyDraft())
    setErrors({})
    setEditingId(null)
    setModal('add')
  }

  const openEdit = (r: ProfitSharingRule) => {
    setDraft({ partyName: r.partyName, percentage: String(r.percentage), effectiveDate: r.effectiveDate, notes: r.notes, active: r.active })
    setEditingId(r.id)
    setErrors({})
    setModal('edit')
  }

  const validateDraft = () => {
    const e: Record<string, string> = {}
    if (!draft.partyName.trim()) e.partyName = 'Party name is required'
    const pct = Number(draft.percentage)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) e.percentage = 'Enter a percentage greater than 0 and at most 100'
    if (!isValidIsoDate(draft.effectiveDate)) e.effectiveDate = 'Enter a valid effective date'
    return e
  }

  const save = async () => {
    const e = validateDraft()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    const payload = {
      partyName: draft.partyName.trim(),
      percentage: Math.round(Number(draft.percentage) * 100) / 100,
      effectiveDate: draft.effectiveDate,
      notes: draft.notes,
      active: draft.active,
    }
    if (modal === 'edit' && editingId) {
      await updateProfitSharingRule(editingId, payload)
      notify('Profit-sharing party updated')
    } else {
      await createProfitSharingRule(payload)
      notify('Profit-sharing party added')
    }
    setModal(null)
    await refresh()
  }

  const exportCsv = () => {
    const ok = downloadCsv(
      buildFilename('profit-sharing-rules', 'csv'),
      ['Party', 'Percentage', 'Effective date', 'Active', 'Notes'],
      rules.map((r) => [r.partyName, r.percentage, r.effectiveDate, r.active ? 'Yes' : 'No', r.notes])
    )
    notify(ok ? 'Profit-sharing rules exported' : 'Export failed', ok ? 'success' : 'error')
  }

  const exportDistribution = () => {
    if (!distribution) return
    const ok = downloadCsv(
      buildFilename('profit-distribution', 'csv', `${range.start ?? 'all'}_to_${range.end ?? 'present'}`),
      ['Party', 'Percentage', 'Amount (INR)'],
      distribution.shares.map((s) => [s.partyName, `${s.percentage}%`, (s.amountPaise / 100).toFixed(2)])
    )
    notify(ok ? 'Distribution calculation exported' : 'Export failed', ok ? 'success' : 'error')
  }

  return (
    <AppShell
      title="Profit & Sharing"
      subtitle="Configure sharing parties explicitly and preview a provisional distribution calculation. Nothing here moves money or creates payments."
      badge="Local data"
    >
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <CanteenFilter canteens={data.canteens} value={canteenId} onChange={setCanteenId} />
          <DateRangeFilter preset={preset} onPresetChange={setPreset} customStart={customStart} customEnd={customEnd} onCustomStartChange={setCustomStart} onCustomEndChange={setCustomEnd} />
        </div>
        <div className="flex gap-2">
          <SecondaryButton onClick={exportCsv}>
            <Download className="size-4" />
            Export rules
          </SecondaryButton>
          <PrimaryButton onClick={openAdd}>
            <Plus className="size-4" />
            Add party
          </PrimaryButton>
        </div>
      </div>

      <section className="mb-5 rounded-xl border border-[#e3e9e3] bg-white p-5">
        <h3 className="mb-3 font-bold">Configured sharing parties</h3>
        {rules.length === 0 ? (
          <p className="py-6 text-center text-xs text-[#89958d]">No profit-sharing agreement configured. Add a party to begin.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-[#89958d]">
                  <th className="p-2">Party</th>
                  <th className="p-2 text-right">Percentage</th>
                  <th className="p-2">Effective date</th>
                  <th className="p-2">Active</th>
                  <th className="p-2">Notes</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-[#eff2ef]">
                    <td className="p-2 font-semibold">{r.partyName}</td>
                    <td className="p-2 text-right">{r.percentage}%</td>
                    <td className="p-2">{r.effectiveDate}</td>
                    <td className="p-2">{r.active ? 'Yes' : 'No'}</td>
                    <td className="p-2 text-[#89958d]">{r.notes || '—'}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(r)} aria-label="Edit party" className="text-[#347246]">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => setDeleting(r)} aria-label="Delete party" className="text-red-600">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rules.length > 0 && (
          <div className={`mt-4 rounded-lg px-4 py-3 text-xs ${validation.valid ? 'bg-[#e8f6eb] text-[#347246]' : 'bg-amber-50 text-amber-800'}`}>
            Active shares total <b>{validation.totalPercentage}%</b>.{' '}
            {validation.valid ? 'This agreement is valid and can be used to compute a distribution.' : validation.errors.join(' ')}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">Distribution calculation (provisional estimate)</h3>
          {distribution && (
            <SecondaryButton onClick={exportDistribution}>
              <Download className="size-4" />
              Export calculation
            </SecondaryButton>
          )}
        </div>

        {!validation.valid ? (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">No profit-sharing agreement configured.</p>
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryBox label="Recognised sales" value={formatPaise(summary.salesPaise)} />
              <SummaryBox label="Recognised operating expenses" value={formatPaise(summary.expensesPaise)} />
              <SummaryBox label="Operating profit" value={formatPaise(summary.profitPaise)} tone={summary.profitPaise >= 0 ? 'good' : 'bad'} />
              <SummaryBox label="Amount eligible for distribution" value={formatPaise(distributableAmountPaise)} tone="good" />
            </div>

            <p className="mb-3 text-xs text-[#89958d]">
              Formula: amount eligible = max(0, operating profit for the selected period and canteen). Each party&apos;s amount = amount
              eligible × party percentage, with any paise-level rounding remainder allocated deterministically so the parts always sum
              exactly to the amount eligible.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-[#89958d]">
                    <th className="p-2">Party</th>
                    <th className="p-2 text-right">Percentage</th>
                    <th className="p-2 text-right">Calculated amount</th>
                  </tr>
                </thead>
                <tbody>
                  {distribution!.shares.map((s) => (
                    <tr key={s.ruleId} className="border-b border-[#eff2ef]">
                      <td className="p-2 font-semibold">{s.partyName}</td>
                      <td className="p-2 text-right">{s.percentage}%</td>
                      <td className="p-2 text-right font-semibold">{formatPaise(s.amountPaise)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#dfe6df]">
                    <td className="p-2 font-bold">Total allocated</td>
                    <td className="p-2 text-right font-bold">{validation.totalPercentage}%</td>
                    <td className="p-2 text-right font-bold">{formatPaise(distribution!.totalAllocatedPaise)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {distribution!.roundingAdjustmentPaise !== 0 && (
              <p className="mt-2 text-[11px] text-[#89958d]">
                A total of {distribution!.roundingAdjustmentPaise} paise of rounding remainder was deterministically allocated so the
                shares sum exactly to the amount eligible for distribution.
              </p>
            )}
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              This is a provisional estimate based on the operating profit figure, not an audited or legally approved distribution. No
              money is transferred, no payment records are created, and no historical accounting records are modified by this page.
            </p>
          </>
        )}
      </section>

      {modal && (
        <Modal title={modal === 'edit' ? 'Edit sharing party' : 'Add sharing party'} onClose={() => setModal(null)}>
          <div className="grid gap-3">
            <Field label="Party name" error={errors.partyName}>
              <Input value={draft.partyName} onChange={(e) => setDraft({ ...draft, partyName: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Percentage share" error={errors.percentage}>
                <Input type="number" min="0" max="100" step="0.01" value={draft.percentage} onChange={(e) => setDraft({ ...draft, percentage: e.target.value })} />
              </Field>
              <Field label="Effective date" error={errors.effectiveDate}>
                <Input type="date" value={draft.effectiveDate} onChange={(e) => setDraft({ ...draft, effectiveDate: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Active (included in distribution calculations)
            </label>
          </div>
          <PrimaryButton onClick={save} className="mt-5 w-full">
            Save party
          </PrimaryButton>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete sharing party"
          message={`Remove "${deleting.partyName}" from the profit-sharing agreement? This does not affect any historical sales or expense records.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await removeProfitSharingRule(deleting.id)
            setDeleting(null)
            await refresh()
            notify('Sharing party removed')
          }}
          onCancel={() => setDeleting(null)}
        />
      )}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}

function SummaryBox({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-[#347246]' : tone === 'bad' ? 'text-red-600' : 'text-[#1b2520]'
  return (
    <div className="rounded-lg border border-[#eff2ef] bg-[#fbfcfb] p-3">
      <p className="text-[11px] font-semibold text-[#89958d]">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}
