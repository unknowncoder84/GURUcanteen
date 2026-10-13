'use client'

import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { Modal, ConfirmDialog } from '@/components/ui/modal'
import { Field, Input, PrimaryButton, SecondaryButton, Textarea } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/empty-state'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import { createCanteen, setCanteenActive, updateCanteen } from '@/lib/db/repository'
import type { Canteen } from '@/lib/types'
import { formatPaise } from '@/lib/money'
import { computeFinancialSummary } from '@/lib/calculations'

type Draft = Pick<Canteen, 'name' | 'address' | 'contactPerson' | 'phone' | 'email' | 'active'>

const emptyDraft: Draft = { name: '', address: '', contactPerson: '', phone: '', email: '', active: true }

export default function CanteensPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [formError, setFormError] = useState('')
  const [confirmDeactivate, setConfirmDeactivate] = useState<Canteen | null>(null)
  const [viewing, setViewing] = useState<Canteen | null>(null)

  const filtered = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.canteens
    return data.canteens.filter((c) => `${c.name} ${c.address} ${c.contactPerson}`.toLowerCase().includes(q))
  }, [data, query])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const openAdd = () => {
    setDraft(emptyDraft)
    setFormError('')
    setModal('add')
  }

  const openEdit = (c: Canteen) => {
    setEditingId(c.id)
    setDraft({ name: c.name, address: c.address, contactPerson: c.contactPerson, phone: c.phone, email: c.email, active: c.active })
    setFormError('')
    setModal('edit')
  }

  const save = async () => {
    if (!draft.name.trim()) {
      setFormError('Canteen name is required')
      return
    }
    if (modal === 'edit' && editingId) {
      // Editing never regenerates the ID, preserving all historical links.
      await updateCanteen(editingId, draft)
      notify('Canteen updated')
    } else {
      await createCanteen(draft)
      notify('Canteen added')
    }
    setModal(null)
    setEditingId(null)
    await refresh()
  }

  const recordCountFor = (canteenId: string) => data.sales.filter((s) => s.canteenId === canteenId).length + data.expenses.filter((e) => e.canteenId === canteenId).length

  return (
    <AppShell title="Canteens" subtitle="Manage locations. Canteen IDs never change, even when you rename a canteen." badge="Local data">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#89958d]" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search canteens" className="pl-9" aria-label="Search canteens" />
        </div>
        <PrimaryButton onClick={openAdd}>
          <Plus className="size-4" />
          Add canteen
        </PrimaryButton>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No canteens found" description="Add a canteen to start recording sales and expenses." action={<PrimaryButton onClick={openAdd}>Add canteen</PrimaryButton>} />
      ) : (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
          {filtered.map((c) => {
            const summary = computeFinancialSummary(data.sales, data.expenses, { canteenId: c.id })
            return (
              <div key={c.id} className="flex flex-col gap-3 border-b border-[#eff2ef] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <b className="text-sm">{c.name}</b>
                    {!c.active && <span className="rounded-full bg-[#f3f0e8] px-2 py-0.5 text-[10px] font-semibold text-[#8a7a3a]">Inactive</span>}
                  </div>
                  <p className="text-xs text-[#89958d]">
                    {c.address || 'No address set'} · {recordCountFor(c.id)} total records · Lifetime profit {formatPaise(summary.profitPaise)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <SecondaryButton onClick={() => setViewing(c)}>View</SecondaryButton>
                  <SecondaryButton onClick={() => openEdit(c)}>Edit</SecondaryButton>
                  <SecondaryButton
                    onClick={() => (c.active ? setConfirmDeactivate(c) : setCanteenActive(c.id, true).then(refresh).then(() => notify('Canteen activated')))}
                    className={c.active ? 'text-amber-700' : 'text-[#347246]'}
                  >
                    {c.active ? 'Deactivate' : 'Activate'}
                  </SecondaryButton>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {modal && (
        <Modal title={modal === 'edit' ? 'Edit canteen' : 'Add canteen'} onClose={() => setModal(null)}>
          <div className="grid gap-3">
            <Field label="Name" error={formError}>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Address">
              <Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Active canteen (new transactions allowed)
            </label>
          </div>
          <PrimaryButton onClick={save} className="mt-5 w-full">
            Save canteen
          </PrimaryButton>
        </Modal>
      )}

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          <div className="grid gap-2 text-sm">
            <p>
              <b>Address:</b> {viewing.address || '—'}
            </p>
            <p>
              <b>Contact:</b> {viewing.contactPerson || '—'}
            </p>
            <p>
              <b>Phone:</b> {viewing.phone || '—'}
            </p>
            <p>
              <b>Email:</b> {viewing.email || '—'}
            </p>
            <p>
              <b>Status:</b> {viewing.active ? 'Active' : 'Inactive'}
            </p>
            <p>
              <b>Canteen ID:</b> <code className="text-xs">{viewing.id}</code>
            </p>
            <p className="mt-2 text-xs text-[#89958d]">
              {data.sales.filter((s) => s.canteenId === viewing.id).length} sales records,{' '}
              {data.expenses.filter((e) => e.canteenId === viewing.id).length} expense records on file for this canteen.
            </p>
          </div>
        </Modal>
      )}

      {confirmDeactivate && (
        <ConfirmDialog
          title="Deactivate canteen"
          message={`Deactivating "${confirmDeactivate.name}" prevents new transactions against it but keeps all historical records and reports intact.`}
          confirmLabel="Deactivate"
          danger
          onConfirm={async () => {
            await setCanteenActive(confirmDeactivate.id, false)
            setConfirmDeactivate(null)
            await refresh()
            notify('Canteen deactivated')
          }}
          onCancel={() => setConfirmDeactivate(null)}
        />
      )}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}
