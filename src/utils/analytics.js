import { STAFF } from '../data/staff'
import { GYMS } from '../data/gyms'
import { BOULDER_SECTIONS, ROPE_SECTIONS } from '../data/sections'
import { loadSectionAges, getEffectiveAge } from '../data/section-ages'

const SHIFT_TYPES = {
  BOULDER: 'Boulder Setting',
  ROPE: 'Rope Setting',
}

function parseKey(key) {
  const idx = key.lastIndexOf('-')
  return { gymName: key.slice(0, idx), day: key.slice(idx + 1) }
}

function getSectionDifficulty(gymName, sectionName, shiftType) {
  if (!sectionName) return null
  const pool =
    shiftType === SHIFT_TYPES.BOULDER
      ? BOULDER_SECTIONS[gymName]
      : ROPE_SECTIONS[gymName]
  return pool?.find((s) => s.name === sectionName)?.difficulty || null
}

/**
 * Analyze a single week's schedule and return per-setter stats.
 * Returns { [staffId]: { name, role, totalShifts, boulderShifts, ropeShifts, hardSections, washShifts, ogdenDays, gyms } }
 */
export function analyzeWeeklyAssignments(weekSchedule) {
  const stats = {}

  STAFF.forEach((s) => {
    stats[s.id] = {
      id: s.id,
      name: s.name,
      role: s.role,
      totalShifts: 0,
      boulderShifts: 0,
      ropeShifts: 0,
      hardSections: 0,
      washShifts: 0,
      ogdenDays: 0,
      gyms: {},
    }
  })

  if (!weekSchedule) return stats

  Object.entries(weekSchedule).forEach(([key, shift]) => {
    if (!shift) return
    const { gymName } = parseKey(key)
    const difficulty = getSectionDifficulty(gymName, shift.section, shift.shiftType)

    if (shift.assignedStaff?.length) {
      shift.assignedStaff.forEach((id) => {
        if (!stats[id]) return
        const st = stats[id]
        st.totalShifts++
        st.gyms[gymName] = (st.gyms[gymName] || 0) + 1
        if (shift.shiftType === SHIFT_TYPES.BOULDER) st.boulderShifts++
        if (shift.shiftType === SHIFT_TYPES.ROPE) st.ropeShifts++
        if (difficulty === 'hard') st.hardSections++
        if (gymName === 'Ogden') st.ogdenDays++
      })
    }

    if (shift.holdWasher && stats[shift.holdWasher]) {
      stats[shift.holdWasher].washShifts++
    }
    if (shift.flexHoldWashers) {
      shift.flexHoldWashers.forEach((id) => {
        if (!stats[id]) return
        // Skip if already counted as holdWasher on this shift
        if (id === shift.holdWasher) return
        stats[id].washShifts++
        stats[id].totalShifts++
        stats[id].gyms[gymName] = (stats[id].gyms[gymName] || 0) + 1
      })
    }

    // Count staff from additional sections
    if (shift.additionalSections?.length) {
      shift.additionalSections.forEach((extraSec) => {
        const extraDifficulty = getSectionDifficulty(gymName, extraSec.section, shift.shiftType)
        ;(extraSec.assignedStaff || []).forEach((id) => {
          if (!stats[id]) return
          const st = stats[id]
          st.totalShifts++
          st.gyms[gymName] = (st.gyms[gymName] || 0) + 1
          if (shift.shiftType === SHIFT_TYPES.ROPE) st.ropeShifts++
          if (extraDifficulty === 'hard') st.hardSections++
          if (gymName === 'Ogden') st.ogdenDays++
        })
      })
    }
  })

  return stats
}

/**
 * Check if a rope section has special rules (multi-day, manual only, etc.)
 * that should bypass automatic partial completion tracking.
 */
export function hasSpecialRules(sectionDef) {
  return !!(sectionDef?.specialRules)
}

