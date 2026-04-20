import { STAFF as DEFAULT_STAFF } from '../data/staff'
import { GYMS as DEFAULT_GYMS } from '../data/gyms'
import { BOULDER_SECTIONS as DEFAULT_BOULDER, ROPE_SECTIONS as DEFAULT_ROPE } from '../data/sections'
import { loadSettings, DEFAULT_CONSTRAINTS } from '../data/settings'
import { loadAvailability, getSetterAbsence } from '../data/availability-overrides'
import { parseMultiDayRules } from './multi-day-helpers'

const SHIFT_TYPES = {
  BOULDER: 'Boulder Setting',
  ROPE: 'Rope Setting',
}

/**
 * Validate a full week's schedule. Returns an array of violation objects.
 * Each violation: { severity: 'error'|'warning', message: string, shiftKey: string|null, staffIds: number[] }
 *
 * Uses settings from localStorage (staff overrides, gym configs, constraint toggles).
 */
export function validateSchedule(weekSchedule, weekNumber) {
  const violations = []
  if (!weekSchedule) return violations

  // Load current settings (merges user overrides with defaults)
  const settings = loadSettings()
  const STAFF = settings.staff
  const GYMS = settings.gyms
  const BOULDER_SECTIONS = settings.boulderSections
  const ROPE_SECTIONS = settings.ropeSections
  const C = settings.constraints

  // Helpers scoped to current settings
  function getStaff(id) { return STAFF.find((s) => s.id === id) }
  function getGym(name) { return GYMS.find((g) => g.name === name) }

  function parseKey(key) {
    const idx = key.lastIndexOf('-')
    return { gymName: key.slice(0, idx), day: key.slice(idx + 1) }
  }

  function isSettingDay(gym, day) {
    return (
      gym.boulderDays?.includes(day) ||
      gym.ropeDays?.includes(day) ||
      gym.flexDays?.includes(day)
    )
  }

  function getSectionDifficulty(gymName, sectionName, shiftType) {
    if (!sectionName) return null
    const pool =
      shiftType === SHIFT_TYPES.BOULDER
        ? BOULDER_SECTIONS[gymName]
        : ROPE_SECTIONS[gymName]
    return pool?.find((s) => s.name === sectionName)?.difficulty || null
  }

  function getBoulderSection(gymName, sectionName) {
    return BOULDER_SECTIONS[gymName]?.find((s) => s.name === sectionName)
  }

  // ---- Build per-staff weekly stats ----
  const staffStats = {}
  STAFF.forEach((s) => {
    staffStats[s.id] = {
      totalShifts: 0, boulderShifts: 0, ropeShifts: 0,
      hardSections: 0, washShifts: 0, ogdenDays: 0,
      assignedDays: new Set(),
      assignments: [],
    }
  })

  Object.entries(weekSchedule).forEach(([key, shift]) => {
    if (!shift) return
    const { gymName, day } = parseKey(key)
    const sectionDifficulty = getSectionDifficulty(gymName, shift.section, shift.shiftType)

    if (shift.assignedStaff?.length) {
      shift.assignedStaff.forEach((id) => {
        if (!staffStats[id]) return
        const st = staffStats[id]
        st.totalShifts++
        st.assignedDays.add(day)
        st.assignments.push({ key, gymName, day, shiftType: shift.shiftType, section: shift.section })
        if (shift.shiftType === SHIFT_TYPES.BOULDER) st.boulderShifts++
        if (shift.shiftType === SHIFT_TYPES.ROPE) st.ropeShifts++
        if (sectionDifficulty === 'hard') st.hardSections++
        if (gymName === 'Ogden') st.ogdenDays++
      })
    }

    if (shift.holdWasher && staffStats[shift.holdWasher]) {
      staffStats[shift.holdWasher].washShifts++
    }
    if (shift.flexHoldWashers) {
      shift.flexHoldWashers.forEach((id) => {
        if (!staffStats[id]) return
        // Skip if already counted as holdWasher on this shift
        if (id === shift.holdWasher) return
        staffStats[id].washShifts++
        staffStats[id].totalShifts++
        staffStats[id].assignedDays.add(day)
        staffStats[id].assignments.push({ key, gymName, day, shiftType: 'Hold Wash', section: null })
      })
    }

    // Count staff from additional sections
    if (shift.additionalSections?.length) {
      shift.additionalSections.forEach((extraSec) => {
        const extraDifficulty = getSectionDifficulty(gymName, extraSec.section, shift.shiftType)
        ;(extraSec.assignedStaff || []).forEach((id) => {
          if (!staffStats[id]) return
          const st = staffStats[id]
          st.totalShifts++
          st.assignedDays.add(day)
          st.assignments.push({ key, gymName, day, shiftType: shift.shiftType, section: extraSec.section })
          if (shift.shiftType === SHIFT_TYPES.ROPE) st.ropeShifts++
          if (extraDifficulty === 'hard') st.hardSections++
          if (gymName === 'Ogden') st.ogdenDays++
        })
      })
    }
  })

  // Helper: push violation only if the rule is enabled, using configured severity
  function addViolation(ruleKey, defaultSeverity, message, shiftKey, staffIds) {
    const rule = C[ruleKey]
    if (rule && !rule.enabled) return
    const severity = rule?.severity || defaultSeverity
    violations.push({ severity, message, shiftKey, staffIds })
  }

  // ---- CRITICAL CONSTRAINTS ----

  Object.entries(weekSchedule).forEach(([key, shift]) => {
    if (!shift) return
    const { gymName, day } = parseKey(key)
    const gym = getGym(gymName)
    if (!gym) return
    const staffIds = shift.assignedStaff || []

    // 1. Head Setter Assignment — required any day their gym has setting
    if (isSettingDay(gym, day)) {
      const headForGym = STAFF.find((s) => s.role === 'Head Setter' && s.gym === gymName)
      if (headForGym && headForGym.availability.includes(day) && !staffIds.includes(headForGym.id) && staffIds.length > 0) {
        addViolation('headSetterRequired', 'error',
          `${day}: ${headForGym.name} must be assigned to ${gymName} (head setter requirement)`,
          key, [headForGym.id])
      }
    }

    // Head setters at wrong gym — only when their own gym has setting that day
    staffIds.forEach((id) => {
      const s = getStaff(id)
      if (!s || s.role !== 'Head Setter') return
      const homeGym = getGym(s.gym)
      if (homeGym && isSettingDay(homeGym, day) && s.gym !== gymName) {
        addViolation('headSetterRequired', 'error',
          `${s.name} is Head Setter for ${s.gym} which has setting on ${day}, cannot be at ${gymName}`,
          key, [id])
      }
    })

    // 2. Rope Safety Minimum
    if (shift.shiftType === SHIFT_TYPES.ROPE && staffIds.length > 0) {
      const setterCount = staffIds.filter((id) => id !== shift.holdWasher).length
      const minSetters = C.ropeMinSetters?.value ?? 2
      if (setterCount < minSetters) {
        addViolation('ropeMinSetters', 'error',
          `Rope setting at ${gymName} on ${day} requires minimum ${minSetters} setters (have ${setterCount}, not counting hold washer)`,
          key, staffIds)
      }
    }

    // 3. Rope Maximum (total across primary + additional sections)
    if (shift.shiftType === SHIFT_TYPES.ROPE && staffIds.length > 0) {
      const primaryCount = staffIds.filter((id) => id !== shift.holdWasher).length
      const extraCount = (shift.additionalSections || []).reduce(
        (sum, s) => sum + (s.assignedStaff?.length || 0), 0
      )
      const totalRopeSetters = primaryCount + extraCount
      if (gym.maxRopeSetters && totalRopeSetters > gym.maxRopeSetters) {
        const allIds = [
          ...staffIds,
          ...(shift.additionalSections || []).flatMap((s) => s.assignedStaff || []),
        ]
        addViolation('ropeMaxSetters', 'warning',
          `Rope setting at ${gymName} on ${day}: ${totalRopeSetters} total setters exceeds typical max of ${gym.maxRopeSetters}${shift.additionalSections?.length ? ` (${shift.additionalSections.length + 1} sections)` : ''}`,
          key, allIds)
      }
    }

    // 3b. Per-section rope minimum (additional sections need >= 2 setters each)
    if (shift.shiftType === SHIFT_TYPES.ROPE && shift.additionalSections?.length > 0) {
      shift.additionalSections.forEach((extraSec) => {
        const extraStaff = extraSec.assignedStaff || []
        if (extraStaff.length > 0 && extraStaff.length < 2) {
          addViolation('ropeMinSetters', 'error',
            `${extraSec.section} at ${gymName} on ${day} requires minimum 2 setters (have ${extraStaff.length})`,
            key, extraStaff)
        }
      })
    }

    // 4. Boulder Exactness
    if (shift.shiftType === SHIFT_TYPES.BOULDER && shift.section && staffIds.length > 0) {
      const sec = getBoulderSection(gymName, shift.section)
      if (sec && staffIds.length !== sec.settersRequired) {
        addViolation('boulderExactSetters', 'error',
          `${shift.section} at ${gymName} requires exactly ${sec.settersRequired} setters (have ${staffIds.length})`,
          key, staffIds)
      }
    }

    // 5 & 6. Spec Setter constraints
    staffIds.forEach((id) => {
      const s = getStaff(id)
      if (!s || s.role !== 'Spec Setter') return
      if (!s.availability.includes(day)) {
        addViolation('specSetterDays', 'error',
          `${s.name} (Spec Setter) is not available on ${day}, assigned at ${gymName}`,
          key, [id])
      }
      if (shift.shiftType === SHIFT_TYPES.ROPE) {
        addViolation('specSetterNoRope', 'error',
          `${s.name} (Spec Setter) cannot do rope setting — only boulder or hold wash (${gymName} ${day})`,
          key, [id])
      }
    })

    // 7. Director/Head Setter cannot be hold washer
    if (shift.holdWasher) {
      const washer = getStaff(shift.holdWasher)
      if (washer && (washer.role === 'Director' || washer.role === 'Head Setter')) {
        addViolation('directorHoldWash', 'error',
          `${washer.name} (${washer.role}) cannot be assigned as hold washer at ${gymName} on ${day}`,
          key, [shift.holdWasher])
      }
      // Hold washer must be available on this day
      if (washer && !washer.availability.includes(day)) {
        addViolation('holdWasherAvailability', 'error',
          `${washer.name} (hold washer) is not available on ${day} at ${gymName}`,
          key, [shift.holdWasher])
      }
    }

    // 7b. Flex hold washer availability check
    if (shift.flexHoldWashers?.length) {
      shift.flexHoldWashers.forEach((id) => {
        const s = getStaff(id)
        if (!s) return
        if (!s.availability.includes(day)) {
          addViolation('holdWasherAvailability', 'error',
            `${s.name} (flex hold washer) is not available on ${day} at ${gymName}`,
            key, [id])
        }
      })
    }

    // 8. Staff Availability
    staffIds.forEach((id) => {
      const s = getStaff(id)
      if (!s) return
      if (!s.availability.includes(day)) {
        addViolation('staffAvailability', 'error',
          `${s.name} is not available on ${day} but assigned to ${gymName}`,
          key, [id])
      }
    })

    // 9. Director Schedule
    staffIds.forEach((id) => {
      const s = getStaff(id)
      if (!s || s.role !== 'Director') return
      if (day !== 'Monday') {
        addViolation('directorSchedule', 'error',
          `${s.name} (Director) should only set on Monday (assigned ${day} at ${gymName})`,
          key, [id])
      }
      if (weekNumber % 2 !== 0) {
        addViolation('directorSchedule', 'error',
          `${s.name} (Director) sets every other Monday — week ${weekNumber} is an odd week`,
          key, [id])
      }
    })
  })

  // ---- RECOMMENDED CONSTRAINTS (warnings) ----

  const hardLimit = C.hardSectionLimit?.value ?? 2
  const washLimit = C.washShiftLimit?.value ?? 1
  const boulderMin = C.boulderMinimum?.value ?? 1
  const ogdenMax = C.ogdenFrequency?.value ?? 1

  STAFF.forEach((s) => {
    const st = staffStats[s.id]
    if (!st || st.totalShifts === 0) return

    if (st.hardSections > hardLimit) {
      addViolation('hardSectionLimit', 'warning',
        `${s.name} has ${st.hardSections} hard sections this week (recommended max ${hardLimit})`,
        null, [s.id])
    }

    if (st.washShifts > washLimit) {
      addViolation('washShiftLimit', 'warning',
        `${s.name} has ${st.washShifts} hold wash shifts this week (recommended max ${washLimit})`,
        null, [s.id])
    }

    if (st.boulderShifts < boulderMin && st.totalShifts > 0 && s.role !== 'Director') {
      addViolation('boulderMinimum', 'warning',
        `${s.name} has ${st.boulderShifts} boulder shift(s) this week (recommended at least ${boulderMin})`,
        null, [s.id])
    }

    if (st.ogdenDays > ogdenMax) {
      // Head setters are exempt at their own gym — they must be there on setting days
      const isHeadSetterAtOgden = s.role === 'Head Setter' && s.gym === 'Ogden'
      if (!isHeadSetterAtOgden) {
        const ogdenKeys = st.assignments.filter((a) => a.gymName === 'Ogden').map((a) => a.key)
        addViolation('ogdenFrequency', 'warning',
          `${s.name} is at Ogden ${st.ogdenDays} days this week (recommended max ${ogdenMax})`,
          ogdenKeys[0] || null, [s.id])
      }
    }
  })

  // 5. Workload Balance
  const activeSetters = STAFF.filter((s) => staffStats[s.id]?.totalShifts > 0)
  if (activeSetters.length > 0) {
    const avg = activeSetters.reduce((sum, s) => sum + staffStats[s.id].totalShifts, 0) / activeSetters.length
    activeSetters.forEach((s) => {
      const st = staffStats[s.id]
      if (st.totalShifts >= avg + 2 && st.totalShifts >= 5) {
        addViolation('workloadBalance', 'warning',
          `${s.name} has ${st.totalShifts} shifts this week — workload may be unbalanced (avg ${avg.toFixed(1)})`,
          null, [s.id])
      }
    })
  }

  // 6. Unassigned setters per day
  // For each work day, check if every available setter is assigned to at least one gym.
  // Severity depends on how many are unassigned: 1-2 = warning, 3+ = error.
  const WORK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday']
  const availData = loadAvailability()

  // First pass: collect unassigned setters per day
  const unassignedPerDay = {}
  WORK_DAYS.forEach((day) => {
    const dayUnassigned = []
    STAFF.forEach((s) => {
      if (!s.availability?.includes(day)) return
      if (s.role === 'Director') {
        if (day !== 'Monday') return
        if (weekNumber % 2 !== 0) return
      }
      const absence = getSetterAbsence(availData, s.id, weekNumber, day)
      if (absence) return

      let isAssigned = false
      GYMS.forEach((gym) => {
        const key = `${gym.name}-${day}`
        const shift = weekSchedule[key]
        if (!shift) return
        if (shift.assignedStaff?.includes(s.id)) isAssigned = true
        if (shift.holdWasher === s.id) isAssigned = true
        if (shift.flexHoldWashers?.includes(s.id)) isAssigned = true
        if (shift.additionalSections?.some((es) => es.assignedStaff?.includes(s.id))) isAssigned = true
      })

      if (!isAssigned) dayUnassigned.push(s)
    })
    unassignedPerDay[day] = dayUnassigned
  })

  // Second pass: create violations with severity based on count
  WORK_DAYS.forEach((day) => {
    const dayUnassigned = unassignedPerDay[day]
    if (dayUnassigned.length === 0) return

    // 1-2 unassigned = warning (acceptable if gym capacity limited)
    // 3+ unassigned = error
    const severity = dayUnassigned.length >= 3 ? 'error' : 'warning'

    dayUnassigned.forEach((s) => {
      const suffix = severity === 'warning' ? ' (capacity limited)' : ' (available)'
      violations.push({
        severity,
        message: `${day}: ${s.name} not assigned${suffix}`,
        shiftKey: null,
        staffIds: [s.id],
        day,
      })
    })
  })

  // ---- Multi-day section setter count validation ----
  Object.entries(weekSchedule).forEach(([key, shift]) => {
    if (!shift?.multiDayProgress || !shift.section) return
    const { gymName } = parseKey(key)
    const sec = (ROPE_SECTIONS[gymName] || DEFAULT_ROPE[gymName] || []).find((s) => s.name === shift.section)
    if (!sec?.specialRules) return

    const rules = parseMultiDayRules(sec.specialRules)
    if (!rules.multiDay) return

    const dayIndex = shift.multiDayProgress.day - 1
    const exactCount = rules.settersPerDay[dayIndex] || rules.settersPerDay[0]
    const setterIds = (shift.assignedStaff || []).filter((id) => id !== shift.holdWasher)

    if (setterIds.length > exactCount) {
      violations.push({
        severity: 'error',
        message: `${shift.section} Day ${shift.multiDayProgress.day}: ${setterIds.length} setters assigned, should be exactly ${exactCount}`,
        shiftKey: key,
        staffIds: setterIds,
      })
    }
  })

  // ---- Partial rope completion warnings ----
  // Check for rope shifts with partial anchor completion (some done, some remaining)
  // Also auto-detect partials based on setter count vs anchor count
  // Skip sections with special rules — they follow their own completion logic
  Object.entries(weekSchedule).forEach(([key, shift]) => {
    if (!shift?.section || shift.shiftType !== SHIFT_TYPES.ROPE) return
    if (!shift.assignedStaff?.length) return
    const { gymName, day } = parseKey(key)
    const sectionDef = ROPE_SECTIONS[gymName]?.find((s) => s.name === shift.section)
    if (!sectionDef?.anchors?.length) return

    // Sections with special rules bypass partial tracking entirely
    if (sectionDef.specialRules) return

    const completed = shift.completedAnchors || []
    if (completed.length > 0 && completed.length < sectionDef.anchors.length) {
      const remaining = sectionDef.anchors.filter((a) => !completed.includes(a))
      violations.push({
        severity: 'warning',
        message: `${shift.section} at ${gymName} on ${day}: ${completed.length}/${sectionDef.anchors.length} anchors complete — anchors ${remaining.join(', ')} remaining`,
        shiftKey: key,
        staffIds: shift.assignedStaff,
      })
    } else if (completed.length === 0) {
      // Auto-detect: if fewer setters (excluding hold washer) than anchors, it's an implicit partial
      const effectiveSetters = shift.assignedStaff.filter((id) => id !== shift.holdWasher).length
      if (effectiveSetters > 0 && effectiveSetters < sectionDef.anchors.length) {
        const pct = Math.round((effectiveSetters / sectionDef.anchors.length) * 100)
        violations.push({
          severity: 'warning',
          message: `${shift.section} at ${gymName} on ${day}: ${effectiveSetters} setter${effectiveSetters !== 1 ? 's' : ''} for ${sectionDef.anchors.length} anchors — estimated ${pct}% completion`,
          shiftKey: key,
          staffIds: shift.assignedStaff,
          type: 'auto_partial_completion',
        })
      }
    }
  })

  return violations
}

/**
 * Build a lookup of shiftKey -> violations for that shift.
 */
export function buildViolationMap(violations) {
  const map = {}
  violations.forEach((v) => {
    if (v.shiftKey) {
      if (!map[v.shiftKey]) map[v.shiftKey] = []
      map[v.shiftKey].push(v)
    }
  })
  return map
}
