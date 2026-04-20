import { STAFF } from '../data/staff'
import { GYMS } from '../data/gyms'
import { BOULDER_SECTIONS, ROPE_SECTIONS } from '../data/sections'
import { validateSchedule } from './validation'
import { buildWeekContext, selectBestSetters, getWashShiftCount, violatesHardConstraints, parseMultiDayRules } from './auto-scheduler'
import { autoPopulateCompletedAnchors, assignAnchorsToSetters } from './analytics'
import { loadAvailability, getSetterAbsence } from '../data/availability-overrides'

const SHIFT_TYPES = {
  BOULDER: 'Boulder Setting',
  ROPE: 'Rope Setting',
}

function parseKey(key) {
  const idx = key.lastIndexOf('-')
  return { gymName: key.slice(0, idx), day: key.slice(idx + 1) }
}

function deepCloneSchedule(schedule) {
  return JSON.parse(JSON.stringify(schedule))
}

function getStaff(id) {
  return STAFF.find((s) => s.id === id)
}

function getGym(name) {
  return GYMS.find((g) => g.name === name)
}

// ---------------------------------------------------------------------------
// Strategy 1: Relax hold washer requirements
// ---------------------------------------------------------------------------

function relaxHoldWasherRequirements(schedule, violations, weekNumber) {
  // If violations are only about missing hold washers, just clear them
  const holdWashViolations = violations.filter(
    (v) => v.message.toLowerCase().includes('hold wash')
  )
  if (holdWashViolations.length === 0) return null

  const fixed = deepCloneSchedule(schedule)
  let fixedCount = 0

  Object.entries(fixed).forEach(([key, shift]) => {
    if (!shift) return
    const { gymName, day } = parseKey(key)
    const gym = getGym(gymName)

    // If there's a hold washer violation and we have one assigned that is problematic, remove it
    if (shift.holdWasher) {
      const washer = getStaff(shift.holdWasher)
      if (washer && (washer.role === 'Director' || washer.role === 'Head Setter')) {
        shift.holdWasher = null
        fixedCount++
      }
    }

    // If no hold washer and it's a wash day, that's OK — make it optional
    if (gym?.holdWashDays?.includes(day) && !shift.holdWasher) {
      // Hold washer should be an additional person NOT already setting this shift
      const assignedSet = new Set(shift.assignedStaff || [])
      const weekCtx = buildWeekContext(fixed)
      const candidates = STAFF
        .filter((s) => {
          if (assignedSet.has(s.id)) return false // Not already assigned to this shift
          if (s.role === 'Director' || s.role === 'Head Setter') return false
          if (!s.availability.includes(day)) return false
          // Check not busy at another gym this day
          const ctx = weekCtx[s.id]
          if (ctx?.assignedKeys.some((k) => {
            const { day: kDay, gymName: kGym } = parseKey(k)
            return kDay === day && kGym !== gymName
          })) return false
          return true
        })
        .sort((a, b) => getWashShiftCount(a.id, weekCtx) - getWashShiftCount(b.id, weekCtx))

      if (candidates.length > 0) {
        shift.holdWasher = candidates[0].id
        // Do NOT add to assignedStaff — holdWasher is separate from setters
        fixedCount++
      }
      // If no candidates, leave null — it's optional
    }
  })

  if (fixedCount === 0) return null

  const remaining = validateSchedule(fixed, weekNumber)
  return { schedule: fixed, remaining, fixedCount, strategy: 'relaxHoldWasherRequirements' }
}

// ---------------------------------------------------------------------------
// Strategy 2: Reduce rope setter count to minimum (2)
// ---------------------------------------------------------------------------

