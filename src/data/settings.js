/**
 * Centralized settings layer.
 *
 * Provides getters that merge hardcoded defaults from staff.js / gyms.js / sections.js
 * with user overrides stored in localStorage.  Every consumer that previously imported
 * from the raw data files can instead call the getter here to pick up live changes.
 */

import { STAFF as DEFAULT_STAFF } from './staff'
import { GYMS as DEFAULT_GYMS } from './gyms'
import { BOULDER_SECTIONS as DEFAULT_BOULDER, ROPE_SECTIONS as DEFAULT_ROPE } from './sections'

const SETTINGS_KEY = 'climbing-scheduler-settings'

// ---------------------------------------------------------------------------
// Default constraint rules (the numbers validation.js currently hard-codes)
// ---------------------------------------------------------------------------

export const DEFAULT_CONSTRAINTS = {
  headSetterRequired:   { enabled: true, severity: 'error' },
  ropeMinSetters:       { enabled: true, severity: 'error',   value: 2 },
  ropeMaxSetters:       { enabled: true, severity: 'error' }, // per-gym value lives on gym obj
  boulderExactSetters:  { enabled: true, severity: 'error' },
  specSetterDays:       { enabled: true, severity: 'error' },
  specSetterNoRope:     { enabled: true, severity: 'error' },
  directorHoldWash:     { enabled: true, severity: 'error' },
  staffAvailability:    { enabled: true, severity: 'error' },
  directorSchedule:     { enabled: true, severity: 'error' },
  hardSectionLimit:     { enabled: true, severity: 'warning', value: 2 },
  washShiftLimit:       { enabled: true, severity: 'warning', value: 1 },
  boulderMinimum:       { enabled: true, severity: 'warning', value: 1 },
  ogdenFrequency:       { enabled: true, severity: 'warning', value: 1 },
  workloadBalance:      { enabled: true, severity: 'warning' },
}

// ---------------------------------------------------------------------------
// Deep-clone helpers
// ---------------------------------------------------------------------------

function cloneStaff(arr) { return arr.map((s) => ({ ...s, availability: [...s.availability] })) }
function cloneGyms(arr) {
  return arr.map((g) => ({
    ...g,
    boulderDays:      g.boulderDays      ? [...g.boulderDays]      : undefined,
    ropeDays:         g.ropeDays         ? [...g.ropeDays]         : undefined,
    flexDays:         g.flexDays         ? [...g.flexDays]         : undefined,
    holdWashDays:     g.holdWashDays     ? [...g.holdWashDays]     : undefined,
    flexHoldWashDays: g.flexHoldWashDays ? [...g.flexHoldWashDays] : undefined,
  }))
}
function cloneSections(obj) {
  const out = {}
  Object.keys(obj).forEach((gym) => {
    out[gym] = obj[gym].map((s) => ({
      ...s,
      anchors: s.anchors ? [...s.anchors] : undefined,
    }))
  })
  return out
}

// ---------------------------------------------------------------------------
// Build a full defaults snapshot (used for Reset to Defaults)
// ---------------------------------------------------------------------------

export function buildDefaults() {
  return {
    staff: cloneStaff(DEFAULT_STAFF),
    gyms: cloneGyms(DEFAULT_GYMS),
    boulderSections: cloneSections(DEFAULT_BOULDER),
    ropeSections: cloneSections(DEFAULT_ROPE),
    constraints: JSON.parse(JSON.stringify(DEFAULT_CONSTRAINTS)),
  }
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return buildDefaults()
    const parsed = JSON.parse(raw)
    const defaults = buildDefaults()
    // Merge: use stored value where present, fall back to defaults
    return {
      staff:           parsed.staff           ?? defaults.staff,
      gyms:            parsed.gyms            ?? defaults.gyms,
      boulderSections: parsed.boulderSections ?? defaults.boulderSections,
      ropeSections:    parsed.ropeSections    ?? defaults.ropeSections,
      constraints:     { ...defaults.constraints, ...parsed.constraints },
    }
  } catch {
    return buildDefaults()
  }
}

export function saveSettings(data) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(data))
}

// ---------------------------------------------------------------------------
// Export / Import (JSON file)
// ---------------------------------------------------------------------------

export function exportSettingsJSON(data) {
  return JSON.stringify(data, null, 2)
}

export function importSettingsJSON(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr)
    if (!parsed || typeof parsed !== 'object') return null
    const defaults = buildDefaults()
    return {
      staff:           parsed.staff           ?? defaults.staff,
      gyms:            parsed.gyms            ?? defaults.gyms,
      boulderSections: parsed.boulderSections ?? defaults.boulderSections,
      ropeSections:    parsed.ropeSections    ?? defaults.ropeSections,
      constraints:     { ...defaults.constraints, ...parsed.constraints },
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Convenience: next-available staff id
// ---------------------------------------------------------------------------

export function nextStaffId(staff) {
  return staff.reduce((max, s) => Math.max(max, s.id), 0) + 1
}
