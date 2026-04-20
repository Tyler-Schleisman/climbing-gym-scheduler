/**
 * Missed shift / incomplete anchor tracking.
 *
 * Storage key: 'climbing-missed-shifts'
 *
 * Data shape:
 * {
 *   records: [
 *     {
 *       id: string,            // unique ID
 *       weekNumber: number,
 *       day: string,           // 'Monday' etc.
 *       gymName: string,
 *       section: string,
 *       shiftType: string,     // 'Rope Setting' | 'Boulder Setting'
 *       incompleteAnchors: number[],  // anchor numbers that were missed
 *       missedBy: number[],    // setter IDs who were assigned
 *       missedReason: string,  // 'sick' | 'emergency' | 'no-show' | 'other'
 *       missedNotes: string,
 *       missedDate: string,    // ISO timestamp
 *       status: string,        // 'open' | 'scheduled' | 'completed'
 *       makeupWeek: number | null,
 *       makeupDay: string | null,
 *       makeupNotes: string,
 *       completedDate: string | null, // ISO timestamp
 *       editHistory: Array<{ts: string, change: string}>,
 *     }
 *   ]
 * }
 */

import { GYMS } from './gyms'
import { STAFF } from './staff'
import { ROPE_SECTIONS } from './sections'
import { loadAvailability, getSetterAbsence } from './availability-overrides'

