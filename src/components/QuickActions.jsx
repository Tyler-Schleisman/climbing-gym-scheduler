import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Zap, Trash2, Copy, ArrowLeftRight, Droplets, Scale, UserPlus,
  UserMinus, ChevronDown, AlertTriangle, Check, Undo2, X,
  ClipboardPaste, Calendar, FileWarning, ClipboardCheck,
} from 'lucide-react'
import { STAFF } from '../data/staff'
import { GYMS } from '../data/gyms'
import { getOpenRecords } from '../data/missed-shifts'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

// ---- QuickActions dropdown button ----

export default function QuickActions({
  weekSchedule,
  currentWeek,
  onBatchUpdate, // (updatedWeekSchedule) => void — replaces entire week
  scheduleHistory,
  onScheduleHistoryUpdate, // (updatedHistory) => void — for copy/paste across weeks
  showToast,
  onShowMissedShifts,
}) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(null) // { action, title, ... }
  const [undoSnapshot, setUndoSnapshot] = useState(null) // { schedule, timer }
  const ref = useRef(null)
  const undoTimerRef = useRef(null)

  // Outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open && !dialog) return
    function handleKey(e) {
      if (e.key === 'Escape') {
        if (dialog) setDialog(null)
        else setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, dialog])

  // Undo support
  const saveUndo = useCallback((schedule) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    const timer = setTimeout(() => setUndoSnapshot(null), 6000)
    undoTimerRef.current = timer
    setUndoSnapshot({ schedule })
  }, [])

  const handleUndo = useCallback(() => {
    if (!undoSnapshot) return
    onBatchUpdate(undoSnapshot.schedule)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoSnapshot(null)
    showToast('Action undone', 'info')
  }, [undoSnapshot, onBatchUpdate, showToast])

  const dismissUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoSnapshot(null)
  }, [])

  const openAction = useCallback((action) => {
    setOpen(false)
    setDialog(action)
  }, [])

  // ---- Count what will be affected ----
  const countAssignments = useCallback((filter) => {
    let count = 0
    Object.entries(weekSchedule || {}).forEach(([key, shift]) => {
      if (!shift) return
      if (filter && !filter(key, shift)) return
      count += (shift.assignedStaff?.length || 0)
      if (shift.additionalSections?.length) {
        shift.additionalSections.forEach((es) => { count += (es.assignedStaff?.length || 0) })
      }
      if (shift.holdWasher) count++
      if (shift.flexHoldWashers?.length) count += shift.flexHoldWashers.length
    })
    return count
  }, [weekSchedule])

  // ---- Action Executors ----

  const executeClearDay = useCallback((day) => {
    saveUndo({ ...weekSchedule })
    const updated = { ...weekSchedule }
    let cleared = 0
    Object.keys(updated).forEach((key) => {
      if (key.endsWith(`-${day}`) && updated[key]) {
        cleared += (updated[key].assignedStaff?.length || 0)
        if (updated[key].additionalSections?.length) {
          updated[key].additionalSections.forEach((es) => { cleared += (es.assignedStaff?.length || 0) })
        }
        updated[key] = {
          ...updated[key],
          assignedStaff: [],
          holdWasher: null,
          flexHoldWashers: [],
          additionalSections: undefined,
        }
      }
    })
    onBatchUpdate(updated)
    showToast(`Cleared ${cleared} assignments for ${day}`)
    setDialog(null)
  }, [weekSchedule, onBatchUpdate, saveUndo, showToast])

  const executeClearWeek = useCallback(() => {
    saveUndo({ ...weekSchedule })
    const updated = {}
    let cleared = 0
    Object.entries(weekSchedule || {}).forEach(([key, shift]) => {
      if (!shift) return
      cleared += (shift.assignedStaff?.length || 0)
      if (shift.additionalSections?.length) {
        shift.additionalSections.forEach((es) => { cleared += (es.assignedStaff?.length || 0) })
      }
      updated[key] = {
        ...shift,
        assignedStaff: [],
        holdWasher: null,
        flexHoldWashers: [],
        additionalSections: undefined,
      }
    })
    onBatchUpdate(updated)
    showToast(`Cleared ${cleared} assignments for the week`)
    setDialog(null)
  }, [weekSchedule, onBatchUpdate, saveUndo, showToast])

  const executeClearGym = useCallback((gymName) => {
    saveUndo({ ...weekSchedule })
    const updated = { ...weekSchedule }
    let cleared = 0
    Object.keys(updated).forEach((key) => {
      if (key.startsWith(`${gymName}-`) && updated[key]) {
        cleared += (updated[key].assignedStaff?.length || 0)
        updated[key] = {
          ...updated[key],
          assignedStaff: [],
          holdWasher: null,
          flexHoldWashers: [],
        }
      }
    })
    onBatchUpdate(updated)
    showToast(`Cleared ${cleared} assignments for ${gymName}`)
    setDialog(null)
  }, [weekSchedule, onBatchUpdate, saveUndo, showToast])

  const executeRemoveSetter = useCallback((setterId) => {
    saveUndo({ ...weekSchedule })
    const updated = { ...weekSchedule }
    let removed = 0
    Object.keys(updated).forEach((key) => {
      const shift = updated[key]
      if (!shift) return
      let changed = false
      let newShift = { ...shift }
      if (newShift.assignedStaff?.includes(setterId)) {
        newShift.assignedStaff = newShift.assignedStaff.filter((id) => id !== setterId)
        removed++
        changed = true
      }
      if (newShift.holdWasher === setterId) {
        newShift.holdWasher = null
        changed = true
      }
      if (newShift.flexHoldWashers?.includes(setterId)) {
        newShift.flexHoldWashers = newShift.flexHoldWashers.filter((id) => id !== setterId)
        changed = true
      }
      if (changed) updated[key] = newShift
    })
    const setter = STAFF.find((s) => s.id === setterId)
    onBatchUpdate(updated)
    showToast(`Removed ${setter?.name || 'setter'} from ${removed} shift${removed !== 1 ? 's' : ''}`)
    setDialog(null)
  }, [weekSchedule, onBatchUpdate, saveUndo, showToast])

  const executeSwapSetters = useCallback((id1, id2) => {
    saveUndo({ ...weekSchedule })
    const updated = { ...weekSchedule }
    let swapped = 0
    Object.keys(updated).forEach((key) => {
      const shift = updated[key]
      if (!shift) return
      let newShift = { ...shift }
      let changed = false

      // Swap in assignedStaff
      if (newShift.assignedStaff) {
        const has1 = newShift.assignedStaff.includes(id1)
        const has2 = newShift.assignedStaff.includes(id2)
        if (has1 !== has2) {
          newShift.assignedStaff = newShift.assignedStaff.map((id) => {
            if (id === id1) return id2
            if (id === id2) return id1
            return id
          })
          swapped++
          changed = true
        }
      }

      // Swap holdWasher
      if (newShift.holdWasher === id1) { newShift.holdWasher = id2; changed = true }
      else if (newShift.holdWasher === id2) { newShift.holdWasher = id1; changed = true }

      // Swap flexHoldWashers
      if (newShift.flexHoldWashers) {
        const fHas1 = newShift.flexHoldWashers.includes(id1)
        const fHas2 = newShift.flexHoldWashers.includes(id2)
        if (fHas1 !== fHas2) {
          newShift.flexHoldWashers = newShift.flexHoldWashers.map((id) => {
            if (id === id1) return id2
            if (id === id2) return id1
            return id
          })
          changed = true
        }
      }

      if (changed) updated[key] = newShift
    })
    const s1 = STAFF.find((s) => s.id === id1)
    const s2 = STAFF.find((s) => s.id === id2)
    onBatchUpdate(updated)
    showToast(`Swapped ${s1?.name} and ${s2?.name} (${swapped} shift${swapped !== 1 ? 's' : ''})`)
    setDialog(null)
  }, [weekSchedule, onBatchUpdate, saveUndo, showToast])

  const executeCopyWeek = useCallback((targetWeek, mode) => {
    if (targetWeek === currentWeek) return
    const source = weekSchedule || {}
    let copied = {}
    if (mode === 'full') {
      copied = JSON.parse(JSON.stringify(source))
    } else {
      // Template: sections only, no staff
      Object.entries(source).forEach(([key, shift]) => {
        if (!shift) return
        copied[key] = {
          shiftType: shift.shiftType,
          section: shift.section,
          assignedStaff: [],
          holdWasher: null,
          flexHoldWashers: [],
          notes: shift.notes || '',
          completedAnchors: [],
          multiDayProgress: null,
        }
      })
    }
    onScheduleHistoryUpdate({
      ...scheduleHistory,
      [targetWeek]: copied,
    })
    showToast(`${mode === 'full' ? 'Copied' : 'Templated'} to Week ${targetWeek}`)
    setDialog(null)
  }, [weekSchedule, currentWeek, scheduleHistory, onScheduleHistoryUpdate, showToast])

  return (
    <>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          style={styles.mainBtn}
          onClick={() => setOpen((p) => !p)}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)' }}
          title="Quick batch actions"
        >
          <Zap size={14} />
          Quick Actions
          <ChevronDown size={12} style={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }} />
        </button>

        {open && (
          <div style={styles.dropdown}>
            <div style={styles.dropdownLabel}>Clear</div>
            <DropdownItem icon={Calendar} label="Clear Day..." desc="Remove all assignments for a day"
              onClick={() => openAction({ type: 'clearDay' })} />
            <DropdownItem icon={Trash2} label="Clear Week" desc="Remove all assignments this week"
              onClick={() => openAction({ type: 'clearWeek' })} warn />
            <DropdownItem icon={Trash2} label="Clear Gym..." desc="Remove all assignments for a gym"
              onClick={() => openAction({ type: 'clearGym' })} />

            <div style={styles.dropdownDivider} />
            <div style={styles.dropdownLabel}>Setters</div>
            <DropdownItem icon={ArrowLeftRight} label="Swap Setters..." desc="Swap two setters' assignments"
              onClick={() => openAction({ type: 'swapSetters' })} />
            <DropdownItem icon={UserMinus} label="Remove Setter..." desc="Unassign a setter from all shifts"
              onClick={() => openAction({ type: 'removeSetter' })} />

            <div style={styles.dropdownDivider} />
            <div style={styles.dropdownLabel}>Copy</div>
            <DropdownItem icon={Copy} label="Copy Week To..." desc="Copy schedule to another week"
              onClick={() => openAction({ type: 'copyWeek' })} />

            <div style={styles.dropdownDivider} />
            <div style={styles.dropdownLabel}>Missed Shifts</div>
            <DropdownItem icon={FileWarning} label="Report Missed Shift" desc="Mark a shift as incomplete"
              onClick={() => { setOpen(false); if (onShowMissedShifts) onShowMissedShifts('report') }} warn />
            <DropdownItem icon={ClipboardCheck} label="View Incomplete Work" desc={`${getOpenRecords().length} open items`}
              onClick={() => { setOpen(false); if (onShowMissedShifts) onShowMissedShifts('view') }} />
          </div>
        )}
      </div>

      {/* Action Dialogs */}
      {dialog && (
        <ActionDialog
          dialog={dialog}
          weekSchedule={weekSchedule}
          currentWeek={currentWeek}
          countAssignments={countAssignments}
          onClearDay={executeClearDay}
          onClearWeek={executeClearWeek}
          onClearGym={executeClearGym}
          onRemoveSetter={executeRemoveSetter}
          onSwapSetters={executeSwapSetters}
          onCopyWeek={executeCopyWeek}
          onClose={() => setDialog(null)}
        />
      )}

      {/* Undo toast */}
      {undoSnapshot && (
        <div style={styles.undoToast}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
            Action applied
          </span>
          <button onClick={handleUndo} style={styles.undoBtn}>
            <Undo2 size={12} /> Undo
          </button>
          <button onClick={dismissUndo} style={styles.undoDismiss}>
            <X size={12} />
          </button>
        </div>
      )}
    </>
  )
}


