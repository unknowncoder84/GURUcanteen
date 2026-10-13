import { describe, it, expect, beforeEach } from 'vitest'
import { loadPreferences, savePreferences } from '@/lib/preferences'

beforeEach(() => {
  window.localStorage.clear()
})

describe('UI preference persistence (view/filter preferences, not financial data)', () => {
  it('returns an empty object when nothing has been saved yet', () => {
    expect(loadPreferences()).toEqual({})
  })

  it('persists the preferred dashboard view and reloads it after a simulated refresh', () => {
    savePreferences({ dashboardView: 'comparison', dashboardCanteenId: 'c1' })
    const reloaded = loadPreferences()
    expect(reloaded.dashboardView).toBe('comparison')
    expect(reloaded.dashboardCanteenId).toBe('c1')
  })

  it('merges new preference writes rather than overwriting unrelated preferences', () => {
    savePreferences({ dashboardView: 'canteen' })
    savePreferences({ reportCompact: true })
    const reloaded = loadPreferences()
    expect(reloaded.dashboardView).toBe('canteen')
    expect(reloaded.reportCompact).toBe(true)
  })

  it('falls back to an empty object if the stored value is corrupted JSON, without throwing', () => {
    window.localStorage.setItem('brightnest.preferences.v1', '{not valid json')
    expect(() => loadPreferences()).not.toThrow()
    expect(loadPreferences()).toEqual({})
  })

  it('never stores keys that look like financial records', () => {
    savePreferences({ dashboardView: 'combined' })
    const raw = window.localStorage.getItem('brightnest.preferences.v1')
    expect(raw).not.toMatch(/amountPaise/)
    expect(raw).not.toMatch(/canteenId.*sales/)
  })
})
