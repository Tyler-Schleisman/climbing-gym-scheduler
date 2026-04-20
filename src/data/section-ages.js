/**
 * Section age tracking data layer.
 *
 * Stores manual overrides for when each wall section was last reset.
 * Works alongside the auto-computed rotation tracking from analytics.js.
 *
 * localStorage key: 'climbing-section-ages'
 *
 * Shape: {
 *   "Ogden:boulder:Wave": {
 *     lastResetDate: "2025-01-15",       // ISO date string
 *     lastResetWeek: 1,                   // week number in scheduler system
 *     manualOverride: true,               // true = manually set, false = auto-tracked
 *     updatedAt: "2025-03-01T12:00:00Z"   // when this entry was last modified
 *   },
 *   ...
 * }
 */

const STORAGE_KEY = 'climbing-section-ages'

// Base date: Monday Jan 6, 2025 (week 0)
const BASE_DATE = new Date(2025, 0, 6)

// ---- Key helpers ----

export function ageKey(gym, type, sectionName) {
  return `${gym}:${type}:${sectionName}`
}

// ---- Date/week conversion ----

export function weekToDate(weekNumber) {
  const d = new Date(BASE_DATE)
  d.setDate(d.getDate() + weekNumber * 7)
  return d
}

export function dateToWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const diff = d.getTime() - BASE_DATE.getTime()
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000))
}

export function todayWeek() {
  const now = new Date()
  const diff = now.getTime() - BASE_DATE.getTime()
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000))
}

export function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function toISODate(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// ---- Load / Save ----

export function loadSectionAges() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveSectionAges(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// ---- CRUD ----

export function getSectionAge(ages, gym, type, sectionName) {
  return ages[ageKey(gym, type, sectionName)] || null
}

export function setSectionAge(ages, gym, type, sectionName, { lastResetDate, lastResetWeek, manualOverride }) {
  const key = ageKey(gym, type, sectionName)
  const updated = {
    ...ages,
    [key]: {
      lastResetDate,
      lastResetWeek,
      manualOverride: manualOverride !== false,
      updatedAt: new Date().toISOString(),
    },
  }
  saveSectionAges(updated)
  return updated
}

export function removeSectionAge(ages, gym, type, sectionName) {
  const key = ageKey(gym, type, sectionName)
  const updated = { ...ages }
  delete updated[key]
  saveSectionAges(updated)
  return updated
}

export function clearAllManualOverrides(ages) {
  const updated = {}
  Object.entries(ages).forEach(([key, entry]) => {
    if (!entry.manualOverride) {
      updated[key] = entry
    }
  })
  saveSectionAges(updated)
  return updated
}

export function setAllToDate(ages, sections, dateStr) {
  const week = dateToWeek(dateStr)
  const updated = { ...ages }
  sections.forEach(({ gym, type, name }) => {
    const key = ageKey(gym, type, name)
    updated[key] = {
      lastResetDate: dateStr,
      lastResetWeek: week,
      manualOverride: true,
      updatedAt: new Date().toISOString(),
    }
  })
  saveSectionAges(updated)
  return updated
}

export function markAsJustReset(ages, gym, type, sectionName) {
  const today = toISODate(new Date())
  const week = todayWeek()
  return setSectionAge(ages, gym, type, sectionName, {
    lastResetDate: today,
    lastResetWeek: week,
    manualOverride: true,
  })
}

// ---- Age calculation ----

/**
 * Get the effective age (in weeks) for a section, considering manual overrides.
 * Returns { weeksOld, lastResetDate, lastResetWeek, isManual, source: 'manual'|'auto'|'none' }
 */
export function getEffectiveAge(ages, gym, type, sectionName, autoLastResetWeek, currentWeek) {
  const manual = getSectionAge(ages, gym, type, sectionName)

  if (manual && manual.manualOverride) {
    const weeksOld = currentWeek - manual.lastResetWeek
    return {
      weeksOld: Math.max(0, weeksOld),
      lastResetDate: manual.lastResetDate,
      lastResetWeek: manual.lastResetWeek,
      isManual: true,
      source: 'manual',
    }
  }

  if (autoLastResetWeek != null) {
    const weeksOld = currentWeek - autoLastResetWeek
    const d = weekToDate(autoLastResetWeek)
    return {
      weeksOld: Math.max(0, weeksOld),
      lastResetDate: toISODate(d),
      lastResetWeek: autoLastResetWeek,
      isManual: false,
      source: 'auto',
    }
  }

  return { weeksOld: null, lastResetDate: null, lastResetWeek: null, isManual: false, source: 'none' }
}

/**
 * Get age status color based on rotation cycle progress.
 * Returns { color, bg, label }
 */
export function getAgeStatus(weeksOld, rotationGoal) {
  if (weeksOld == null) {
    return { color: '#64748b', bg: 'rgba(100,116,139,0.1)', label: 'Unknown' }
  }
  const pct = weeksOld / rotationGoal
  if (pct < 0.5) {
    return { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Fresh' }
  }
  if (pct < 0.9) {
    return { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Aging' }
  }
  if (pct < 1.0) {
    return { color: '#f97316', bg: 'rgba(249,115,22,0.1)', label: 'Due Soon' }
  }
  return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Overdue' }
}

// ---- Export / Import CSV ----

export function exportAgesToCSV(ages, allSections) {
  const lines = ['Gym,Type,Section,Last Reset Date,Weeks Old,Manual Override']
  const currentWk = todayWeek()

  allSections.forEach(({ gym, type, name }) => {
    const entry = getSectionAge(ages, gym, type, name)
    if (entry) {
      const weeksOld = Math.max(0, currentWk - entry.lastResetWeek)
      lines.push(`${gym},${type},${name},${entry.lastResetDate},${weeksOld},${entry.manualOverride}`)
    } else {
      lines.push(`${gym},${type},${name},,unknown,false`)
    }
  })

  return lines.join('\n')
}

export function importAgesFromCSV(csvStr) {
  const lines = csvStr.trim().split('\n')
  if (lines.length < 2) return null

  const ages = {}
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((s) => s.trim())
    if (parts.length < 4) continue
    const [gym, type, name, dateStr] = parts
    if (!gym || !type || !name || !dateStr) continue

    const week = dateToWeek(dateStr)
    const key = ageKey(gym, type, name)
    ages[key] = {
      lastResetDate: dateStr,
      lastResetWeek: week,
      manualOverride: true,
      updatedAt: new Date().toISOString(),
    }
  }

  return Object.keys(ages).length > 0 ? ages : null
}
