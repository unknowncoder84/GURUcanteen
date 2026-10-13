'use client'

import { useMemo, useState } from 'react'
import { Plus, Download, Pencil } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { CanteenFilter, DateRangeFilter } from '@/components/filters'
import { Modal } from '@/components/ui/modal'
import { Field, Input, Select, Textarea, PrimaryButton, SecondaryButton } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/empty-state'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import { createCollection, updateCollection } from '@/lib/db/repository'
import type { CollectionRecord } from '@/lib/types'
import { PAYMENT_METHODS } from '@/lib/types'
import { formatPaise, parseAmountToPaise, paiseToRupees } from '@/lib/money'
import { todayIst, isValidIsoDate, resolveDateRange, type DateRangePreset } from '@/lib/dates'
import { isDateInRange } from '@/lib/dates'
import { downloadCsv, buildFilename } from '@/lib/export'

type Draft = {
  canteenId: string
  date: string
  paymentMethod: CollectionRecord['paymentMethod']
  expected: string
  actual: string
  reference: string
  notes: string
  reviewed: boolean
}

function emptyDraft(canteenId = ''): Draft {
  return { canteenId, date: todayIst(), paymentMethod: 'Cash', expected: '', actual: '', reference: '', notes: '', reviewed: false }
}

export default function CollectionsPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const [canteenId, setCanteenId] = useState('all')
  const [preset, setPreset] = useState<DateRangePreset>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const range = useMemo(() => resolveDateRange(preset, customStart, customEnd), [preset, customStart, customEnd])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.collections
      .filter((c) => (canteenId === 'all' || c.canteenId === canteenId) && isDateInRange(c.date, range.start, range.end))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [data, canteenId, range])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const activeCanteens = data.canteens.filter((c) => c.active)

  const openAdd = () => {
    setDraft(emptyDraft(activeCanteens[0]?.id ?? ''))
    setErrors({})
    setEditingId(null)
    setModal('add')
  }

  const openEdit = (c: CollectionRecord) => {
    setDraft({
      canteenId: c.canteenId,
      date: c.date,
      paymentMethod: c.paymentMethod,
      expected: String(paiseToRupees(c.expectedPaise)),
      actual: String(paiseToRupees(c.actualPaise)),
      reference: c.reference,
      notes: c.notes,
      reviewed: c.reviewed,
    })
    setEditingId(c.id)
    setErrors({})
    setModal('edit')
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!draft.canteenId) e.canteenId = 'Canteen is required'
    if (!isValidIsoDate(draft.date)) e.date = 'Enter a valid date'
    if (parseAmountToPaise(draft.expected) === null) e.expected = 'Enter a valid expected amount'
    if (parseAmountToPaise(draft.actual) === null) e.actual = 'Enter a valid actual amount'
    return e
  }

  const save = async () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    const payload = {
      canteenId: draft.canteenId,
      date: draft.date,
      paymentMethod: draft.paymentMethod,
      expectedPaise: parseAmountToPaise(draft.expected)!,
      actualPaise: parseAmountToPaise(draft.actual)!,
      reference: draft.reference,
      notes: draft.notes,
      reviewed: draft.reviewed,
      linkedSalesIds: [],
    }
    if (modal === 'edit' && editingId) {
      await updateCollection(editingId, payload)
      notify('Collection updated')
    } else {
      await createCollection(payload)
      notify('Collection recorded')
    }
    setModal(null)
    await refresh()
  }

  const exportCsv = () => {
    const ok = downloadCsv(
      buildFilename('collections', 'csv'),
      ['Date', 'Canteen', 'Method', 'Expected', 'Actual', 'Discrepancy', 'Reviewed', 'Reference', 'Notes'],
      filtered.map((c) => [
        c.date,
        data.canteens.find((x) => x.id === c.canteenId)?.name ?? c.canteenId,
        c.paymentMethod,
        paiseToRupees(c.expectedPaise),
        paiseToRupees(c.actualPaise),
        paiseToRupees(c.actualPaise - c.expectedPaise),
        c.reviewed ? 'Yes' : 'No',
        c.reference,
        c.notes,
      ])
    )
    notify(ok ? 'Collections exported' : 'Export failed', ok ? 'success' : 'error')
  }

  return (
    <AppShell
      title="Collections"
      subtitle="Record cash/UPI/card collections and compare expected vs actual amounts. Sales and collections are kept as distinct records."
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
            Export CSV
          </SecondaryButton>
          <PrimaryButton onClick={openAdd} disabled={activeCanteens.length === 0}>
            <Plus className="size-4" />
            Record collection
          </PrimaryButton>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No collection records yet" action={<PrimaryButton onClick={openAdd}>Record collection</PrimaryButton>} />
      ) : (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-[#89958d]">
                  <th className="p-2">Date</th>
                  <th className="p-2">Canteen</th>
                  <th className="p-2">Method</th>
                  <th className="p-2 text-right">Expected</th>
                  <th className="p-2 text-right">Actual</th>
                  <th className="p-2 text-right">Discrepancy</th>
                  <th className="p-2">Reviewed</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const discrepancy = c.actualPaise - c.expectedPaise
                  return (
                    <tr key={c.id} className="border-b border-[#eff2ef]">
                      <td className="p-2 whitespace-nowrap">{c.date}</td>
                      <td className="p-2">{data.canteens.find((x) => x.id === c.canteenId)?.name ?? '—'}</td>
                      <td className="p-2">{c.paymentMethod}</td>
                      <td className="p-2 text-right">{formatPaise(c.expectedPaise)}</td>
                      <td className="p-2 text-right">{formatPaise(c.actualPaise)}</td>
                      <td className={`p-2 text-right font-semibold ${discrepancy === 0 ? 'text-[#347246]' : discrepancy < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                        {formatPaise(discrepancy)}
                      </td>
                      <td className="p-2">{c.reviewed ? 'Yes' : 'No'}</td>
                      <td className="p-2">
                        <button onClick={() => openEdit(c)} aria-label="Edit collection" className="text-[#347246]">
                          <Pencil className="size-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {modal && (
        <Modal title={modal === 'edit' ? 'Edit collection' : 'Record collection'} onClose={() => setModal(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Canteen" error={errors.canteenId}>
              <Select value={draft.canteenId} onChange={(e) => setDraft({ ...draft, canteenId: e.target.value })}>
                <option value="">Select canteen</option>
                {data.canteens.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" error={errors.date}>
              <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </Field>
            <Field label="Payment method">
              <Select value={draft.paymentMethod} onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value as CollectionRecord['paymentMethod'] })}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference">
              <Input value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} />
            </Field>
            <Field label="Expected amount (INR)" error={errors.expected}>
              <Input type="number" min="0" step="0.01" value={draft.expected} onChange={(e) => setDraft({ ...draft, expected: e.target.value })} />
            </Field>
            <Field label="Actual amount (INR)" error={errors.actual}>
              <Input type="number" min="0" step="0.01" value={draft.actual} onChange={(e) => setDraft({ ...draft, actual: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <input type="checkbox" checked={draft.reviewed} onChange={(e) => setDraft({ ...draft, reviewed: e.target.checked })} />
              Mark as reviewed
            </label>
          </div>
          <PrimaryButton onClick={save} className="mt-5 w-full">
            Save collection
          </PrimaryButton>
        </Modal>
      )}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}
