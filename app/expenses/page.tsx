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
import { createExpense, removeById, updateExpense } from '@/lib/db/repository'
import type { ExpenseRecord } from '@/lib/types'
import { PAYMENT_METHODS, EXPENSE_CATEGORIES } from '@/lib/types'
import { formatPaise, parseAmountToPaise, isValidPositiveAmount, paiseToRupees } from '@/lib/money'
import { todayIst, isValidIsoDate, resolveDateRange, type DateRangePreset } from '@/lib/dates'
import { filterExpenses } from '@/lib/calculations'
import { filterExpensesBySearch } from '@/lib/search'
import { downloadCsv, downloadExcel, buildFilename } from '@/lib/export'

type Draft = {
  canteenId: string
  date: string
  amount: string
  category: ExpenseRecord['category']
  paymentMethod: ExpenseRecord['paymentMethod']
  vendorId: string
  reference: string
  description: string
}

function emptyDraft(canteenId = ''): Draft {
  return { canteenId, date: todayIst(), amount: '', category: 'Other', paymentMethod: 'Cash', vendorId: '', reference: '', description: '' }
}

export default function ExpensesPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const [canteenId, setCanteenId] = useState('all')
  const [preset, setPreset] = useState<DateRangePreset>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [vendorFilter, setVendorFilter] = useState('all')
  const [importFilter, setImportFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState<ExpenseRecord | null>(null)

  const range = useMemo(() => resolveDateRange(preset, customStart, customEnd), [preset, customStart, customEnd])

  const filteredRows = useMemo(() => {
    if (!data) return []
    let rows = filterExpenses(data.expenses, { canteenId, startDate: range.start, endDate: range.end })
    if (paymentFilter !== 'all') rows = rows.filter((r) => r.paymentMethod === paymentFilter)
    if (categoryFilter !== 'all') rows = rows.filter((r) => r.category === categoryFilter)
    if (vendorFilter !== 'all') rows = rows.filter((r) => r.vendorId === vendorFilter)
    if (importFilter !== 'all') rows = rows.filter((r) => r.importId === importFilter)
    rows = filterExpensesBySearch(rows, query, { vendors: data.vendors, staff: data.staff, imports: data.imports })
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [data, canteenId, range, paymentFilter, categoryFilter, vendorFilter, importFilter, query])

  const total = filteredRows.reduce((n, r) => n + r.amountPaise, 0)

  const categorySummary = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of filteredRows) map.set(r.category, (map.get(r.category) ?? 0) + r.amountPaise)
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [filteredRows])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const activeCanteens = data.canteens.filter((c) => c.active)

  const openAdd = () => {
    setDraft(emptyDraft(activeCanteens[0]?.id ?? ''))
    setFormErrors({})
    setEditingId(null)
    setModal('add')
  }

  const openEdit = (r: ExpenseRecord) => {
    setDraft({
      canteenId: r.canteenId,
      date: r.date,
      amount: String(paiseToRupees(r.amountPaise)),
      category: r.category,
      paymentMethod: r.paymentMethod,
      vendorId: r.vendorId ?? '',
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
    else if (canteen && !canteen.active) errors.canteenId = 'Cannot record new expenses against an inactive canteen'
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
    const payload = {
      canteenId: draft.canteenId,
      date: draft.date,
      amountPaise,
      category: draft.category,
      paymentMethod: draft.paymentMethod,
      vendorId: draft.vendorId || undefined,
      reference: draft.reference,
      description: draft.description,
    }
    if (modal === 'edit' && editingId) {
      await updateExpense(editingId, payload)
      notify('Expense updated')
    } else {
      await createExpense({ ...payload, source: 'manual' })
      notify('Expense added')
    }
    setModal(null)
    await refresh()
  }

  const exportCsv = () => {
    const rows = filteredRows.map((r) => [
      r.date,
      data.canteens.find((c) => c.id === r.canteenId)?.name ?? r.canteenId,
      paiseToRupees(r.amountPaise),
      r.category,
      r.paymentMethod,
      data.vendors.find((v) => v.id === r.vendorId)?.name ?? '',
      r.reference,
      r.description,
    ])
    const ok = downloadCsv(buildFilename('expense-register', 'csv'), ['Date', 'Canteen', 'Amount', 'Category', 'Payment Method', 'Vendor', 'Reference', 'Description'], rows)
    notify(ok ? 'Expenses exported (CSV)' : 'Export failed', ok ? 'success' : 'error')
  }

  const exportExcel = () => {
    const rows = filteredRows.map((r) => [
      r.date,
      data.canteens.find((c) => c.id === r.canteenId)?.name ?? r.canteenId,
      paiseToRupees(r.amountPaise),
      r.category,
      r.paymentMethod,
      data.vendors.find((v) => v.id === r.vendorId)?.name ?? '',
      r.reference,
      r.description,
    ])
    const ok = downloadExcel(buildFilename('expense-register', 'xlsx'), ['Date', 'Canteen', 'Amount', 'Category', 'Payment Method', 'Vendor', 'Reference', 'Description'], rows)
    notify(ok ? 'Expenses exported (Excel)' : 'Export failed', ok ? 'success' : 'error')
  }

  return (
    <AppShell title="Expense Register" subtitle="Track operating expenses, categorised and filterable per canteen." badge="Local data">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <CanteenFilter canteens={data.canteens} value={canteenId} onChange={setCanteenId} />
          <DateRangeFilter preset={preset} onPresetChange={setPreset} customStart={customStart} customEnd={customEnd} onCustomStartChange={setCustomStart} onCustomEndChange={setCustomEnd} />
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 w-auto" aria-label="Filter by category">
            <option value="all">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="h-10 w-auto" aria-label="Filter by payment method">
            <option value="all">All payment methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          {data.vendors.length > 0 && (
            <Select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="h-10 w-auto" aria-label="Filter by vendor">
              <option value="all">All vendors</option>
              {data.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          )}
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
              placeholder="Search description, reference, vendor, filename..."
              className="w-56 pl-9"
              aria-label="Search expenses"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <SecondaryButton onClick={exportCsv}>
            <Download className="size-4" />
            CSV
          </SecondaryButton>
          <SecondaryButton onClick={exportExcel}>
            <Download className="size-4" />
            Excel
          </SecondaryButton>
          <PrimaryButton onClick={openAdd} disabled={activeCanteens.length === 0}>
            <Plus className="size-4" />
            Add expense
          </PrimaryButton>
        </div>
      </div>

      {categorySummary.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {categorySummary.map(([cat, amount]) => (
            <div key={cat} className="rounded-lg border border-[#e3e9e3] bg-white px-3 py-2 text-xs">
              <span className="text-[#89958d]">{cat}: </span>
              <b>{formatPaise(amount)}</b>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
        <div className="mb-3 flex items-center justify-between text-xs text-[#89958d]">
          <span>{filteredRows.length} records</span>
          <span className="font-bold text-[#1b2520]">Total: {formatPaise(total)}</span>
        </div>
        {filteredRows.length === 0 ? (
          <EmptyState title="No expense records match your filters" action={<PrimaryButton onClick={openAdd}>Add expense</PrimaryButton>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-[#89958d]">
                  <th className="p-2">Date</th>
                  <th className="p-2">Canteen</th>
                  <th className="p-2">Description</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Payment</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.id} className="border-b border-[#eff2ef]">
                    <td className="p-2 whitespace-nowrap">{r.date}</td>
                    <td className="p-2">{data.canteens.find((c) => c.id === r.canteenId)?.name ?? '—'}</td>
                    <td className="p-2">{r.description}</td>
                    <td className="p-2">{r.category}</td>
                    <td className="p-2">{r.paymentMethod}</td>
                    <td className="p-2 text-right font-semibold">{formatPaise(r.amountPaise)}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(r)} aria-label="Edit expense" className="text-[#347246]">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => setDeleting(r)} aria-label="Delete expense" className="text-red-600">
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
        <Modal title={modal === 'edit' ? 'Edit expense' : 'Add expense'} onClose={() => setModal(null)}>
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
            <Field label="Category">
              <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ExpenseRecord['category'] })}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Payment method">
              <Select value={draft.paymentMethod} onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value as ExpenseRecord['paymentMethod'] })}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vendor (optional)">
              <Select value={draft.vendorId} onChange={(e) => setDraft({ ...draft, vendorId: e.target.value })}>
                <option value="">No vendor</option>
                {data.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
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
            Save expense
          </PrimaryButton>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete expense record"
          message={`Delete the expense of ${formatPaise(deleting.amountPaise)} dated ${deleting.date}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await removeById('expenses', deleting.id)
            setDeleting(null)
            await refresh()
            notify('Expense deleted')
          }}
          onCancel={() => setDeleting(null)}
        />
      )}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}
