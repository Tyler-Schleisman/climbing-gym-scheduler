/**
 * Inspection scheduling data layer.
 *
 * Manages gym inspection schedules with localStorage persistence.
 *
 * localStorage keys:
 *   'climbing-inspection-settings' - configuration (frequency, day, gyms, mode)
 *   'climbing-inspection-records'  - individual inspection records
 */

const SETTINGS_KEY = 'climbing-inspection-settings'
const RECORDS_KEY = 'climbing-inspection-records'

// Base date: Monday Jan 6, 2025 (week 0)
const BASE_DATE = new Date(2025, 0, 6)

// ---- Date / Week helpers ----

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
  const diff = new Date().getTime() - BASE_DATE.getTime()
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000))
}

export function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getDayIndex(dayName) {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].indexOf(dayName)
}

export function weekAndDayToDate(weekNumber, dayName) {
  const d = weekToDate(weekNumber)
  d.setDate(d.getDate() + getDayIndex(dayName))
  return d
}

// ---- Default settings ----

export const DEFAULT_INSPECTION_SETTINGS = {
  enabled: true,
  frequencyWeeks: 12,
  inspectionDay: 'Friday',
  gymsToInspect: ['SLC', 'Soma'],
  mode: 'same', // 'same' | 'alternating' | 'custom'
  customSchedules: {}, // { gymName: { frequencyWeeks, inspectionDay } }
  lastInspectionDate: null, // ISO date string
  generatedThrough: null, // week number of last generated inspection
}

// ---- Settings CRUD ----

export function loadInspectionSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_INSPECTION_SETTINGS }
    return { ...DEFAULT_INSPECTION_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_INSPECTION_SETTINGS }
  }
}

export function saveInspectionSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

// ---- Records CRUD ----

let _nextId = 1

export function loadInspectionRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY)
    const records = raw ? JSON.parse(raw) : []
    if (records.length > 0) {
      _nextId = Math.max(...records.map((r) => r.id)) + 1
    }
    return records
  } catch {
    return []
  }
}

export function saveInspectionRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records))
}

function createRecord(weekNumber, dayName, gyms, notes = '') {
  const date = weekAndDayToDate(weekNumber, dayName)
  return {
    id: _nextId++,
    weekNumber,
    day: dayName,
    date: toISODate(date),
    gyms: [...gyms],
    status: 'scheduled', // 'scheduled' | 'completed' | 'missed' | 'cancelled'
    notes,
    completedDate: null,
    inspectorName: '',
    completionNotes: '',
  }
}

// ---- Schedule Generation ----

/**
 * Generate inspection records for the next N months from settings.
 * @returns {object[]} Array of inspection records
 */
export function generateInspectionSchedule(settings, monthsAhead = 12) {
  const records = []
  if (!settings.enabled || settings.gymsToInspect.length === 0) return records

  // Determine starting week
  let startWeek
  if (settings.lastInspectionDate) {
    startWeek = dateToWeek(settings.lastInspectionDate) + settings.frequencyWeeks
  } else {
    startWeek = todayWeek()
  }

  const endWeek = todayWeek() + Math.ceil(monthsAhead * 4.33)

  if (settings.mode === 'alternating' && settings.gymsToInspect.length > 1) {
    // Alternate between gyms
    let gymIdx = 0
    for (let w = startWeek; w <= endWeek; w += settings.frequencyWeeks) {
      const gym = settings.gymsToInspect[gymIdx % settings.gymsToInspect.length]
      records.push(createRecord(w, settings.inspectionDay, [gym]))
      gymIdx++
    }
  } else if (settings.mode === 'custom') {
    // Per-gym schedules
    settings.gymsToInspect.forEach((gymName) => {
      const custom = settings.customSchedules[gymName] || {}
      const freq = custom.frequencyWeeks || settings.frequencyWeeks
      const day = custom.inspectionDay || settings.inspectionDay

      let sw = startWeek
      if (custom.lastInspectionDate) {
        sw = dateToWeek(custom.lastInspectionDate) + freq
      }

      for (let w = sw; w <= endWeek; w += freq) {
        records.push(createRecord(w, day, [gymName]))
      }
    })
    // Sort by week
    records.sort((a, b) => a.weekNumber - b.weekNumber)
  } else {
    // Same day - all gyms together
    for (let w = startWeek; w <= endWeek; w += settings.frequencyWeeks) {
      records.push(createRecord(w, settings.inspectionDay, [...settings.gymsToInspect]))
    }
  }

  return records
}