const STORAGE_KEY = 'climbing-missed-shifts'
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const MISSED_REASONS = {
  sick:      { label: 'Sick',      icon: '🤒', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  emergency: { label: 'Emergency', icon: '🚨', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  'no-show': { label: 'No-show',   icon: '❌', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  other:     { label: 'Other',     icon: '📋', color: '#64748b', bg: 'rgba(100,116,139,0.15)' },
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function loadMissedShifts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { records: [] }
    const data = JSON.parse(raw)
    return { records: Array.isArray(data.records) ? data.records : [] }
  } catch {
    return { records: [] }
  }
}

function saveMissedShifts(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function addMissedShift(record) {
  const data = loadMissedShifts()
  const entry = {
    id: generateId(),
    weekNumber: record.weekNumber,
    day: record.day,
    gymName: record.gymName,
    section: record.section,
    shiftType: record.shiftType,
    incompleteAnchors: record.incompleteAnchors || [],
    missedBy: record.missedBy || [],
    missedReason: record.missedReason || 'other',
    missedNotes: record.missedNotes || '',
    missedDate: new Date().toISOString(),
    status: 'open',
    makeupWeek: null,
    makeupDay: null,
    makeupNotes: '',
    completedDate: null,
    editHistory: [],
  }
  data.records.push(entry)
  saveMissedShifts(data)
  return entry
}

function updateMissedShift(id, updates) {
  const data = loadMissedShifts()
  const idx = data.records.findIndex((r) => r.id === id)
  if (idx === -1) return null
  data.records[idx] = { ...data.records[idx], ...updates }
  saveMissedShifts(data)
  return data.records[idx]
}

function removeMissedShift(id) {
  const data = loadMissedShifts()
  data.records = data.records.filter((r) => r.id !== id)
  saveMissedShifts(data)
}

function markAsScheduled(id, makeupWeek, makeupDay, makeupNotes) {
  return updateMissedShift(id, {
    status: 'scheduled',
    makeupWeek,
    makeupDay,
    makeupNotes: makeupNotes || '',
  })
}

function markAsCompleted(id) {
  return updateMissedShift(id, {
    status: 'completed',
    completedDate: new Date().toISOString(),
  })
}

function addEditHistory(id, changeDescription) {
  const data = loadMissedShifts()
  const idx = data.records.findIndex((r) => r.id === id)
  if (idx === -1) return null
  const history = data.records[idx].editHistory || []
  history.push({ ts: new Date().toISOString(), change: changeDescription })
  data.records[idx].editHistory = history
  saveMissedShifts(data)
  return data.records[idx]
}

function getOpenRecords() {
  return loadMissedShifts().records.filter((r) => r.status !== 'completed')
}

function getAllRecords() {
  return loadMissedShifts().records
}

function getRecordsForWeek(weekNumber) {
  return loadMissedShifts().records.filter((r) => r.weekNumber === weekNumber)
}

function getRecordsForGym(gymName) {
  return loadMissedShifts().records.filter(
    (r) => r.gymName === gymName && r.status !== 'completed'
  )
}

function getIncompleteForShift(weekNumber, gymName, day) {
  return loadMissedShifts().records.filter(
    (r) => r.weekNumber === weekNumber && r.gymName === gymName && r.day === day && r.status !== 'completed'
  )
}

/** Get records that have makeup work scheduled on a specific shift */
function getMakeupForShift(weekNumber, gymName, day) {
  return loadMissedShifts().records.filter(
    (r) => r.makeupWeek === weekNumber && r.makeupDay === day && r.gymName === gymName && r.status === 'scheduled'
  )
}

/** Stats for analytics */
function getMissedShiftStats() {
  const records = loadMissedShifts().records
  const bySetterId = {}
  const byGym = {}
  const byDay = {}
  const byReason = {}

  records.forEach((r) => {
    r.missedBy.forEach((id) => {
      bySetterId[id] = (bySetterId[id] || 0) + 1
    })
    byGym[r.gymName] = (byGym[r.gymName] || 0) + 1
    byDay[r.day] = (byDay[r.day] || 0) + 1
    byReason[r.missedReason] = (byReason[r.missedReason] || 0) + 1
  })

  return { total: records.length, bySetterId, byGym, byDay, byReason }
}

// ---- Auto-scheduling ----

function getCurrentWeek() {
  const base = new Date(2025, 0, 6)
  const now = new Date()
  return Math.max(0, Math.floor((now - base) / (7 * 24 * 60 * 60 * 1000)))
}

/**
 * Find candidate makeup slots for a missed shift record.
 * Returns an array of { weekNumber, day, gymName, shiftKey, staffCount, maxSetters, section, sameSection, score }
 * sorted best-first by score.
 */
function findMakeupSlots(record, scheduleHistory, maxWeeksAhead = 4) {
  const gym = GYMS.find((g) => g.name === record.gymName)
  if (!gym) return []

  const currentWeek = getCurrentWeek()
  const startWeek = Math.max(currentWeek, record.weekNumber + 1)
  const endWeek = startWeek + maxWeeksAhead
  const isRope = record.shiftType === 'Rope Setting'
  const maxSetters = gym.maxRopeSetters || 6

  // Determine which days this gym has rope/compatible shifts
  const compatibleDays = []
  if (isRope) {
    if (gym.ropeDays) compatibleDays.push(...gym.ropeDays)
    if (gym.flexDays) compatibleDays.push(...gym.flexDays)
  } else {
    if (gym.boulderDays) compatibleDays.push(...gym.boulderDays)
    if (gym.flexDays) compatibleDays.push(...gym.flexDays)
  }

  const availData = loadAvailability()
  const candidates = []

  for (let w = startWeek; w < endWeek; w++) {
    const weekSched = scheduleHistory[w] || {}

    for (const day of compatibleDays) {
      const shiftKey = `${record.gymName}-${day}`
      const shift = weekSched[shiftKey]
      const staffCount = shift?.assignedStaff?.length || 0
      const shiftType = shift?.shiftType || (isRope ? 'Rope Setting' : 'Boulder Setting')

      // Only consider compatible shift types
      if (shift && shiftType !== record.shiftType) continue

      const hasCapacity = staffCount < maxSetters
      const sameSection = shift?.section === record.section
      const weeksFromNow = w - currentWeek

      // Count available experienced setters for this slot
      let availableSetters = 0
      STAFF.forEach((s) => {
        if (s.role === 'Director') return
        if (!s.availability.includes(day)) return
        const absence = getSetterAbsence(availData, s.id, w, day)
        if (absence) return
        // Check not already assigned to a different shift at another gym this day
        let busyElsewhere = false
        GYMS.forEach((otherGym) => {
          if (otherGym.name === record.gymName) return
          const otherShift = weekSched[`${otherGym.name}-${day}`]
          if (otherShift?.assignedStaff?.includes(s.id)) busyElsewhere = true
        })
        if (!busyElsewhere) availableSetters++
      })

      // Score: lower is better
      // Heavily prefer same section, same gym, near future, with capacity
      let score = weeksFromNow * 10 // closer weeks are better
      if (sameSection) score -= 50 // strong preference for same section
      if (!hasCapacity) score += 100 // penalty for full shifts
      if (staffCount === 0) score += 5 // slight penalty for empty shifts (may be intentionally empty)
      if (availableSetters < 2) score += 30 // need at least 2 setters

      candidates.push({
        weekNumber: w,
        day,
        gymName: record.gymName,
        shiftKey,
        staffCount,
        maxSetters,
        section: shift?.section || null,
        sameSection,
        hasCapacity,
        availableSetters,
        score,
        existingStaff: shift?.assignedStaff || [],
      })
    }
  }

  candidates.sort((a, b) => a.score - b.score)
  return candidates
}

/**
 * Validate a proposed makeup assignment.
 * Returns { valid, warnings, errors }
 */
function validateMakeupAssignment(record, weekNumber, day, scheduleHistory) {
  const gym = GYMS.find((g) => g.name === record.gymName)
  const warnings = []
  const errors = []

  const weekSched = scheduleHistory[weekNumber] || {}
  const shiftKey = `${record.gymName}-${day}`
  const shift = weekSched[shiftKey]
  const staffCount = shift?.assignedStaff?.length || 0
  const maxSetters = gym?.maxRopeSetters || 6

  // Check shift type compatibility
  if (shift && shift.shiftType !== record.shiftType) {
    errors.push(`Shift is ${shift.shiftType}, but makeup work is ${record.shiftType}`)
  }

  // Check capacity
  if (staffCount >= maxSetters) {
    warnings.push(`Shift already at capacity (${staffCount}/${maxSetters} setters)`)
  }

  // Check minimum setters for rope
  if (record.shiftType === 'Rope Setting' && staffCount < 2 && staffCount > 0) {
    warnings.push(`Only ${staffCount} setter assigned, need at least 2 for rope`)
  }

  // Check if section is compatible
  if (shift?.section && shift.section !== record.section) {
    warnings.push(`Different section: shift has "${shift.section}", makeup is "${record.section}"`)
  }

  // Check if gym has this shift type on this day
  const isRope = record.shiftType === 'Rope Setting'
  const gymDays = isRope
    ? [...(gym?.ropeDays || []), ...(gym?.flexDays || [])]
    : [...(gym?.boulderDays || []), ...(gym?.flexDays || [])]
  if (!gymDays.includes(day)) {
    errors.push(`${record.gymName} does not have ${record.shiftType.toLowerCase()} on ${day}`)
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    staffCount,
    maxSetters,
    sameSection: !shift?.section || shift.section === record.section,
  }
}

/**
 * Get the age of a missed record in days
 */
function getRecordAge(record) {
  const missedDate = new Date(record.missedDate)
  const now = new Date()
  return Math.floor((now - missedDate) / (24 * 60 * 60 * 1000))
}

/**
 * Get age status color for a missed record
 */
function getRecordAgeStatus(daysOld) {
  if (daysOld <= 7) return { color: '#10b981', label: 'Recent' }
  if (daysOld <= 14) return { color: '#f59e0b', label: 'Aging' }
  return { color: '#ef4444', label: 'Overdue' }
}

export {
  MISSED_REASONS,
  loadMissedShifts,
  saveMissedShifts,
  addMissedShift,
  updateMissedShift,
  removeMissedShift,
  markAsScheduled,
  markAsCompleted,
  addEditHistory,
  getOpenRecords,
  getAllRecords,
  getRecordsForWeek,
  getRecordsForGym,
  getIncompleteForShift,
  getMakeupForShift,
  getMissedShiftStats,
  findMakeupSlots,
  validateMakeupAssignment,
  getRecordAge,
  getRecordAgeStatus,
}