function reduceRopeSetterCount(schedule, violations, weekNumber) {
  const ropeMaxViolations = violations.filter(
    (v) => v.severity === 'error' && v.message.toLowerCase().includes('exceeds max')
  )
  const ropeMinViolations = violations.filter(
    (v) => v.severity === 'error' && v.message.toLowerCase().includes('minimum 2 setters')
  )

  if (ropeMaxViolations.length === 0 && ropeMinViolations.length === 0) return null

  const fixed = deepCloneSchedule(schedule)
  let fixedCount = 0

  Object.entries(fixed).forEach(([key, shift]) => {
    if (!shift || shift.shiftType !== SHIFT_TYPES.ROPE) return
    const { gymName } = parseKey(key)
    const gym = getGym(gymName)
    if (!gym) return

    const setterIds = (shift.assignedStaff || []).filter((id) => id !== shift.holdWasher)

    // For multi-day sections, enforce exact setter count from special rules
    if (shift.multiDayProgress && shift.section) {
      const sec = (ROPE_SECTIONS[gymName] || []).find((s) => s.name === shift.section)
      if (sec?.specialRules) {
        const rules = parseMultiDayRules(sec.specialRules)
        if (rules.multiDay) {
          const dayIndex = shift.multiDayProgress.day - 1
          const exactCount = rules.settersPerDay[dayIndex] || rules.settersPerDay[0]
          if (setterIds.length > exactCount) {
            // Trim to exact count, keeping head setters first
            const sorted = setterIds
              .map((id) => getStaff(id))
              .filter(Boolean)
              .sort((a, b) => {
                const priority = { 'Head Setter': 0, 'Director': 1, 'Setter': 2, 'Spec Setter': 3 }
                return (priority[a.role] ?? 9) - (priority[b.role] ?? 9)
              })
            const kept = sorted.slice(0, exactCount).map((s) => s.id)
            if (shift.holdWasher && !kept.includes(shift.holdWasher)) {
              kept.push(shift.holdWasher)
            }
            shift.assignedStaff = kept
            fixedCount++
            console.log(`  Trimmed "${shift.section}" Day ${shift.multiDayProgress.day} to ${exactCount} setters (was ${setterIds.length})`)
          }
        }
      }
      return // Don't apply normal max/min logic to multi-day sections
    }

    // Over max: trim to max, keeping head setters and highest-priority staff
    if (gym.maxRopeSetters && setterIds.length > gym.maxRopeSetters) {
      const sorted = setterIds
        .map((id) => getStaff(id))
        .filter(Boolean)
        .sort((a, b) => {
          // Head setters first, then director, then others
          const priority = { 'Head Setter': 0, 'Director': 1, 'Spec Setter': 3, 'Setter': 2 }
          return (priority[a.role] ?? 9) - (priority[b.role] ?? 9)
        })

      const kept = sorted.slice(0, gym.maxRopeSetters).map((s) => s.id)
      // Re-add hold washer if they were separate
      if (shift.holdWasher && !kept.includes(shift.holdWasher)) {
        kept.push(shift.holdWasher)
      }
      shift.assignedStaff = kept
      fixedCount++
    }

    // Under minimum: try to add setters
    if (setterIds.length < 2 && setterIds.length > 0) {
      const weekCtx = buildWeekContext(fixed)
      const needed = 2 - setterIds.length
      const { day } = parseKey(key)
      const { selected } = selectBestSetters(
        {
          count: needed,
          day,
          gym: gymName,
          shiftType: SHIFT_TYPES.ROPE,
          difficulty: 'easy',
        },
        weekCtx,
        weekNumber,
        shift.assignedStaff,
      )
      selected.forEach((s) => shift.assignedStaff.push(s.id))
      if (selected.length > 0) fixedCount++
    }
  })

  if (fixedCount === 0) return null

  const remaining = validateSchedule(fixed, weekNumber)
  return { schedule: fixed, remaining, fixedCount, strategy: 'reduceRopeSetterCount' }
}

// ---------------------------------------------------------------------------
// Strategy 3: Swap setters between days to balance workload
// ---------------------------------------------------------------------------

