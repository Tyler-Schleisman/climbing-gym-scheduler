import { STAFF } from '../data/staff'
import { GYMS } from '../data/gyms'
import { BOULDER_SECTIONS, ROPE_SECTIONS } from '../data/sections'
import { selectSectionsForWeek } from './section-selection'
import { loadAvailability, getSetterAbsence } from '../data/availability-overrides'
import { loadPreferences, getPreferenceScore } from '../data/setter-preferences'
import { autoPopulateCompletedAnchors, assignAnchorsToSetters } from './analytics'
import { parseMultiDayRules as _parseMultiDayRules, getConsecutiveDays as _getConsecutiveDays } from './multi-day-helpers'

// Re-export from multi-day-helpers so existing imports from auto-scheduler still work
export const parseMultiDayRules = _parseMultiDayRules
export const getConsecutiveDays = _getConsecutiveDays

const SHIFT_TYPES = {
  BOULDER: 'Boulder Setting',
  ROPE: 'Rope Setting',
}

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

/**
 * Auto-calculate completedAnchors for a rope shift based on setter count.
 * Returns the newly completed anchor numbers (not cumulative — just this shift).
 * @param {string} gymName
 * @param {string} sectionName
 * @param {number[]} assignedStaff
 * @param {number|null} holdWasher
 * @param {number[]} [existingCompleted] - anchors already done from prior partial work
 */
function computeRopeAnchors(gymName, sectionName, assignedStaff, holdWasher, existingCompleted) {
  if (!sectionName) return []
  const secDef = ROPE_SECTIONS[gymName]?.find((s) => s.name === sectionName)
  // Sections with special rules skip per-anchor tracking
  if (secDef?.specialRules) return []
  return autoPopulateCompletedAnchors(assignedStaff || [], holdWasher, secDef, existingCompleted)
}

/**
 * Build anchorAssignments for a rope shift showing per-setter anchor mapping.
 */
function buildAnchorAssignments(gymName, sectionName, assignedStaff, holdWasher, existingCompleted) {
  if (!sectionName) return undefined
  const secDef = ROPE_SECTIONS[gymName]?.find((s) => s.name === sectionName)
  if (!secDef?.anchors?.length) return undefined
  // Sections with special rules skip per-anchor assignments
  if (secDef.specialRules) return undefined
  const result = assignAnchorsToSetters(assignedStaff || [], holdWasher, secDef, existingCompleted)
  if (!result.setterAssignments?.length) return undefined
  return result
}

// ---------------------------------------------------------------------------
// Week-context helpers — extract stats from in-progress schedule
// ---------------------------------------------------------------------------

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
 * Build a lightweight stats object for every staff member from the
 * current (in-progress) week schedule.
 */
export function buildWeekContext(weekSchedule) {
  const ctx = {}
  STAFF.forEach((s) => {
    ctx[s.id] = {
      totalShifts: 0,
      boulderShifts: 0,
      hardSections: 0,
      washShifts: 0,
      ogdenDays: 0,
      assignedKeys: [],
    }
  })

  if (!weekSchedule) return ctx

  Object.entries(weekSchedule).forEach(([key, shift]) => {
    if (!shift) return
    const { gymName } = parseKey(key)
    const difficulty = getSectionDifficulty(gymName, shift.section, shift.shiftType)

    if (shift.assignedStaff?.length) {
      shift.assignedStaff.forEach((id) => {
        if (!ctx[id]) return
        const c = ctx[id]
        c.totalShifts++
        c.assignedKeys.push(key)
        if (shift.shiftType === SHIFT_TYPES.BOULDER) c.boulderShifts++
        if (difficulty === 'hard') c.hardSections++
        if (gymName === 'Ogden') c.ogdenDays++
      })
    }

    if (shift.holdWasher && ctx[shift.holdWasher]) {
      ctx[shift.holdWasher].washShifts++
      // Track holdWasher as busy on this day so they're not assigned elsewhere
      if (!shift.assignedStaff?.includes(shift.holdWasher)) {
        ctx[shift.holdWasher].totalShifts++
        if (!ctx[shift.holdWasher].assignedKeys.includes(key)) {
          ctx[shift.holdWasher].assignedKeys.push(key)
        }
      }
    }
    if (shift.flexHoldWashers) {
      shift.flexHoldWashers.forEach((id) => {
        if (!ctx[id]) return
        // Skip if already counted as holdWasher on this shift
        if (id === shift.holdWasher) return
        ctx[id].washShifts++
        ctx[id].totalShifts++
        if (!ctx[id].assignedKeys.includes(key)) ctx[id].assignedKeys.push(key)
      })
    }

    // Count staff from additional sections
    if (shift.additionalSections?.length) {
      shift.additionalSections.forEach((extraSec) => {
        const extraDifficulty = getSectionDifficulty(gymName, extraSec.section, shift.shiftType)
        ;(extraSec.assignedStaff || []).forEach((id) => {
          if (!ctx[id]) return
          const c = ctx[id]
          c.totalShifts++
          if (!c.assignedKeys.includes(key)) c.assignedKeys.push(key)
          if (shift.shiftType === SHIFT_TYPES.BOULDER) c.boulderShifts++
          if (extraDifficulty === 'hard') c.hardSections++
          if (gymName === 'Ogden') c.ogdenDays++
        })
      })
    }
  })

  return ctx
}

// ---------------------------------------------------------------------------
// Per-setter stat helpers
// ---------------------------------------------------------------------------

export function needsBoulderShift(setterId, weekCtx) {
  return (weekCtx[setterId]?.boulderShifts || 0) === 0
}

export function hasWorkedOgden(setterId, weekCtx) {
  return (weekCtx[setterId]?.ogdenDays || 0) > 0
}

export function getHardSectionCount(setterId, weekCtx) {
  return weekCtx[setterId]?.hardSections || 0
}

export function getWashShiftCount(setterId, weekCtx) {
  return weekCtx[setterId]?.washShifts || 0
}

export function getTotalShifts(setterId, weekCtx) {
  return weekCtx[setterId]?.totalShifts || 0
}

export function getOgdenDays(setterId, weekCtx) {
  return weekCtx[setterId]?.ogdenDays || 0
}

// ---------------------------------------------------------------------------
// Hard-constraint check
// ---------------------------------------------------------------------------

