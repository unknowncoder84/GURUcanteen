'use client'

import { useMemo, useState } from 'react'
import { Plus, Search, Download, Pencil, Trash2 } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { CanteenFilter, DateRangeFilter } from '@/components/filters'
import { Modal, ConfirmDialog } from '@/components/ui/modal'
import { Field, Input, Select, PrimaryButton, SecondaryButton } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/empty-state'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import { createSale, removeById, updateSale } from '@/lib/db/repository'
import type { SalesRecord } from '@/lib/types'
import { PAYMENT_METHODS } from '@/lib/types'
import { formatPaise, parseAmountToPaise, isValidPositiveAmount, paiseToRupees } from '@/lib/money'
import { todayIst, isValidIsoDate, resolveDateRange, type DateRangePreset } from '@/lib/dates'
import { filterSales } from '@/lib/calculations'
import { filterSalesBySearch } from '@/lib/search'
import { downloadCsv, buildFilename } from '@/lib/export'
import { generateId, nowIso } from '@/lib/id'

type Draft = {
  canteenId: string
  date: string
  amount: string
  paymentMethod: SalesRecord['paymentMethod']
  reference: string
  description: string
}

function emptyDraft(canteenId = ''): Draft {
  return { canteenId, date: todayIst(), amount: '', paymentMethod: 'UPI', reference: '', description: '' }
}

