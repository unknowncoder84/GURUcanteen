'use client'

import { useMemo, useState } from 'react'
import { Plus, Download, AlertTriangle } from 'lucide-react'
import { AppShell, LoadingScreen, ErrorScreen } from '@/components/layout/app-shell'
import { CanteenFilter } from '@/components/filters'
import { Modal } from '@/components/ui/modal'
import { Field, Input, Select, PrimaryButton, SecondaryButton } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/empty-state'
import { Toaster } from '@/components/ui/toaster'
import { useAppData } from '@/lib/hooks/useAppData'
import { useToast } from '@/lib/hooks/useToast'
import { createInventoryItem, createInventoryMovement } from '@/lib/db/repository'
import type { InventoryItem, InventoryMovementType, InventoryUnit } from '@/lib/types'
import { computeClosingStock, isLowStock, wouldGoNegative } from '@/lib/inventory'
import { downloadCsv, buildFilename } from '@/lib/export'
import { todayIst } from '@/lib/dates'

const UNITS: InventoryUnit[] = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'packet', 'other']

type ItemDraft = { name: string; canteenId: string; category: string; unit: InventoryUnit; openingStock: string; lowStockThreshold: string }
function emptyItemDraft(canteenId = ''): ItemDraft {
  return { name: '', canteenId, category: '', unit: 'kg', openingStock: '0', lowStockThreshold: '0' }
}

