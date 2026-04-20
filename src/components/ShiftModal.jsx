import { useState, useMemo } from 'react'
import { X, Users, Droplets, AlertTriangle, Check, Heart, Wrench, Plus, Trash2 } from 'lucide-react'
import { InlineReportButton } from './MissedShiftManager'
import { STAFF } from '../data/staff'
import { GYMS } from '../data/gyms'
import { BOULDER_SECTIONS, ROPE_SECTIONS } from '../data/sections'
import { loadAvailability, getSetterAbsence, ABSENCE_TYPES } from '../data/availability-overrides'
import { loadPreferences, getPreferenceMatchInfo, hasPreferences } from '../data/setter-preferences'
import { loadSectionAges, getSectionAge, getAgeStatus, todayWeek } from '../data/section-ages'
import { getMakeupForShift } from '../data/missed-shifts'
import { calculatePartialCompletion, getEffectiveSetterCount, assignAnchorsToSetters } from '../utils/analytics'

const SHIFT_TYPES = {
  BOULDER: 'Boulder Setting',
  ROPE: 'Rope Setting',
  HOLD_WASH: 'Hold Washing',
}

function getGymConfig(gymName) {
  return GYMS.find((g) => g.name === gymName)
}

function getAvailableShiftTypes(gymName, day) {
  const gym = getGymConfig(gymName)
  if (!gym) return []
  const types = []
  if (gym.boulderDays?.includes(day)) types.push(SHIFT_TYPES.BOULDER)
  if (gym.ropeDays?.includes(day)) types.push(SHIFT_TYPES.ROPE)
  if (gym.flexDays?.includes(day)) {
    types.push(SHIFT_TYPES.BOULDER)
    if (!types.includes(SHIFT_TYPES.ROPE)) types.push(SHIFT_TYPES.ROPE)
  }
  return [...new Set(types)]
}

function canHoldWash(gymName, day) {
  const gym = getGymConfig(gymName)
  return gym?.holdWashDays?.includes(day) || false
}

function getSectionsForType(gymName, shiftType) {
  if (shiftType === SHIFT_TYPES.BOULDER) return BOULDER_SECTIONS[gymName] || []
  if (shiftType === SHIFT_TYPES.ROPE) return ROPE_SECTIONS[gymName] || []
  return []
}

function getStaffUnavailableReason(staff, day, gymName, shiftType, weekNumber, weekSchedule) {
  // Check availability overrides (sick, vacation, personal, recurring)
  const availData = loadAvailability()
  const absence = getSetterAbsence(availData, staff.id, weekNumber, day)
  if (absence) {
    const info = ABSENCE_TYPES[absence.type]
    return `${info?.label || absence.type}${absence.notes ? ': ' + absence.notes : ''}`
  }

  // Check day availability
  if (!staff.availability.includes(day)) {
    return `Not available on ${day}`
  }

  // Director: only every other Monday
  if (staff.role === 'Director') {
    if (day !== 'Monday') return 'Director only sets on Monday'
    if (weekNumber % 2 !== 0) return 'Director sets every other Monday (even weeks only)'
  }

  // Head Setter: must be at their gym when it has setting
  if (staff.role === 'Head Setter' && staff.gym !== gymName) {
    const homeGym = GYMS.find((g) => g.name === staff.gym)
    const homeHasSetting = homeGym && (
      homeGym.boulderDays?.includes(day) ||
      homeGym.ropeDays?.includes(day) ||
      homeGym.flexDays?.includes(day)
    )
    if (homeHasSetting) return `${staff.gym} has setting on ${day}`
  }

  // Spec Setter: check availability, only boulder/hold wash
  if (staff.role === 'Spec Setter') {
    if (!staff.availability.includes(day)) return `Not available on ${day}`
    if (shiftType === SHIFT_TYPES.ROPE) return 'Spec setters cannot do rope setting'
  }

  // Check if already assigned to another gym on this day (as setter or hold washer)
  if (weekSchedule) {
    const gymsThisDay = Object.entries(weekSchedule)
      .filter(([key, shift]) => {
        if (!key.endsWith(`-${day}`)) return false
        if (key === `${gymName}-${day}`) return false
        return shift?.assignedStaff?.includes(staff.id) ||
          shift?.holdWasher === staff.id ||
          shift?.flexHoldWashers?.includes(staff.id)
      })
    if (gymsThisDay.length > 0) {
      const otherKey = gymsThisDay[0][0]
      const otherGym = otherKey.split('-')[0]
      const otherShift = gymsThisDay[0][1]
      const role = otherShift?.holdWasher === staff.id ? 'Washing' :
        otherShift?.flexHoldWashers?.includes(staff.id) ? 'Flex washing' : 'Already'
      return `${role} at ${otherGym} on ${day}`
    }
  }

  return null
}

function getDifficultyColor(difficulty) {
  switch (difficulty) {
    case 'easy': return '#10b981'
    case 'medium': return '#f59e0b'
    case 'hard': return '#ef4444'
    default: return '#94a3b8'
  }
}