function swapSettersBetweenDays(schedule, violations, weekNumber) {
  // Look for workload / Ogden-frequency / hard-section warnings
  const balanceViolations = violations.filter(
    (v) => v.severity === 'warning' && (
      v.message.includes('workload') ||
      v.message.includes('Ogden') ||
      v.message.includes('hard sections')
    )
  )
  if (balanceViolations.length === 0) return null

  const fixed = deepCloneSchedule(schedule)
  let fixedCount = 0

  // Identify overloaded setters
  const weekCtx = buildWeekContext(fixed)
  const overloaded = STAFF.filter((s) => {
    const ctx = weekCtx[s.id]
    return ctx && (ctx.totalShifts >= 5 || ctx.ogdenDays > 1 || ctx.hardSections > 2)
  })

  overloaded.forEach((overSetter) => {
    const ctx = weekCtx[overSetter.id]

    // Find a shift where we can swap this setter out
    const swappableKeys = ctx.assignedKeys.filter((key) => {
      const shift = fixed[key]
      if (!shift) return false
      // Don't swap setters in/out of multi-day sections (exact counts required)
      if (shift.multiDayProgress) return false
      // Don't remove head setters from their gym
      if (overSetter.role === 'Head Setter') {
        const { gymName } = parseKey(key)
        if (overSetter.gym === gymName) return false
      }
      // Don't remove from boulder shifts where exact count matters
      if (shift.shiftType === SHIFT_TYPES.BOULDER) return false
      // Must have more than minimum (2) setters
      const setterCount = shift.assignedStaff.filter((id) => id !== shift.holdWasher).length
      return setterCount > 2
    })

    if (swappableKeys.length === 0) return

    // Pick the shift where removing this setter helps most
    const targetKey = swappableKeys[swappableKeys.length - 1] // last assigned
    const shift = fixed[targetKey]
    const { gymName, day } = parseKey(targetKey)

    // Find a replacement setter who is underloaded
    const underloaded = STAFF.filter((s) => {
      if (s.id === overSetter.id) return false
      const sCtx = weekCtx[s.id]
      if (!sCtx) return false
      if (sCtx.totalShifts >= 3) return false
      if (!s.availability.includes(day)) return false
      if (shift.assignedStaff.includes(s.id)) return false
      // Check not already at another gym that day
      const busyElsewhere = sCtx.assignedKeys.some((k) => {
        const { day: kDay, gymName: kGym } = parseKey(k)
        return kDay === day && kGym !== gymName
      })
      if (busyElsewhere) return false
      // Spec setters can't do rope
      if (s.role === 'Spec Setter' && shift.shiftType === SHIFT_TYPES.ROPE) return false
      return true
    })

    if (underloaded.length > 0) {
      const replacement = underloaded[0]
      // Swap
      shift.assignedStaff = shift.assignedStaff.map((id) =>
        id === overSetter.id ? replacement.id : id
      )
      if (shift.holdWasher === overSetter.id) {
        shift.holdWasher = replacement.role !== 'Director' && replacement.role !== 'Head Setter'
          ? replacement.id
          : null
      }
      fixedCount++
    }
  })

  if (fixedCount === 0) return null

  const remaining = validateSchedule(fixed, weekNumber)
  return { schedule: fixed, remaining, fixedCount, strategy: 'swapSettersBetweenDays' }
}

// ---------------------------------------------------------------------------
// Strategy 4: Assign unassigned setters via flex-day shifts
// ---------------------------------------------------------------------------

