import { GYMS } from '../data/gyms'
import { BOULDER_SECTIONS, ROPE_SECTIONS } from '../data/sections'
import { computeRotationTracking } from './analytics'
import { loadSectionAges, getEffectiveAge } from '../data/section-ages'
import { parseMultiDayRules, getConsecutiveDays } from './multi-day-helpers'

/**
 * Compute the effective weeks-since-reset for a section.
 * If rotationOverrides has an entry for this section, it takes priority over
 * both manual overrides and auto-tracked history (used by extended scheduler
 * to reflect resets made in earlier weeks of the same scheduling batch).
 */
function getWeeksSinceReset(gym, type, secName, autoLastReset, weekNumber, manualAges, rotationOverrides) {
  // Rotation overrides from extended scheduling take highest priority
  if (rotationOverrides) {
    const overrideResets = type === 'boulder'
      ? rotationOverrides[gym.name]?.boulderResets
      : rotationOverrides[gym.name]?.ropeResets
    const overrideWeek = overrideResets?.[secName]
    if (overrideWeek != null) {
      return {
        weeksSince: Math.max(0, weekNumber - overrideWeek),
        lastResetWeek: overrideWeek,
        source: 'extended-override',
      }
    }
  }

  // Fall back to normal getEffectiveAge (manual overrides + auto-tracked)
  const effective = getEffectiveAge(manualAges, gym.name, type, secName, autoLastReset, weekNumber)
  const rotationGoal = type === 'boulder' ? gym.boulderRotationWeeks : gym.ropeRotationWeeks
  return {
    weeksSince: effective.weeksOld != null ? effective.weeksOld : rotationGoal + 10,
    lastResetWeek: effective.lastResetWeek,
    source: effective.source,
  }
}

/**
 * Select which sections should be set this week for each gym,
 * based on rotation tracking (most overdue first).
 * Manual age overrides from section-ages are respected.
 *
 * options.rotationOverrides - if provided, takes priority over manual overrides
 *   and auto-tracked history. Used by extended scheduler to reflect resets from
 *   earlier weeks in the same batch. Shape: { [gymName]: { boulderResets: {}, ropeResets: {} } }
 *
 * @param {object} scheduleHistory - full schedule history keyed by week number
 * @param {number} weekNumber - the week being scheduled
 * @returns {{ [gymName]: { boulder: object|null, rope: object[] } }}
 */
