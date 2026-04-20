/**
 * Undo/Redo manager for schedule state.
 * Session-only (not persisted to localStorage).
 * Per-week undo history — resets when navigating to a different week.
 */

const MAX_HISTORY = 50

export function createUndoManager() {
  return {
    undoStack: [],   // past states (most recent at end)
    redoStack: [],   // future states (most recent at end)
    labels: [],      // label per undo entry
    redoLabels: [],
  }
}

/**
 * Push a snapshot before a mutation. Call this BEFORE changing the schedule.
 * @param {object} manager - undo manager state
 * @param {object} weekSchedule - deep clone of current week's schedule
 * @param {string} label - human-readable description of what's about to happen
 * @returns {object} new manager state
 */
export function pushUndo(manager, weekSchedule, label = 'Change') {
  const snapshot = JSON.parse(JSON.stringify(weekSchedule || {}))
  const undoStack = [...manager.undoStack, snapshot]
  const labels = [...manager.labels, label]

  // Trim to max
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift()
    labels.shift()
  }

  return {
    undoStack,
    redoStack: [],   // clear redo on new action
    labels,
    redoLabels: [],
  }
}

/**
 * Undo: pop last state from undo stack, push current to redo.
 * @param {object} manager
 * @param {object} currentWeekSchedule - current state to push to redo
 * @returns {{ manager, schedule, label } | null} - null if nothing to undo
 */
export function undo(manager, currentWeekSchedule) {
  if (manager.undoStack.length === 0) return null

  const undoStack = [...manager.undoStack]
  const labels = [...manager.labels]
  const restored = undoStack.pop()
  const label = labels.pop()

  const redoStack = [...manager.redoStack, JSON.parse(JSON.stringify(currentWeekSchedule || {}))]
  const redoLabels = [...manager.redoLabels, label]

  return {
    manager: { undoStack, redoStack, labels, redoLabels },
    schedule: restored,
    label,
  }
}

/**
 * Redo: pop last state from redo stack, push current to undo.
 * @param {object} manager
 * @param {object} currentWeekSchedule
 * @returns {{ manager, schedule, label } | null}
 */
export function redo(manager, currentWeekSchedule) {
  if (manager.redoStack.length === 0) return null

  const redoStack = [...manager.redoStack]
  const redoLabels = [...manager.redoLabels]
  const restored = redoStack.pop()
  const label = redoLabels.pop()

  const undoStack = [...manager.undoStack, JSON.parse(JSON.stringify(currentWeekSchedule || {}))]
  const labels = [...manager.labels, label]

  return {
    manager: { undoStack, redoStack, labels, redoLabels },
    schedule: restored,
    label,
  }
}

/**
 * Check if undo/redo is available
 */
export function canUndo(manager) {
  return manager.undoStack.length > 0
}

export function canRedo(manager) {
  return manager.redoStack.length > 0
}

/**
 * Get labels for display
 */
export function getUndoLabel(manager) {
  if (manager.labels.length === 0) return null
  return manager.labels[manager.labels.length - 1]
}

export function getRedoLabel(manager) {
  if (manager.redoLabels.length === 0) return null
  return manager.redoLabels[manager.redoLabels.length - 1]
}

/**
 * Get recent history for the history dropdown (last N entries)
 */
export function getUndoHistory(manager, count = 10) {
  const entries = []
  for (let i = manager.labels.length - 1; i >= 0 && entries.length < count; i--) {
    entries.push({ index: i, label: manager.labels[i] })
  }
  return entries
}
