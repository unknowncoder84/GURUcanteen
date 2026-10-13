// Harmless UI preference persistence (preferred dashboard view, report
// layout defaults) using localStorage. This NEVER stores financial records
// — those always live in IndexedDB via lib/db/*. If localStorage is
// unavailable (e.g. private browsing) these functions fail silently and the
// app falls back to in-memory defaults; nothing here can corrupt or
// overwrite financial data.

const PREFS_KEY = 'brightnest.preferences.v1'

export interface UiPreferences {
  dashboardView?: 'combined' | 'canteen' | 'comparison'
  dashboardCanteenId?: string
  reportCompact?: boolean
  reportOrientation?: 'portrait' | 'landscape'
}

export function loadPreferences(): UiPreferences {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as UiPreferences
  } catch {
    return {}
  }
}

export function savePreferences(patch: Partial<UiPreferences>): void {
  if (typeof window === 'undefined') return
  try {
    const current = loadPreferences()
    const next = { ...current, ...patch }
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage failures (e.g. quota exceeded, private browsing). This
    // is a non-critical preference, never financial data.
  }
}
