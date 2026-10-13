'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Download } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { CanteenFilter } from '@/components/filters'
import { Modal, ConfirmDialog } from '@/components/ui/modal'
import { Field, Input, Select, PrimaryButton, SecondaryButton } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/empty-state'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import { createPurchase, removeById, updatePurchase } from '@/lib/db/repository'
import type { PurchaseRecord } from '@/lib/types'
import { formatPaise, parseAmountToPaise, paiseToRupees, isValidPositiveAmount } from '@/lib/money'
import { todayIst, isValidIsoDate } from '@/lib/dates'
import { downloadCsv, buildFilename } from '@/lib/export'

type Draft = {
  canteenId: string
  vendorId: string
  date: string
  itemDescription: string
  quantity: string
  unitCost: string
  reference: string
}

function emptyDraft(canteenId = '', vendorId = ''): Draft {
  return { canteenId, vendorId, date: todayIst(), itemDescription: '', quantity: '1', unitCost: '', reference: '' }
}

export default function PurchasesPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const [canteenId, setCanteenId] = useState('all')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState<PurchaseRecord | null>(null)

  const filtered = useMemo(() => {
    if (!data) return []
    return data.purchases
      .filter((p) => canteenId === 'all' || p.canteenId === canteenId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [data, canteenId])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const activeCanteens = data.canteens.filter((c) => c.active)

  const openAdd = () => {
    setDraft(emptyDraft(activeCanteens[0]?.id ?? '', data.vendors[0]?.id ?? ''))
    setErrors({})
    setEditingId(null)
    setModal('add')
  }

  const openEdit = (p: PurchaseRecord) => {
    setDraft({
      canteenId: p.canteenId,
      vendorId: p.vendorId,
      date: p.date,
      itemDescription: p.itemDescription,
      quantity: String(p.quantity),
      unitCost: String(paiseToRupees(p.unitCostPaise)),
      reference: p.reference,
    })
    setEditingId(p.id)
    setErrors({})
    setModal('edit')
  }

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!draft.canteenId) e.canteenId = 'Canteen is required'
    if (!draft.vendorId) e.vendorId = 'Vendor is required'
    if (!isValidIsoDate(draft.date)) e.date = 'Enter a valid date'
    const qty = Number(draft.quantity)
    if (!Number.isFinite(qty) || qty <= 0) e.quantity = 'Quantity must be a positive number'
    const unitCostPaise = parseAmountToPaise(draft.unitCost)
    if (!isValidPositiveAmount(unitCostPaise)) e.unitCost = 'Enter a positive unit cost'
    if (!draft.itemDescription.trim()) e.itemDescription = 'Item description is required'
    return e
  }

  const save = async () => {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const quantity = Number(draft.quantity)
    const unitCostPaise = parseAmountToPaise(draft.unitCost)!
    const totalPaise = Math.round(quantity * unitCostPaise)

    if (modal === 'edit' && editingId) {
      await updatePurchase(editingId, {
        canteenId: draft.canteenId,
        vendorId: draft.vendorId,
        date: draft.date,
        itemDescription: draft.itemDescription,
        quantity,
        unitCostPaise,
        totalPaise,
        reference: draft.reference,
      })
      notify('Purchase updated')
    } else {
      await createPurchase({
        canteenId: draft.canteenId,
        vendorId: draft.vendorId,
        date: draft.date,
        itemDescription: draft.itemDescription,
        quantity,
        unitCostPaise,
        totalPaise,
        reference: draft.reference,
        paymentStatus: 'Unpaid',
        source: 'manual',
      })
      notify('Purchase added')
    }
    setModal(null)
    await refresh()
  }

  const exportCsv = () => {
    const ok = downloadCsv(
      buildFilename('purchases', 'csv'),
      ['Date', 'Canteen', 'Vendor', 'Item', 'Quantity', 'Unit Cost', 'Total', 'Reference', 'Status'],
      filtered.map((p) => [
        p.date,
        data.canteens.find((c) => c.id === p.canteenId)?.name ?? p.canteenId,
        data.vendors.find((v) => v.id === p.vendorId)?.name ?? p.vendorId,
        p.itemDescription,
        p.quantity,
        paiseToRupees(p.unitCostPaise),
        paiseToRupees(p.totalPaise),
        p.reference,
        p.paymentStatus,
      ])
    )
    notify(ok ? 'Purchases exported' : 'Export failed', ok ? 'success' : 'error')
  }

  return (
    <AppShell title="Purchases" subtitle="Record stock and supply purchases from vendors." badge="Local data">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CanteenFilter canteens={data.canteens} value={canteenId} onChange={setCanteenId} />
        <div className="flex gap-2">
          <SecondaryButton onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </SecondaryButton>
          <PrimaryButton onClick={openAdd} disabled={activeCanteens.length === 0 || data.vendors.length === 0}>
            <Plus className="size-4" />
            Add purchase
          </PrimaryButton>
        </div>
      </div>
      {data.vendors.length === 0 && <p className="mb-3 text-xs text-amber-700">Add a vendor first (Vendors page) before recording purchases.</p>}

      {filtered.length === 0 ? (
        <EmptyState title="No purchases recorded" action={<PrimaryButton onClick={openAdd}>Add purchase</PrimaryButton>} />
      ) : (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-[#89958d]">
                  <th className="p-2">Date</th>
                  <th className="p-2">Canteen</th>
                  <th className="p-2">Vendor</th>
                  <th className="p-2">Item</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Unit cost</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-[#eff2ef]">
                    <td className="p-2 whitespace-nowrap">{p.date}</td>
                    <td className="p-2">{data.canteens.find((c) => c.id === p.canteenId)?.name ?? '—'}</td>
                    <td className="p-2">{data.vendors.find((v) => v.id === p.vendorId)?.name ?? '—'}</td>
                    <td className="p-2">{p.itemDescription}</td>
                    <td className="p-2 text-right">{p.quantity}</td>
                    <td className="p-2 text-right">{formatPaise(p.unitCostPaise)}</td>
                    <td className="p-2 text-right font-semibold">{formatPaise(p.totalPaise)}</td>
                    <td className="p-2">{p.paymentStatus}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(p)} aria-label="Edit purchase" className="text-[#347246]">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => setDeleting(p)} aria-label="Delete purchase" className="text-red-600">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {modal && (
        <Modal title={modal === 'edit' ? 'Edit purchase' : 'Add purchase'} onClose={() => setModal(null)}>
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
            <Field label="Vendor" error={errors.vendorId}>
              <Select value={draft.vendorId} onChange={(e) => setDraft({ ...draft, vendorId: e.target.value })}>
                <option value="">Select vendor</option>
                {data.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" error={errors.date}>
              <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </Field>
            <Field label="Reference">
              <Input value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} />
            </Field>
            <Field label="Quantity" error={errors.quantity}>
              <Input type="number" min="0" step="0.01" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
            </Field>
            <Field label="Unit cost (INR)" error={errors.unitCost}>
              <Input type="number" min="0" step="0.01" value={draft.unitCost} onChange={(e) => setDraft({ ...draft, unitCost: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Item / description" error={errors.itemDescription}>
                <Input value={draft.itemDescription} onChange={(e) => setDraft({ ...draft, itemDescription: e.target.value })} />
              </Field>
            </div>
          </div>
          <PrimaryButton onClick={save} className="mt-5 w-full">
            Save purchase
          </PrimaryButton>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete purchase record"
          message={`Delete the purchase of ${formatPaise(deleting.totalPaise)} dated ${deleting.date}? Any vendor payments already recorded against this purchase will remain and should be reviewed manually. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await removeById('purchases', deleting.id)
            setDeleting(null)
            await refresh()
            notify('Purchase deleted')
          }}
          onCancel={() => setDeleting(null)}
        />
      )}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}