export default function InventoryPage() {
  const { data, loading, error, refresh } = useAppData()
  const { toasts, notify, dismiss } = useToast()
  const [canteenId, setCanteenId] = useState('all')
  const [itemModal, setItemModal] = useState(false)
  const [itemDraft, setItemDraft] = useState<ItemDraft>(emptyItemDraft())
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const [movingItem, setMovingItem] = useState<InventoryItem | null>(null)
  const [moveType, setMoveType] = useState<InventoryMovementType>('received')
  const [moveQty, setMoveQty] = useState('')
  const [moveNotes, setMoveNotes] = useState('')
  const [moveError, setMoveError] = useState('')

  const filtered = useMemo(() => {
    if (!data) return []
    return data.inventoryItems.filter((i) => canteenId === 'all' || i.canteenId === canteenId)
  }, [data, canteenId])

  if (loading) return <LoadingScreen />
  if (error || !data) return <ErrorScreen message={error ?? 'Unknown error'} />

  const activeCanteens = data.canteens.filter((c) => c.active)

  const openAddItem = () => {
    setItemDraft(emptyItemDraft(activeCanteens[0]?.id ?? ''))
    setItemErrors({})
    setItemModal(true)
  }

  const validateItem = () => {
    const e: Record<string, string> = {}
    if (!itemDraft.name.trim()) e.name = 'Item name is required'
    if (!itemDraft.canteenId) e.canteenId = 'Canteen is required'
    const opening = Number(itemDraft.openingStock)
    if (!Number.isFinite(opening) || opening < 0) e.openingStock = 'Opening stock must be zero or a positive number'
    const threshold = Number(itemDraft.lowStockThreshold)
    if (!Number.isFinite(threshold) || threshold < 0) e.lowStockThreshold = 'Threshold must be zero or a positive number'
    return e
  }

  const saveItem = async () => {
    const e = validateItem()
    setItemErrors(e)
    if (Object.keys(e).length > 0) return
    await createInventoryItem({
      name: itemDraft.name,
      canteenId: itemDraft.canteenId,
      category: itemDraft.category,
      unit: itemDraft.unit,
      openingStock: Number(itemDraft.openingStock),
      lowStockThreshold: Number(itemDraft.lowStockThreshold),
      active: true,
    })
    setItemModal(false)
    await refresh()
    notify('Inventory item added')
  }

  const openMove = (item: InventoryItem) => {
    setMovingItem(item)
    setMoveType('received')
    setMoveQty('')
    setMoveNotes('')
    setMoveError('')
  }

  const saveMovement = async () => {
    if (!movingItem) return
    const qty = Number(moveQty)
    if (!Number.isFinite(qty) || qty === 0) {
      setMoveError('Enter a non-zero quantity')
      return
    }
    if (moveType !== 'adjustment' && qty < 0) {
      setMoveError('Received/consumed quantities must be positive. Use "Adjustment" for corrections.')
      return
    }
    if (wouldGoNegative(movingItem, data.inventoryMovements, { type: moveType, quantity: qty })) {
      setMoveError('This movement would make stock negative. Use an explicit adjustment if this is intentional.')
      return
    }
    await createInventoryMovement({
      itemId: movingItem.id,
      canteenId: movingItem.canteenId,
      date: todayIst(),
      type: moveType,
      quantity: qty,
      notes: moveNotes,
    })
    setMovingItem(null)
    await refresh()
    notify('Stock movement recorded')
  }

  const exportCsv = () => {
    const ok = downloadCsv(
      buildFilename('inventory', 'csv'),
      ['Item', 'Canteen', 'Category', 'Unit', 'Opening stock', 'Closing stock', 'Low stock threshold', 'Status'],
      filtered.map((item) => {
        const closing = computeClosingStock(item, data.inventoryMovements)
        return [
          item.name,
          data.canteens.find((c) => c.id === item.canteenId)?.name ?? '',
          item.category,
          item.unit,
          item.openingStock,
          closing,
          item.lowStockThreshold,
          isLowStock(item, closing) ? 'Low stock' : 'OK',
        ]
      })
    )
    notify(ok ? 'Inventory exported' : 'Export failed', ok ? 'success' : 'error')
  }

  return (
    <AppShell
      title="Inventory"
      subtitle="Basic stock register derived from movement history. Inventory costs are not included in profit calculations."
      badge="Local data"
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CanteenFilter canteens={data.canteens} value={canteenId} onChange={setCanteenId} />
        <div className="flex gap-2">
          <SecondaryButton onClick={exportCsv}>
            <Download className="size-4" />
            Export CSV
          </SecondaryButton>
          <PrimaryButton onClick={openAddItem} disabled={activeCanteens.length === 0}>
            <Plus className="size-4" />
            Add item
          </PrimaryButton>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No inventory items yet" action={<PrimaryButton onClick={openAddItem}>Add item</PrimaryButton>} />
      ) : (
        <section className="rounded-xl border border-[#e3e9e3] bg-white p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-[#89958d]">
                  <th className="p-2">Item</th>
                  <th className="p-2">Canteen</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Unit</th>
                  <th className="p-2 text-right">Closing stock</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const closing = computeClosingStock(item, data.inventoryMovements)
                  const low = isLowStock(item, closing)
                  return (
                    <tr key={item.id} className="border-b border-[#eff2ef]">
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">{data.canteens.find((c) => c.id === item.canteenId)?.name ?? '—'}</td>
                      <td className="p-2">{item.category || '—'}</td>
                      <td className="p-2">{item.unit}</td>
                      <td className="p-2 text-right font-semibold">{closing}</td>
                      <td className="p-2">
                        {low ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                            <AlertTriangle className="size-3.5" /> Low stock
                          </span>
                        ) : (
                          <span className="font-semibold text-[#347246]">OK</span>
                        )}
                      </td>
                      <td className="p-2">
                        <SecondaryButton onClick={() => openMove(item)}>Record movement</SecondaryButton>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {itemModal && (
        <Modal title="Add inventory item" onClose={() => setItemModal(false)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Item name" error={itemErrors.name}>
              <Input value={itemDraft.name} onChange={(e) => setItemDraft({ ...itemDraft, name: e.target.value })} />
            </Field>
            <Field label="Canteen" error={itemErrors.canteenId}>
              <Select value={itemDraft.canteenId} onChange={(e) => setItemDraft({ ...itemDraft, canteenId: e.target.value })}>
                <option value="">Select canteen</option>
                {data.canteens.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Input value={itemDraft.category} onChange={(e) => setItemDraft({ ...itemDraft, category: e.target.value })} />
            </Field>
            <Field label="Unit">
              <Select value={itemDraft.unit} onChange={(e) => setItemDraft({ ...itemDraft, unit: e.target.value as InventoryUnit })}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Opening stock" error={itemErrors.openingStock}>
              <Input type="number" min="0" step="0.01" value={itemDraft.openingStock} onChange={(e) => setItemDraft({ ...itemDraft, openingStock: e.target.value })} />
            </Field>
            <Field label="Low stock threshold" error={itemErrors.lowStockThreshold}>
              <Input type="number" min="0" step="0.01" value={itemDraft.lowStockThreshold} onChange={(e) => setItemDraft({ ...itemDraft, lowStockThreshold: e.target.value })} />
            </Field>
          </div>
          <PrimaryButton onClick={saveItem} className="mt-5 w-full">
            Save item
          </PrimaryButton>
        </Modal>
      )}

      {movingItem && (
        <Modal title={`Record stock movement — ${movingItem.name}`} onClose={() => setMovingItem(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Movement type">
              <Select value={moveType} onChange={(e) => setMoveType(e.target.value as InventoryMovementType)}>
                <option value="received">Received</option>
                <option value="consumed">Consumed / issued</option>
                <option value="adjustment">Adjustment (signed)</option>
              </Select>
            </Field>
            <Field label="Quantity" error={moveError}>
              <Input type="number" step="0.01" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <Input value={moveNotes} onChange={(e) => setMoveNotes(e.target.value)} />
              </Field>
            </div>
          </div>
          <p className="mt-2 text-xs text-[#89958d]">
            Current closing stock: {computeClosingStock(movingItem, data.inventoryMovements)} {movingItem.unit}
          </p>
          <PrimaryButton onClick={saveMovement} className="mt-5 w-full">
            Save movement
          </PrimaryButton>
        </Modal>
      )}

      <Toaster toasts={toasts} dismiss={dismiss} />
    </AppShell>
  )
}