export function selectSectionsForWeek(scheduleHistory, weekNumber, options = {}) {
  const optimizeRotations = options.optimizeForRotations !== false
  const rotationOverrides = options.rotationOverrides || null
  const tracking = computeRotationTracking(scheduleHistory, weekNumber - 1)
  const manualAges = loadSectionAges()
  const selections = {}

  console.group(`[Section Selection] Week ${weekNumber}${optimizeRotations ? '' : ' (rotation optimization OFF)'}${rotationOverrides ? ' (with rotation overrides)' : ''}`)

  GYMS.forEach((gym) => {
    const gt = tracking[gym.name]
    selections[gym.name] = { boulder: null, rope: [] }

    // ---- Boulder: pick the single most-overdue section (or first if optimization off) ----
    const hasBoulderDay = gym.boulderDays?.length > 0
    if (hasBoulderDay) {
      const boulderSections = BOULDER_SECTIONS[gym.name] || []

      if (!optimizeRotations) {
        if (boulderSections.length > 0) {
          const sec = boulderSections[0]
          selections[gym.name].boulder = { ...sec, weeksSinceReset: 0, overdueBy: 0 }
          console.log(`  ${gym.name} Boulder: "${sec.name}" (rotation optimization off — first section)`)
        }
      } else {
        let bestSection = null
        let bestOverdue = -Infinity

        boulderSections.forEach((sec) => {
          const autoLastReset = gt.boulderResets[sec.name]
          const age = getWeeksSinceReset(gym, 'boulder', sec.name, autoLastReset, weekNumber, manualAges, rotationOverrides)
          const overdueBy = age.weeksSince - gym.boulderRotationWeeks

          if (age.weeksSince > bestOverdue) {
            bestOverdue = age.weeksSince
            bestSection = { ...sec, weeksSinceReset: age.weeksSince, overdueBy }
          }
        })

        if (bestSection) {
          selections[gym.name].boulder = bestSection
          console.log(
            `  ${gym.name} Boulder: "${bestSection.name}" ` +
            `(${bestSection.weeksSinceReset} weeks since reset, ` +
            `goal ${gym.boulderRotationWeeks}, ` +
            `${bestSection.overdueBy > 0 ? `OVERDUE by ${bestSection.overdueBy}` : `due in ${-bestSection.overdueBy}`})`
          )
        } else {
          console.log(`  ${gym.name} Boulder: no sections found`)
        }
      }
    }

    // ---- Rope: pick 2-3 most overdue/nearly due sections ----
    const hasRopeDays =
      (gym.ropeDays?.length > 0) || (gym.flexDays?.length > 0)

    if (hasRopeDays) {
      const ropeSections = ROPE_SECTIONS[gym.name] || []
      const candidates = []

      // Determine available rope days for this gym (needed for multi-day validation)
      const availableRopeDays = [...(gym.ropeDays || []), ...(gym.flexDays || [])]
        .filter((d, i, a) => a.indexOf(d) === i)

      ropeSections.forEach((sec) => {
        // Skip manual-only sections (e.g. Speed Wall)
        if (sec.specialRules?.includes('manual only')) return

        const rotationGoal = sec.autobelay ? 5 : gym.ropeRotationWeeks
        const autoLastReset = gt.ropeResets[sec.name]
        const age = getWeeksSinceReset(gym, 'rope', sec.name, autoLastReset, weekNumber, manualAges, rotationOverrides)
        const weeksSince = age.weeksSince
        const overdueBy = weeksSince - rotationGoal

        const rules = parseMultiDayRules(sec.specialRules)

        // Log rotation check for multi-day / special-rule sections
        if (rules.multiDay || sec.specialRules) {
          console.log(
            `    Checking "${sec.name}": last reset week ${age.lastResetWeek ?? 'never'} (source: ${age.source}), ` +
            `current week ${weekNumber}, weeks since ${weeksSince}, ` +
            `rotation goal ${rotationGoal}, can select? ${weeksSince >= rotationGoal}`
          )
        }

        // Multi-day section validation
        if (rules.multiDay) {
          // Ensure enough consecutive days exist
          let hasValidDays = false
          for (const startDay of availableRopeDays) {
            const days = getConsecutiveDays(startDay, rules.numDays, gym.name)
            if (days.length >= rules.numDays) {
              hasValidDays = true
              break
            }
          }
          if (!hasValidDays) {
            console.log(`    SKIP "${sec.name}" — not enough consecutive days available`)
            return
          }

          // Strict rotation enforcement for multi-day sections:
          // Only select if full rotation cycle has passed since last reset
          if (optimizeRotations && weeksSince < rotationGoal) {
            console.log(
              `    SKIP "${sec.name}" — only ${weeksSince}/${rotationGoal} weeks since last reset (need full rotation)`
            )
            return
          }
        }

        // Rotation check for ALL sections (not just multi-day)
        if (optimizeRotations) {
          if (rules.multiDay) {
            // Multi-day sections already passed the strict check above — include
            candidates.push({
              ...sec,
              rotationGoal,
              weeksSinceReset: weeksSince,
              overdueBy,
            })
          } else if (weeksSince >= rotationGoal - 1) {
            // Single-day: include if at least nearly due (within 1 week of goal) or never set
            candidates.push({
              ...sec,
              rotationGoal,
              weeksSinceReset: weeksSince,
              overdueBy,
            })
          }
        } else {
          // Include all sections regardless of overdue status
          candidates.push({
            ...sec,
            rotationGoal,
            weeksSinceReset: weeksSince,
            overdueBy,
          })
        }
      })

      // Boost partially-completed sections to the top so they get finished first
      // Skip sections with special rules — they follow their own completion logic
      const partials = tracking._partialCompletions?.[gym.name] || {}
      candidates.forEach((c) => {
        if (c.specialRules) return // Special rules bypass partial tracking
        const partial = partials[c.name]
        if (partial) {
          c.hasPartial = true
          c.partialCompletedAnchors = partial.completedAnchors
          c.partialTotalAnchors = partial.totalAnchors
          c.partialWeek = partial.week
        }
      })

      // Sort: partially-completed first, then by most overdue
      candidates.sort((a, b) => {
        if (a.hasPartial && !b.hasPartial) return -1
        if (!a.hasPartial && b.hasPartial) return 1
        return b.overdueBy - a.overdueBy
      })

      // Take top 3 (or fewer if not enough are due)
      const maxRopePicks = 3
      const picked = candidates.slice(0, maxRopePicks)

      selections[gym.name].rope = picked

      if (picked.length > 0) {
        console.log(`  ${gym.name} Rope: ${picked.length} section(s) selected`)
        picked.forEach((sec) => {
          const typeLabel = sec.autobelay ? 'AUTOBELAY' : 'ROPE'
          console.log(
            `    - "${sec.name}" [${typeLabel}] ` +
            `(${sec.weeksSinceReset} weeks since reset, ` +
            `goal ${sec.rotationGoal}, ` +
            `${sec.overdueBy > 0 ? `OVERDUE by ${sec.overdueBy}` : `due in ${-sec.overdueBy}`})` +
            `${sec.specialRules ? ` [Special: ${sec.specialRules}]` : ''}`
          )
        })
      } else {
        console.log(`  ${gym.name} Rope: no sections due for reset`)
      }
    }
  })

  console.groupEnd()
  return selections
}