// ---- Record operations ----

export function addInspectionRecord(records, record) {
  const updated = [...records, record]
  saveInspectionRecords(updated)
  return updated
}

export function updateInspectionRecord(records, id, changes) {
  const updated = records.map((r) => r.id === id ? { ...r, ...changes } : r)
  saveInspectionRecords(updated)
  return updated
}

export function removeInspectionRecord(records, id) {
  const updated = records.filter((r) => r.id !== id)
  saveInspectionRecords(updated)
  return updated
}

export function markInspectionComplete(records, id, { completedDate, inspectorName, completionNotes }) {
  return updateInspectionRecord(records, id, {
    status: 'completed',
    completedDate: completedDate || toISODate(new Date()),
    inspectorName: inspectorName || '',
    completionNotes: completionNotes || '',
  })
}

export function rescheduleInspection(records, id, newWeek, newDay) {
  const newDate = weekAndDayToDate(newWeek, newDay)
  return updateInspectionRecord(records, id, {
    weekNumber: newWeek,
    day: newDay,
    date: toISODate(newDate),
    status: 'scheduled',
  })
}

// ---- Query helpers ----

export function getInspectionsForWeek(records, weekNumber) {
  return records.filter((r) => r.weekNumber === weekNumber && r.status !== 'cancelled')
}

export function getUpcomingInspections(records, count = 5) {
  const current = todayWeek()
  return records
    .filter((r) => r.weekNumber >= current && r.status === 'scheduled')
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .slice(0, count)
}

export function getPastInspections(records, count = 10) {
  const current = todayWeek()
  return records
    .filter((r) => r.weekNumber < current || r.status === 'completed')
    .sort((a, b) => b.weekNumber - a.weekNumber)
    .slice(0, count)
}

export function getOverdueInspections(records) {
  const current = todayWeek()
  return records.filter((r) => r.weekNumber < current && r.status === 'scheduled')
}

export function getNextInspection(records) {
  const current = todayWeek()
  const upcoming = records
    .filter((r) => r.weekNumber >= current && r.status === 'scheduled')
    .sort((a, b) => a.weekNumber - b.weekNumber)
  return upcoming[0] || null
}

/**
 * Check if a specific week has an inspection scheduled.
 * Returns the inspection record(s) or empty array.
 */
export function hasInspectionOnWeek(records, weekNumber) {
  return records.filter((r) => r.weekNumber === weekNumber && r.status !== 'cancelled')
}

/**
 * Check if a specific day within a week has an inspection.
 */
export function hasInspectionOnDay(records, weekNumber, dayName) {
  return records.filter(
    (r) => r.weekNumber === weekNumber && r.day === dayName && r.status !== 'cancelled'
  )
}

// ---- Stats ----

export function getInspectionStats(records) {
  const current = todayWeek()
  const scheduled = records.filter((r) => r.status === 'scheduled' && r.weekNumber >= current)
  const completed = records.filter((r) => r.status === 'completed')
  const overdue = records.filter((r) => r.status === 'scheduled' && r.weekNumber < current)
  const missed = records.filter((r) => r.status === 'missed')

  return {
    total: records.length,
    scheduled: scheduled.length,
    completed: completed.length,
    overdue: overdue.length,
    missed: missed.length,
  }
}
