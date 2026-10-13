'use client'

import { useMemo, useState } from 'react'
import { Plus, Download, Pencil } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { CanteenFilter } from '@/components/filters'
import { Modal } from '@/components/ui/modal'
import { Field, Input, Select, PrimaryButton, SecondaryButton } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/empty-state'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import { createStaff, updateStaff, createSalaryPayment } from '@/lib/db/repository'
import type { StaffMember } from '@/lib/types'
import { PAYMENT_METHODS } from '@/lib/types'
import { computeSalaryBalance } from '@/lib/balances'
import { formatPaise, parseAmountToPaise, isValidPositiveAmount, paiseToRupees } from '@/lib/money'
import { todayIst } from '@/lib/dates'
import { downloadCsv, buildFilename } from '@/lib/export'

type Draft = { name: string; canteenId: string; role: string; phone: string; monthlySalary: string; active: boolean }
function emptyDraft(canteenId = ''): Draft {
  return { name: '', canteenId, role: '', phone: '', monthlySalary: '', active: true }
}

export default function StaffPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const [canteenId, setCanteenId] = useState('all')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [payingStaff, setPayingStaff] = useState<StaffMember | null>(null)
  const [payPeriod, setPayPeriod] = useState('')
  const [payDue, setPayDue] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<typeof PAYMENT_METHODS[number]>('Bank Transfer')
  const [payError, setPayError] = useState('')
  const [viewing, setViewing] = useState<StaffMember | null>(null)

  const filtered = useMemo(() => {
    if (!data) return []
    return data.staff.filter((s) => canteenId === 'all' || s.canteenId === canteenId)
  }, [data, canteenId])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const activeCanteens = data.canteens.filter((c) => c.active)

  const openAdd = () => {
    setDraft(emptyDraft(activeCanteens[0]?.id ?? ''))
    setErrors({})
    setEditingId(null)
    setModal('add')
  }

  const openEdit = (s: StaffMember) => {
    setDraft({ name: s.name, canteenId: s.canteenId, role: s.role, phone: s.phone, monthlySalary: String(paiseToRupees(s.monthlySalaryPaise)), active: s.active })
    setEditingId(s.id)
    setErrors({})
    setModal('edit')
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!draft.name.trim()) e.name = 'Name is required'
    if (!draft.canteenId) e.canteenId = 'Canteen is required'
    if (!isValidPositiveAmount(parseAmountToPaise(draft.monthlySalary))) e.monthlySalary = 'Enter a positive monthly salary'
    return e
  }

  const save = async () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    const payload = {
      name: draft.name,
      canteenId: draft.canteenId,
      role: draft.role,
      phone: draft.phone,
      monthlySalaryPaise: parseAmountToPaise(draft.monthlySalary)!,
      active: draft.active,
    }
    if (modal === 'edit' && editingId) {
      await updateStaff(editingId, payload)
      notify('Staff member updated')
    } else {
      await createStaff(payload)
      notify('Staff member added')
    }
    setModal(null)
    await refresh()
  }

  const openPay = (s: StaffMember) => {
    setPayingStaff(s)
    const now = new Date()
    setPayPeriod(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    setPayDue(String(paiseToRupees(s.monthlySalaryPaise)))
    setPayAmount(String(paiseToRupees(s.monthlySalaryPaise)))
    setPayMethod('Bank Transfer')
    setPayError('')
  }

  const recordPayment = async () => {
    if (!payingStaff) return
    const duePaise = parseAmountToPaise(payDue)
    const paidPaise = parseAmountToPaise(payAmount)
    if (!isValidPositiveAmount(duePaise) || paidPaise === null || paidPaise < 0) {
      setPayError('Enter valid due and paid amounts')
      return
    }
    await createSalaryPayment({
      staffId: payingStaff.id,
      canteenId: payingStaff.canteenId,
      period: payPeriod,
      amountDuePaise: duePaise,
      amountPaidPaise: paidPaise,
      date: todayIst(),
      paymentMethod: payMethod,
      notes: '',
    })
    setPayingStaff(null)
    await refresh()
    notify('Salary payment recorded')
  }

  const exportCsv = () => {
    const ok = downloadCsv(
      buildFilename('staff', 'csv'),
      ['Name', 'Canteen', 'Role', 'Phone', 'Monthly Salary', 'Outstanding', 'Active'],
      filtered.map((s) => {
        const bal = computeSalaryBalance(s.id, data.salaryPayments)
        return [s.name, data.canteens.find((c) => c.id === s.canteenId)?.name ?? '', s.role, s.phone, paiseToRupees(s.monthlySalaryPaise), paiseToRupees(bal.outstandingPaise), s.active]
      })
    )
    notify(ok ? 'Staff exported' : 'Export failed', ok ? 'success' : 'error')
  }

  return (
    <AppShell title="Staff & Salaries" subtitle="Basic staff register and salary payments. Not payroll-compliance software." badge="Local data">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CanteenFilter canteens={data.canteens} value={canteenId} onChange={setCanteenId} />
        <div className="flex gap-2">
          <SecondaryButton onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </SecondaryButton>
          <PrimaryButton onClick={openAdd} disabled={activeCanteens.length === 0}>
            <Plus className="size-4" />
            Add staff
          </PrimaryButton>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No staff members yet" action={<PrimaryButton onClick={openAdd}>Add staff</PrimaryButton>} />
      ) : (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
          {filtered.map((s) => {
            const bal = computeSalaryBalance(s.id, data.salaryPayments)
            return (
              <div key={s.id} className="flex flex-col gap-3 border-b border-[#eff2ef] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <b className="text-sm">{s.name}</b>
                  {!s.active && <span className="ml-2 rounded-full bg-[#f3f0e8] px-2 py-0.5 text-[10px] font-semibold text-[#8a7a3a]">Inactive</span>}
                  <p className="text-xs text-[#89958d]">
                    {s.role || 'No role set'} · {data.canteens.find((c) => c.id === s.canteenId)?.name ?? '—'} · Monthly {formatPaise(s.monthlySalaryPaise)} · Outstanding{' '}
                    <span className={bal.outstandingPaise > 0 ? 'font-semibold text-amber-700' : 'font-semibold text-[#347246]'}>{formatPaise(bal.outstandingPaise)}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <SecondaryButton onClick={() => setViewing(s)}>History</SecondaryButton>
                  <SecondaryButton onClick={() => openEdit(s)}>
                    <Pencil className="size-3.5" />
                    Edit
                  </SecondaryButton>
                  <PrimaryButton onClick={() => openPay(s)}>Record payment</PrimaryButton>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {modal && (
        <Modal title={modal === 'edit' ? 'Edit staff member' : 'Add staff member'} onClose={() => setModal(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" error={errors.name}>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
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
            <Field label="Role">
              <Input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </Field>
            <Field label="Monthly salary (INR)" error={errors.monthlySalary}>
              <Input type="number" min="0" step="0.01" value={draft.monthlySalary} onChange={(e) => setDraft({ ...draft, monthlySalary: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Active
            </label>
          </div>
          <PrimaryButton onClick={save} className="mt-5 w-full">
            Save staff member
          </PrimaryButton>
        </Modal>
      )}

      {payingStaff && (
        <Modal title={`Record salary payment — ${payingStaff.name}`} onClose={() => setPayingStaff(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Period (YYYY-MM)">
              <Input value={payPeriod} onChange={(e) => setPayPeriod(e.target.value)} placeholder="2026-10" />
            </Field>
            <Field label="Payment method">
              <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof PAYMENT_METHODS[number])}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount due (INR)" error={payError}>
              <Input type="number" min="0" step="0.01" value={payDue} onChange={(e) => setPayDue(e.target.value)} />
            </Field>
            <Field label="Amount paid now (INR)">
              <Input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-[#89958d]">Partial payments are supported — record the due amount and only the amount actually paid.</p>
          <PrimaryButton onClick={recordPayment} className="mt-5 w-full">
            Record payment
          </PrimaryButton>
        </Modal>
      )}

      {viewing && (
        <Modal title={`${viewing.name} — payment history`} onClose={() => setViewing(null)}>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-[#eff2ef]">
            {data.salaryPayments.filter((p) => p.staffId === viewing.id).length === 0 ? (
              <p className="p-3 text-xs text-[#89958d]">No payments recorded.</p>
            ) : (
              data.salaryPayments
                .filter((p) => p.staffId === viewing.id)
                .map((p) => (
                  <div key={p.id} className="flex justify-between border-b border-[#eff2ef] px-3 py-2 text-xs last:border-0">
                    <span>
                      {p.period} · {p.date} · {p.paymentMethod}
                    </span>
                    <b>
                      {formatPaise(p.amountPaidPaise)} / {formatPaise(p.amountDuePaise)}
                    </b>
                  </div>
                ))
            )}
          </div>
        </Modal>
      )}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}