function assignUnassignedSetters(schedule, violations, weekNumber) {
  const unassignedViolations = violations.filter(
    (v) => v.severity === 'error' && v.day && v.message.includes('not assigned')
  )
  if (unassignedViolations.length === 0) return null

  const fixed = deepCloneSchedule(schedule)
  let fixedCount = 0
  const availData = loadAvailability()

  // Group by day
  const byDay = {}
  unassignedViolations.forEach((v) => {
    if (!byDay[v.day]) byDay[v.day] = []
    byDay[v.day].push(v)
  })

  const weekCtx = buildWeekContext(fixed)

  Object.entries(byDay).forEach(([day, dayViolations]) => {
    // Get the actual unassigned setter IDs
    const unassignedIds = dayViolations.flatMap((v) => v.staffIds || [])
    const unassignedSetters = unassignedIds
      .map((id) => STAFF.find((s) => s.id === id))
      .filter(Boolean)

    let remaining = [...unassignedSetters]

    // Phase 1: Expand existing rope shifts (skip multi-day sections — they have exact counts)
    GYMS.forEach((gym) => {
      if (remaining.length === 0) return
      const key = `${gym.name}-${day}`
      const shift = fixed[key]
      if (!shift?.assignedStaff?.length || shift.shiftType !== SHIFT_TYPES.ROPE) return
      if (shift.multiDayProgress) return // Don't expand multi-day sections beyond their specified counts
      const maxSetters = gym.maxRopeSetters || 4
      const canAdd = maxSetters - shift.assignedStaff.length
      if (canAdd <= 0) return

      const eligible = remaining.filter((s) =>
        !violatesHardConstraints(s, { day, gym: gym.name, shiftType: SHIFT_TYPES.ROPE }, weekNumber) &&
        !shift.assignedStaff.includes(s.id)
      ).slice(0, canAdd)

      eligible.forEach((s) => {
        shift.assignedStaff.push(s.id)
        remaining = remaining.filter((r) => r.id !== s.id)
        fixedCount++
      })
    })

    // Phase 2: Create new rope shifts on flex days
    GYMS.forEach((gym) => {
      if (remaining.length < 2) return
      if (!gym.flexDays?.includes(day)) return
      const key = `${gym.name}-${day}`
      if (fixed[key]?.assignedStaff?.length) return

      const eligible = remaining.filter((s) =>
        !violatesHardConstraints(s, { day, gym: gym.name, shiftType: SHIFT_TYPES.ROPE }, weekNumber)
      )
      if (eligible.length < 2) return

      const maxSetters = gym.maxRopeSetters || 4
      const toAssign = eligible.slice(0, maxSetters)

      const usedSections = new Set(
        Object.entries(fixed)
          .filter(([k]) => k.startsWith(gym.name + '-'))
          .map(([, v]) => v?.section)
          .filter(Boolean)
      )
      const section = (ROPE_SECTIONS[gym.name] || [])
        .find((s) => !usedSections.has(s.name) && !parseMultiDayRules(s.specialRules).multiDay)

      const ropeIds = toAssign.map((s) => s.id)
      const secDef = section ? (ROPE_SECTIONS[gym.name] || []).find((s) => s.name === section.name) : null
      const ropeAssignments = secDef ? assignAnchorsToSetters(ropeIds, null, secDef) : undefined
      fixed[key] = {
        shiftType: SHIFT_TYPES.ROPE,
        section: section?.name || null,
        assignedStaff: ropeIds,
        holdWasher: null,
        notes: 'Added to assign all available setters',
        completedAnchors: secDef ? autoPopulateCompletedAnchors(ropeIds, null, secDef) : [],
        anchorAssignments: ropeAssignments?.setterAssignments?.length ? ropeAssignments : undefined,
        multiDayProgress: null,
      }

      toAssign.forEach((s) => {
        remaining = remaining.filter((r) => r.id !== s.id)
      })
      fixedCount += toAssign.length
    })
  })

  if (fixedCount === 0) return null

  const remaining = validateSchedule(fixed, weekNumber)
  return { schedule: fixed, remaining, fixedCount, strategy: 'assignUnassignedSetters' }
}

// ---------------------------------------------------------------------------
// Strategy 5: Suggest manual intervention
// ---------------------------------------------------------------------------

function suggestManualIntervention(schedule, violations, weekNumber) {
  // This strategy never "fixes" anything — it just produces suggestions
  return {
    schedule: deepCloneSchedule(schedule),
    remaining: violations,
    fixedCount: 0,
    strategy: 'suggestManualIntervention',
  }
}

// ---------------------------------------------------------------------------
// Suggestion generator
// ---------------------------------------------------------------------------

/**
 * Analyze violations and return actionable suggestions.
 */
