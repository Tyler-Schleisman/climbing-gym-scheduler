/**
 * Availability Overrides — sick days, vacation, personal days, recurring patterns.
 *
 * Storage shape:
 * {
 *   overrides: { [setterId]: { [YYYY-MM-DD]: { type, notes } } },
 *   recurring: [ { setterId, dayOfWeek, type, notes } ]
 * }
 */

const STORAGE_KEY = 'climbing-availability-overrides'

export const ABSENCE_TYPES = {
  sick: { label: 'Sick Day', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: 'S' },
  vacation: { label: 'Vacation', color: '#10b981', bg: 'rgba(16,185,129,0.15)', icon: 'V' },
  personal: { label: 'Personal', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: 'P' },
  other: { label: 'Other', color: '#64748b', bg: 'rgba(100,116,139,0.15)', icon: 'O' },
}

function defaultData() {
  return { overrides: {}, recurring: [] }
}

export function loadAvailability() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultData()
    const parsed = JSON.parse(raw)
    return {
      overrides: parsed.overrides || {},
      recurring: parsed.recurring || [],
    }
  } catch {
    return defaultData()
  }
}

export function saveAvailability(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

/** Export data as JSON string for bulk export */
export function exportAvailabilityJSON(data) {
  return JSON.stringify(data, null, 2)
}

/** Import from JSON string, returns parsed data or null on failure */
export function importAvailabilityJSON(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      overrides: parsed.overrides || {},
      recurring: parsed.recurring || [],
    }
  } catch {
    return null
  }
}

// ---- Date helpers (shared base date with WeekNavigation) ----

const BASE_DATE = new Date(2025, 0, 6) // Monday Jan 6, 2025 = week 0
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

/** Convert week number + day name → YYYY-MM-DD string */
export function weekDayToDate(weekNumber, dayName) {
  const dayIdx = DAYS.indexOf(dayName)
  if (dayIdx === -1) return null
  const d = new Date(BASE_DATE)
  d.setDate(d.getDate() + weekNumber * 7 + dayIdx)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Convert YYYY-MM-DD → Date object */
export function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Check if a setter is unavailable on a specific week+day.
 * Returns the absence record { type, notes } or null if available.
 */
export function getSetterAbsence(data, setterId, weekNumber, dayName) {
  const dateStr = weekDayToDate(weekNumber, dayName)
  if (!dateStr) return null

  // Check specific date overrides
  const setterOverrides = data.overrides[setterId]
  if (setterOverrides && setterOverrides[dateStr]) {
    return setterOverrides[dateStr]
  }

  // Check recurring patterns
  for (const rec of data.recurring) {
    if (rec.setterId === setterId && rec.dayOfWeek === dayName) {
      return { type: rec.type, notes: rec.notes || 'Recurring' }
    }
  }

  return null
}

/**
 * Get all upcoming absences across all setters from a given week onward.
 * Returns array of { setterId, date, dayName, weekNumber, type, notes, source }
 * sorted by date.
 */
export function getUpcomingAbsences(data, fromWeek, weeksAhead = 4) {
  const absences = []

  // Specific date overrides
  Object.entries(data.overrides).forEach(([sidStr, dates]) => {
    const setterId = Number(sidStr)
    Object.entries(dates).forEach(([dateStr, info]) => {
      // Convert date back to week number to filter
      const d = parseDate(dateStr)
      const diffMs = d - BASE_DATE
      const diffDays = Math.round(diffMs / 86400000)
      const wk = Math.floor(diffDays / 7)
      const dayIdx = diffDays % 7
      if (dayIdx < 0 || dayIdx > 4) return // weekend
      if (wk < fromWeek || wk >= fromWeek + weeksAhead) return
      absences.push({
        setterId,
        date: dateStr,
        dayName: DAYS[dayIdx],
        weekNumber: wk,
        type: info.type,
        notes: info.notes,
        source: 'override',
      })
    })
  })

  // Recurring patterns — generate entries for each week in range
  data.recurring.forEach((rec) => {
    for (let w = fromWeek; w < fromWeek + weeksAhead; w++) {
      const dateStr = weekDayToDate(w, rec.dayOfWeek)
      if (!dateStr) continue
      // Skip if there's already a specific override for this date
      const existing = data.overrides[rec.setterId]?.[dateStr]
      if (existing) continue
      absences.push({
        setterId: rec.setterId,
        date: dateStr,
        dayName: rec.dayOfWeek,
        weekNumber: w,
        type: rec.type,
        notes: rec.notes || 'Recurring',
        source: 'recurring',
      })
    }
  })

  absences.sort((a, b) => a.date.localeCompare(b.date))
  return absences
}
