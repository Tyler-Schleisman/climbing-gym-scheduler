import { GYMS } from '../data/gyms'

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

function wordToNumber(word) {
  const map = { one: 1, two: 2, three: 3, four: 4, five: 5 }
  return map[word.toLowerCase()] || parseInt(word) || 2
}

/**
 * Parse specialRules text into a structured object.
 */
export function parseMultiDayRules(specialRules) {
  if (!specialRules) return { multiDay: false }

  // "Two consecutive days, 2 setters per day"
  const consecutiveMatch = specialRules.match(
    /(\w+)\s+consecutive\s+days?,\s*(\d+)\s+setters?\s+per\s+day/i
  )
  if (consecutiveMatch) {
    const numDays = wordToNumber(consecutiveMatch[1])
    return {
      multiDay: true,
      numDays,
      settersPerDay: Array(numDays).fill(parseInt(consecutiveMatch[2])),
    }
  }

  // "Two days: 4 setters day 1, 3 setters day 2"
  const variableMatch = specialRules.match(
    /(\w+)\s+days?:\s*(\d+)\s+setters?\s+day\s*\d+,\s*(\d+)\s+setters?\s+day\s*\d+/i
  )
  if (variableMatch) {
    return {
      multiDay: true,
      numDays: wordToNumber(variableMatch[1]),
      settersPerDay: [parseInt(variableMatch[2]), parseInt(variableMatch[3])],
    }
  }

  // "Two days: 2 setters per day"  (uniform, slightly different format)
  const uniformMatch = specialRules.match(
    /(\w+)\s+days?:\s*(\d+)\s+setters?\s+per\s+day/i
  )
  if (uniformMatch) {
    const numDays = wordToNumber(uniformMatch[1])
    return {
      multiDay: true,
      numDays,
      settersPerDay: Array(numDays).fill(parseInt(uniformMatch[2])),
    }
  }

  return { multiDay: false }
}

/**
 * Get N consecutive calendar days starting from startDay for a given gym.
 * Days must be consecutive on the calendar AND valid setting days for the gym.
 * Returns array of day names, or fewer if consecutive days aren't available.
 */
export function getConsecutiveDays(startDay, numDays, gymName) {
  const gym = GYMS.find((g) => g.name === gymName)
  if (!gym) return [startDay]

  // Build list of valid setting days for this gym
  const settingDays = new Set([
    ...(gym.ropeDays || []),
    ...(gym.flexDays || []),
  ])

  const startIdx = ALL_DAYS.indexOf(startDay)
  if (startIdx < 0) return []

  const result = []

  // Days must be consecutive on the calendar (no gaps)
  for (let i = startIdx; i < ALL_DAYS.length && result.length < numDays; i++) {
    if (settingDays.has(ALL_DAYS[i])) {
      result.push(ALL_DAYS[i])
    } else {
      // Gap in consecutive days — multi-day section can't span non-setting days
      break
    }
  }

  return result
}