// ---- Dropdown Item ----

function DropdownItem({ icon: Icon, label, desc, onClick, warn }) {
  return (
    <button
      style={styles.dropdownItem}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <Icon size={14} color={warn ? '#f87171' : '#94a3b8'} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: warn ? '#f87171' : '#e2e8f0' }}>{label}</div>
        {desc && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{desc}</div>}
      </div>
    </button>
  )
}


// ---- Action Dialog (modal) ----

function ActionDialog({
  dialog, weekSchedule, currentWeek, countAssignments,
  onClearDay, onClearWeek, onClearGym, onRemoveSetter, onSwapSetters, onCopyWeek, onClose,
}) {
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedGym, setSelectedGym] = useState(null)
  const [selectedSetter1, setSelectedSetter1] = useState(null)
  const [selectedSetter2, setSelectedSetter2] = useState(null)
  const [targetWeek, setTargetWeek] = useState(currentWeek + 1)
  const [copyMode, setCopyMode] = useState('full')

  // Count for selected clear
  const clearDayCount = useMemo(() => {
    if (!selectedDay) return 0
    return countAssignments((key) => key.endsWith(`-${selectedDay}`))
  }, [selectedDay, countAssignments])

  const clearGymCount = useMemo(() => {
    if (!selectedGym) return 0
    return countAssignments((key) => key.startsWith(`${selectedGym}-`))
  }, [selectedGym, countAssignments])

  const clearWeekCount = useMemo(() => countAssignments(), [countAssignments])

  // Setter shift counts
  const setterShiftCounts = useMemo(() => {
    const counts = {}
    STAFF.forEach((s) => { counts[s.id] = 0 })
    Object.values(weekSchedule || {}).forEach((shift) => {
      if (!shift) return
      shift.assignedStaff?.forEach((id) => { if (counts[id] != null) counts[id]++ })
      if (shift.holdWasher != null && counts[shift.holdWasher] != null) counts[shift.holdWasher]++
      if (shift.flexHoldWashers) shift.flexHoldWashers.forEach((id) => { if (counts[id] != null) counts[id]++ })
    })
    return counts
  }, [weekSchedule])

  let title = ''
  let content = null
  let canConfirm = false
  let confirmLabel = 'Confirm'
  let confirmDanger = false
  let onConfirm = null

  switch (dialog.type) {
    case 'clearDay':
      title = 'Clear Day'
      confirmLabel = selectedDay ? `Clear ${selectedDay}` : 'Select a day'
      confirmDanger = true
      canConfirm = !!selectedDay
      onConfirm = () => onClearDay(selectedDay)
      content = (
        <>
          <div style={styles.dialogDesc}>Select a day to clear all assignments:</div>
          <div style={styles.chipRow}>
            {DAYS.slice(0, 4).map((day) => (
              <Chip key={day} label={day} selected={selectedDay === day}
                onClick={() => setSelectedDay(day)} />
            ))}
          </div>
          {selectedDay && (
            <div style={styles.impactBox}>
              <AlertTriangle size={14} color="#f59e0b" />
              <span>This will clear <strong>{clearDayCount}</strong> assignment{clearDayCount !== 1 ? 's' : ''} from all gyms on {selectedDay}.</span>
            </div>
          )}
        </>
      )
      break

    case 'clearWeek':
      title = 'Clear Entire Week'
      confirmLabel = 'Clear All'
      confirmDanger = true
      canConfirm = true
      onConfirm = onClearWeek
      content = (
        <div style={styles.impactBox}>
          <AlertTriangle size={14} color="#ef4444" />
          <span>This will clear <strong>{clearWeekCount}</strong> assignment{clearWeekCount !== 1 ? 's' : ''} from all gyms for the entire week. This cannot be automatically undone after 6 seconds.</span>
        </div>
      )
      break

    case 'clearGym':
      title = 'Clear Gym'
      confirmLabel = selectedGym ? `Clear ${selectedGym}` : 'Select a gym'
      confirmDanger = true
      canConfirm = !!selectedGym
      onConfirm = () => onClearGym(selectedGym)
      content = (
        <>
          <div style={styles.dialogDesc}>Select a gym to clear all assignments for the week:</div>
          <div style={styles.chipRow}>
            {GYMS.map((g) => (
              <Chip key={g.name} label={g.name} selected={selectedGym === g.name}
                onClick={() => setSelectedGym(g.name)} />
            ))}
          </div>
          {selectedGym && (
            <div style={styles.impactBox}>
              <AlertTriangle size={14} color="#f59e0b" />
              <span>This will clear <strong>{clearGymCount}</strong> assignment{clearGymCount !== 1 ? 's' : ''} from {selectedGym} this week.</span>
            </div>
          )}
        </>
      )
      break

    case 'removeSetter':
      title = 'Remove Setter from Week'
      confirmLabel = selectedSetter1 ? `Remove ${STAFF.find((s) => s.id === selectedSetter1)?.name}` : 'Select a setter'
      confirmDanger = true
      canConfirm = !!selectedSetter1
      onConfirm = () => onRemoveSetter(selectedSetter1)
      content = (
        <>
          <div style={styles.dialogDesc}>Select a setter to remove from all shifts this week:</div>
          <div style={styles.setterList}>
            {STAFF.filter((s) => setterShiftCounts[s.id] > 0).map((s) => (
              <SetterChip key={s.id} setter={s}
                selected={selectedSetter1 === s.id}
                count={setterShiftCounts[s.id]}
                onClick={() => setSelectedSetter1(s.id)} />
            ))}
          </div>
          {STAFF.filter((s) => setterShiftCounts[s.id] > 0).length === 0 && (
            <div style={styles.emptyNote}>No setters assigned this week.</div>
          )}
        </>
      )
      break

    case 'swapSetters':
      title = 'Swap Setters'
      const s1 = STAFF.find((s) => s.id === selectedSetter1)
      const s2 = STAFF.find((s) => s.id === selectedSetter2)
      confirmLabel = s1 && s2 ? `Swap ${s1.name} ↔ ${s2.name}` : 'Select two setters'
      canConfirm = !!selectedSetter1 && !!selectedSetter2 && selectedSetter1 !== selectedSetter2
      onConfirm = () => onSwapSetters(selectedSetter1, selectedSetter2)
      content = (
        <>
          <div style={styles.dialogDesc}>Select two setters to swap all their assignments:</div>
          <div style={{ marginBottom: '8px' }}>
            <div style={styles.swapLabel}>Setter 1 {s1 && <span style={{ color: '#3b82f6' }}>({s1.name})</span>}</div>
            <div style={styles.setterList}>
              {STAFF.filter((s) => setterShiftCounts[s.id] > 0).map((s) => (
                <SetterChip key={s.id} setter={s}
                  selected={selectedSetter1 === s.id}
                  disabled={selectedSetter2 === s.id}
                  count={setterShiftCounts[s.id]}
                  onClick={() => setSelectedSetter1(s.id)} />
              ))}
            </div>
          </div>
          <div>
            <div style={styles.swapLabel}>Setter 2 {s2 && <span style={{ color: '#10b981' }}>({s2.name})</span>}</div>
            <div style={styles.setterList}>
              {STAFF.filter((s) => setterShiftCounts[s.id] > 0).map((s) => (
                <SetterChip key={s.id} setter={s}
                  selected={selectedSetter2 === s.id}
                  disabled={selectedSetter1 === s.id}
                  count={setterShiftCounts[s.id]}
                  onClick={() => setSelectedSetter2(s.id)} />
              ))}
            </div>
          </div>
          {s1 && s2 && (
            <div style={{ ...styles.impactBox, borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.05)' }}>
              <ArrowLeftRight size={14} color="#3b82f6" />
              <span>All of <strong>{s1.name}</strong>'s assignments will become <strong>{s2.name}</strong>'s and vice versa.</span>
            </div>
          )}
        </>
      )
      break

    case 'copyWeek':
      title = 'Copy Week To...'
      confirmLabel = `${copyMode === 'full' ? 'Copy' : 'Template'} to Week ${targetWeek}`
      canConfirm = targetWeek !== currentWeek && targetWeek >= 0
      onConfirm = () => onCopyWeek(targetWeek, copyMode)
      content = (
        <>
          <div style={styles.dialogDesc}>Copy Week {currentWeek}'s schedule to another week:</div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Target Week:</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button style={styles.weekAdjBtn} onClick={() => setTargetWeek((w) => Math.max(0, w - 1))}>-</button>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0', minWidth: '36px', textAlign: 'center' }}>
                {targetWeek}
              </span>
              <button style={styles.weekAdjBtn} onClick={() => setTargetWeek((w) => w + 1)}>+</button>
            </div>
            {targetWeek === currentWeek && (
              <span style={{ fontSize: '11px', color: '#ef4444' }}>Same as current week</span>
            )}
          </div>
          <div style={styles.dialogDesc}>Copy mode:</div>
          <div style={styles.chipRow}>
            <Chip label="Full Copy" desc="Sections + setters" selected={copyMode === 'full'}
              onClick={() => setCopyMode('full')} />
            <Chip label="Template Only" desc="Sections only, no setters" selected={copyMode === 'template'}
              onClick={() => setCopyMode('template')} />
          </div>
          <div style={{ ...styles.impactBox, borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.05)' }}>
            <ClipboardPaste size={14} color="#3b82f6" />
            <span>This will <strong>overwrite</strong> Week {targetWeek}'s schedule.</span>
          </div>
        </>
      )
      break

    default:
      return null
  }

  return (
    <div style={styles.dialogOverlay} onClick={onClose}>
      <div style={styles.dialogModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dialogHeader}>
          <h3 style={styles.dialogTitle}>{title}</h3>
          <button onClick={onClose} style={styles.dialogClose}><X size={16} /></button>
        </div>
        <div style={styles.dialogBody}>
          {content}
        </div>
        <div style={styles.dialogFooter}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{
              ...styles.confirmBtn,
              background: confirmDanger
                ? canConfirm ? 'rgba(239,68,68,0.9)' : 'rgba(239,68,68,0.3)'
                : canConfirm ? 'rgba(59,130,246,0.9)' : 'rgba(59,130,246,0.3)',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.5,
            }}
            onClick={canConfirm ? onConfirm : undefined}
            disabled={!canConfirm}
          >
            <Check size={14} /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}


