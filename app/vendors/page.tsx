'use client'

import { useMemo, useState } from 'react'
import { Plus, Search, Download } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { Modal, ConfirmDialog } from '@/components/ui/modal'
import { Field, Input, Textarea, PrimaryButton, SecondaryButton } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/empty-state'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import { createVendor, createVendorPayment, updateVendor } from '@/lib/db/repository'
import type { Vendor } from '@/lib/types'
import { PAYMENT_METHODS } from '@/lib/types'
import { computeVendorBalance } from '@/lib/balances'
import { formatPaise, parseAmountToPaise, isValidPositiveAmount, paiseToRupees } from '@/lib/money'
import { todayIst } from '@/lib/dates'
import { downloadCsv, buildFilename } from '@/lib/export'

type Draft = Pick<Vendor, 'name' | 'contactPerson' | 'phone' | 'email' | 'notes' | 'active'>
const emptyDraft: Draft = { name: '', contactPerson: '', phone: '', email: '', notes: '', active: true }

export default function VendorsPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [formError, setFormError] = useState('')
  const [payingVendor, setPayingVendor] = useState<Vendor | null>(null)
  const [viewing, setViewing] = useState<Vendor | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>('Cash')
  const [paymentIsAdvance, setPaymentIsAdvance] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [confirmDeactivate, setConfirmDeactivate] = useState<Vendor | null>(null)

  const filtered = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.vendors
    return data.vendors.filter((v) => `${v.name} ${v.contactPerson}`.toLowerCase().includes(q))
  }, [data, query])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const openAdd = () => {
    setDraft(emptyDraft)
    setFormError('')
    setEditingId(null)
    setModal('add')
  }

  const openEdit = (v: Vendor) => {
    setDraft({ name: v.name, contactPerson: v.contactPerson, phone: v.phone, email: v.email, notes: v.notes, active: v.active })
    setEditingId(v.id)
    setFormError('')
    setModal('edit')
  }

  const save = async () => {
    if (!draft.name.trim()) {
      setFormError('Vendor name is required')
      return
    }
    if (modal === 'edit' && editingId) {
      await updateVendor(editingId, draft)
      notify('Vendor updated')
    } else {
      await createVendor(draft)
      notify('Vendor added')
    }
    setModal(null)
    await refresh()
  }

  const openPay = (v: Vendor) => {
    setPayingVendor(v)
    setPaymentAmount('')
    setPaymentMethod('Cash')
    setPaymentIsAdvance(false)
    setPaymentError('')
  }

  const recordPayment = async () => {
    if (!payingVendor) return
    const amountPaise = parseAmountToPaise(paymentAmount)
    if (!isValidPositiveAmount(amountPaise)) {
      setPaymentError('Enter a positive numeric amount')
      return
    }
    const balance = computeVendorBalance(payingVendor.id, data.purchases, data.vendorPayments)
    if (!paymentIsAdvance && amountPaise > balance.outstandingPaise) {
      setPaymentError(`This exceeds the outstanding balance of ${formatPaise(balance.outstandingPaise)}. Mark as an advance instead if intentional.`)
      return
    }
    await createVendorPayment({
      vendorId: payingVendor.id,
      canteenId: data.canteens[0]?.id ?? '',
      date: todayIst(),
      amountPaise,
      paymentMethod,
      reference: '',
      notes: paymentIsAdvance ? 'Advance payment' : 'Settlement payment',
      isAdvance: paymentIsAdvance,
    })
    setPayingVendor(null)
    await refresh()
    notify('Vendor payment recorded')
  }

  const exportCsv = () => {
    const ok = downloadCsv(
      buildFilename('vendors', 'csv'),
      ['Name', 'Contact person', 'Phone', 'Email', 'Total purchased', 'Total paid', 'Outstanding', 'Active'],
      filtered.map((v) => {
        const bal = computeVendorBalance(v.id, data.purchases, data.vendorPayments)
        return [v.name, v.contactPerson, v.phone, v.email, paiseToRupees(bal.totalPurchasedPaise), paiseToRupees(bal.totalPaidPaise), paiseToRupees(bal.outstandingPaise), v.active]
      })
    )
    notify(ok ? 'Vendors exported' : 'Export failed', ok ? 'success' : 'error')
  }

  return (
    <AppShell title="Vendors" subtitle="Manage vendors, purchase history, and outstanding balances." badge="Local data">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#89958d]" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendors" className="pl-9" aria-label="Search vendors" />
        </div>
        <div className="flex gap-2">
          <SecondaryButton onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </SecondaryButton>
          <PrimaryButton onClick={openAdd}>
            <Plus className="size-4" />
            Add vendor
          </PrimaryButton>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No vendors found" action={<PrimaryButton onClick={openAdd}>Add vendor</PrimaryButton>} />
      ) : (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
          {filtered.map((v) => {
            const balance = computeVendorBalance(v.id, data.purchases, data.vendorPayments)
            return (
              <div key={v.id} className="flex flex-col gap-3 border-b border-[#eff2ef] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <b className="text-sm">{v.name}</b>
                    {!v.active && <span className="rounded-full bg-[#f3f0e8] px-2 py-0.5 text-[10px] font-semibold text-[#8a7a3a]">Inactive</span>}
                  </div>
                  <p className="text-xs text-[#89958d]">
                    {v.contactPerson || 'No contact set'} · Purchased {formatPaise(balance.totalPurchasedPaise)} · Outstanding{' '}
                    <span className={balance.outstandingPaise > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-[#347246]'}>
                      {formatPaise(balance.outstandingPaise)}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <SecondaryButton onClick={() => setViewing(v)}>History</SecondaryButton>
                  <SecondaryButton onClick={() => openEdit(v)}>Edit</SecondaryButton>
                  <PrimaryButton onClick={() => openPay(v)}>Record payment</PrimaryButton>
                  <SecondaryButton
                    onClick={() => (v.active ? setConfirmDeactivate(v) : updateVendor(v.id, { active: true }).then(refresh).then(() => notify('Vendor activated')))}
                    className={v.active ? 'text-amber-700' : 'text-[#347246]'}
                  >
                    {v.active ? 'Deactivate' : 'Activate'}
                  </SecondaryButton>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {modal && (
        <Modal title={modal === 'edit' ? 'Edit vendor' : 'Add vendor'} onClose={() => setModal(null)}>
          <div className="grid gap-3">
            <Field label="Name" error={formError}>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Contact person">
              <Input value={draft.contactPerson} onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone">
                <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
          </div>
          <PrimaryButton onClick={save} className="mt-5 w-full">
            Save vendor
          </PrimaryButton>
        </Modal>
      )}

      {payingVendor && (
        <Modal title={`Record payment to ${payingVendor.name}`} onClose={() => setPayingVendor(null)}>
          <div className="grid gap-3">
            <Field label="Amount (INR)" error={paymentError}>
              <Input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
            </Field>
            <Field label="Payment method">
              <select
                className="h-10 w-full rounded-lg border border-[#dfe6df] px-3 text-sm"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as typeof PAYMENT_METHODS[number])}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={paymentIsAdvance} onChange={(e) => setPaymentIsAdvance(e.target.checked)} />
              This is an advance payment (not settling an existing liability)
            </label>
          </div>
          <PrimaryButton onClick={recordPayment} className="mt-5 w-full">
            Record payment
          </PrimaryButton>
        </Modal>
      )}

      {viewing && (
        <Modal title={`${viewing.name} — history`} onClose={() => setViewing(null)} wide>
          <h4 className="mb-2 text-xs font-bold text-[#89958d]">Purchases</h4>
          <div className="mb-5 max-h-48 overflow-y-auto rounded-lg border border-[#eff2ef]">
            {data.purchases.filter((p) => p.vendorId === viewing.id).length === 0 ? (
              <p className="p-3 text-xs text-[#89958d]">No purchases recorded.</p>
            ) : (
              data.purchases
                .filter((p) => p.vendorId === viewing.id)
                .map((p) => (
                  <div key={p.id} className="flex justify-between border-b border-[#eff2ef] px-3 py-2 text-xs last:border-0">
                    <span>
                      {p.date} · {p.itemDescription}
                    </span>
                    <b>{formatPaise(p.totalPaise)}</b>
                  </div>
                ))
            )}
          </div>
          <h4 className="mb-2 text-xs font-bold text-[#89958d]">Payments</h4>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-[#eff2ef]">
            {data.vendorPayments.filter((p) => p.vendorId === viewing.id).length === 0 ? (
              <p className="p-3 text-xs text-[#89958d]">No payments recorded.</p>
            ) : (
              data.vendorPayments
                .filter((p) => p.vendorId === viewing.id)
                .map((p) => (
                  <div key={p.id} className="flex justify-between border-b border-[#eff2ef] px-3 py-2 text-xs last:border-0">
                    <span>
                      {p.date} · {p.paymentMethod} {p.isAdvance ? '(advance)' : ''}
                    </span>
                    <b>{formatPaise(p.amountPaise)}</b>
                  </div>
                ))
            )}
          </div>
        </Modal>
      )}

      {confirmDeactivate && (
        <ConfirmDialog
          title="Deactivate vendor"
          message={`Deactivating "${confirmDeactivate.name}" hides it from new purchase selection but keeps all historical purchases and payments intact. This does not delete any records.`}
          confirmLabel="Deactivate"
          danger
          onConfirm={async () => {
            await updateVendor(confirmDeactivate.id, { active: false })
            setConfirmDeactivate(null)
            await refresh()
            notify('Vendor deactivated')
          }}
          onCancel={() => setConfirmDeactivate(null)}
        />
      )}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}