/**
 * Auto-calculate partial rope section completion based on setters assigned.
 * Each setter can reset approximately one anchor per shift.
 * Sections with special rules bypass partial tracking entirely.
 *
 * @param {number} setterCount - number of setters assigned (excluding hold washer)
 * @param {object} sectionDef - rope section definition with .anchors array
 * @param {number[]} [existingCompleted] - anchor numbers already completed in previous shifts
 * @returns {{ isComplete, isPartial, completedAnchors, remainingAnchors, completedAnchorList, remainingAnchorList, completionPercentage, newlyCompleted, previouslyCompleted, hasSpecialRules }}
 */
export function calculatePartialCompletion(setterCount, sectionDef, existingCompleted) {
  if (!sectionDef?.anchors?.length) {
    return { isComplete: true, isPartial: false }
  }

  // Sections with special rules bypass partial tracking — they follow their own rules
  if (hasSpecialRules(sectionDef)) {
    return {
      isComplete: true,
      isPartial: false,
      hasSpecialRules: true,
      specialRules: sectionDef.specialRules,
      completedAnchors: sectionDef.anchors.length,
      remainingAnchors: 0,
      completedAnchorList: [...sectionDef.anchors],
      remainingAnchorList: [],
      newlyCompleted: [...sectionDef.anchors],
      previouslyCompleted: [],
      completionPercentage: 100,
    }
  }

  const totalAnchors = sectionDef.anchors.length
  const previouslyCompleted = existingCompleted?.length ? [...existingCompleted] : []
  const previousSet = new Set(previouslyCompleted)

  // Determine which anchors still need to be set
  const remaining = sectionDef.anchors.filter((a) => !previousSet.has(a))

  if (setterCount <= 0) {
    return {
      isComplete: remaining.length === 0,
      isPartial: previouslyCompleted.length > 0 && remaining.length > 0,
      completedAnchors: previouslyCompleted.length,
      remainingAnchors: remaining.length,
      completedAnchorList: previouslyCompleted,
      remainingAnchorList: remaining,
      newlyCompleted: [],
      previouslyCompleted,
    }
  }

  // Assign ALL remaining anchors — setters split them evenly (some do multiple)
  const newlyCompleted = [...remaining]
  const allCompleted = [...previouslyCompleted, ...newlyCompleted].sort((a, b) => a - b)
  const stillRemaining = sectionDef.anchors.filter((a) => !allCompleted.includes(a))

  const isComplete = stillRemaining.length === 0

  return {
    isComplete,
    isPartial: !isComplete && allCompleted.length > 0,
    completedAnchors: allCompleted.length,
    remainingAnchors: stillRemaining.length,
    completedAnchorList: allCompleted,
    remainingAnchorList: stillRemaining,
    newlyCompleted,
    previouslyCompleted,
    completionPercentage: Math.round((allCompleted.length / totalAnchors) * 100),
  }
}

/**
 * Get the number of effective setters for a shift (excludes hold washer).
 */
export function getEffectiveSetterCount(assignedStaff, holdWasher) {
  if (!assignedStaff?.length) return 0
  return assignedStaff.filter((id) => id !== holdWasher).length
}

/**
 * Assign specific anchors to individual setters.
 * Returns per-setter mappings showing which anchors each setter is responsible for.
 *
 * @param {number[]} assignedStaff - staff IDs assigned to this shift
 * @param {number|null} holdWasher - hold washer ID (excluded from anchor assignments)
 * @param {object} sectionDef - rope section definition with .anchors array
 * @param {number[]} [existingCompleted] - anchor numbers already completed previously
 * @returns {{ setterAssignments: Array<{setterId, anchors}>, newlyCompleted, previouslyCompleted, allCompleted, remaining, isComplete, isPartial }}
 */