function getDifficultyBg(difficulty) {
  switch (difficulty) {
    case 'easy': return 'rgba(16,185,129,0.15)'
    case 'medium': return 'rgba(245,158,11,0.15)'
    case 'hard': return 'rgba(239,68,68,0.15)'
    default: return 'rgba(255,255,255,0.05)'
  }
}

function getRoleBadge(role) {
  switch (role) {
    case 'Director': return { label: 'DIR', bg: 'rgba(139,92,246,0.3)', color: '#a78bfa' }
    case 'Head Setter': return { label: 'HEAD', bg: 'rgba(59,130,246,0.3)', color: '#60a5fa' }
    case 'Spec Setter': return { label: 'SPEC', bg: 'rgba(245,158,11,0.3)', color: '#fbbf24' }
    default: return null
  }
}

export default function ShiftModal({
  gymName,
  day,
  currentWeek,
  shift,
  weekSchedule,
  onSave,
  onClose,
}) {
  const availableShiftTypes = useMemo(
    () => getAvailableShiftTypes(gymName, day),
    [gymName, day]
  )

  // Auto-select shift type if only one option
  const initialShiftType = shift?.shiftType
    || (availableShiftTypes.length === 1 ? availableShiftTypes[0] : null)

  const [shiftType, setShiftType] = useState(initialShiftType)
  const [selectedSection, setSelectedSection] = useState(shift?.section || null)
  const [assignedStaff, setAssignedStaff] = useState(shift?.assignedStaff || [])
  const [holdWasher, setHoldWasher] = useState(shift?.holdWasher || null)
  const [notes, setNotes] = useState(shift?.notes || '')
  const [completedAnchors, setCompletedAnchors] = useState(shift?.completedAnchors || [])
  const [additionalSections, setAdditionalSections] = useState(shift?.additionalSections || [])

  const showHoldWash = canHoldWash(gymName, day)

  // Check for scheduled makeup work on this shift
  const makeupRecords = useMemo(
    () => getMakeupForShift(currentWeek, gymName, day),
    [currentWeek, gymName, day]
  )

  const sections = useMemo(
    () => (shiftType ? getSectionsForType(gymName, shiftType) : []),
    [gymName, shiftType]
  )

  const sectionConfig = useMemo(
    () => sections.find((s) => s.name === selectedSection) || null,
    [sections, selectedSection]
  )

  const staffList = useMemo(() => {
    const allPrefs = loadPreferences()
    return STAFF.map((s) => {
      const reason = getStaffUnavailableReason(
        s, day, gymName, shiftType, currentWeek, weekSchedule
      )
      const prefMatches = getPreferenceMatchInfo(allPrefs, s.id, gymName, selectedSection)
      const prefersThis = prefMatches.some((m) => m.includes('Prefers this'))
      const avoidsThis = prefMatches.some((m) => m.includes('Prefers other'))
      return { ...s, unavailableReason: reason, available: !reason, prefMatches, prefersThis, avoidsThis }
    }).sort((a, b) => {
      // Available first, then by role priority, then preferences, then name
      if (a.available !== b.available) return a.available ? -1 : 1
      const rolePriority = { 'Director': 0, 'Head Setter': 1, 'Spec Setter': 2, 'Setter': 3 }
      const rp = (rolePriority[a.role] || 3) - (rolePriority[b.role] || 3)
      if (rp !== 0) return rp
      // Preferred setters sort before non-preferred within same role
      if (a.prefersThis !== b.prefersThis) return a.prefersThis ? -1 : 1
      if (a.avoidsThis !== b.avoidsThis) return a.avoidsThis ? 1 : -1
      return a.name.localeCompare(b.name)
    })
  }, [day, gymName, shiftType, currentWeek, weekSchedule, selectedSection])

  const toggleStaff = (staffId) => {
    setAssignedStaff((prev) =>
      prev.includes(staffId)
        ? prev.filter((id) => id !== staffId)
        : [...prev, staffId]
    )
    // If adding the hold washer as a setter, clear them as hold washer
    // (can't be both a setter and a washer)
    if (holdWasher === staffId && !assignedStaff.includes(staffId)) {
      setHoldWasher(null)
    }
  }

  const toggleHoldWasher = (staffId) => {
    // Check constraints: Directors and Head Setters cannot be hold washers
    const staff = STAFF.find((s) => s.id === staffId)
    if (staff && (staff.role === 'Director' || staff.role === 'Head Setter')) return
    setHoldWasher((prev) => (prev === staffId ? null : staffId))
  }

  const handleSave = () => {
    // Auto-populate completedAnchors if none manually set and we have setters on a rope section
    let finalAnchors = completedAnchors
    if (shiftType === SHIFT_TYPES.ROPE && sectionConfig?.anchors?.length && completedAnchors.length === 0 && assignedStaff.length > 0) {
      const autoCalc = calculatePartialCompletion(getEffectiveSetterCount(assignedStaff, holdWasher), sectionConfig, existingPartialAnchors)
      if (autoCalc.newlyCompleted?.length > 0) {
        finalAnchors = autoCalc.newlyCompleted
      }
    }
    // Build anchor assignments for the save
    const saveAnchorAssignments = (shiftType === SHIFT_TYPES.ROPE && sectionConfig?.anchors?.length && assignedStaff.length > 0)
      ? (() => {
          const result = assignAnchorsToSetters(assignedStaff, holdWasher, sectionConfig, existingPartialAnchors)
          return result.setterAssignments?.length ? result : undefined
        })()
      : undefined
    onSave({
      shiftType,
      section: selectedSection,
      assignedStaff,
      holdWasher,
      notes,
      completedAnchors: finalAnchors,
      anchorAssignments: saveAnchorAssignments,
      multiDayProgress: shift?.multiDayProgress || null,
      additionalSections: additionalSections.length > 0 ? additionalSections : undefined,
    })
  }

  // Reset completedAnchors when section changes
  const handleSectionChange = (secName) => {
    const newSec = secName === selectedSection ? null : secName
    setSelectedSection(newSec)
    // Keep completedAnchors only if same section
    if (newSec !== selectedSection) setCompletedAnchors([])
  }

  const toggleAnchor = (anchorNum) => {
    setCompletedAnchors((prev) =>
      prev.includes(anchorNum)
        ? prev.filter((a) => a !== anchorNum)
        : [...prev, anchorNum].sort((a, b) => a - b)
    )
  }

  const markAllAnchors = () => {
    if (!sectionConfig?.anchors) return
    setCompletedAnchors([...sectionConfig.anchors])
  }

  const clearAllAnchors = () => {
    setCompletedAnchors([])
  }

  // Existing partial data from the shift (anchors already completed in prior weeks)
  const existingPartialAnchors = useMemo(() => {
    if (!shift?.anchorAssignments?.previouslyCompleted?.length) return undefined
    return shift.anchorAssignments.previouslyCompleted
  }, [shift])

  // Auto-calculated completion based on setter count, aware of existing partial progress
  const autoCompletionData = useMemo(() => {
    if (shiftType !== SHIFT_TYPES.ROPE || !sectionConfig?.anchors?.length) return null
    const setterCount = getEffectiveSetterCount(assignedStaff, holdWasher)
    return calculatePartialCompletion(setterCount, sectionConfig, existingPartialAnchors)
  }, [shiftType, sectionConfig, assignedStaff, holdWasher, existingPartialAnchors])

  const autoFillAnchors = () => {
    if (!autoCompletionData?.newlyCompleted?.length) return
    setCompletedAnchors(autoCompletionData.newlyCompleted)
  }

  // ---- Additional rope sections management ----
  const allAssignedStaff = useMemo(() => {
    const ids = new Set(assignedStaff)
    additionalSections.forEach((s) => s.assignedStaff?.forEach((id) => ids.add(id)))
    return ids
  }, [assignedStaff, additionalSections])

  const totalRopeSetters = useMemo(() => {
    if (shiftType !== SHIFT_TYPES.ROPE) return assignedStaff.length
    let total = assignedStaff.length
    additionalSections.forEach((s) => { total += (s.assignedStaff?.length || 0) })
    return total
  }, [shiftType, assignedStaff, additionalSections])

  const usedSectionNames = useMemo(() => {
    const names = new Set()
    if (selectedSection) names.add(selectedSection)
    additionalSections.forEach((s) => { if (s.section) names.add(s.section) })
    return names
  }, [selectedSection, additionalSections])

  const availableExtraSections = useMemo(() => {
    if (shiftType !== SHIFT_TYPES.ROPE) return []
    return (ROPE_SECTIONS[gymName] || []).filter((s) =>
      !usedSectionNames.has(s.name) && !s.specialRules?.includes('manual only')
    )
  }, [shiftType, gymName, usedSectionNames])

  const addAdditionalSection = () => {
    if (availableExtraSections.length === 0) return
    setAdditionalSections((prev) => [
      ...prev,
      { section: availableExtraSections[0].name, assignedStaff: [], completedAnchors: [] },
    ])
  }

  const removeAdditionalSection = (index) => {
    setAdditionalSections((prev) => prev.filter((_, i) => i !== index))
  }

  const updateAdditionalSectionName = (index, name) => {
    setAdditionalSections((prev) => prev.map((s, i) =>
      i === index ? { ...s, section: name, assignedStaff: [], completedAnchors: [] } : s
    ))
  }

  const toggleAdditionalSectionStaff = (sectionIndex, staffId) => {
    setAdditionalSections((prev) => prev.map((s, i) => {
      if (i !== sectionIndex) return s
      const has = s.assignedStaff.includes(staffId)
      return {
        ...s,
        assignedStaff: has
          ? s.assignedStaff.filter((id) => id !== staffId)
          : [...s.assignedStaff, staffId],
      }
    }))
  }

  const handleClear = () => {
    onSave(null)
  }

  // Validation warnings
  const warnings = useMemo(() => {
    const w = []
    if (!shiftType) return w

    if (shiftType === SHIFT_TYPES.ROPE) {
      const gym = getGymConfig(gymName)
      if (assignedStaff.length < 2 && assignedStaff.length > 0) {
        w.push({ type: 'error', msg: 'Rope setting requires minimum 2 setters (primary section)' })
      }
      additionalSections.forEach((s) => {
        if (s.assignedStaff?.length > 0 && s.assignedStaff.length < 2) {
          w.push({ type: 'error', msg: `${s.section}: requires minimum 2 setters` })
        }
      })
      if (gym && totalRopeSetters > gym.maxRopeSetters) {
        w.push({ type: 'warning', msg: `${totalRopeSetters} total rope setters at ${gymName} exceeds typical max of ${gym.maxRopeSetters}` })
      }
    }

    if (shiftType === SHIFT_TYPES.BOULDER && sectionConfig) {
      if (assignedStaff.length !== sectionConfig.settersRequired && assignedStaff.length > 0) {
        w.push({
          type: 'error',
          msg: `${sectionConfig.name} requires exactly ${sectionConfig.settersRequired} setters (have ${assignedStaff.length})`,
        })
      }
    }

    return w
  }, [shiftType, assignedStaff, holdWasher, gymName, sectionConfig])

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>{gymName} — {day}</h2>
            <p style={styles.subtitle}>Week {currentWeek}</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Shift Type Selection */}
        <div style={styles.section}>
          <label style={styles.label}>Shift Type</label>
          <div style={styles.buttonGroup}>
            {availableShiftTypes.map((type) => (
              <button
                key={type}
                style={{
                  ...styles.typeButton,
                  ...(shiftType === type ? styles.typeButtonActive : {}),
                  borderColor: shiftType === type
                    ? (type === SHIFT_TYPES.BOULDER ? '#3b82f6' : '#8b5cf6')
                    : 'rgba(255,255,255,0.15)',
                  color: shiftType === type
                    ? (type === SHIFT_TYPES.BOULDER ? '#3b82f6' : '#8b5cf6')
                    : '#94a3b8',
                }}
                onClick={() => {
                  setShiftType(type)
                  setSelectedSection(null)
                  setAssignedStaff([])
                  setHoldWasher(null)
                  setAdditionalSections([])
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Section Selection */}
        {shiftType && sections.length > 0 && (
          <div style={styles.section}>
            <label style={styles.label}>
              Section
              {sectionConfig && (
                <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '8px' }}>
                  {shiftType === SHIFT_TYPES.BOULDER
                    ? `${sectionConfig.settersRequired} setters required`
                    : `${sectionConfig.anchors.length} anchors`}
                </span>
              )}
            </label>
            <div style={styles.sectionGrid}>
              {sections.map((sec) => {
                const sType = shiftType === SHIFT_TYPES.BOULDER ? 'boulder' : 'rope'
                const sAges = loadSectionAges()
                const ageEntry = getSectionAge(sAges, gymName, sType, sec.name)
                const cw = todayWeek()
                const weeksOld = ageEntry ? Math.max(0, cw - ageEntry.lastResetWeek) : null
                const gymCfg = GYMS.find((g) => g.name === gymName)
                const rotGoal = sType === 'boulder' ? (gymCfg?.boulderRotationWeeks || 5) : (sec.autobelay ? 5 : (gymCfg?.ropeRotationWeeks || 10))
                const ageStatus = getAgeStatus(weeksOld, rotGoal)

                return (
                <button
                  key={sec.name}
                  style={{
                    ...styles.sectionButton,
                    background: selectedSection === sec.name
                      ? getDifficultyBg(sec.difficulty)
                      : 'rgba(255,255,255,0.04)',
                    borderColor: selectedSection === sec.name
                      ? getDifficultyColor(sec.difficulty)
                      : 'rgba(255,255,255,0.1)',
                  }}
                  onClick={() => handleSectionChange(sec.name)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                    <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600, flex: 1 }}>
                      {sec.name}
                    </span>
                    {weeksOld != null && (
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '1px 5px',
                        borderRadius: '4px', background: ageStatus.bg, color: ageStatus.color,
                        whiteSpace: 'nowrap',
                      }}>
                        {weeksOld}w
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: '11px',
                    color: getDifficultyColor(sec.difficulty),
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                  }}>
                    {sec.difficulty}
                    {shiftType === SHIFT_TYPES.BOULDER && ` · ${sec.settersRequired}`}
                    {shiftType === SHIFT_TYPES.ROPE && ` · ${sec.anchors.length}a`}
                  </span>
                  {weeksOld != null && weeksOld >= rotGoal && (
                    <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: 600 }}>
                      Due for reset
                    </span>
                  )}
                  {sec.specialRules && (
                    <span style={{ fontSize: '10px', color: '#f59e0b', marginTop: '2px' }}>
                      {sec.specialRules}
                    </span>
                  )}
                </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Anchor Completion Tracking (rope sections only, skip special rules) */}
        {shiftType === SHIFT_TYPES.ROPE && sectionConfig?.anchors?.length > 0 && !sectionConfig.specialRules && (
          <div style={styles.section}>
            <label style={styles.label}>
              <Check size={14} style={{ marginRight: '6px' }} />
              Completed Anchors
              <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '8px' }}>
                {completedAnchors.length}/{sectionConfig.anchors.length}
                {completedAnchors.length === sectionConfig.anchors.length && ' (complete)'}
                {completedAnchors.length > 0 && completedAnchors.length < sectionConfig.anchors.length && ' (partial)'}
              </span>
            </label>

            {/* Auto-completion status based on setter count */}
            {autoCompletionData && assignedStaff.length > 0 && (
              <div style={{
                marginBottom: '8px', padding: '8px 12px', borderRadius: '6px',
                background: autoCompletionData.isComplete
                  ? 'rgba(16,185,129,0.08)' : autoCompletionData.isPartial
                  ? 'rgba(251,146,60,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${autoCompletionData.isComplete
                  ? 'rgba(16,185,129,0.2)' : autoCompletionData.isPartial
                  ? 'rgba(251,146,60,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: autoCompletionData.isComplete ? '#10b981' : autoCompletionData.isPartial ? '#f59e0b' : '#ef4444', marginBottom: '4px' }}>
                  {autoCompletionData.isComplete ? 'Full Section Reset' : autoCompletionData.isPartial ? `Partial Reset — ${autoCompletionData.completionPercentage}%` : 'No Setters (excluding washer)'}
                </div>

                {/* Progress bar */}
                <div style={{
                  width: '100%', height: '6px', borderRadius: '3px',
                  background: 'rgba(255,255,255,0.08)', marginBottom: '6px',
                }}>
                  <div style={{
                    width: `${autoCompletionData.completionPercentage || 0}%`,
                    height: '100%', borderRadius: '3px',
                    background: autoCompletionData.isComplete ? '#10b981' : '#f59e0b',
                    transition: 'width 0.3s ease',
                  }} />
                </div>

                {/* Anchor visual timeline */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '6px' }}>
                  {sectionConfig.anchors.map((anchor) => {
                    const isPreviouslyDone = autoCompletionData.previouslyCompleted?.includes(anchor)
                    const isNewlyAssigned = autoCompletionData.newlyCompleted?.includes(anchor)
                    const isRemaining = !isPreviouslyDone && !isNewlyAssigned
                    return (
                      <div key={anchor} style={{
                        width: '28px', height: '24px', borderRadius: '3px', fontSize: '10px',
                        fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isPreviouslyDone ? 'rgba(16,185,129,0.25)' : isNewlyAssigned ? 'rgba(251,146,60,0.25)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${isPreviouslyDone ? '#10b981' : isNewlyAssigned ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
                        color: isPreviouslyDone ? '#34d399' : isNewlyAssigned ? '#fbbf24' : '#64748b',
                      }} title={isPreviouslyDone ? `#${anchor} — already done` : isNewlyAssigned ? `#${anchor} — setting now` : `#${anchor} — still needed`}>
                        {anchor}
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '10px', marginBottom: '4px' }}>
                  {(autoCompletionData.previouslyCompleted?.length > 0) && (
                    <span style={{ color: '#34d399' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: '#10b981', marginRight: '3px', verticalAlign: 'middle' }} />
                      Done prior
                    </span>
                  )}
                  {(autoCompletionData.newlyCompleted?.length > 0) && (
                    <span style={{ color: '#fbbf24' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: '#f59e0b', marginRight: '3px', verticalAlign: 'middle' }} />
                      This shift
                    </span>
                  )}
                  {(autoCompletionData.remainingAnchorList?.length > 0) && (
                    <span style={{ color: '#64748b' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', marginRight: '3px', verticalAlign: 'middle' }} />
                      Still needed
                    </span>
                  )}
                </div>

                {autoCompletionData.isPartial && (
                  <div style={{ fontSize: '11px', color: '#d1d5db' }}>
                    {getEffectiveSetterCount(assignedStaff, holdWasher)} setter{getEffectiveSetterCount(assignedStaff, holdWasher) !== 1 ? 's' : ''} will set anchors {autoCompletionData.newlyCompleted?.join(', ')}.
                    {' '}{autoCompletionData.remainingAnchors} anchor{autoCompletionData.remainingAnchors !== 1 ? 's' : ''} still needed: {autoCompletionData.remainingAnchorList?.join(', ')}
                  </div>
                )}
                {autoCompletionData.newlyCompleted?.length > 0 && (
                  <button
                    style={{ ...styles.anchorBulkBtn, marginTop: '6px', background: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.3)', color: '#a5b4fc' }}
                    onClick={autoFillAnchors}
                    title="Auto-fill anchors based on setter count"
                  >
                    Auto-fill from setters ({autoCompletionData.newlyCompleted.length} new anchor{autoCompletionData.newlyCompleted.length !== 1 ? 's' : ''})
                  </button>
                )}
              </div>
            )}

            {/* Per-setter anchor assignments */}
            {shift?.anchorAssignments?.setterAssignments?.length > 0 && (
              <div style={{
                marginBottom: '8px', padding: '6px 10px', borderRadius: '6px',
                background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#a5b4fc', marginBottom: '4px' }}>Anchor Assignments</div>
                {shift.anchorAssignments.setterAssignments.map((sa) => {
                  const setter = STAFF.find((s) => s.id === sa.setterId)
                  return (
                    <div key={sa.setterId} style={{ fontSize: '11px', color: '#d1d5db', display: 'flex', gap: '6px', padding: '2px 0' }}>
                      <span style={{ fontWeight: 600, minWidth: '80px' }}>{setter?.name || `#${sa.setterId}`}:</span>
                      <span>{sa.anchors.length > 0 ? `Anchors ${sa.anchors.join(', ')}` : <em style={{ color: '#6b7280' }}>support role</em>}</span>
                    </div>
                  )
                })}
                {/* Show hold washer as support role */}
                {shift.holdWasher && !shift.anchorAssignments.setterAssignments.some((sa) => sa.setterId === shift.holdWasher) && (() => {
                  const washer = STAFF.find((s) => s.id === shift.holdWasher)
                  return (
                    <div style={{ fontSize: '11px', color: '#d1d5db', display: 'flex', gap: '6px', padding: '2px 0' }}>
                      <span style={{ fontWeight: 600, minWidth: '80px' }}>{washer?.name || `#${shift.holdWasher}`}:</span>
                      <span><em style={{ color: '#6b7280' }}>hold washing</em></span>
                    </div>
                  )
                })()}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                style={styles.anchorBulkBtn}
                onClick={markAllAnchors}
                title="Mark all anchors complete"
              >
                All Complete
              </button>
              <button
                style={styles.anchorBulkBtn}
                onClick={clearAllAnchors}
                title="Clear all anchor completions"
              >
                Clear All
              </button>
            </div>
            <div style={styles.anchorGrid}>
              {sectionConfig.anchors.map((anchor) => {
                const isDone = completedAnchors.includes(anchor)
                const wasPreviouslyDone = existingPartialAnchors?.includes(anchor) && !isDone
                return (
                  <button
                    key={anchor}
                    style={{
                      ...styles.anchorButton,
                      background: wasPreviouslyDone ? 'rgba(99,102,241,0.15)' : isDone ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)',
                      borderColor: wasPreviouslyDone ? '#818cf8' : isDone ? '#10b981' : 'rgba(255,255,255,0.1)',
                      color: wasPreviouslyDone ? '#a5b4fc' : isDone ? '#34d399' : '#94a3b8',
                    }}
                    onClick={() => toggleAnchor(anchor)}
                    title={wasPreviouslyDone ? `#${anchor} — done in prior week` : `Anchor #${anchor}`}
                  >
                    {(isDone || wasPreviouslyDone) && <Check size={10} style={{ flexShrink: 0 }} />}
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>#{anchor}</span>
                  </button>
                )
              })}
            </div>
            {completedAnchors.length > 0 && completedAnchors.length < sectionConfig.anchors.length && (
              <div style={{
                marginTop: '6px', padding: '6px 10px', borderRadius: '6px',
                background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.15)',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <AlertTriangle size={12} color="#fb923c" />
                <span style={{ fontSize: '11px', color: '#fed7aa' }}>
                  Partial completion — remaining anchors: {sectionConfig.anchors.filter((a) => !completedAnchors.includes(a)).join(', ')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Additional Rope Sections */}
        {shiftType === SHIFT_TYPES.ROPE && selectedSection && (
          <div style={styles.section}>
            <label style={styles.label}>
              Additional Rope Sections
              <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '8px' }}>
                {additionalSections.length} extra section{additionalSections.length !== 1 ? 's' : ''}
                {totalRopeSetters > 0 && ` · ${totalRopeSetters} total setters`}
              </span>
            </label>

            {additionalSections.map((extraSec, idx) => {
              const secDef = (ROPE_SECTIONS[gymName] || []).find((s) => s.name === extraSec.section)
              return (
                <div key={idx} style={styles.additionalSectionBlock}>
                  <div style={styles.additionalSectionHeader}>
                    <select
                      value={extraSec.section}
                      onChange={(e) => updateAdditionalSectionName(idx, e.target.value)}
                      style={styles.sectionSelect}
                    >
                      {/* Current selection + available options */}
                      <option value={extraSec.section}>{extraSec.section}</option>
                      {availableExtraSections
                        .filter((s) => s.name !== extraSec.section)
                        .map((s) => (
                          <option key={s.name} value={s.name}>{s.name}</option>
                        ))}
                    </select>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {secDef ? `${secDef.anchors.length} anchors · ${secDef.difficulty}` : ''}
                    </span>
                    <button
                      style={styles.removeSectionBtn}
                      onClick={() => removeAdditionalSection(idx)}
                      title="Remove this section"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div style={styles.miniStaffGrid}>
                    {staffList.filter((s) => s.available).map((s) => {
                      const inPrimary = assignedStaff.includes(s.id)
                      const inOtherExtra = additionalSections.some(
                        (other, oi) => oi !== idx && other.assignedStaff?.includes(s.id)
                      )
                      const inThis = extraSec.assignedStaff?.includes(s.id)
                      const isHoldWasher = holdWasher === s.id
                      const disabled = (inPrimary || inOtherExtra || isHoldWasher) && !inThis
                      return (
                        <button
                          key={s.id}
                          style={{
                            ...styles.miniStaffBtn,
                            opacity: disabled ? 0.35 : 1,
                            background: inThis ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                            borderColor: inThis ? '#8b5cf6' : 'rgba(255,255,255,0.1)',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                          onClick={() => !disabled && toggleAdditionalSectionStaff(idx, s.id)}
                          title={disabled ? (inPrimary ? 'Assigned to primary section' : inOtherExtra ? 'Assigned to another section' : 'Hold washer') : ''}
                        >
                          {inThis && <Check size={10} color="#8b5cf6" />}
                          <span style={{ fontSize: '11px', color: '#e2e8f0' }}>{s.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    {extraSec.assignedStaff?.length || 0} setters assigned
                  </div>
                </div>
              )
            })}

            {availableExtraSections.length > 0 && (
              <button
                style={styles.addSectionBtn}
                onClick={addAdditionalSection}
              >
                <Plus size={14} />
                Add Another Rope Section
              </button>
            )}

            {totalRopeSetters > 0 && (() => {
              const gym = getGymConfig(gymName)
              const max = gym?.maxRopeSetters || 4
              const isOver = totalRopeSetters > max
              return (
                <div style={{
                  marginTop: '8px', padding: '6px 10px', borderRadius: '6px',
                  background: isOver ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                  border: `1px solid ${isOver ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '12px', fontWeight: 700,
                  color: isOver ? '#f87171' : '#34d399',
                }}>
                  {totalRopeSetters}/{max} total rope setters
                  {isOver && ' — OVERSTAFFED'}
                </div>
              )
            })()}
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div style={styles.warningsBox}>
            {warnings.map((w, i) => (
              <div key={i} style={styles.warningItem(w.type)}>
                <AlertTriangle size={14} />
                {w.msg}
              </div>
            ))}
          </div>
        )}

        {/* Staff Assignment */}
        {shiftType && (
          <div style={styles.section}>
            <label style={styles.label}>
              <Users size={14} style={{ marginRight: '6px' }} />
              Assigned Staff
              <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '8px' }}>
                {assignedStaff.length} selected
                {sectionConfig?.settersRequired && ` / ${sectionConfig.settersRequired} required`}
              </span>
            </label>
            <div style={styles.staffGrid}>
              {staffList.map((s) => {
                const isAssigned = assignedStaff.includes(s.id)
                const badge = getRoleBadge(s.role)
                return (
                  <button
                    key={s.id}
                    style={{
                      ...styles.staffButton,
                      opacity: s.available ? 1 : 0.4,
                      cursor: s.available ? 'pointer' : 'not-allowed',
                      background: isAssigned
                        ? 'rgba(59,130,246,0.2)'
                        : 'rgba(255,255,255,0.04)',
                      borderColor: isAssigned
                        ? '#3b82f6'
                        : 'rgba(255,255,255,0.1)',
                    }}
                    onClick={() => s.available && toggleStaff(s.id)}
                    title={s.unavailableReason || ''}
                  >
                    <div style={styles.staffButtonTop}>
                      <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600 }}>
                        {s.name}
                      </span>
                      {isAssigned && <Check size={14} color="#3b82f6" />}
                    </div>
                    <div style={styles.staffButtonBottom}>
                      {badge && (
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: badge.bg,
                          color: badge.color,
                          letterSpacing: '0.3px',
                        }}>
                          {badge.label}
                        </span>
                      )}
                      {s.prefersThis && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '2px',
                          fontSize: '9px', fontWeight: 600, color: '#f472b6',
                        }} title={s.prefMatches.join(', ')}>
                          <Heart size={9} fill="#f472b6" /> Preferred
                        </span>
                      )}
                      {s.avoidsThis && !s.prefersThis && (
                        <span style={{
                          fontSize: '9px', fontWeight: 600, color: '#64748b',
                        }} title={s.prefMatches.join(', ')}>
                          Rather avoid
                        </span>
                      )}
                      {!s.available && (
                        <span style={{ fontSize: '10px', color: '#ef4444' }}>
                          {s.unavailableReason}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Hold Washer Assignment */}
        {showHoldWash && (
          <div style={styles.section}>
            <label style={styles.label}>
              <Droplets size={14} style={{ marginRight: '6px' }} />
              Hold Washer
              <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '8px' }}>
                Washes only, does not set
              </span>
            </label>
            <div style={styles.holdWashGrid}>
              {staffList
                .filter((s) => !assignedStaff.includes(s.id)) // Exclude current setters
                .map((s) => {
                const isDirectorOrHead = s.role === 'Director' || s.role === 'Head Setter'
                const isSelected = holdWasher === s.id
                const isUnavailable = !s.available || isDirectorOrHead
                return (
                  <button
                    key={s.id}
                    style={{
                      ...styles.holdWashButton,
                      opacity: isUnavailable ? 0.4 : 1,
                      cursor: isUnavailable ? 'not-allowed' : 'pointer',
                      background: isSelected
                        ? 'rgba(6,182,212,0.2)'
                        : 'rgba(255,255,255,0.04)',
                      borderColor: isSelected
                        ? '#06b6d4'
                        : 'rgba(255,255,255,0.1)',
                    }}
                    onClick={() => !isUnavailable && toggleHoldWasher(s.id)}
                    title={isDirectorOrHead ? 'Directors and head setters cannot be hold washers' : s.unavailableReason || ''}
                  >
                    <Droplets size={12} color={isSelected ? '#06b6d4' : '#64748b'} />
                    <span style={{ color: '#e2e8f0', fontSize: '12px' }}>{s.name}</span>
                    {isDirectorOrHead && (
                      <span style={{ fontSize: '9px', color: '#ef4444' }}>N/A</span>
                    )}
                    {!s.available && !isDirectorOrHead && (
                      <span style={{ fontSize: '9px', color: '#f59e0b' }}>Busy</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Makeup Work Indicator */}
        {makeupRecords.length > 0 && (
          <div style={{
            margin: '0 24px', padding: '10px 14px', borderRadius: '10px',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            display: 'flex', flexDirection: 'column', gap: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wrench size={14} color="#f59e0b" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24' }}>
                Includes Makeup Work
              </span>
            </div>
            {makeupRecords.map((mr) => (
              <div key={mr.id} style={{ fontSize: '11px', color: '#94a3b8', paddingLeft: '22px', lineHeight: 1.5 }}>
                {mr.section}{mr.incompleteAnchors.length > 0 ? ` — anchors ${mr.incompleteAnchors.join(', ')}` : ''}
                <span style={{ color: '#64748b' }}> (from Week {mr.weekNumber})</span>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        <div style={styles.section}>
          <label style={styles.label}>Notes</label>
          <textarea
            style={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for this shift..."
            rows={2}
          />
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button style={styles.clearBtn} onClick={handleClear}>
              Clear Shift
            </button>
            {shift && shift.assignedStaff?.length > 0 && (
              <InlineReportButton
                gymName={gymName}
                day={day}
                weekNumber={currentWeek}
                shift={shift}
              />
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button style={styles.saveBtn} onClick={handleSave}>
              Save Assignment
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
    animation: 'modalFadeIn 0.2s ease-out',
  },
  modal: {
    background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.1)',
    width: '100%',
    maxWidth: '640px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)',
    animation: 'modalSlideIn 0.25s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '20px 24px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    position: 'sticky',
    top: 0,
    background: 'linear-gradient(145deg, #1e293b 0%, rgba(15,23,42,0.98) 100%)',
    zIndex: 2,
    borderRadius: '16px 16px 0 0',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 800,
    color: '#f1f5f9',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: 1.4,
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    color: '#94a3b8',
    padding: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
    minWidth: '36px',
    minHeight: '36px',
  },
  section: {
    padding: '18px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    fontWeight: 700,
    color: '#cbd5e1',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
  },
  typeButton: {
    flex: 1,
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'all 0.15s',
    minHeight: '44px',
    textAlign: 'center',
  },
  typeButtonActive: {
    background: 'rgba(59,130,246,0.1)',
  },
  sectionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  sectionButton: {
    padding: '12px 14px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    transition: 'all 0.15s',
    minHeight: '44px',
  },
  warningsBox: {
    margin: '0 24px',
    padding: '12px',
    background: 'rgba(239,68,68,0.08)',
    borderRadius: '8px',
    border: '1px solid rgba(239,68,68,0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  warningItem: (type) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    fontWeight: 500,
    color: type === 'error' ? '#f87171' : '#fbbf24',
  }),
  staffGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  staffButton: {
    padding: '10px 14px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    textAlign: 'left',
    transition: 'all 0.15s',
    minHeight: '48px',
  },
  staffButtonTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  staffButtonBottom: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '5px',
  },
  holdWashGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  holdWashButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    minHeight: '40px',
  },
  textarea: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    color: '#e2e8f0',
    padding: '12px 14px',
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
    lineHeight: 1.5,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    position: 'sticky',
    bottom: 0,
    background: 'linear-gradient(145deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.98) 100%)',
    borderRadius: '0 0 16px 16px',
    zIndex: 2,
  },
  clearBtn: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: '10px',
    color: '#f87171',
    padding: '10px 18px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'all 0.15s',
    minHeight: '40px',
  },
  cancelBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    color: '#94a3b8',
    padding: '10px 18px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'all 0.15s',
    minHeight: '40px',
  },
  saveBtn: {
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    padding: '10px 24px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
    transition: 'all 0.15s',
    minHeight: '40px',
  },
  anchorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))',
    gap: '6px',
  },
  anchorButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '36px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  anchorBulkBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    color: '#94a3b8',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
    transition: 'all 0.15s',
  },
  additionalSectionBlock: {
    padding: '10px 12px',
    marginBottom: '8px',
    background: 'rgba(139,92,246,0.05)',
    border: '1px solid rgba(139,92,246,0.15)',
    borderRadius: '10px',
  },
  additionalSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  sectionSelect: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    padding: '6px 10px',
    cursor: 'pointer',
    outline: 'none',
    flex: 1,
  },
  removeSectionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: '6px',
    background: 'rgba(239,68,68,0.1)',
    color: '#f87171',
    cursor: 'pointer',
    transition: 'all 0.15s',
    flexShrink: 0,
  },
  miniStaffGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  miniStaffBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    transition: 'all 0.15s',
  },
  addSectionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    background: 'rgba(139,92,246,0.08)',
    border: '1px dashed rgba(139,92,246,0.3)',
    borderRadius: '10px',
    color: '#a78bfa',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'all 0.15s',
    width: '100%',
    justifyContent: 'center',
  },
}
