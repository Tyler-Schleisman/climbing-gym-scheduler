/**
 * Setter preference tracking — low-priority scheduling hints (not constraints).
 * Persisted to localStorage.
 */

const STORAGE_KEY = 'climbing-setter-preferences'

/**
 * Default preferences for a single setter.
 */
export function defaultSetterPrefs() {
  return {
    preferredGyms: [],       // e.g. ['Soma', 'SLC']
    avoidGyms: [],           // gyms they'd rather not work at
    preferredSections: [],   // section names they enjoy
    avoidSections: [],       // sections they'd rather avoid
    difficultyComfort: null,  // 'easy' | 'medium' | 'hard' | null (no pref)
    workloadPreference: null, // 'light' | 'normal' | 'heavy' | null
    partnerPrefs: [],        // setter IDs they work well with
    notes: '',               // free-form notes
  }
}

/**
 * Load all setter preferences from localStorage.
 * Returns { [setterId]: { ...prefs } }
 */
export function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

/**
 * Save all setter preferences to localStorage.
 */
export function savePreferences(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Silently fail on quota errors
  }
}

/**
 * Get preferences for a single setter (with defaults filled in).
 */
export function getSetterPrefs(allPrefs, setterId) {
  const stored = allPrefs[setterId]
  if (!stored) return defaultSetterPrefs()
  return { ...defaultSetterPrefs(), ...stored }
}

/**
 * Update preferences for a single setter.
 */
export function updateSetterPrefs(allPrefs, setterId, updates) {
  const current = getSetterPrefs(allPrefs, setterId)
  const next = { ...allPrefs, [setterId]: { ...current, ...updates } }
  savePreferences(next)
  return next
}

/**
 * Check if a setter has any preferences set.
 */
export function hasPreferences(allPrefs, setterId) {
  const p = allPrefs[setterId]
  if (!p) return false
  return (
    (p.preferredGyms?.length > 0) ||
    (p.avoidGyms?.length > 0) ||
    (p.preferredSections?.length > 0) ||
    (p.avoidSections?.length > 0) ||
    p.difficultyComfort ||
    p.workloadPreference ||
    (p.partnerPrefs?.length > 0) ||
    (p.notes && p.notes.trim().length > 0)
  )
}

/**
 * Calculate a preference bonus/penalty for scoring.
 * Returns a small adjustment (-5 to +5) to use as a tie-breaker.
 */
export function getPreferenceScore(allPrefs, setterId, gymName, sectionName, difficulty) {
  const p = getSetterPrefs(allPrefs, setterId)
  let bonus = 0

  // Gym preference: +3 preferred, -3 avoid
  if (p.preferredGyms.includes(gymName)) bonus += 3
  if (p.avoidGyms.includes(gymName)) bonus -= 3

  // Section preference: +3 preferred, -3 avoid
  if (sectionName && p.preferredSections.includes(sectionName)) bonus += 3
  if (sectionName && p.avoidSections.includes(sectionName)) bonus -= 3

  // Difficulty comfort: +2 match
  if (difficulty && p.difficultyComfort && p.difficultyComfort === difficulty) bonus += 2

  // Cap to [-5, +5] range
  return Math.max(-5, Math.min(5, bonus))
}

/**
 * Get a human-readable summary of preference match for a setter+shift.
 */
export function getPreferenceMatchInfo(allPrefs, setterId, gymName, sectionName) {
  const p = getSetterPrefs(allPrefs, setterId)
  const matches = []

  if (p.preferredGyms.includes(gymName)) matches.push('Prefers this gym')
  if (p.avoidGyms.includes(gymName)) matches.push('Prefers other gyms')
  if (sectionName && p.preferredSections.includes(sectionName)) matches.push('Prefers this section')
  if (sectionName && p.avoidSections.includes(sectionName)) matches.push('Prefers other sections')

  return matches
}