export function generateSuggestions(violations, schedule, weekNumber) {
  const suggestions = []
  const seen = new Set()

  violations.forEach((v) => {
    // Head setter missing
    if (v.message.includes('must be assigned') && v.message.includes('Head Setter')) {
      const name = v.message.match(/^(\w+)/)?.[1]
      const tip = `${name} needs to be assigned to their gym on that day (head setter requirement)`
      if (!seen.has(tip)) { seen.add(tip); suggestions.push(tip) }
    }

    // Director on wrong day/week
    if (v.message.includes('Director') && v.message.includes('odd week')) {
      suggestions.push(`Remove Eddie from this week's schedule — directors only set on even-numbered weeks`)
    }
    if (v.message.includes('Director') && v.message.includes('only set on Monday')) {
      suggestions.push(`Move Eddie to Monday — directors can only set on Mondays`)
    }

    // Rope minimum
    if (v.message.includes('minimum 2 setters')) {
      const match = v.message.match(/at (\w+) on (\w+)/)
      if (match) {
        const [, gym, day] = match
        const available = STAFF.filter(
          (s) => s.availability.includes(day) && s.role !== 'Spec Setter'
        )
        const needed = 2
        const tip = `${gym} ${day} needs at least ${needed} rope setters — ${available.length} staff available that day`
        if (!seen.has(tip)) { seen.add(tip); suggestions.push(tip) }
      }
    }

    // Rope maximum exceeded
    if (v.message.includes('exceeds max')) {
      const match = v.message.match(/at (\w+) on (\w+).* (\d+) setters exceeds max of (\d+)/)
      if (match) {
        const [, gym, day, have, max] = match
        suggestions.push(`Remove ${have - max} setter(s) from ${gym} ${day} rope shift to stay under the ${max}-setter maximum`)
      }
    }

    // Boulder exact count
    if (v.message.includes('requires exactly') && v.shiftKey) {
      const match = v.message.match(/exactly (\d+) setters \(have (\d+)\)/)
      if (match) {
        const [, required, have] = match
        const diff = required - have
        if (diff > 0) {
          suggestions.push(`Add ${diff} more setter(s) to the boulder shift at ${v.shiftKey.replace('-', ' ')}`)
        } else {
          suggestions.push(`Remove ${-diff} setter(s) from the boulder shift at ${v.shiftKey.replace('-', ' ')}`)
        }
      }
    }

    // Spec setter violations
    if (v.message.includes('Spec Setter') && v.message.includes('rope')) {
      const name = v.message.match(/^(\w+)/)?.[1]
      suggestions.push(`Move ${name} to a boulder or hold wash shift — spec setters cannot do rope setting`)
    }

    // Staff availability
    if (v.message.includes('not available on') && !v.message.includes('Director') && !v.message.includes('Head Setter')) {
      const match = v.message.match(/^(\w+) is not available on (\w+) but assigned to (\w+)/)
      if (match) {
        const [, name, day, gym] = match
        suggestions.push(`Remove ${name} from ${gym} ${day} — they're not available that day`)
      }
    }

    // Workload warnings
    if (v.message.includes('workload')) {
      const name = v.message.match(/^(\w+)/)?.[1]
      suggestions.push(`Consider redistributing some of ${name}'s shifts to less-loaded setters`)
    }

    // Ogden frequency
    if (v.message.includes('Ogden') && v.message.includes('days this week')) {
      const name = v.message.match(/^(\w+)/)?.[1]
      suggestions.push(`${name} is at Ogden multiple days — try swapping one Ogden shift with another setter`)
    }

    // Hard section overload
    if (v.message.includes('hard sections this week')) {
      const name = v.message.match(/^(\w+)/)?.[1]
      suggestions.push(`${name} has too many hard sections — swap one hard shift with a setter who has fewer`)
    }

    // No boulder shift
    if (v.message.includes('no boulder shifts')) {
      const name = v.message.match(/^(\w+)/)?.[1]
      suggestions.push(`Try to include ${name} in a boulder shift this week for variety`)
    }

    // Unassigned setter (per-day)
    if (v.day && v.message.includes('not assigned')) {
      const name = v.message.match(/:\s*(\w+)\s+not assigned/)?.[1]
      if (name) {
        const setter = STAFF.find((s) => s.name === name)
        if (setter?.role === 'Spec Setter') {
          const tip = `${name} (Spec Setter) cannot do rope — needs a boulder or hold wash slot on ${v.day}`
          if (!seen.has(tip)) { seen.add(tip); suggestions.push(tip) }
        } else {
          const flexGyms = GYMS.filter((g) => g.flexDays?.includes(v.day))
          if (flexGyms.length > 0) {
            const tip = `Add rope setting at ${flexGyms.map((g) => g.name).join(' or ')} on ${v.day} to assign ${name}`
            if (!seen.has(tip)) { seen.add(tip); suggestions.push(tip) }
          }
        }
      }
    }
  })

  // Deduplicate
  return [...new Set(suggestions)]
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Attempt to resolve violations in an auto-scheduled week.
 *
 * @param {object} schedule    - the proposed week schedule
 * @param {number} weekNumber
 * @returns {{ schedule: object, success: boolean, message: string, suggestions: string[], strategiesAttempted: string[] }}
 */
export function resolveConflicts(schedule, weekNumber) {
  const strategies = [
    { name: 'relaxHoldWasherRequirements', fn: relaxHoldWasherRequirements },
    { name: 'reduceRopeSetterCount', fn: reduceRopeSetterCount },
    { name: 'assignUnassignedSetters', fn: assignUnassignedSetters },
    { name: 'swapSettersBetweenDays', fn: swapSettersBetweenDays },
    { name: 'suggestManualIntervention', fn: suggestManualIntervention },
  ]

  let current = deepCloneSchedule(schedule)
  let violations = validateSchedule(current, weekNumber)
  const strategiesAttempted = []

  console.group('[Conflict Resolution]')
  console.log(`Starting with ${violations.length} violation(s): ${violations.filter((v) => v.severity === 'error').length} errors, ${violations.filter((v) => v.severity === 'warning').length} warnings`)

  // If no errors, we're good (warnings are acceptable)
  const hasErrors = () => violations.some((v) => v.severity === 'error')

  if (!hasErrors() && violations.length === 0) {
    console.log('No violations — schedule is clean!')
    console.groupEnd()
    return {
      schedule: current,
      success: true,
      message: 'Schedule has no violations.',
      suggestions: [],
      strategiesAttempted: [],
    }
  }

  for (const strategy of strategies) {
    if (strategy.name === 'suggestManualIntervention') {
      // Always run this last to get suggestions, even if no errors
      strategiesAttempted.push(strategy.name)
      console.log(`Trying: ${strategy.name}...`)
      break
    }

    if (!hasErrors() && violations.filter((v) => v.severity === 'warning').length <= 3) {
      // Few enough warnings to be acceptable
      console.log('Remaining violations are acceptable (warnings only)')
      break
    }

    strategiesAttempted.push(strategy.name)
    console.log(`Trying: ${strategy.name}...`)

    const result = strategy.fn(current, violations, weekNumber)

    if (result && result.fixedCount > 0) {
      console.log(`  ✓ Fixed ${result.fixedCount} issue(s)`)
      current = result.schedule
      violations = result.remaining

      if (!hasErrors()) {
        console.log(`  All errors resolved after ${strategy.name}`)
        break
      }
    } else {
      console.log(`  ✗ No fixes applied`)
    }
  }

  // Final validation
  violations = validateSchedule(current, weekNumber)
  const errors = violations.filter((v) => v.severity === 'error')
  const warnings = violations.filter((v) => v.severity === 'warning')
  const suggestions = generateSuggestions(violations, current, weekNumber)

  // Separate constraint errors from capacity (unassigned setter) errors
  const constraintErrors = errors.filter((v) => !v.day)
  const unassignedErrors = errors.filter((v) => v.day)
  const success = constraintErrors.length === 0

  console.log(`\nFinal: ${constraintErrors.length} constraint errors, ${unassignedErrors.length} unassigned-setter errors, ${warnings.length} warnings`)
  console.log(`Strategies attempted: ${strategiesAttempted.join(' → ')}`)
  if (suggestions.length > 0) {
    console.log('Suggestions:')
    suggestions.forEach((s) => console.log(`  - ${s}`))
  }
  console.groupEnd()

  let message
  if (success && unassignedErrors.length === 0) {
    message = warnings.length > 0
      ? `Schedule created with ${warnings.length} warning(s). Review recommended.`
      : 'Schedule created successfully with no violations.'
  } else if (success && unassignedErrors.length > 0) {
    message = `Schedule created. ${unassignedErrors.length} setter-day(s) could not fit — see capacity analysis.`
  } else {
    message = `${constraintErrors.length} constraint error(s) remain. Manual adjustment required.`
  }

  return {
    schedule: current,
    success,
    message,
    suggestions,
    strategiesAttempted,
  }
}