// ---- Selection Chips ----

function Chip({ label, desc, selected, onClick }) {
  return (
    <button
      style={{
        ...styles.chip,
        background: selected ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
        borderColor: selected ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)',
        color: selected ? '#60a5fa' : '#94a3b8',
      }}
      onClick={onClick}
    >
      {label}
      {desc && <span style={{ fontSize: '9px', color: '#64748b', display: 'block' }}>{desc}</span>}
    </button>
  )
}

function SetterChip({ setter, selected, disabled, count, onClick }) {
  const badge = (() => {
    switch (setter.role) {
      case 'Director': return { label: 'DIR', color: '#a78bfa' }
      case 'Head Setter': return { label: 'HEAD', color: '#60a5fa' }
      case 'Spec Setter': return { label: 'SPEC', color: '#fbbf24' }
      default: return null
    }
  })()

  return (
    <button
      style={{
        ...styles.setterChip,
        background: selected ? 'rgba(59,130,246,0.15)' : disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
        borderColor: selected ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onClick={disabled ? undefined : onClick}
    >
      {badge && (
        <span style={{
          fontSize: '8px', fontWeight: 700, padding: '1px 4px', borderRadius: '3px',
          background: `${badge.color}22`, color: badge.color,
        }}>{badge.label}</span>
      )}
      <span style={{ fontSize: '12px', fontWeight: 600, color: selected ? '#60a5fa' : '#e2e8f0' }}>
        {setter.name}
      </span>
      <span style={{ fontSize: '10px', color: '#64748b', marginLeft: 'auto' }}>
        {count} shift{count !== 1 ? 's' : ''}
      </span>
    </button>
  )
}


// ---- Styles ----

const styles = {
  mainBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(245,158,11,0.3)',
    background: 'rgba(245,158,11,0.1)',
    color: '#f59e0b',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
    minHeight: '38px',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    width: '300px',
    background: 'rgba(15,23,42,0.98)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '12px',
    padding: '6px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.25)',
    backdropFilter: 'blur(16px)',
    zIndex: 100,
    animation: 'slideInUp 0.15s ease-out',
  },
  dropdownLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '6px 10px 2px',
  },
  dropdownDivider: {
    height: '1px',
    background: 'rgba(255,255,255,0.06)',
    margin: '4px 8px',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'background 0.1s',
    color: '#e2e8f0',
    minHeight: '42px',
  },
  dialogOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
    animation: 'modalFadeIn 0.15s ease',
  },
  dialogModal: {
    width: '480px',
    maxWidth: '95vw',
    maxHeight: '80vh',
    background: 'rgba(15,23,42,0.98)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '14px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
    animation: 'modalSlideIn 0.2s ease',
  },
  dialogHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  dialogTitle: {
    margin: 0, fontSize: '16px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.2px',
  },
  dialogClose: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '32px', height: '32px', borderRadius: '8px',
    border: 'none', background: 'rgba(255,255,255,0.06)',
    color: '#94a3b8', cursor: 'pointer',
  },
  dialogBody: {
    padding: '18px 20px',
    overflowY: 'auto',
    flex: 1,
  },
  dialogDesc: {
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '10px',
  },
  dialogFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '14px 20px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  cancelBtn: {
    padding: '9px 18px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#94a3b8',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: '38px',
  },
  confirmBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '9px 20px',
    borderRadius: '10px',
    border: 'none',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background 0.15s',
    minHeight: '38px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
  chipRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  },
  chip: {
    padding: '8px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.1)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.12s',
    textAlign: 'center',
    minHeight: '36px',
  },
  setterList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    maxHeight: '200px',
    overflowY: 'auto',
    marginBottom: '10px',
  },
  setterChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    transition: 'all 0.12s',
    background: 'transparent',
    minHeight: '36px',
  },
  swapLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    marginBottom: '4px',
  },
  impactBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(245,158,11,0.25)',
    background: 'rgba(245,158,11,0.05)',
    fontSize: '12px',
    color: '#cbd5e1',
    lineHeight: '1.5',
  },
  weekAdjBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.06)',
    color: '#e2e8f0',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoToast: {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    borderRadius: '10px',
    background: 'rgba(30,41,59,0.95)',
    border: '1px solid rgba(59,130,246,0.3)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    backdropFilter: 'blur(8px)',
    zIndex: 400,
    animation: 'modalFadeIn 0.2s ease',
  },
  undoBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(59,130,246,0.4)',
    background: 'rgba(59,130,246,0.15)',
    color: '#60a5fa',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  undoDismiss: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    border: 'none',
    background: 'rgba(255,255,255,0.1)',
    color: '#64748b',
    cursor: 'pointer',
    padding: 0,
  },
  emptyNote: {
    fontSize: '12px',
    color: '#475569',
    fontStyle: 'italic',
    padding: '8px 0',
  },
}