export function assignAnchorsToSetters(assignedStaff, holdWasher, sectionDef, existingCompleted) {
  if (!sectionDef?.anchors?.length || !assignedStaff?.length) {
    return { setterAssignments: [], newlyCompleted: [], previouslyCompleted: existingCompleted || [], allCompleted: existingCompleted || [], remaining: sectionDef?.anchors || [], isComplete: false, isPartial: false }
  }

  // Sections with special rules don't use per-anchor tracking
  if (hasSpecialRules(sectionDef)) {
    return { setterAssignments: [], newlyCompleted: [...sectionDef.anchors], previouslyCompleted: [], allCompleted: [...sectionDef.anchors], remaining: [], isComplete: true, isPartial: false, hasSpecialRules: true }
  }

  const previouslyCompleted = existingCompleted?.length ? [...existingCompleted] : []
  const previousSet = new Set(previouslyCompleted)
  const remaining = sectionDef.anchors.filter((a) => !previousSet.has(a))

  // Get effective setters (exclude hold washer)
  const setters = assignedStaff.filter((id) => id !== holdWasher)
  if (setters.length === 0) {
    return { setterAssignments: [], newlyCompleted: [], previouslyCompleted, allCompleted: previouslyCompleted, remaining, isComplete: remaining.length === 0, isPartial: previouslyCompleted.length > 0 && remaining.length > 0 }
  }

  // Distribute ALL remaining anchors across setters evenly (floor + remainder)
  const setterAssignments = setters.map((id) => ({ setterId: id, anchors: [] }))

  remaining.forEach((anchor, i) => {
    // Round-robin assignment distributes all anchors
    setterAssignments[i % setters.length].anchors.push(anchor)
  })

  const newlyCompleted = [...remaining]
  const allCompleted = [...previouslyCompleted, ...newlyCompleted].sort((a, b) => a - b)
  const stillRemaining = sectionDef.anchors.filter((a) => !allCompleted.includes(a))

  return {
    setterAssignments,
    newlyCompleted,
    previouslyCompleted,
    allCompleted,
    remaining: stillRemaining,
    isComplete: stillRemaining.length === 0,
    isPartial: stillRemaining.length > 0 && allCompleted.length > 0,
  }
}

/**
 * Auto-populate completedAnchors array based on setter count.
 * Returns the anchor numbers that would be completed in THIS shift (newly assigned only).
 * @param {number[]} assignedStaff
 * @param {number|null} holdWasher
 * @param {object} sectionDef
 * @param {number[]} [existingCompleted] - anchors already completed from previous partial work
 */
export function autoPopulateCompletedAnchors(assignedStaff, holdWasher, sectionDef, existingCompleted) {
  const setterCount = getEffectiveSetterCount(assignedStaff, holdWasher)
  const completion = calculatePartialCompletion(setterCount, sectionDef, existingCompleted)
  return completion.newlyCompleted || []
}

/**
 * Compute rotation tracking from schedule history.
 * Scans all weeks up to and including currentWeek to find the last week each section was set.
 * Returns { [gymName]: { boulderResets: { [sectionName]: lastWeek }, ropeResets: { [sectionName]: lastWeek } } }
 */