export function violatesHardConstraints(setter, shift, weekNumber) {
  const { day, gym: gymName, shiftType } = shift

  if (!setter.availability.includes(day)) {
    return `Not available on ${day}`
  }

  if (setter.role === 'Spec Setter') {
    if (shiftType === SHIFT_TYPES.ROPE) return 'Spec setters cannot do rope setting'
  }

  if (setter.role === 'Director') {
    if (day !== 'Monday') return 'Director only sets on Monday'
    if (weekNumber % 2 !== 0) return 'Director sets every other Monday (even weeks)'
  }

  if (setter.role === 'Head Setter') {
    // Head setter must be at their gym on any day it has setting
    if (setter.gym !== gymName) {
      const homeGym = GYMS.find((g) => g.name === setter.gym)
      const homeHasSetting = homeGym && (
        homeGym.boulderDays?.includes(day) ||
        homeGym.ropeDays?.includes(day) ||
        homeGym.flexDays?.includes(day)
      )
      if (homeHasSetting) {
        return `Head setter for ${setter.gym} — ${setter.gym} has setting on ${day}`
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Setter scoring (with per-call memoization)
// ---------------------------------------------------------------------------

// Cache for calculateSetterScore — keyed on setter+shift+context fingerprint.
// Cleared at the start of each scheduling run via resetScoreCache().
let _scoreCache = new Map()

export function resetScoreCache() {
  _scoreCache = new Map()
}

function buildScoreCacheKey(setterId, shift, weekCtx, options) {
  const ctx = weekCtx[setterId]
  // The context fields that affect scoring — compact fingerprint
  return `${setterId}|${shift.shiftType}|${shift.gym}|${shift.difficulty || ''}|${ctx?.totalShifts ?? 0}|${ctx?.boulderShifts ?? 0}|${ctx?.hardSections ?? 0}|${ctx?.washShifts ?? 0}|${ctx?.ogdenDays ?? 0}|${options.prioritizeWorkloadBalance !== false ? 1 : 0}|${options.minimizeOgdenFrequency !== false ? 1 : 0}`
}

export function calculateSetterScore(setter, shift, weekCtx, options = {}) {
  const cacheKey = buildScoreCacheKey(setter.id, shift, weekCtx, options)
  const cached = _scoreCache.get(cacheKey)
  if (cached) return cached

  let score = 100
  const breakdown = []
  const id = setter.id

  const workloadBalance = options.prioritizeWorkloadBalance !== false
  const minimizeOgden = options.minimizeOgdenFrequency !== false

  // Bonuses
  if (shift.shiftType === SHIFT_TYPES.BOULDER && needsBoulderShift(id, weekCtx)) {
    score += 30; breakdown.push('+30 needs boulder')
  }
  const isHeadSetterAtOgden = setter.role === 'Head Setter' && setter.gym === 'Ogden'
  if (minimizeOgden && shift.gym !== 'Ogden' && hasWorkedOgden(id, weekCtx) && !isHeadSetterAtOgden) {
    score += 20; breakdown.push('+20 already did Ogden')
  }
  if (getWashShiftCount(id, weekCtx) === 0) {
    score += 15; breakdown.push('+15 no wash yet')
  }
  if (setter.role === 'Spec Setter' && shift.shiftType === SHIFT_TYPES.BOULDER) {
    score += 25; breakdown.push('+25 spec setter on boulder')
  }

  // Penalties
  if (workloadBalance && getHardSectionCount(id, weekCtx) >= 2) {
    score -= 40; breakdown.push('-40 hard sections >= 2')
  } else if (!workloadBalance && getHardSectionCount(id, weekCtx) >= 2) {
    score -= 10; breakdown.push('-10 hard sections >= 2 (relaxed)')
  }
  if (getWashShiftCount(id, weekCtx) >= 1) {
    score -= 30; breakdown.push('-30 already has wash')
  }
  if (workloadBalance && getTotalShifts(id, weekCtx) >= 4) {
    score -= 20; breakdown.push('-20 total shifts >= 4')
  } else if (!workloadBalance && getTotalShifts(id, weekCtx) >= 4) {
    score -= 5; breakdown.push('-5 total shifts >= 4 (relaxed)')
  }
  if (minimizeOgden && shift.gym === 'Ogden' && getOgdenDays(id, weekCtx) >= 1 && !isHeadSetterAtOgden) {
    score -= 50; breakdown.push('-50 Ogden again')
  }

  // Difficulty balancing
  if (workloadBalance && shift.difficulty === 'hard') {
    const hardPenalty = getHardSectionCount(id, weekCtx) * 15
    if (hardPenalty > 0) {
      score -= hardPenalty; breakdown.push(`-${hardPenalty} hard-section load`)
    }
  }

  // Setter preferences (low-priority tie-breaker, -5 to +5)
  const allPrefs = loadPreferences()
  const prefBonus = getPreferenceScore(allPrefs, id, shift.gym, shift.section, shift.difficulty)
  if (prefBonus !== 0) {
    score += prefBonus; breakdown.push(`${prefBonus > 0 ? '+' : ''}${prefBonus} preference`)
  }

  const result = { score, breakdown }
  _scoreCache.set(cacheKey, result)
  return result
}

// ---------------------------------------------------------------------------
// Best-setter selection
// ---------------------------------------------------------------------------

export function selectBestSetters(
  { count, day, gym, shiftType, difficulty },
  weekCtx,
  weekNumber,
  alreadyAssigned = [],
  options = {},
) {
  const log = []
  const shift = { day, gym, shiftType, difficulty }

  // Load availability overrides once per call
  const availData = loadAvailability()

  const available = STAFF.filter((s) => s.availability.includes(day))
  const excluded = new Set(alreadyAssigned)
  const eligible = []

  available.forEach((s) => {
    if (excluded.has(s.id)) return

    // Check availability overrides (sick, vacation, personal, recurring)
    const absence = getSetterAbsence(availData, s.id, weekNumber, day)
    if (absence) {
      const typeLabel = absence.type.charAt(0).toUpperCase() + absence.type.slice(1)
      log.push(`  SKIP ${s.name}: ${typeLabel}${absence.notes ? ' — ' + absence.notes : ''}`)
      return
    }

    const violation = violatesHardConstraints(s, shift, weekNumber)
    if (violation) { log.push(`  SKIP ${s.name}: ${violation}`); return }

    const ctx = weekCtx[s.id]
    if (ctx) {
      const busyOnDay = ctx.assignedKeys.some((k) => {
        const { day: kDay, gymName: kGym } = parseKey(k)
        return kDay === day && kGym !== gym
      })
      if (busyOnDay) { log.push(`  SKIP ${s.name}: already at another gym on ${day}`); return }
    }

    eligible.push(s)
  })

  const scored = eligible.map((s) => {
    const { score, breakdown } = calculateSetterScore(s, shift, weekCtx, options)
    return { setter: s, score, breakdown }
  })

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aShifts = getTotalShifts(a.setter.id, weekCtx)
    const bShifts = getTotalShifts(b.setter.id, weekCtx)
    if (aShifts !== bShifts) return aShifts - bShifts
    return a.setter.name.localeCompare(b.setter.name)
  })

  const selected = scored.slice(0, count)

  console.group(
    `[selectBestSetters] ${gym} ${day} ${shiftType} (need ${count}, ${eligible.length} eligible)`
  )
  scored.forEach((s, i) => {
    const picked = i < count ? '>>>' : '   '
    console.log(
      `${picked} ${s.setter.name.padEnd(10)} score=${String(s.score).padStart(4)}  [${s.breakdown.join(', ')}]`
    )
  })
  if (log.length > 0) { console.log('Skipped:'); log.forEach((l) => console.log(l)) }
  console.groupEnd()

  return { selected: selected.map((s) => s.setter), log }
}

// ---------------------------------------------------------------------------
// Multi-day section helpers
// ---------------------------------------------------------------------------

// parseMultiDayRules, getConsecutiveDays — see multi-day-helpers.js (re-exported above)

/**
 * Schedule a multi-day section across consecutive days.
 * Mutates `schedule` and `weekCtx` in place.
 */
function scheduleMultiDaySection(section, startDay, gymName, schedule, weekCtx, weekNumber, notes, options = {}) {
  const rules = parseMultiDayRules(section.specialRules)
  if (!rules.multiDay) return false

  const days = getConsecutiveDays(startDay, rules.numDays, gymName)
  if (days.length < rules.numDays) {
    console.warn(
      `[Multi-day] Cannot find ${rules.numDays} consecutive days for "${section.name}" starting ${startDay} at ${gymName} (only got ${days.length})`
    )
    return false // Don't partially schedule multi-day sections
  }

  console.group(`[Multi-day] "${section.name}" at ${gymName}: ${days.length} day(s)`)

  days.forEach((day, index) => {
    const setterCount = rules.settersPerDay[index] || rules.settersPerDay[0]
    const key = `${gymName}-${day}`

    // Head setter for this gym is mandatory when gym has setting
    const headSetter = STAFF.find(
      (s) => s.role === 'Head Setter' && s.gym === gymName
    )
    const mandatoryIds = []
    if (headSetter && headSetter.availability.includes(day)) {
      mandatoryIds.push(headSetter.id)
    }

    // Select remaining setters
    const remaining = Math.max(0, setterCount - mandatoryIds.length)
    const { selected } = selectBestSetters(
      {
        count: remaining,
        day,
        gym: gymName,
        shiftType: SHIFT_TYPES.ROPE,
        difficulty: section.difficulty,
      },
      weekCtx,
      weekNumber,
      mandatoryIds,
      options,
    )

    // Enforce exact setter count — never exceed the specified number
    const allIds = [...mandatoryIds, ...selected.map((s) => s.id)].slice(0, setterCount)

    schedule[key] = {
      shiftType: SHIFT_TYPES.ROPE,
      section: section.name,
      assignedStaff: allIds,
      holdWasher: null,
      notes: `${section.name} — Day ${index + 1} of ${rules.numDays}${notes ? ` | ${notes}` : ''}`,
      completedAnchors: computeRopeAnchors(gymName, section.name, allIds, null),
      anchorAssignments: buildAnchorAssignments(gymName, section.name, allIds, null),
      multiDayProgress: { day: index + 1, total: rules.numDays },
    }

    // Update weekCtx for subsequent assignments
    allIds.forEach((id) => {
      if (!weekCtx[id]) return
      weekCtx[id].totalShifts++
      weekCtx[id].assignedKeys.push(key)
      if (section.difficulty === 'hard') weekCtx[id].hardSections++
      if (gymName === 'Ogden') weekCtx[id].ogdenDays++
    })

    console.log(
      `  Day ${index + 1} (${day}): ${allIds.length} setters → [${allIds.map((id) => STAFF.find((s) => s.id === id)?.name).join(', ')}]`
    )
  })

  console.groupEnd()
  return true
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Auto-schedule an entire week. Returns the proposed week schedule object.
 *
 * @param {object} scheduleHistory - full history (used for rotation tracking)
 * @param {number} weekNumber      - week to schedule
 * @returns {{ schedule: object, warnings: string[] }}
 */
export function autoScheduleWeek(scheduleHistory, weekNumber, options = {}) {
  resetScoreCache()
  const schedule = {}
  const warnings = []
  let weekCtx = buildWeekContext(null) // start empty

  console.group(`[Auto-Schedule] Week ${weekNumber}`)

  // ===== STEP 1: Mandatory assignments (head setters + director) =====
  console.group('Step 1: Mandatory assignments')

  const headSetters = STAFF.filter((s) => s.role === 'Head Setter')
  const director = STAFF.find((s) => s.role === 'Director')
  const isEvenWeek = weekNumber % 2 === 0

  headSetters.forEach((hs) => {
    const gym = GYMS.find((g) => g.name === hs.gym)
    if (!gym) return

    // Head setter MUST be at their gym on any day it has setting
    const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const daysAtGym = allDays.filter((day) => {
      if (!hs.availability.includes(day)) return false
      // Only assign on days when setting actually occurs
      return (
        gym.boulderDays?.includes(day) ||
        gym.ropeDays?.includes(day) ||
        gym.flexDays?.includes(day)
      )
    })

    daysAtGym.forEach((day) => {
      const key = `${hs.gym}-${day}`
      if (!schedule[key]) {
        schedule[key] = {
          shiftType: null, // will be set in steps 3/4
          section: null,
          assignedStaff: [],
          holdWasher: null,
          notes: '',
          completedAnchors: [],
          multiDayProgress: null,
        }
      }
      if (!schedule[key].assignedStaff.includes(hs.id)) {
        schedule[key].assignedStaff.push(hs.id)
        console.log(`  ${hs.name} → ${hs.gym} ${day}`)
      }
    })
  })

  // Director on even-week Monday
  if (director && isEvenWeek) {
    // Pick the Monday gym that could use extra help — prefer Ogden or SLC (boulder day)
    const mondayGyms = GYMS.filter(
      (g) => g.boulderDays?.includes('Monday') || g.flexDays?.includes('Monday')
    )
    if (mondayGyms.length > 0) {
      // Assign to the first boulder-day gym (Ogden, then SLC)
      const targetGym = mondayGyms[0].name
      const key = `${targetGym}-Monday`
      if (!schedule[key]) {
        schedule[key] = {
          shiftType: null,
          section: null,
          assignedStaff: [],
          holdWasher: null,
          notes: '',
          completedAnchors: [],
          multiDayProgress: null,
        }
      }
      if (!schedule[key].assignedStaff.includes(director.id)) {
        schedule[key].assignedStaff.push(director.id)
        console.log(`  ${director.name} (Director) → ${targetGym} Monday (even week ${weekNumber})`)
      }
    }
  }

  // Rebuild context after mandatory placements
  weekCtx = buildWeekContext(schedule)
  console.groupEnd()

  // ===== STEP 2: Section selection =====
  // Pass rotationOverrides through if provided (used by extended scheduler)
  const sectionOptions = { ...options }
  if (options.rotationOverrides) {
    sectionOptions.rotationOverrides = options.rotationOverrides
  }
  const sectionPicks = selectSectionsForWeek(scheduleHistory, weekNumber, sectionOptions)

  // ===== STEP 3: Boulder days =====
  console.group('Step 3: Boulder day assignments')

  GYMS.forEach((gym) => {
    if (!gym.boulderDays?.length) return
    const boulderSection = sectionPicks[gym.name]?.boulder
    if (!boulderSection) {
      console.log(`  ${gym.name}: no boulder section selected`)
      return
    }

    const day = gym.boulderDays[0] // boulder is always a single day
    const key = `${gym.name}-${day}`
    const needed = boulderSection.settersRequired

    // Ensure shift exists with type set
    if (!schedule[key]) {
      schedule[key] = {
        shiftType: SHIFT_TYPES.BOULDER,
        section: boulderSection.name,
        assignedStaff: [],
        holdWasher: null,
        notes: '',
        completedAnchors: [],
        multiDayProgress: null,
      }
    } else {
      schedule[key].shiftType = SHIFT_TYPES.BOULDER
      schedule[key].section = boulderSection.name
    }

    // Already-placed staff (head setters, director)
    const prePlaced = schedule[key].assignedStaff || []
    const remaining = Math.max(0, needed - prePlaced.length)

    if (remaining > 0) {
      weekCtx = buildWeekContext(schedule) // refresh
      const { selected } = selectBestSetters(
        {
          count: remaining,
          day,
          gym: gym.name,
          shiftType: SHIFT_TYPES.BOULDER,
          difficulty: boulderSection.difficulty,
        },
        weekCtx,
        weekNumber,
        prePlaced,
        options,
      )

      selected.forEach((s) => {
        schedule[key].assignedStaff.push(s.id)
      })
    }

    const final = schedule[key].assignedStaff
    if (final.length < needed) {
      const msg = `${gym.name} ${day} "${boulderSection.name}": only ${final.length}/${needed} setters assigned`
      warnings.push(msg)
      console.warn(`  WARNING: ${msg}`)
    } else {
      console.log(
        `  ${gym.name} ${day} "${boulderSection.name}": ${final.length} setters → [${final.map((id) => STAFF.find((s) => s.id === id)?.name).join(', ')}]`
      )
    }
  })

  weekCtx = buildWeekContext(schedule)
  console.groupEnd()

  // ===== STEP 4: Rope days =====
  // Two-phase approach: Phase A assigns one primary section per gym (balanced),
  // Phase B adds additional sections only after ALL gyms have primaries.
  console.group('Step 4: Rope day assignments')

  // --- Phase A: Multi-day sections + primary single-day sections for all gyms ---

  // Track used days per gym (for multi-day sections that consume multiple days)
  const gymUsedDays = {}
  // Track remaining single-day sections per gym (for Phase B)
  const gymRemainingSections = {}

  GYMS.forEach((gym) => {
    const ropeSections = sectionPicks[gym.name]?.rope || []
    if (ropeSections.length === 0) return

    const ropeDays = [...(gym.ropeDays || []), ...(gym.flexDays || [])]
      .filter((d, i, a) => a.indexOf(d) === i)

    const multiDaySections = []
    const singleDaySections = []

    ropeSections.forEach((sec) => {
      const rules = parseMultiDayRules(sec.specialRules)
      if (rules.multiDay) multiDaySections.push(sec)
      else singleDaySections.push(sec)
    })

    // Schedule multi-day sections first
    const usedDays = new Set()

    multiDaySections.forEach((sec) => {
      const rules = parseMultiDayRules(sec.specialRules)
      let scheduled = false
      for (const startDay of ropeDays) {
        if (usedDays.has(startDay)) continue
        const days = getConsecutiveDays(startDay, rules.numDays, gym.name)
        if (days.length >= rules.numDays && days.every((d) => !usedDays.has(d))) {
          weekCtx = buildWeekContext(schedule)
          scheduleMultiDaySection(sec, startDay, gym.name, schedule, weekCtx, weekNumber, '', options)
          days.forEach((d) => usedDays.add(d))
          scheduled = true
          break
        }
      }
      if (!scheduled) {
        const msg = `${gym.name}: could not find ${rules.numDays} consecutive days for "${sec.name}"`
        warnings.push(msg)
        console.warn(`  WARNING: ${msg}`)
      }
    })

    gymUsedDays[gym.name] = usedDays

    // Schedule FIRST single-day section per available day (one per day only in Phase A)
    const remainingDays = ropeDays.filter((d) => !usedDays.has(d))
    let dayIdx = 0

    if (singleDaySections.length > 0 && remainingDays.length > 0) {
      const sec = singleDaySections[0]
      const day = remainingDays[dayIdx]
      const key = `${gym.name}-${day}`

      const prePlaced = schedule[key]?.assignedStaff || []

      // Aim for 3 setters for primary, respecting gym max
      const targetSetters = Math.min(
        gym.maxRopeSetters || 4,
        Math.max(3, prePlaced.length)
      )
      const remaining = Math.max(0, targetSetters - prePlaced.length)

      weekCtx = buildWeekContext(schedule)

      const { selected } = selectBestSetters(
        {
          count: remaining,
          day,
          gym: gym.name,
          shiftType: SHIFT_TYPES.ROPE,
          difficulty: sec.difficulty,
        },
        weekCtx,
        weekNumber,
        prePlaced,
        options,
      )

      const allIds = [...prePlaced, ...selected.map((s) => s.id)]

      const existingPartial = sec.hasPartial ? sec.partialCompletedAnchors : undefined
      schedule[key] = {
        shiftType: SHIFT_TYPES.ROPE,
        section: sec.name,
        assignedStaff: allIds,
        holdWasher: null,
        notes: sec.hasPartial ? `Continuing partial — ${(sec.partialCompletedAnchors || []).length} anchors already done` : '',
        completedAnchors: computeRopeAnchors(gym.name, sec.name, allIds, null, existingPartial),
        anchorAssignments: buildAnchorAssignments(gym.name, sec.name, allIds, null, existingPartial),
        multiDayProgress: null,
      }

      // Update context
      weekCtx = buildWeekContext(schedule)

      if (allIds.length < 2) {
        const msg = `${gym.name} ${day} "${sec.name}": only ${allIds.length} setters (minimum 2 required)`
        warnings.push(msg)
        console.warn(`  WARNING: ${msg}`)
      } else {
        console.log(
          `  ${gym.name} ${day} "${sec.name}": ${allIds.length} setters → [${allIds.map((id) => STAFF.find((s) => s.id === id)?.name).join(', ')}]`
        )
      }

      // Save remaining sections + days for Phase B
      gymRemainingSections[gym.name] = {
        sections: singleDaySections.slice(1),
        days: remainingDays,
        usedDayIdx: 1, // day 0 used by primary
      }
    } else {
      gymRemainingSections[gym.name] = {
        sections: singleDaySections,
        days: remainingDays,
        usedDayIdx: 0,
      }
    }
  })

  weekCtx = buildWeekContext(schedule)

  // --- Phase B: Additional sections, distributed across gyms ---
  // Process by day so setters are distributed fairly across all gyms needing work.
  console.log('  --- Phase B: Additional rope sections (balanced across gyms) ---')

  const ALL_ROPE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  ALL_ROPE_DAYS.forEach((day) => {
    // Find all gyms that have remaining sections and this day available
    const gymsThisDay = GYMS.filter((gym) => {
      const rem = gymRemainingSections[gym.name]
      if (!rem || rem.sections.length === 0) return false
      // Check if this gym has rope/flex on this day
      const hasRopeDay = gym.ropeDays?.includes(day) || gym.flexDays?.includes(day)
      if (!hasRopeDay) return false
      // Check if the day isn't already consumed by a multi-day section
      if (gymUsedDays[gym.name]?.has(day)) return false
      return true
    })

    if (gymsThisDay.length === 0) return

    // For each gym on this day, try to add ONE additional section (round-robin fairness)
    gymsThisDay.forEach((gym) => {
      const rem = gymRemainingSections[gym.name]
      if (rem.sections.length === 0) return

      const key = `${gym.name}-${day}`
      const existingShift = schedule[key]

      // Only add additional sections if this day already has a primary section for this gym
      if (!existingShift?.section) return

      // Calculate how many setters are already at this gym on this day
      const primaryCount = existingShift.assignedStaff?.length || 0
      const existingAdditionalCount = (existingShift.additionalSections || [])
        .reduce((sum, s) => sum + (s.assignedStaff?.length || 0), 0)
      const currentTotal = primaryCount + existingAdditionalCount
      const maxSetters = gym.maxRopeSetters || 4
      const spaceLeft = maxSetters - currentTotal

      if (spaceLeft < 2) return // Can't fit a section (need minimum 2)

      const nextSec = rem.sections[0]

      // Build exclusion set: everyone already assigned at this gym on this day
      const excludeIds = new Set([
        ...(existingShift.assignedStaff || []),
        ...(existingShift.additionalSections || []).flatMap((s) => s.assignedStaff || []),
      ])

      weekCtx = buildWeekContext(schedule)
      const { selected } = selectBestSetters(
        {
          count: Math.min(spaceLeft, 4), // Up to 4 or space left, whichever is less
          day,
          gym: gym.name,
          shiftType: SHIFT_TYPES.ROPE,
          difficulty: nextSec.difficulty,
        },
        weekCtx,
        weekNumber,
        [...excludeIds],
        options,
      )

      if (selected.length < 2) return // Not enough setters

      const extraIds = selected.map((s) => s.id)

      if (!existingShift.additionalSections) {
        existingShift.additionalSections = []
      }
      const extraPartial = nextSec.hasPartial ? nextSec.partialCompletedAnchors : undefined
      existingShift.additionalSections.push({
        section: nextSec.name,
        assignedStaff: extraIds,
        completedAnchors: computeRopeAnchors(gym.name, nextSec.name, extraIds, null, extraPartial),
        anchorAssignments: buildAnchorAssignments(gym.name, nextSec.name, extraIds, null, extraPartial),
      })

      // Consume this section from remaining
      rem.sections = rem.sections.slice(1)

      // Rebuild context so next gym on this day sees these as busy
      weekCtx = buildWeekContext(schedule)

      console.log(
        `  ${gym.name} ${day} "${nextSec.name}" (additional): ${extraIds.length} setters → [${extraIds.map((id) => STAFF.find((s) => s.id === id)?.name).join(', ')}]`
      )
    })

    // Second pass: if any gym still has sections and space, add more
    gymsThisDay.forEach((gym) => {
      const rem = gymRemainingSections[gym.name]
      if (!rem || rem.sections.length === 0) return

      const key = `${gym.name}-${day}`
      const existingShift = schedule[key]
      if (!existingShift?.section) return

      while (rem.sections.length > 0) {
        const primaryCount = existingShift.assignedStaff?.length || 0
        const additionalCount = (existingShift.additionalSections || [])
          .reduce((sum, s) => sum + (s.assignedStaff?.length || 0), 0)
        const currentTotal = primaryCount + additionalCount
        const maxSetters = gym.maxRopeSetters || 4
        const spaceLeft = maxSetters - currentTotal

        if (spaceLeft < 2) break

        const nextSec = rem.sections[0]
        const excludeIds = new Set([
          ...(existingShift.assignedStaff || []),
          ...(existingShift.additionalSections || []).flatMap((s) => s.assignedStaff || []),
        ])

        weekCtx = buildWeekContext(schedule)
        const { selected } = selectBestSetters(
          {
            count: Math.min(spaceLeft, 4),
            day,
            gym: gym.name,
            shiftType: SHIFT_TYPES.ROPE,
            difficulty: nextSec.difficulty,
          },
          weekCtx,
          weekNumber,
          [...excludeIds],
          options,
        )

        if (selected.length < 2) break

        if (!existingShift.additionalSections) existingShift.additionalSections = []
        const extraIds2 = selected.map((s) => s.id)
        const extraPartial2 = nextSec.hasPartial ? nextSec.partialCompletedAnchors : undefined
        existingShift.additionalSections.push({
          section: nextSec.name,
          assignedStaff: extraIds2,
          completedAnchors: computeRopeAnchors(gym.name, nextSec.name, extraIds2, null, extraPartial2),
          anchorAssignments: buildAnchorAssignments(gym.name, nextSec.name, extraIds2, null, extraPartial2),
        })

        rem.sections = rem.sections.slice(1)
        weekCtx = buildWeekContext(schedule)

        console.log(
          `  ${gym.name} ${day} "${nextSec.name}" (additional pass 2): ${selected.length} setters`
        )
      }
    })

    // Third: place remaining sections that need a NEW day (no primary yet on unused days)
    gymsThisDay.forEach((gym) => {
      const rem = gymRemainingSections[gym.name]
      if (!rem || rem.sections.length === 0) return

      const key = `${gym.name}-${day}`
      if (schedule[key]?.section) return // Already has a shift, handled above

      // This day doesn't have a shift for this gym yet — create one
      const sec = rem.sections[0]
      const prePlaced = schedule[key]?.assignedStaff || []

      const targetSetters = Math.min(
        gym.maxRopeSetters || 4,
        Math.max(3, prePlaced.length)
      )
      const needed = Math.max(0, targetSetters - prePlaced.length)

      weekCtx = buildWeekContext(schedule)
      const { selected } = selectBestSetters(
        {
          count: needed,
          day,
          gym: gym.name,
          shiftType: SHIFT_TYPES.ROPE,
          difficulty: sec.difficulty,
        },
        weekCtx,
        weekNumber,
        prePlaced,
        options,
      )

      const allIds = [...prePlaced, ...selected.map((s) => s.id)]
      if (allIds.length < 2) return // Not enough for a valid rope shift

      const newShiftPartial = sec.hasPartial ? sec.partialCompletedAnchors : undefined
      schedule[key] = {
        shiftType: SHIFT_TYPES.ROPE,
        section: sec.name,
        assignedStaff: allIds,
        holdWasher: null,
        notes: sec.hasPartial ? `Continuing partial — ${(sec.partialCompletedAnchors || []).length} anchors already done` : '',
        completedAnchors: computeRopeAnchors(gym.name, sec.name, allIds, null, newShiftPartial),
        anchorAssignments: buildAnchorAssignments(gym.name, sec.name, allIds, null, newShiftPartial),
        multiDayProgress: null,
      }

      rem.sections = rem.sections.slice(1)
      weekCtx = buildWeekContext(schedule)

      console.log(
        `  ${gym.name} ${day} "${sec.name}" (new shift): ${allIds.length} setters → [${allIds.map((id) => STAFF.find((s) => s.id === id)?.name).join(', ')}]`
      )
    })
  })

  weekCtx = buildWeekContext(schedule)
  console.groupEnd()

  // ===== STEP 4b: Maximize assignments & capacity analysis =====
  const capacityAnalysis = []
  {
    console.group('Step 4b: Capacity analysis & setter absorption')
    const WORK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday']
    const availData = loadAvailability()
    const doAbsorb = options.maximizeAssignments !== false

    WORK_DAYS.forEach((day) => {
      weekCtx = buildWeekContext(schedule)

      // All available setters for this day (accounting for role rules + absences)
      const allAvailable = STAFF.filter((s) => {
        if (!s.availability.includes(day)) return false
        if (s.role === 'Director' && (day !== 'Monday' || weekNumber % 2 !== 0)) return false
        return !getSetterAbsence(availData, s.id, weekNumber, day)
      })

      // Which of those are currently unassigned?
      let unassigned = allAvailable.filter((s) => {
        const ctx = weekCtx[s.id]
        return !ctx?.assignedKeys.some((k) => parseKey(k).day === day)
      })

      if (doAbsorb && unassigned.length > 0) {
        let remaining = [...unassigned]

        // Phase 1: Expand existing rope shifts to gym max capacity
        // (skip multi-day sections — they have exact setter counts from special rules)
        // Count total setters across primary + additional sections for cap
        GYMS.forEach((gym) => {
          if (remaining.length === 0) return
          const key = `${gym.name}-${day}`
          const shift = schedule[key]
          if (!shift?.assignedStaff?.length || shift.shiftType !== SHIFT_TYPES.ROPE) return
          if (shift.multiDayProgress) return // Don't expand multi-day sections beyond their specified counts
          const maxSetters = gym.maxRopeSetters || 4
          const totalCurrentSetters = (shift.assignedStaff?.length || 0) +
            (shift.additionalSections || []).reduce((sum, s) => sum + (s.assignedStaff?.length || 0), 0)
          const canAdd = maxSetters - totalCurrentSetters
          if (canAdd <= 0) return

          const eligible = remaining.filter((s) =>
            !violatesHardConstraints(s, { day, gym: gym.name, shiftType: SHIFT_TYPES.ROPE }, weekNumber)
          ).slice(0, canAdd)

          eligible.forEach((s) => {
            shift.assignedStaff.push(s.id)
            remaining = remaining.filter((r) => r.id !== s.id)
            console.log(`    +${s.name} → ${gym.name} rope (expanded)`)
          })
        })

        // Phase 2: Create or complete rope shifts on flex days
        // Handles both empty flex days AND pre-existing shifts from head setter placement that lack a section
        GYMS.forEach((gym) => {
          if (remaining.length === 0) return
          if (!gym.flexDays?.includes(day)) return
          const key = `${gym.name}-${day}`
          const existingShift = schedule[key]

          // Skip if shift already has a section assigned (fully configured by Step 4)
          if (existingShift?.section) return

          // Pre-placed staff from Step 1 (head setter) that need a section + more setters
          const prePlaced = existingShift?.assignedStaff || []

          const eligible = remaining.filter((s) =>
            !violatesHardConstraints(s, { day, gym: gym.name, shiftType: SHIFT_TYPES.ROPE }, weekNumber)
          )

          // Need at least 2 total setters (pre-placed + new) for a valid rope shift
          const totalAvailable = prePlaced.length + eligible.length
          if (totalAvailable < 2) return

          const maxSetters = gym.maxRopeSetters || 4
          const needed = Math.max(0, Math.min(maxSetters, totalAvailable) - prePlaced.length)
          const toAssign = eligible.slice(0, needed)

          // Pick an unused rope section — sort by least recently used for better rotation
          const usedSections = new Set()
          Object.entries(schedule)
            .filter(([k]) => k.startsWith(gym.name + '-'))
            .forEach(([, v]) => {
              if (v?.section) usedSections.add(v.section)
              if (v?.additionalSections) v.additionalSections.forEach((es) => { if (es.section) usedSections.add(es.section) })
            })
          const sectionCandidates = (ROPE_SECTIONS[gym.name] || [])
            .filter((s) => !usedSections.has(s.name) && !parseMultiDayRules(s.specialRules).multiDay && !s.specialRules?.includes('manual only'))
          const section = sectionCandidates[0]

          // Don't create/update shift if no section is available
          if (!section) {
            console.log(`    SKIP: ${gym.name} ${day} — no unused rope section available`)
            return
          }

          const allStaffP2 = [...prePlaced, ...toAssign.map((s) => s.id)]
          schedule[key] = {
            shiftType: SHIFT_TYPES.ROPE,
            section: section.name,
            assignedStaff: allStaffP2,
            holdWasher: existingShift?.holdWasher || null,
            notes: prePlaced.length > 0 ? 'Completed from head setter placement' : 'Added to maximize setter assignments',
            completedAnchors: computeRopeAnchors(gym.name, section.name, allStaffP2, existingShift?.holdWasher || null),
            anchorAssignments: buildAnchorAssignments(gym.name, section.name, allStaffP2, existingShift?.holdWasher || null),
            multiDayProgress: null,
          }

          toAssign.forEach((s) => {
            remaining = remaining.filter((r) => r.id !== s.id)
          })
          const allNames = allStaffP2.map((id) => STAFF.find((s) => s.id === id)?.name).join(', ')
          console.log(`    ${prePlaced.length > 0 ? 'FILL' : 'NEW'}: ${gym.name} ${day} rope "${section.name}" → [${allNames}]`)
        })

        // Phase 3: Create rope shifts on dedicated rope days with no shift yet
        GYMS.forEach((gym) => {
          if (remaining.length === 0) return
          if (!gym.ropeDays?.includes(day)) return
          const key = `${gym.name}-${day}`
          const existingShift = schedule[key]

          // Skip if shift already has a section assigned
          if (existingShift?.section) return

          const prePlaced = existingShift?.assignedStaff || []

          const eligible = remaining.filter((s) =>
            !violatesHardConstraints(s, { day, gym: gym.name, shiftType: SHIFT_TYPES.ROPE }, weekNumber)
          )

          const totalAvailable = prePlaced.length + eligible.length
          if (totalAvailable < 2) return

          const maxSetters = gym.maxRopeSetters || 4
          const needed = Math.max(0, Math.min(maxSetters, totalAvailable) - prePlaced.length)
          const toAssign = eligible.slice(0, needed)

          const usedSections3 = new Set()
          Object.entries(schedule)
            .filter(([k]) => k.startsWith(gym.name + '-'))
            .forEach(([, v]) => {
              if (v?.section) usedSections3.add(v.section)
              if (v?.additionalSections) v.additionalSections.forEach((es) => { if (es.section) usedSections3.add(es.section) })
            })
          const sectionCandidates = (ROPE_SECTIONS[gym.name] || [])
            .filter((s) => !usedSections3.has(s.name) && !parseMultiDayRules(s.specialRules).multiDay && !s.specialRules?.includes('manual only'))
          const section = sectionCandidates[0]

          // Don't create shift if no section is available
          if (!section) {
            console.log(`    SKIP: ${gym.name} ${day} — no unused rope section available`)
            return
          }

          const allStaffP3 = [...prePlaced, ...toAssign.map((s) => s.id)]
          schedule[key] = {
            shiftType: SHIFT_TYPES.ROPE,
            section: section.name,
            assignedStaff: allStaffP3,
            holdWasher: existingShift?.holdWasher || null,
            notes: prePlaced.length > 0 ? 'Completed from head setter placement' : 'Added to maximize setter assignments',
            completedAnchors: computeRopeAnchors(gym.name, section.name, allStaffP3, existingShift?.holdWasher || null),
            anchorAssignments: buildAnchorAssignments(gym.name, section.name, allStaffP3, existingShift?.holdWasher || null),
            multiDayProgress: null,
          }

          toAssign.forEach((s) => {
            remaining = remaining.filter((r) => r.id !== s.id)
          })
          const allNames = allStaffP3.map((id) => STAFF.find((s) => s.id === id)?.name).join(', ')
          console.log(`    ${prePlaced.length > 0 ? 'FILL' : 'NEW'}: ${gym.name} ${day} rope "${section.name}" → [${allNames}]`)
        })

        unassigned = remaining
      }

      // Phase 4: Flex hold wash absorption — assign remaining setters as hold washers
      const doFlexWash = options.allowFlexHoldWash !== false
      const allowStandalone = options.allowStandaloneWash === true
      if (doFlexWash && unassigned.length > 0) {
        let remaining = [...unassigned]

        // Sort candidates: spec setters first, then those with fewest wash shifts, then lowest total shifts
        remaining.sort((a, b) => {
          if (a.role === 'Spec Setter' && b.role !== 'Spec Setter') return -1
          if (b.role === 'Spec Setter' && a.role !== 'Spec Setter') return 1
          const aWash = weekCtx[a.id]?.washShifts || 0
          const bWash = weekCtx[b.id]?.washShifts || 0
          if (aWash !== bWash) return aWash - bWash
          return (weekCtx[a.id]?.totalShifts || 0) - (weekCtx[b.id]?.totalShifts || 0)
        })

        // Prefer gyms that are already setting that day, then flex wash days
        const gymsSettingToday = GYMS.filter((gym) => {
          const key = `${gym.name}-${day}`
          return schedule[key]?.assignedStaff?.length > 0
        })
        const gymsWithFlexWash = GYMS.filter((gym) => {
          if (gymsSettingToday.some((g) => g.name === gym.name)) return false
          return gym.flexHoldWashDays?.includes(day)
        })
        const orderedGyms = allowStandalone
          ? [...gymsSettingToday, ...gymsWithFlexWash]
          : gymsSettingToday

        orderedGyms.forEach((gym) => {
          if (remaining.length === 0) return
          const key = `${gym.name}-${day}`
          const shift = schedule[key]

          // Skip regular hold wash days — Step 5 assigns holdWasher from assignedStaff
          const isRegularWash = gym.holdWashDays?.includes(day)
          const isFlexWash = gym.flexHoldWashDays?.includes(day)
          if (isRegularWash) return
          if (!isFlexWash) return

          // Max 1 hold washer per gym per day — check existing
          const existingWashers = (shift?.holdWasher ? 1 : 0) + (shift?.flexHoldWashers?.length || 0)
          if (existingWashers >= 1) return

          // Filter: skip directors/head setters, skip those already washing this week (max 1)
          const eligible = remaining.filter((s) => {
            if (s.role === 'Director' || s.role === 'Head Setter') return false
            if ((weekCtx[s.id]?.washShifts || 0) >= 1) return false
            if (!s.availability.includes(day)) return false
            return true
          })
          if (eligible.length === 0) return

          const toAssign = eligible.slice(0, 1)

          if (!shift) {
            // Create a standalone wash shift (no setting, just wash)
            schedule[key] = {
              shiftType: null,
              section: null,
              assignedStaff: [],
              holdWasher: toAssign[0].id,
              flexHoldWashers: [],
              notes: 'Flex hold wash — maintenance day',
              completedAnchors: [],
              multiDayProgress: null,
            }
          } else {
            // Add to existing shift as hold washer (separate from setter assignedStaff)
            if (!shift.holdWasher) {
              shift.holdWasher = toAssign[0].id
            } else {
              // holdWasher already taken — add as flex hold washer
              shift.flexHoldWashers = [
                ...(shift.flexHoldWashers || []),
                ...toAssign.map((s) => s.id),
              ]
            }
          }

          toAssign.forEach((s) => {
            remaining = remaining.filter((r) => r.id !== s.id)
            if (weekCtx[s.id]) weekCtx[s.id].washShifts++
            console.log(`    +${s.name} → ${gym.name} flex hold wash`)
          })
        })

        unassigned = remaining
      }

      // Record capacity analysis for this day
      weekCtx = buildWeekContext(schedule)
      const totalAssigned = allAvailable.length - unassigned.length

      const gymBreakdown = GYMS.map((gym) => {
        const key = `${gym.name}-${day}`
        const shift = schedule[key]
        return `${gym.name}:${shift?.assignedStaff?.length || 0}`
      }).join(', ')

      console.log(`  ${day}: ${allAvailable.length} available, ${totalAssigned} assigned (${gymBreakdown})`)

      if (unassigned.length > 0) {
        unassigned.forEach((s) => {
          const reason = s.role === 'Spec Setter'
            ? 'spec setter — cannot do rope setting'
            : 'all shifts at capacity'
          console.log(`    ✗ ${s.name}: ${reason}`)
        })
        warnings.push(`${day}: ${unassigned.length} setter(s) not placed — ${unassigned.map((s) => s.name).join(', ')}`)
      }

      const getUnassignedReason = (s) => {
        if (s.role === 'Director' || s.role === 'Head Setter') return `${s.role} — cannot do hold wash`
        if (s.role === 'Spec Setter') return 'Spec setter — max wash shifts reached'
        if ((weekCtx[s.id]?.washShifts || 0) >= 1) return 'Already has a wash shift this week'
        return 'All shifts at capacity'
      }

      capacityAnalysis.push({
        day,
        available: allAvailable.length,
        assigned: totalAssigned,
        unassigned: unassigned.map((s) => ({
          name: s.name,
          reason: getUnassignedReason(s),
        })),
        gymSlots: GYMS.map((gym) => {
          const key = `${gym.name}-${day}`
          const shift = schedule[key]
          const flexWashCount = shift?.flexHoldWashers?.length || 0
          return {
            gym: gym.name,
            count: shift?.assignedStaff?.length || 0,
            shiftType: shift?.shiftType || null,
            flexWashCount,
          }
        }),
      })
    })

    // Summary: count total flex wash assignments across the week
    let flexWashTotal = 0
    Object.values(schedule).forEach((shift) => {
      if (shift?.flexHoldWashers?.length) flexWashTotal += shift.flexHoldWashers.length
    })
    if (flexWashTotal > 0) {
      console.log(`  Total flex hold wash assignments: ${flexWashTotal}`)
      warnings.push(`Added ${flexWashTotal} flex hold wash shift(s) to fully staff the week`)
    }

    weekCtx = buildWeekContext(schedule)
    console.groupEnd()
  }

  // ===== STEP 5: Hold washers =====
  // Hold washers are ADDITIONAL staff — they don't set, only wash.
  // They get added to assignedStaff for tracking but are excluded from setter counts.
  console.group('Step 5: Hold washer assignments')
  const availData5 = loadAvailability()

  GYMS.forEach((gym) => {
    if (!gym.holdWashDays?.length) return

    gym.holdWashDays.forEach((day) => {
      const key = `${gym.name}-${day}`
      const shift = schedule[key]
      if (!shift || !shift.assignedStaff?.length) {
        console.log(`  ${gym.name} ${day}: no shift to assign hold washer`)
        return
      }

      // Skip if already has a hold washer (e.g. from flex wash phase)
      if (shift.holdWasher) {
        console.log(`  ${gym.name} ${day}: already has hold washer ${shift.holdWasher}`)
        return
      }

      weekCtx = buildWeekContext(schedule)

      // Select hold washer from available staff NOT already assigned to this shift.
      // Hold washer is an additional person who washes but doesn't set.
      const assignedSet = new Set(shift.assignedStaff)
      const candidates = STAFF
        .filter((s) => {
          // Must not already be assigned to this shift
          if (assignedSet.has(s.id)) return false
          // Must be available this day
          if (!s.availability.includes(day)) return false
          // Never assign directors or head setters as hold washers
          if (s.role === 'Director' || s.role === 'Head Setter') return false
          // Check not absent
          if (getSetterAbsence(availData5, s.id, weekNumber, day)) return false
          // Check not already assigned at another gym this day
          const ctx = weekCtx[s.id]
          if (ctx?.assignedKeys.some((k) => {
            const { day: kDay, gymName: kGym } = parseKey(k)
            return kDay === day && kGym !== gym.name
          })) return false
          return true
        })
        .sort((a, b) => {
          // Prefer spec setters (they can't rope set, but can wash)
          if (a.role === 'Spec Setter' && b.role !== 'Spec Setter') return -1
          if (b.role === 'Spec Setter' && a.role !== 'Spec Setter') return 1
          // Then prefer those without a wash shift yet
          const aWash = getWashShiftCount(a.id, weekCtx)
          const bWash = getWashShiftCount(b.id, weekCtx)
          if (aWash !== bWash) return aWash - bWash
          // Then prefer those with fewer total shifts
          return (weekCtx[a.id]?.totalShifts || 0) - (weekCtx[b.id]?.totalShifts || 0)
        })

      if (candidates.length > 0) {
        const washer = candidates[0]
        shift.holdWasher = washer.id
        // Do NOT add to assignedStaff — holdWasher is separate from setters.
        // buildWeekContext tracks holdWashers via assignedKeys so they're seen as busy.
        if (weekCtx[washer.id]) {
          weekCtx[washer.id].washShifts++
          weekCtx[washer.id].totalShifts++
          weekCtx[washer.id].assignedKeys.push(key)
        }
        console.log(`  ${gym.name} ${day}: ${washer.name} assigned as hold washer (separate from setters)`)
      } else {
        const msg = `${gym.name} ${day}: no available hold washer outside current setters`
        warnings.push(msg)
        console.warn(`  WARNING: ${msg}`)
      }
    })
  })

  console.groupEnd()

  // ===== Clean up: set shift types on any shifts that still have null =====
  Object.entries(schedule).forEach(([key, shift]) => {
    if (!shift.shiftType) {
      const { gymName, day } = parseKey(key)
      const gym = GYMS.find((g) => g.name === gymName)
      if (gym?.boulderDays?.includes(day)) {
        shift.shiftType = SHIFT_TYPES.BOULDER
      } else {
        shift.shiftType = SHIFT_TYPES.ROPE
      }
    }
  })

  // Sanitize — ensure every shift has valid data
  sanitizeSchedule(schedule)

  // Summary
  const totalShifts = Object.keys(schedule).length
  const totalSetters = new Set(
    Object.values(schedule).flatMap((s) => [
      ...(s.assignedStaff || []),
      ...(s.additionalSections || []).flatMap((es) => es.assignedStaff || []),
    ])
  ).size

  console.log(`\n=== Auto-Schedule Summary ===`)
  console.log(`  Shifts created: ${totalShifts}`)
  console.log(`  Unique setters assigned: ${totalSetters}`)
  console.log(`  Warnings: ${warnings.length}`)
  warnings.forEach((w) => console.log(`    - ${w}`))
  console.groupEnd()

  return { schedule, warnings, capacityAnalysis }
}

/**
 * Ensure every shift in the schedule has valid, complete data.
 * Removes corrupt entries and fixes missing fields.
 */
function sanitizeSchedule(schedule) {
  const validStaffIds = new Set(STAFF.map((s) => s.id))

  Object.entries(schedule).forEach(([key, shift]) => {
    if (!shift || typeof shift !== 'object') {
      delete schedule[key]
      return
    }

    // Ensure assignedStaff is a valid array of known IDs
    if (!Array.isArray(shift.assignedStaff)) {
      shift.assignedStaff = []
    } else {
      shift.assignedStaff = shift.assignedStaff.filter((id) => validStaffIds.has(id))
    }

    // Ensure holdWasher is valid
    if (shift.holdWasher && !validStaffIds.has(shift.holdWasher)) {
      shift.holdWasher = null
    }

    // If holdWasher is in assignedStaff, remove them — washers are separate from setters
    if (shift.holdWasher && shift.assignedStaff.includes(shift.holdWasher)) {
      shift.assignedStaff = shift.assignedStaff.filter((id) => id !== shift.holdWasher)
    }

    // If holdWasher also appears in flexHoldWashers, remove the duplicate
    if (shift.holdWasher && shift.flexHoldWashers?.includes(shift.holdWasher)) {
      shift.flexHoldWashers = shift.flexHoldWashers.filter((id) => id !== shift.holdWasher)
    }

    // Ensure required fields exist
    if (!shift.notes) shift.notes = ''
    if (!Array.isArray(shift.completedAnchors)) shift.completedAnchors = []

    // Sanitize additional sections
    if (shift.additionalSections?.length) {
      shift.additionalSections = shift.additionalSections.filter((extraSec) => {
        if (!extraSec.section) return false
        if (!Array.isArray(extraSec.assignedStaff)) extraSec.assignedStaff = []
        else extraSec.assignedStaff = extraSec.assignedStaff.filter((id) => validStaffIds.has(id))
        if (!Array.isArray(extraSec.completedAnchors)) extraSec.completedAnchors = []
        return extraSec.assignedStaff.length > 0
      })
      if (shift.additionalSections.length === 0) delete shift.additionalSections
    }

    // Remove incomplete shifts: no type/section means the shift was never fully configured
    // (e.g. head setter placeholder that Step 4/4b couldn't assign a section to)
    if (!shift.shiftType && !shift.section) {
      delete schedule[key]
      return
    }
    if (!shift.shiftType) shift.shiftType = SHIFT_TYPES.ROPE

    // Remove shifts with no staff and no hold washer
    if (shift.assignedStaff.length === 0 && !shift.holdWasher && !shift.flexHoldWashers?.length) {
      delete schedule[key]
    }
  })
}

// ---------------------------------------------------------------------------
// Partial scheduling: by gym
// ---------------------------------------------------------------------------

/**
 * Auto-schedule a single gym for the week. Preserves existing assignments.
 *
 * @param {string} gymName         - 'Ogden' | 'SLC' | 'Soma'
 * @param {object} scheduleHistory - full history
 * @param {number} weekNumber
 * @returns {{ schedule: object, warnings: string[] }}
 */
export function autoScheduleGym(gymName, scheduleHistory, weekNumber, options = {}) {
  resetScoreCache()
  const existing = scheduleHistory[weekNumber] || {}
  const schedule = JSON.parse(JSON.stringify(existing))
  const warnings = []
  const gym = GYMS.find((g) => g.name === gymName)
  if (!gym) return { schedule, warnings: [`Unknown gym: ${gymName}`] }

  let weekCtx = buildWeekContext(schedule)

  console.group(`[Auto-Schedule Gym] ${gymName} — Week ${weekNumber}`)

  // Section selection (full — we only use this gym's picks)
  const sectionPicks = selectSectionsForWeek(scheduleHistory, weekNumber, options)

  // ---- Boulder ----
  if (gym.boulderDays?.length) {
    const boulderSection = sectionPicks[gymName]?.boulder
    if (boulderSection) {
      const day = gym.boulderDays[0]
      const key = `${gymName}-${day}`

      if (!schedule[key] || !schedule[key].assignedStaff?.length) {
        const needed = boulderSection.settersRequired
        // Place head setter if applicable
        const headSetter = STAFF.find((s) => s.role === 'Head Setter' && s.gym === gymName)
        const mandatory = []
        if (headSetter && headSetter.availability.includes(day)) {
          mandatory.push(headSetter.id)
        }

        // Director on even-week Monday
        const director = STAFF.find((s) => s.role === 'Director')
        if (director && day === 'Monday' && weekNumber % 2 === 0) {
          if (!mandatory.includes(director.id)) mandatory.push(director.id)
        }

        const remaining = Math.max(0, needed - mandatory.length)
        weekCtx = buildWeekContext(schedule)
        const { selected } = selectBestSetters(
          { count: remaining, day, gym: gymName, shiftType: SHIFT_TYPES.BOULDER, difficulty: boulderSection.difficulty },
          weekCtx, weekNumber, mandatory, options,
        )

        schedule[key] = {
          shiftType: SHIFT_TYPES.BOULDER,
          section: boulderSection.name,
          assignedStaff: [...mandatory, ...selected.map((s) => s.id)],
          holdWasher: null,
          notes: '',
          completedAnchors: [],
          multiDayProgress: null,
        }

        if (schedule[key].assignedStaff.length < needed) {
          warnings.push(`${gymName} ${day} "${boulderSection.name}": only ${schedule[key].assignedStaff.length}/${needed} setters`)
        }
      }
    }
  }

  // ---- Rope ----
  const ropeSections = sectionPicks[gymName]?.rope || []
  if (ropeSections.length > 0) {
    const ropeDays = [...(gym.ropeDays || []), ...(gym.flexDays || [])].filter((d, i, a) => a.indexOf(d) === i)

    const multiDaySections = []
    const singleDaySections = []
    ropeSections.forEach((sec) => {
      const rules = parseMultiDayRules(sec.specialRules)
      ;(rules.multiDay ? multiDaySections : singleDaySections).push(sec)
    })

    const usedDays = new Set()

    // Skip days that already have assignments for this gym
    ropeDays.forEach((d) => {
      const key = `${gymName}-${d}`
      if (schedule[key]?.assignedStaff?.length) usedDays.add(d)
    })

    multiDaySections.forEach((sec) => {
      const rules = parseMultiDayRules(sec.specialRules)
      for (const startDay of ropeDays) {
        if (usedDays.has(startDay)) continue
        const days = getConsecutiveDays(startDay, rules.numDays, gymName)
        if (days.length >= rules.numDays && days.every((d) => !usedDays.has(d))) {
          weekCtx = buildWeekContext(schedule)
          scheduleMultiDaySection(sec, startDay, gymName, schedule, weekCtx, weekNumber, '', options)
          days.forEach((d) => usedDays.add(d))
          break
        }
      }
    })

    const remainingDays = ropeDays.filter((d) => !usedDays.has(d))
    let dayIdx = 0

    singleDaySections.forEach((sec) => {
      if (dayIdx >= remainingDays.length) {
        warnings.push(`${gymName}: no rope day available for "${sec.name}"`)
        return
      }
      const day = remainingDays[dayIdx++]
      const key = `${gymName}-${day}`
      const prePlaced = schedule[key]?.assignedStaff || []
      const targetSetters = Math.min(gym.maxRopeSetters || 4, Math.max(3, prePlaced.length))
      const rem = Math.max(0, targetSetters - prePlaced.length)

      weekCtx = buildWeekContext(schedule)
      const { selected } = selectBestSetters(
        { count: rem, day, gym: gymName, shiftType: SHIFT_TYPES.ROPE, difficulty: sec.difficulty },
        weekCtx, weekNumber, prePlaced, options,
      )

      const allRopeIds = [...prePlaced, ...selected.map((s) => s.id)]
      schedule[key] = {
        shiftType: SHIFT_TYPES.ROPE,
        section: sec.name,
        assignedStaff: allRopeIds,
        holdWasher: null,
        notes: '',
        completedAnchors: computeRopeAnchors(gymName, sec.name, allRopeIds, null),
        anchorAssignments: buildAnchorAssignments(gymName, sec.name, allRopeIds, null),
        multiDayProgress: null,
      }
    })
  }

  // ---- Hold washers for this gym ----
  weekCtx = buildWeekContext(schedule)
  if (gym.holdWashDays?.length) {
    gym.holdWashDays.forEach((day) => {
      const key = `${gymName}-${day}`
      const shift = schedule[key]
      if (!shift?.assignedStaff?.length || shift.holdWasher) return

      const candidates = shift.assignedStaff
        .map((id) => STAFF.find((s) => s.id === id))
        .filter((s) => s && s.role !== 'Director' && s.role !== 'Head Setter')
        .sort((a, b) => getWashShiftCount(a.id, weekCtx) - getWashShiftCount(b.id, weekCtx))

      if (candidates.length > 0) {
        shift.holdWasher = candidates[0].id
      } else {
        warnings.push(`${gymName} ${day}: no eligible hold washer`)
      }
    })
  }

  sanitizeSchedule(schedule)
  console.groupEnd()
  return { schedule, warnings, capacityAnalysis: null }
}

// ---------------------------------------------------------------------------
// Partial scheduling: by day
// ---------------------------------------------------------------------------

/**
 * Auto-schedule a single day across all gyms. Preserves existing assignments.
 *
 * @param {string} targetDay       - 'Monday' | ... | 'Friday'
 * @param {object} scheduleHistory - full history
 * @param {number} weekNumber
 * @returns {{ schedule: object, warnings: string[] }}
 */
export function autoScheduleDay(targetDay, scheduleHistory, weekNumber, options = {}) {
  resetScoreCache()
  const existing = scheduleHistory[weekNumber] || {}
  const schedule = JSON.parse(JSON.stringify(existing))
  const warnings = []

  console.group(`[Auto-Schedule Day] ${targetDay} — Week ${weekNumber}`)

  const sectionPicks = selectSectionsForWeek(scheduleHistory, weekNumber, options)
  let weekCtx = buildWeekContext(schedule)

  GYMS.forEach((gym) => {
    const key = `${gym.name}-${targetDay}`

    // Skip if already assigned
    if (schedule[key]?.assignedStaff?.length) return

    const isBoulderDay = gym.boulderDays?.includes(targetDay)
    const isRopeDay = gym.ropeDays?.includes(targetDay) || gym.flexDays?.includes(targetDay)

    if (!isBoulderDay && !isRopeDay) return

    // Determine shift type and section
    let shiftType, section

    if (isBoulderDay) {
      shiftType = SHIFT_TYPES.BOULDER
      section = sectionPicks[gym.name]?.boulder
    } else {
      shiftType = SHIFT_TYPES.ROPE
      // Pick first rope section that hasn't been assigned to another day
      const assignedSections = new Set(
        Object.entries(schedule)
          .filter(([k]) => k.startsWith(gym.name + '-'))
          .map(([, v]) => v?.section)
          .filter(Boolean)
      )
      section = (sectionPicks[gym.name]?.rope || []).find((s) => !assignedSections.has(s.name))
    }

    if (!section) return

    // Mandatory staff
    const mandatory = []
    const headSetter = STAFF.find((s) => s.role === 'Head Setter' && s.gym === gym.name)
    if (headSetter && headSetter.availability.includes(targetDay)) {
      mandatory.push(headSetter.id)
    }
    const director = STAFF.find((s) => s.role === 'Director')
    if (director && targetDay === 'Monday' && weekNumber % 2 === 0) {
      if (!mandatory.includes(director.id)) mandatory.push(director.id)
    }

    const needed = isBoulderDay
      ? (section.settersRequired || 4)
      : Math.min(gym.maxRopeSetters || 4, 3)
    const remaining = Math.max(0, needed - mandatory.length)

    weekCtx = buildWeekContext(schedule)
    const { selected } = selectBestSetters(
      { count: remaining, day: targetDay, gym: gym.name, shiftType, difficulty: section.difficulty },
      weekCtx, weekNumber, mandatory, options,
    )

    const dayAllIds = [...mandatory, ...selected.map((s) => s.id)]
    schedule[key] = {
      shiftType,
      section: section.name,
      assignedStaff: dayAllIds,
      holdWasher: null,
      notes: '',
      completedAnchors: shiftType === SHIFT_TYPES.ROPE ? computeRopeAnchors(gym.name, section.name, dayAllIds, null) : [],
      anchorAssignments: shiftType === SHIFT_TYPES.ROPE ? buildAnchorAssignments(gym.name, section.name, dayAllIds, null) : undefined,
      multiDayProgress: null,
    }

    // Hold washer
    const isWashDay = gym.holdWashDays?.includes(targetDay)
    if (isWashDay && schedule[key].assignedStaff.length > 0) {
      weekCtx = buildWeekContext(schedule)
      const candidates = schedule[key].assignedStaff
        .map((id) => STAFF.find((s) => s.id === id))
        .filter((s) => s && s.role !== 'Director' && s.role !== 'Head Setter')
        .sort((a, b) => getWashShiftCount(a.id, weekCtx) - getWashShiftCount(b.id, weekCtx))

      if (candidates.length > 0) {
        schedule[key].holdWasher = candidates[0].id
      }
    }

    if (schedule[key].assignedStaff.length < (isBoulderDay ? needed : 2)) {
      warnings.push(`${gym.name} ${targetDay}: only ${schedule[key].assignedStaff.length} setters assigned`)
    }
  })

  sanitizeSchedule(schedule)
  console.groupEnd()
  return { schedule, warnings, capacityAnalysis: null }
}

// ---------------------------------------------------------------------------
// Partial scheduling: fill gaps
// ---------------------------------------------------------------------------

/**
 * Fill only unassigned/empty shifts in the current schedule.
 * Preserves all existing assignments.
 *
 * @param {object} scheduleHistory - full history
 * @param {number} weekNumber
 * @returns {{ schedule: object, warnings: string[] }}
 */
export function autoScheduleFillGaps(scheduleHistory, weekNumber, options = {}) {
  resetScoreCache()
  const existing = scheduleHistory[weekNumber] || {}
  const schedule = JSON.parse(JSON.stringify(existing))
  const warnings = []

  console.group(`[Auto-Schedule Fill Gaps] Week ${weekNumber}`)

  const sectionPicks = selectSectionsForWeek(scheduleHistory, weekNumber, options)
  let weekCtx = buildWeekContext(schedule)

  // Track which sections are already assigned per gym
  const assignedSections = {}
  GYMS.forEach((g) => {
    assignedSections[g.name] = new Set(
      Object.entries(schedule)
        .filter(([k]) => k.startsWith(g.name + '-'))
        .map(([, v]) => v?.section)
        .filter(Boolean)
    )
  })

  GYMS.forEach((gym) => {
    ALL_DAYS.forEach((day) => {
      const key = `${gym.name}-${day}`

      // Skip if already has staff assigned
      if (schedule[key]?.assignedStaff?.length) return

      const isBoulderDay = gym.boulderDays?.includes(day)
      const isRopeDay = gym.ropeDays?.includes(day) || gym.flexDays?.includes(day)
      if (!isBoulderDay && !isRopeDay) return

      let shiftType, section

      if (isBoulderDay) {
        shiftType = SHIFT_TYPES.BOULDER
        section = sectionPicks[gym.name]?.boulder
      } else {
        shiftType = SHIFT_TYPES.ROPE
        section = (sectionPicks[gym.name]?.rope || []).find(
          (s) => !assignedSections[gym.name].has(s.name)
        )
      }

      if (!section) return

      // Mark section as used
      assignedSections[gym.name].add(section.name)

      // Mandatory staff
      const mandatory = []
      const headSetter = STAFF.find((s) => s.role === 'Head Setter' && s.gym === gym.name)
      if (headSetter && headSetter.availability.includes(day)) {
        mandatory.push(headSetter.id)
      }
      const director = STAFF.find((s) => s.role === 'Director')
      if (director && day === 'Monday' && weekNumber % 2 === 0) {
        if (!mandatory.includes(director.id)) mandatory.push(director.id)
      }

      const needed = isBoulderDay
        ? (section.settersRequired || 4)
        : Math.min(gym.maxRopeSetters || 4, 3)
      const remaining = Math.max(0, needed - mandatory.length)

      weekCtx = buildWeekContext(schedule)
      const { selected } = selectBestSetters(
        { count: remaining, day, gym: gym.name, shiftType, difficulty: section.difficulty },
        weekCtx, weekNumber, mandatory, options,
      )

      const wpAllIds = [...mandatory, ...selected.map((s) => s.id)]
      schedule[key] = {
        shiftType,
        section: section.name,
        assignedStaff: wpAllIds,
        holdWasher: null,
        notes: '',
        completedAnchors: shiftType === SHIFT_TYPES.ROPE ? computeRopeAnchors(gym.name, section.name, wpAllIds, null) : [],
        anchorAssignments: shiftType === SHIFT_TYPES.ROPE ? buildAnchorAssignments(gym.name, section.name, wpAllIds, null) : undefined,
        multiDayProgress: null,
      }

      // Hold washer
      if (gym.holdWashDays?.includes(day) && schedule[key].assignedStaff.length > 0) {
        weekCtx = buildWeekContext(schedule)
        const candidates = schedule[key].assignedStaff
          .map((id) => STAFF.find((s) => s.id === id))
          .filter((s) => s && s.role !== 'Director' && s.role !== 'Head Setter')
          .sort((a, b) => getWashShiftCount(a.id, weekCtx) - getWashShiftCount(b.id, weekCtx))

        if (candidates.length > 0) {
          schedule[key].holdWasher = candidates[0].id
        }
      }

      console.log(`  Filled: ${gym.name} ${day} → "${section.name}" (${schedule[key].assignedStaff.length} setters)`)
    })
  })

  sanitizeSchedule(schedule)
  console.groupEnd()
  return { schedule, warnings, capacityAnalysis: null }
}

// ---------------------------------------------------------------------------
// Extended auto-scheduling: multiple weeks at once
// ---------------------------------------------------------------------------

/**
 * Auto-schedule a range of weeks with cumulative workload tracking.
 *
 * @param {number} startWeek       - first week to schedule
 * @param {number} endWeek         - last week to schedule (inclusive)
 * @param {object} scheduleHistory - full history (used for rotation tracking)
 * @param {object} extOptions      - extended options
 * @returns {{ results: { [weekNumber]: { schedule, warnings } }, cumulativeStats: object }}
 */
export function extendedAutoSchedule(startWeek, endWeek, scheduleHistory, extOptions = {}) {
  const {
    rotateGyms = true,
    staggerHardSections = true,
    trackCumulativeWorkload = true,
    respectVacations = true,
    ...baseOptions
  } = extOptions

  console.group(`[Extended Auto-Schedule] Weeks ${startWeek}-${endWeek}`)

  const results = {}
  // Build a running copy of history so each week sees the previous weeks' output
  const runningHistory = { ...scheduleHistory }

  // Track which multi-day sections were scheduled in which weeks (for rotation violation detection)
  const multiDaySectionHistory = {} // { "SLC:Tower": [64], "Soma:Beast": [61] }

  // Build rotation overrides — tracks resets made during THIS extended scheduling run.
  // These take priority over manual overrides and auto-tracked history so that
  // scheduling Tower in Week 64 prevents it from being selected again in Week 65.
  const rotationOverrides = {}
  GYMS.forEach((gym) => {
    rotationOverrides[gym.name] = { boulderResets: {}, ropeResets: {} }
  })

  // Pre-seed rotation overrides from existing history so we know what was already reset
  for (let w = 0; w < startWeek; w++) {
    const ws = runningHistory[w]
    if (!ws) continue
    Object.entries(ws).forEach(([key, shift]) => {
      if (!shift?.section || !shift.assignedStaff?.length) return
      const idx = key.lastIndexOf('-')
      const gymName = key.slice(0, idx)
      if (!rotationOverrides[gymName]) return
      if (shift.shiftType === 'Boulder Setting') {
        rotationOverrides[gymName].boulderResets[shift.section] = w
      } else if (shift.shiftType === 'Rope Setting') {
        // Only mark as reset if all anchors are covered (check cumulative partial tracking)
        const secDef = ROPE_SECTIONS[gymName]?.find((s) => s.name === shift.section)
        // Special rules sections always count as full reset
        if (secDef?.specialRules) {
          rotationOverrides[gymName].ropeResets[shift.section] = w
        } else {
          const totalAnchors = secDef?.anchors?.length || 0
          const completed = shift.completedAnchors || []
          if (totalAnchors === 0 || completed.length >= totalAnchors) {
            rotationOverrides[gymName].ropeResets[shift.section] = w
          }
        }
        // Track additional sections
        if (shift.additionalSections?.length) {
          shift.additionalSections.forEach((extraSec) => {
            if (extraSec.section && extraSec.assignedStaff?.length) {
              const extraDef = ROPE_SECTIONS[gymName]?.find((s) => s.name === extraSec.section)
              if (extraDef?.specialRules) {
                rotationOverrides[gymName].ropeResets[extraSec.section] = w
              } else {
                const extraTotal = extraDef?.anchors?.length || 0
                const extraCompleted = extraSec.completedAnchors || []
                if (extraTotal === 0 || extraCompleted.length >= extraTotal) {
                  rotationOverrides[gymName].ropeResets[extraSec.section] = w
                }
              }
            }
          })
        }
      }
    })
  }

  // Track cumulative stats across weeks for cross-week optimization
  const cumulativeStats = {}
  STAFF.forEach((s) => {
    cumulativeStats[s.id] = {
      totalShifts: 0,
      hardSections: 0,
      ogdenWeeks: 0,
      lastGym: null,
      lastHardWeek: -999,
    }
  })

  // Pre-load cumulative stats from recent history (last 4 weeks before startWeek)
  for (let w = Math.max(0, startWeek - 4); w < startWeek; w++) {
    const ws = runningHistory[w]
    if (!ws) continue
    Object.entries(ws).forEach(([key, shift]) => {
      if (!shift?.assignedStaff) return
      const idx = key.lastIndexOf('-')
      const gymName = key.slice(0, idx)
      shift.assignedStaff.forEach((id) => {
        if (!cumulativeStats[id]) return
        cumulativeStats[id].totalShifts++
        if (gymName === 'Ogden') cumulativeStats[id].ogdenWeeks++
        cumulativeStats[id].lastGym = gymName
      })
    })
  }

  for (let weekNumber = startWeek; weekNumber <= endWeek; weekNumber++) {
    console.group(`Week ${weekNumber}`)

    // Build options that incorporate cumulative intelligence
    const weekOptions = { ...baseOptions }

    if (trackCumulativeWorkload) {
      weekOptions.prioritizeWorkloadBalance = true
    }
    if (rotateGyms) {
      weekOptions.minimizeOgdenFrequency = true
    }

    // Pass rotation overrides so section selection sees resets from earlier weeks in this batch
    weekOptions.rotationOverrides = rotationOverrides

    // Run standard single-week scheduler
    const { schedule, warnings } = autoScheduleWeek(runningHistory, weekNumber, weekOptions)

    // Post-process: flag consecutive hard sections across weeks
    if (staggerHardSections) {
      Object.entries(schedule).forEach(([key, shift]) => {
        if (!shift?.assignedStaff) return
        const idx = key.lastIndexOf('-')
        const gymName = key.slice(0, idx)
        const pool = shift.shiftType === 'Boulder Setting'
          ? BOULDER_SECTIONS[gymName]
          : ROPE_SECTIONS[gymName]
        const sec = pool?.find((s) => s.name === shift.section)
        if (sec?.difficulty === 'hard') {
          shift.assignedStaff.forEach((id) => {
            if (cumulativeStats[id] && cumulativeStats[id].lastHardWeek === weekNumber - 1) {
              warnings.push(`${STAFF.find((s) => s.id === id)?.name || id} has hard sections in consecutive weeks (${weekNumber - 1} and ${weekNumber})`)
            }
          })
        }
      })
    }

    // Update cumulative stats
    Object.entries(schedule).forEach(([key, shift]) => {
      if (!shift?.assignedStaff) return
      const idx = key.lastIndexOf('-')
      const gymName = key.slice(0, idx)
      const pool = shift.shiftType === 'Boulder Setting'
        ? BOULDER_SECTIONS[gymName]
        : ROPE_SECTIONS[gymName]
      const sec = pool?.find((s) => s.name === shift.section)

      shift.assignedStaff.forEach((id) => {
        if (!cumulativeStats[id]) return
        cumulativeStats[id].totalShifts++
        cumulativeStats[id].lastGym = gymName
        if (gymName === 'Ogden') cumulativeStats[id].ogdenWeeks++
        if (sec?.difficulty === 'hard') {
          cumulativeStats[id].hardSections++
          cumulativeStats[id].lastHardWeek = weekNumber
        }
      })
    })

    // Update rotation overrides with sections scheduled this week
    Object.entries(schedule).forEach(([key, shift]) => {
      if (!shift?.section || !shift.assignedStaff?.length) return
      const idx = key.lastIndexOf('-')
      const gymName = key.slice(0, idx)
      if (!rotationOverrides[gymName]) return
      if (shift.shiftType === 'Boulder Setting') {
        rotationOverrides[gymName].boulderResets[shift.section] = weekNumber
      } else if (shift.shiftType === 'Rope Setting') {
        // Only mark as reset if section is fully complete (all anchors covered)
        // Special rules sections always count as full reset
        const secDef2 = ROPE_SECTIONS[gymName]?.find((s) => s.name === shift.section)
        if (secDef2?.specialRules) {
          rotationOverrides[gymName].ropeResets[shift.section] = weekNumber
          if (shift.multiDayProgress) {
            console.log(`  Updated rotation tracking: ${gymName} "${shift.section}" reset → Week ${weekNumber} (special rules)`)
          }
        } else {
          const totalAnchors2 = secDef2?.anchors?.length || 0
          const completed2 = shift.completedAnchors || []
          if (totalAnchors2 === 0 || completed2.length >= totalAnchors2) {
            rotationOverrides[gymName].ropeResets[shift.section] = weekNumber
            if (shift.multiDayProgress) {
              console.log(`  Updated rotation tracking: ${gymName} "${shift.section}" reset → Week ${weekNumber}`)
            }
          }
        }
        // Also track additional sections
        if (shift.additionalSections?.length) {
          shift.additionalSections.forEach((extraSec) => {
            if (extraSec.section && extraSec.assignedStaff?.length) {
              const extraDef2 = ROPE_SECTIONS[gymName]?.find((s) => s.name === extraSec.section)
              if (extraDef2?.specialRules) {
                rotationOverrides[gymName].ropeResets[extraSec.section] = weekNumber
              } else {
                const extraTotal2 = extraDef2?.anchors?.length || 0
                const extraCompleted2 = extraSec.completedAnchors || []
                if (extraTotal2 === 0 || extraCompleted2.length >= extraTotal2) {
                  rotationOverrides[gymName].ropeResets[extraSec.section] = weekNumber
                }
              }
            }
          })
        }
      }
    })

    // Post-schedule: detect rotation violations for multi-day sections
    Object.entries(schedule).forEach(([key, shift]) => {
      if (!shift?.multiDayProgress || shift.multiDayProgress.day !== 1) return
      const idx = key.lastIndexOf('-')
      const gymName = key.slice(0, idx)
      const sectionKey = `${gymName}:${shift.section}`

      if (!multiDaySectionHistory[sectionKey]) {
        multiDaySectionHistory[sectionKey] = []
      }

      const prevWeeks = multiDaySectionHistory[sectionKey]
      if (prevWeeks.length > 0) {
        const lastScheduledWeek = prevWeeks[prevWeeks.length - 1]
        const gap = weekNumber - lastScheduledWeek
        const gym = GYMS.find((g) => g.name === gymName)
        const sec = (ROPE_SECTIONS[gymName] || []).find((s) => s.name === shift.section)
        const rotationGoal = sec?.autobelay ? 5 : (gym?.ropeRotationWeeks || 10)

        if (gap < rotationGoal) {
          const msg = `⚠️ ${shift.section} scheduled in Week ${lastScheduledWeek} AND Week ${weekNumber} (only ${gap} weeks apart, rotation requires ${rotationGoal})`
          warnings.push(msg)
          console.warn(msg)
        }
      }

      prevWeeks.push(weekNumber)
    })

    results[weekNumber] = { schedule, warnings }
    runningHistory[weekNumber] = schedule

    console.groupEnd()
  }

  console.log(`\n=== Extended Schedule Summary ===`)
  console.log(`  Weeks scheduled: ${endWeek - startWeek + 1}`)
  const totalShifts = Object.values(results).reduce((sum, r) => sum + Object.keys(r.schedule).length, 0)
  const totalWarnings = Object.values(results).reduce((sum, r) => sum + r.warnings.length, 0)
  console.log(`  Total shifts: ${totalShifts}`)
  console.log(`  Total warnings: ${totalWarnings}`)

  // Summary of multi-day section scheduling across all weeks
  if (Object.keys(multiDaySectionHistory).length > 0) {
    console.group('Multi-day section rotation summary:')
    Object.entries(multiDaySectionHistory).forEach(([sectionKey, weeks]) => {
      console.log(`  ${sectionKey}: scheduled in weeks [${weeks.join(', ')}]`)
    })
    console.groupEnd()
  }

  console.groupEnd()

  return { results, cumulativeStats }
}