export default function SalesPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const [canteenId, setCanteenId] = useState('all')
  const [preset, setPreset] = useState<DateRangePreset>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [importFilter, setImportFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState<SalesRecord | null>(null)

  const range = useMemo(() => resolveDateRange(preset, customStart, customEnd), [preset, customStart, customEnd])

  const filteredRows = useMemo(() => {
    if (!data) return []
    let rows = filterSales(data.sales, { canteenId, startDate: range.start, endDate: range.end })
    if (paymentFilter !== 'all') rows = rows.filter((r) => r.paymentMethod === paymentFilter)
    if (importFilter !== 'all') rows = rows.filter((r) => r.importId === importFilter)
    rows = filterSalesBySearch(rows, query, { vendors: data.vendors, staff: data.staff, imports: data.imports })
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [data, canteenId, range, paymentFilter, importFilter, query])

  const total = filteredRows.reduce((n, r) => n + r.amountPaise, 0)

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const activeCanteens = data.canteens.filter((c) => c.active)

  const openAdd = () => {
    setDraft(emptyDraft(activeCanteens[0]?.id ?? ''))
    setFormErrors({})
    setEditingId(null)
    setModal('add')
  }

  const openEdit = (r: SalesRecord) => {
    setDraft({
      canteenId: r.canteenId,
      date: r.date,
      amount: String(paiseToRupees(r.amountPaise)),
      paymentMethod: r.paymentMethod,
      reference: r.reference,
      description: r.description,
    })
    setEditingId(r.id)
    setFormErrors({})
    setModal('edit')
  }

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {}
    const canteen = data.canteens.find((c) => c.id === draft.canteenId)
    if (!draft.canteenId) errors.canteenId = 'Canteen is required'
    else if (canteen && !canteen.active) errors.canteenId = 'Cannot record new sales against an inactive canteen'
    if (!isValidIsoDate(draft.date)) errors.date = 'Enter a valid date'
    const amountPaise = parseAmountToPaise(draft.amount)
    if (!isValidPositiveAmount(amountPaise)) errors.amount = 'Enter a positive numeric amount'
    if (!draft.description.trim()) errors.description = 'Description is required'
    return errors
  }

  const save = async () => {
    const errors = validate()
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    const amountPaise = parseAmountToPaise(draft.amount)!
    if (modal === 'edit' && editingId) {
      await updateSale(editingId, {
        canteenId: draft.canteenId,
        date: draft.date,
        amountPaise,
        paymentMethod: draft.paymentMethod,
        reference: draft.reference,
        description: draft.description,
      })
      notify('Sale updated')
    } else {
      await createSale({
        canteenId: draft.canteenId,
        date: draft.date,
        amountPaise,
        paymentMethod: draft.paymentMethod,
        reference: draft.reference,
        description: draft.description,
        source: 'manual',
      })
      notify('Sale added')
    }
    setModal(null)
    await refresh()
  }

  const exportCsv = () => {
    const ok = downloadCsv(
      buildFilename('sales-register', 'csv'),
      ['Date', 'Canteen', 'Amount', 'Payment Method', 'Reference', 'Description'],
      filteredRows.map((r) => [r.date, data.canteens.find((c) => c.id === r.canteenId)?.name ?? r.canteenId, paiseToRupees(r.amountPaise), r.paymentMethod, r.reference, r.description])
    )
    notify(ok ? 'Sales exported' : 'Export failed', ok ? 'success' : 'error')
  }

  return (
    <AppShell title="Sales Register" subtitle="Record and manage every sale across all canteens." badge="Local data">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <CanteenFilter canteens={data.canteens} value={canteenId} onChange={setCanteenId} />
          <DateRangeFilter preset={preset} onPresetChange={setPreset} customStart={customStart} customEnd={customEnd} onCustomStartChange={setCustomStart} onCustomEndChange={setCustomEnd} />
          <Select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="h-10 w-auto" aria-label="Filter by payment method">
            <option value="all">All payment methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          {data.imports.length > 0 && (
            <Select value={importFilter} onChange={(e) => setImportFilter(e.target.value)} className="h-10 w-auto" aria-label="Filter by import batch">
              <option value="all">All sources</option>
              {data.imports.map((imp) => (
                <option key={imp.id} value={imp.id}>
                  {imp.filename}
                </option>
              ))}
            </Select>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#89958d]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search description, reference, filename..."
              className="w-56 pl-9"
              aria-label="Search sales"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <SecondaryButton onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </SecondaryButton>
          <PrimaryButton onClick={openAdd} disabled={activeCanteens.length === 0}>
            <Plus className="size-4" />
            Add sale
          </PrimaryButton>
        </div>
      </div>

      {activeCanteens.length === 0 && <p className="mb-3 text-xs text-amber-700">Add an active canteen before recording sales.</p>}

      <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
        <div className="mb-3 flex items-center justify-between text-xs text-[#89958d]">
          <span>{filteredRows.length} records</span>
          <span className="font-bold text-[#1b2520]">Total: {formatPaise(total)}</span>
        </div>
        {filteredRows.length === 0 ? (
          <EmptyState title="No sales records match your filters" action={<PrimaryButton onClick={openAdd}>Add sale</PrimaryButton>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-[#89958d]">
                  <th className="p-2">Date</th>
                  <th className="p-2">Canteen</th>
                  <th className="p-2">Description</th>
                  <th className="p-2">Payment</th>
                  <th className="p-2">Reference</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2">Source</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.id} className="border-b border-[#eff2ef]">
                    <td className="p-2 whitespace-nowrap">{r.date}</td>
                    <td className="p-2">{data.canteens.find((c) => c.id === r.canteenId)?.name ?? '—'}</td>
                    <td className="p-2">{r.description}</td>
                    <td className="p-2">{r.paymentMethod}</td>
                    <td className="p-2">{r.reference || '—'}</td>
                    <td className="p-2 text-right font-semibold">{formatPaise(r.amountPaise)}</td>
                    <td className="p-2 capitalize text-[#89958d]">{r.source}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(r)} aria-label="Edit sale" className="text-[#347246]">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => setDeleting(r)} aria-label="Delete sale" className="text-red-600">
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
      </section>

      {modal && (
        <Modal title={modal === 'edit' ? 'Edit sale' : 'Add sale'} onClose={() => setModal(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Canteen" error={formErrors.canteenId}>
              <Select value={draft.canteenId} onChange={(e) => setDraft({ ...draft, canteenId: e.target.value })}>
                <option value="">Select canteen</option>
                {data.canteens.map((c) => (
                  <option key={c.id} value={c.id} disabled={!c.active}>
                    {c.name}
                    {!c.active ? ' (inactive)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" error={formErrors.date}>
              <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </Field>
            <Field label="Amount (INR)" error={formErrors.amount}>
              <Input type="number" min="0" step="0.01" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            </Field>
            <Field label="Payment method">
              <Select value={draft.paymentMethod} onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value as SalesRecord['paymentMethod'] })}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" error={formErrors.description}>
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <Field label="Reference">
              <Input value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} />
            </Field>
          </div>
          <PrimaryButton onClick={save} className="mt-5 w-full">
            Save sale
          </PrimaryButton>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete sale record"
          message={`Delete the sale of ${formatPaise(deleting.amountPaise)} dated ${deleting.date}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await removeById('sales', deleting.id)
            setDeleting(null)
            await refresh()
            notify('Sale deleted')
          }}
          onCancel={() => setDeleting(null)}
        />
      )}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}

// Re-exported so other modules (e.g. tests) can build a sale quickly if needed.
export function buildManualSale(canteenId: string, amountRupees: number, description: string) {
  return {
    id: generateId('sale'),
    canteenId,
    date: todayIst(),
    amountPaise: Math.round(amountRupees * 100),
    paymentMethod: 'Cash' as const,
    reference: '',
    description,
    source: 'manual' as const,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
}
