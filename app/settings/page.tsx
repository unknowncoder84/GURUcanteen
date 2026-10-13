'use client'

import { useRef, useState } from 'react'
import { Download, Upload, AlertTriangle, Database } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { Modal, ConfirmDialog } from '@/components/ui/modal'
import { Field, Input, PrimaryButton, SecondaryButton } from '@/components/ui/form'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import { updateSettings } from '@/lib/db/repository'
import { loadDemoData, clearDemoData } from '@/lib/db/seed'
import { buildBackup, validateBackup, restoreBackup, resetDatabase, type BackupPayload, type RestoreStrategy } from '@/lib/backup'
import { downloadJson, buildFilename } from '@/lib/export'

export default function SettingsPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [businessName, setBusinessName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [restorePreview, setRestorePreview] = useState<{ payload: BackupPayload; summary: Record<string, number> } | null>(null)
  const [restoreStrategy, setRestoreStrategy] = useState<RestoreStrategy>('merge')
  const [restoreError, setRestoreError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClearDemo, setConfirmClearDemo] = useState(false)
  const [busy, setBusy] = useState(false)

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const nameValue = businessName || data.settings.businessName

  async function saveBusinessName() {
    setSavingName(true)
    await updateSettings({ businessName: nameValue.trim() || 'BrightNest Food Solutions' })
    await refresh()
    setSavingName(false)
    notify('Business name saved')
  }

  async function exportBackup() {
    try {
      const backup = await buildBackup()
      const ok = downloadJson(buildFilename('brightnest-backup', 'json'), backup)
      notify(ok ? 'Backup downloaded. Store this file outside the browser (e.g. cloud drive or USB).' : 'Backup download failed', ok ? 'success' : 'error')
    } catch {
      notify('Backup failed', 'error')
    }
  }

  function handleBackupFileChosen(file: File) {
    setRestoreError('')
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const result = validateBackup(parsed)
        if (!result.valid) {
          setRestoreError(result.errors.join('; '))
          return
        }
        setRestorePreview({ payload: parsed as BackupPayload, summary: result.summary ?? {} })
      } catch {
        setRestoreError('This file is not valid JSON and cannot be read as a backup.')
      }
    }
    reader.onerror = () => setRestoreError('Could not read the selected file.')
    reader.readAsText(file)
  }

  async function confirmRestore() {
    if (!restorePreview) return
    setBusy(true)
    try {
      await restoreBackup(restorePreview.payload, restoreStrategy)
      await refresh()
      notify(`Backup restored (${restoreStrategy === 'replace' ? 'replaced existing data' : 'merged with existing data'})`)
      setRestorePreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {
      notify('Restore failed. No changes were applied outside the attempted transaction.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function exportCsvTable(name: 'canteens' | 'sales' | 'expenses' | 'purchases' | 'vendors') {
    const appData = data
    if (!appData) return
    const { downloadCsv } = await import('@/lib/export')
    const { paiseToRupees } = await import('@/lib/money')
    let headers: string[] = []
    let rows: unknown[][] = []
    if (name === 'canteens') {
      headers = ['ID', 'Name', 'Address', 'Contact', 'Phone', 'Email', 'Active']
      rows = appData.canteens.map((c) => [c.id, c.name, c.address, c.contactPerson, c.phone, c.email, c.active])
    } else if (name === 'sales') {
      headers = ['ID', 'Canteen', 'Date', 'Amount', 'Payment Method', 'Reference', 'Description']
      rows = appData.sales.map((s) => [s.id, appData.canteens.find((c) => c.id === s.canteenId)?.name ?? s.canteenId, s.date, paiseToRupees(s.amountPaise), s.paymentMethod, s.reference, s.description])
    } else if (name === 'expenses') {
      headers = ['ID', 'Canteen', 'Date', 'Amount', 'Category', 'Payment Method', 'Reference', 'Description']
      rows = appData.expenses.map((e) => [e.id, appData.canteens.find((c) => c.id === e.canteenId)?.name ?? e.canteenId, e.date, paiseToRupees(e.amountPaise), e.category, e.paymentMethod, e.reference, e.description])
    } else if (name === 'purchases') {
      headers = ['ID', 'Canteen', 'Vendor', 'Date', 'Item', 'Qty', 'Unit Cost', 'Total', 'Status']
      rows = appData.purchases.map((p) => [p.id, appData.canteens.find((c) => c.id === p.canteenId)?.name ?? p.canteenId, appData.vendors.find((v) => v.id === p.vendorId)?.name ?? p.vendorId, p.date, p.itemDescription, p.quantity, paiseToRupees(p.unitCostPaise), paiseToRupees(p.totalPaise), p.paymentStatus])
    } else {
      headers = ['ID', 'Name', 'Contact', 'Phone', 'Email', 'Active']
      rows = appData.vendors.map((v) => [v.id, v.name, v.contactPerson, v.phone, v.email, v.active])
    }
    const ok = downloadCsv(buildFilename(name, 'csv'), headers, rows)
    notify(ok ? `${name} exported` : 'Export failed', ok ? 'success' : 'error')
  }

  return (
    <AppShell title="Settings" subtitle="Business preferences, demo data, backup, and restore." badge="Local data">
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
          <h3 className="mb-3 font-bold">Business settings</h3>
          <Field label="Business name">
            <Input value={nameValue} onChange={(e) => setBusinessName(e.target.value)} />
          </Field>
          <p className="mt-2 text-xs text-[#89958d]">Currency: INR (₹). Date format: {data.settings.dateFormat}.</p>
          <PrimaryButton onClick={saveBusinessName} disabled={savingName} className="mt-4">
            {savingName ? 'Saving…' : 'Save'}
          </PrimaryButton>
        </section>

        <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold">
            <Database className="size-4" /> Storage information
          </h3>
          <ul className="grid gap-1 text-xs text-[#4c5b52]">
            <li>Storage engine: IndexedDB (browser-local, this computer only)</li>
            <li>Canteens: {data.canteens.length}</li>
            <li>Sales records: {data.sales.length}</li>
            <li>Expense records: {data.expenses.length}</li>
            <li>Purchases: {data.purchases.length}</li>
            <li>Vendors: {data.vendors.length}</li>
            <li>Imports on file: {data.imports.length}</li>
          </ul>
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mr-1 inline size-3.5" />
            IndexedDB is not encrypted and not tamper-proof. Clearing your browser&apos;s site data for this app will erase everything
            stored here. It does not sync between computers or users. Back up regularly to a file stored outside the browser.
          </p>
        </section>

        <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
          <h3 className="mb-3 font-bold">Backup &amp; restore</h3>
          <p className="mb-3 text-xs text-[#89958d]">
            A full backup preserves every record, ID, relationship, import history, audit history, and setting. Save the downloaded
            file somewhere outside this browser (cloud drive, USB, another folder).
          </p>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={exportBackup}>
              <Download className="size-4" />
              Download full backup (JSON)
            </PrimaryButton>
            <SecondaryButton onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" />
              Restore from backup
            </SecondaryButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleBackupFileChosen(f)
              }}
            />
          </div>
          {restoreError && <p className="mt-2 text-xs text-red-600">{restoreError}</p>}
        </section>

        <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
          <h3 className="mb-3 font-bold">CSV export of key tables</h3>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => exportCsvTable('canteens')}>Canteens</SecondaryButton>
            <SecondaryButton onClick={() => exportCsvTable('sales')}>Sales</SecondaryButton>
            <SecondaryButton onClick={() => exportCsvTable('expenses')}>Expenses</SecondaryButton>
            <SecondaryButton onClick={() => exportCsvTable('purchases')}>Purchases</SecondaryButton>
            <SecondaryButton onClick={() => exportCsvTable('vendors')}>Vendors</SecondaryButton>
          </div>
        </section>

        <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
          <h3 className="mb-3 font-bold">Demo data</h3>
          <p className="mb-3 text-xs text-[#89958d]">
            Demo records are clearly tagged with source &quot;demo&quot; and never mixed silently with your real records.
          </p>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton
              onClick={async () => {
                await loadDemoData()
                await refresh()
                notify('Demo dataset loaded')
              }}
              disabled={data.settings.demoDataLoaded}
            >
              Load demo dataset
            </SecondaryButton>
            <SecondaryButton onClick={() => setConfirmClearDemo(true)} disabled={!data.settings.demoDataLoaded} className="text-amber-700">
              Clear demo data
            </SecondaryButton>
          </div>
        </section>

        <section className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h3 className="mb-3 font-bold text-red-800">Reset local database</h3>
          <p className="mb-3 text-xs text-red-700">
            This permanently deletes every canteen, transaction, vendor, import, and setting stored in this browser. This cannot be
            undone unless you have a backup file. Export a backup first.
          </p>
          <SecondaryButton onClick={() => setConfirmReset(true)} className="border-red-300 text-red-700 hover:bg-red-100">
            Reset local database
          </SecondaryButton>
        </section>
      </div>

      {restorePreview && (
        <Modal title="Restore backup — preview" onClose={() => setRestorePreview(null)} wide>
          <p className="mb-3 text-sm text-[#4c5b52]">This backup contains:</p>
          <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {Object.entries(restorePreview.summary).map(([key, count]) => (
              <div key={key} className="rounded-lg border border-[#eff2ef] p-2 text-center">
                <p className="text-[#89958d]">{key}</p>
                <p className="font-bold">{count}</p>
              </div>
            ))}
          </div>
          <Field label="Restore strategy" hint="Merge upserts by ID and keeps unrelated existing records. Replace clears all local data first.">
            <select
              className="h-10 w-full rounded-lg border border-[#dfe6df] px-3 text-sm"
              value={restoreStrategy}
              onChange={(e) => setRestoreStrategy(e.target.value as RestoreStrategy)}
            >
              <option value="merge">Merge with existing data (recommended)</option>
              <option value="replace">Replace all existing data</option>
            </select>
          </Field>
          {restoreStrategy === 'replace' && (
            <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mr-1 inline size-3.5" />
              Replace will permanently delete all current local data before restoring. This cannot be undone.
            </p>
          )}
          <PrimaryButton onClick={confirmRestore} disabled={busy} className="mt-5 w-full">
            {busy ? 'Restoring…' : 'Restore backup'}
          </PrimaryButton>
        </Modal>
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Reset local database"
          message="This will permanently delete all canteens, sales, expenses, purchases, vendors, imports, and settings stored in this browser. Make sure you have exported a backup first. This cannot be undone."
          confirmLabel="Delete everything"
          danger
          onConfirm={async () => {
            await resetDatabase()
            await refresh()
            setConfirmReset(false)
            notify('Local database reset')
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      {confirmClearDemo && (
        <ConfirmDialog
          title="Clear demo data"
          message="This removes only records tagged as demo data. Your real business records are not affected."
          confirmLabel="Clear demo data"
          danger
          onConfirm={async () => {
            await clearDemoData()
            await refresh()
            setConfirmClearDemo(false)
            notify('Demo data cleared')
          }}
          onCancel={() => setConfirmClearDemo(false)}
        />
      )}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}