export function computeRotationTracking(scheduleHistory, currentWeek) {
  const tracking = {}

  GYMS.forEach((gym) => {
    tracking[gym.name] = {
      boulderResets: {},
      ropeResets: {},
    }
    // Initialize all sections to null (never set)
    BOULDER_SECTIONS[gym.name]?.forEach((sec) => {
      tracking[gym.name].boulderResets[sec.name] = null
    })
    ROPE_SECTIONS[gym.name]?.forEach((sec) => {
      tracking[gym.name].ropeResets[sec.name] = null
    })
  })

  // Track partial rope completions: { [gymName]: { [sectionName]: { week, completedAnchors, totalAnchors } } }
  const partialCompletions = {}
  GYMS.forEach((gym) => {
    partialCompletions[gym.name] = {}
  })

  // Scan history up to currentWeek
  for (let w = 0; w <= currentWeek; w++) {
    const week = scheduleHistory[w]
    if (!week) continue

    Object.entries(week).forEach(([key, shift]) => {
      if (!shift?.section || !shift.assignedStaff?.length) return
      const { gymName } = parseKey(key)
      if (!tracking[gymName]) return

      // Helper to process a rope section reset — accumulates across partial weeks
      const processRopeReset = (sectionName, completed) => {
        const sectionDef = ROPE_SECTIONS[gymName]?.find((s) => s.name === sectionName)
        const totalAnchors = sectionDef?.anchors?.length || 0

        // Sections with special rules always count as full resets — no partial tracking
        if (hasSpecialRules(sectionDef)) {
          tracking[gymName].ropeResets[sectionName] = w
          delete partialCompletions[gymName][sectionName]
          return
        }

        if (totalAnchors === 0 || completed.length === 0) {
          // No anchors tracked — treat as full reset if staff were assigned
          tracking[gymName].ropeResets[sectionName] = w
          delete partialCompletions[gymName][sectionName]
          return
        }

        // Merge with existing partial progress
        const existing = partialCompletions[gymName][sectionName]
        const previousAnchors = existing?.completedAnchors || []
        const mergedSet = new Set([...previousAnchors, ...completed])
        const allCompleted = sectionDef.anchors.filter((a) => mergedSet.has(a))

        if (allCompleted.length >= totalAnchors) {
          // Fully complete now
          tracking[gymName].ropeResets[sectionName] = w
          delete partialCompletions[gymName][sectionName]
        } else {
          // Still partial — store accumulated progress
          partialCompletions[gymName][sectionName] = {
            week: w,
            completedAnchors: allCompleted,
            totalAnchors,
            startedWeek: existing?.startedWeek || w,
          }
        }
      }

      if (shift.shiftType === SHIFT_TYPES.BOULDER) {
        tracking[gymName].boulderResets[shift.section] = w
      } else if (shift.shiftType === SHIFT_TYPES.ROPE) {
        processRopeReset(shift.section, shift.completedAnchors || [])

        // Track additional sections too
        if (shift.additionalSections?.length) {
          shift.additionalSections.forEach((extraSec) => {
            if (extraSec.section && extraSec.assignedStaff?.length) {
              processRopeReset(extraSec.section, extraSec.completedAnchors || [])
            }
          })
        }
      }
    })
  }

  tracking._partialCompletions = partialCompletions
  return tracking
}

/**
 * Build rotation status entries for display.
 * Respects manual age overrides from section-ages data.
 * Returns array of { gymName, sectionName, type, rotationGoal, weeksSinceReset, lastReset, overdue, isManual }
 */
export function getRotationStatus(rotationTracking, currentWeek) {
  const entries = []
  const manualAges = loadSectionAges()

  GYMS.forEach((gym) => {
    const gt = rotationTracking[gym.name]
    if (!gt) return

    // Boulder sections
    BOULDER_SECTIONS[gym.name]?.forEach((sec) => {
      const autoLastReset = gt.boulderResets[sec.name]
      const effective = getEffectiveAge(manualAges, gym.name, 'boulder', sec.name, autoLastReset, currentWeek)
      entries.push({
        gymName: gym.name,
        sectionName: sec.name,
        type: 'boulder',
        rotationGoal: gym.boulderRotationWeeks,
        weeksSinceReset: effective.weeksOld,
        lastReset: effective.lastResetWeek,
        overdue: effective.weeksOld != null && effective.weeksOld >= gym.boulderRotationWeeks,
        isManual: effective.isManual,
      })
    })

    // Rope sections
    ROPE_SECTIONS[gym.name]?.forEach((sec) => {
      if (sec.specialRules?.includes('manual only')) return
      const autoLastReset = gt.ropeResets[sec.name]
      const goal = sec.autobelay ? 5 : gym.ropeRotationWeeks
      const effective = getEffectiveAge(manualAges, gym.name, 'rope', sec.name, autoLastReset, currentWeek)
      entries.push({
        gymName: gym.name,
        sectionName: sec.name,
        type: sec.autobelay ? 'autobelay' : 'rope',
        rotationGoal: goal,
        weeksSinceReset: effective.weeksOld,
        lastReset: effective.lastResetWeek,
        overdue: effective.weeksOld != null && effective.weeksOld >= goal,
        isManual: effective.isManual,
      })
    })
  })

  return entries
}
