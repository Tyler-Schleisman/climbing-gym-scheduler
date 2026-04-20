import { Fragment, useMemo } from 'react'
import { Users, Droplets, AlertTriangle, XCircle, AlertCircle, ClipboardCheck } from 'lucide-react'
import { GYMS } from '../data/gyms'
import { STAFF } from '../data/staff'
import { BOULDER_SECTIONS, ROPE_SECTIONS } from '../data/sections'
import { loadAvailability, getSetterAbsence, ABSENCE_TYPES } from '../data/availability-overrides'
import { getIncompleteForShift, getMakeupForShift } from '../data/missed-shifts'
import { loadInspectionRecords, hasInspectionOnDay } from '../data/inspections'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const SHIFT_TYPES = {
  BOULDER: 'Boulder Setting',
  ROPE: 'Rope Setting',
  HOLD_WASH: 'Hold Washing',
  FLEX: 'Flex',
  OFF: null,
}

function getShiftTypesForGymDay(gym, day) {
  const types = []
  if (gym.boulderDays?.includes(day)) types.push(SHIFT_TYPES.BOULDER)
  if (gym.ropeDays?.includes(day)) types.push(SHIFT_TYPES.ROPE)
  if (gym.flexDays?.includes(day)) types.push(SHIFT_TYPES.FLEX)
  return types
}

function hasHoldWash(gym, day) {
  return gym.holdWashDays?.includes(day) || gym.flexHoldWashDays?.includes(day) || false
}

function isActiveDay(gym, day) {
  return getShiftTypesForGymDay(gym, day).length > 0
}

function getDifficultyColor(difficulty) {
  switch (difficulty) {
    case 'easy': return { bg: 'rgba(var(--t-easy-rgb),0.15)', border: 'rgba(var(--t-easy-rgb),0.3)', text: 'var(--t-easy)' }
    case 'medium': return { bg: 'rgba(var(--t-medium-rgb),0.15)', border: 'rgba(var(--t-medium-rgb),0.3)', text: 'var(--t-medium)' }
    case 'hard': return { bg: 'rgba(var(--t-hard-rgb),0.15)', border: 'rgba(var(--t-hard-rgb),0.3)', text: 'var(--t-hard)' }
    default: return { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', text: 'var(--t-text-muted)' }
  }
}

function getStaffName(id) {
  const staff = STAFF.find((s) => s.id === id)
  return staff ? staff.name : `#${id}`
}

function getStaffRole(id) {
  const staff = STAFF.find((s) => s.id === id)
  return staff?.role || ''
}

function getRoleBadgeStyle(role) {
  switch (role) {
    case 'Director': return { background: 'rgba(var(--t-secondary-rgb),0.3)', color: 'var(--t-secondary-light)', label: 'DIR' }
    case 'Head Setter': return { background: 'rgba(var(--t-primary-rgb),0.3)', color: 'var(--t-primary-light)', label: 'HEAD' }
    case 'Spec Setter': return { background: 'rgba(var(--t-warning-rgb),0.3)', color: 'var(--t-warning)', label: 'SPEC' }
    default: return null
  }
}

function getSectionDifficulty(gymName, sectionName, shiftType) {
  const pool = shiftType === SHIFT_TYPES.BOULDER
    ? BOULDER_SECTIONS[gymName]
    : ROPE_SECTIONS[gymName]
  const section = pool?.find((s) => s.name === sectionName)
  return section?.difficulty || null
}

function getSectionSettersRequired(gymName, sectionName) {
  const section = BOULDER_SECTIONS[gymName]?.find((s) => s.name === sectionName)
  return section?.settersRequired || '?'
}

const baseStyles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: '110px repeat(5, 1fr)',
    gap: '1px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  },
  dayHeader: {
    background: 'rgba(255,255,255,0.06)',
    padding: '14px 8px',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--t-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  gymLabel: {
    background: 'rgba(255,255,255,0.04)',
    padding: '16px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--t-text-secondary)',
    writingMode: 'horizontal-tb',
    letterSpacing: '-0.2px',
  },
  shiftType: (shiftType) => ({
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: '6px',
    color:
      shiftType === SHIFT_TYPES.BOULDER ? 'var(--t-primary)' :
      shiftType === SHIFT_TYPES.ROPE ? 'var(--t-secondary)' :
      shiftType === SHIFT_TYPES.FLEX ? 'var(--t-warning)' :
      'var(--t-text-muted)',
  }),
  sectionName: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--t-text-secondary)',
    marginBottom: '8px',
    lineHeight: 1.4,
    letterSpacing: '-0.1px',
  },
  staffList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  staffItem: {
    fontSize: '13px',
    color: 'var(--t-text-tertiary)',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    lineHeight: 1.4,
  },
  roleBadge: (style) => ({
    fontSize: '9px',
    fontWeight: 800,
    padding: '2px 5px',
    borderRadius: '4px',
    background: style.background,
    color: style.color,
    letterSpacing: '0.4px',
    lineHeight: 1,
  }),
  staffCount: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '12px',
    color: '#64748b',
    marginTop: '10px',
    fontWeight: 500,
  },
  holdWasher: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: 'var(--t-info)',
    marginTop: '6px',
    paddingTop: '6px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  flexWash: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '3px',
    fontSize: '10px',
    color: '#fbbf24',
    marginTop: '4px',
    paddingTop: '4px',
    borderTop: '1px dashed rgba(251,191,36,0.25)',
  },
  emptyCell: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '12px',
    color: '#475569',
    fontStyle: 'italic',
  },
  unassignedCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '6px',
  },
  addPrompt: {
    fontSize: '12px',
    color: '#64748b',
  },
  cornerCell: {
    background: 'rgba(255,255,255,0.06)',
  },
  unassignedDayBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    marginTop: '4px',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--t-error)',
    background: 'rgba(var(--t-error-rgb),0.15)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  violationBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--t-error)',
    background: 'rgba(var(--t-error-rgb),0.15)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  errorBadge: {
    position: 'absolute',
    top: '5px',
    right: '5px',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '10px',
    fontWeight: 800,
    color: '#fff',
    background: 'var(--t-error)',
    padding: '2px 7px',
    borderRadius: '4px',
    boxShadow: '0 2px 6px rgba(var(--t-error-rgb),0.4)',
    animation: 'violationPulse 2s ease-in-out infinite',
  },
  warningBadge: {
    position: 'absolute',
    top: '5px',
    right: '5px',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#000',
    background: 'var(--t-warning)',
    padding: '2px 7px',
    borderRadius: '4px',
    boxShadow: '0 2px 6px rgba(var(--t-warning-rgb),0.3)',
  },
}

function getCellStyle(isActive, difficulty, hasErrors, hasWarnings) {
  const dc = difficulty ? getDifficultyColor(difficulty) : null

  // Violation border takes precedence — thicker for errors
  let borderLeft
  if (hasErrors) {
    borderLeft = '4px solid var(--t-error)'
  } else if (hasWarnings) {
    borderLeft = '3px solid var(--t-warning)'
  } else if (dc) {
    borderLeft = `3px solid ${dc.border}`
  } else {
    borderLeft = '3px solid transparent'
  }

  return {
    background: isActive
      ? (dc ? dc.bg : 'rgba(255,255,255,0.03)')
      : 'rgba(0,0,0,0.15)',
    padding: '14px 12px',
    minHeight: '130px',
    cursor: isActive ? 'pointer' : 'default',
    transition: 'all 0.15s ease',
    borderLeft,
    position: 'relative',
    opacity: isActive ? 1 : 0.35,
    // Tinted background + inset border for violation cells
    ...(hasErrors && isActive ? {
      background: dc ? dc.bg : 'rgba(var(--t-error-rgb),0.06)',
      boxShadow: 'inset 0 0 0 1px rgba(var(--t-error-rgb),0.3), 0 0 12px rgba(var(--t-error-rgb),0.08)',
    } : {}),
    ...(hasWarnings && !hasErrors && isActive ? {
      boxShadow: 'inset 0 0 0 1px rgba(var(--t-warning-rgb),0.2)',
    } : {}),
  }
}

function ShiftCell({ gymName, gym, day, weekNumber, shift, onCellClick, cellViolations }) {
  // Load availability overrides once per cell render
  const availData = useMemo(() => loadAvailability(), [])
  // Check for incomplete/missed work on this cell
  const incompleteRecords = useMemo(
    () => getIncompleteForShift(weekNumber, gymName, day),
    [weekNumber, gymName, day]
  )
  const totalIncompleteAnchors = incompleteRecords.reduce(
    (sum, r) => sum + r.incompleteAnchors.length, 0
  )
  // Check for scheduled makeup work on this cell
  const makeupRecords = useMemo(
    () => getMakeupForShift(weekNumber, gymName, day),
    [weekNumber, gymName, day]
  )
  const active = isActiveDay(gym, day)
  const shiftTypes = getShiftTypesForGymDay(gym, day)
  const canHoldWash = hasHoldWash(gym, day)

  const errors = cellViolations?.filter((v) => v.severity === 'error') || []
  const warnings = cellViolations?.filter((v) => v.severity === 'warning') || []
  const hasErrors = errors.length > 0
  const hasWarnings = warnings.length > 0

  if (!active) {
    return (
      <div style={getCellStyle(false, null, false, false)}>
        <div style={baseStyles.emptyCell}>—</div>
      </div>
    )
  }

  const currentShiftType = shift?.shiftType || shiftTypes[0] || null
  const difficulty = shift?.section
    ? getSectionDifficulty(gymName, shift.section, currentShiftType)
    : null

  const defaultBg = difficulty
    ? getDifficultyColor(difficulty).bg
    : 'rgba(255,255,255,0.04)'
  const hoverBg = difficulty
    ? getDifficultyColor(difficulty).bg.replace('0.15', '0.25')
    : 'rgba(255,255,255,0.08)'

  return (
    <div
      style={getCellStyle(true, difficulty, hasErrors, hasWarnings)}
      onClick={() => onCellClick(gymName, day)}
      onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg }}
      onMouseLeave={(e) => { e.currentTarget.style.background = defaultBg }}
    >
      {/* Violation badges */}
      {hasErrors && (
        <div
          style={baseStyles.errorBadge}
          title={errors.map((v) => v.message).join('\n')}
        >
          <XCircle size={10} />
          {errors.length}
        </div>
      )}
      {hasWarnings && !hasErrors && (
        <div
          style={baseStyles.warningBadge}
          title={warnings.map((v) => v.message).join('\n')}
        >
          <AlertCircle size={10} />
          {warnings.length}
        </div>
      )}
      {hasErrors && hasWarnings && (
        <div
          style={{
            position: 'absolute',
            top: '22px',
            right: '5px',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            fontSize: '9px',
            fontWeight: 700,
            color: '#000',
            background: 'var(--t-warning)',
            padding: '1px 5px',
            borderRadius: '3px',
          }}
          title={warnings.map((v) => v.message).join('\n')}
        >
          <AlertCircle size={8} />
          {warnings.length}
        </div>
      )}

      {shift && shift.assignedStaff?.length > 0 ? (
        <>
          <div style={baseStyles.shiftType(currentShiftType)}>
            {currentShiftType === SHIFT_TYPES.FLEX
              ? (shift.shiftType || 'Flex — Click to set')
              : currentShiftType}
          </div>

          {shift.section && (
            <div style={baseStyles.sectionName}>
              {shift.section}
              {shift.additionalSections?.length > 0 && (
                <span style={{ color: '#a78bfa', fontSize: '10px', marginLeft: '4px' }}>
                  +{shift.additionalSections.length}
                </span>
              )}
            </div>
          )}

          <div style={baseStyles.staffList}>
            {shift.assignedStaff.map((id) => {
              const badge = getRoleBadgeStyle(getStaffRole(id))
              const absence = getSetterAbsence(availData, id, weekNumber, day)
              const absenceInfo = absence ? ABSENCE_TYPES[absence.type] : null
              return (
                <div key={id} style={baseStyles.staffItem}>
                  {badge && <span style={baseStyles.roleBadge(badge)}>{badge.label}</span>}
                  {getStaffName(id)}
                  {absenceInfo && (
                    <span
                      title={`${absenceInfo.label}${absence.notes ? ': ' + absence.notes : ''}`}
                      style={{
                        fontSize: '8px',
                        fontWeight: 700,
                        padding: '0px 4px',
                        borderRadius: '3px',
                        background: absenceInfo.bg,
                        color: absenceInfo.color,
                        marginLeft: '3px',
                        lineHeight: '14px',
                      }}
                    >
                      {absenceInfo.icon}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div style={baseStyles.staffCount}>
            <Users size={12} />
            {(() => {
              const extraCount = shift.additionalSections?.reduce((sum, s) => sum + (s.assignedStaff?.length || 0), 0) || 0
              const total = shift.assignedStaff.length + extraCount
              const gym = GYMS.find((g) => g.name === gymName)
              const max = gym?.maxRopeSetters || 4
              const isRope = currentShiftType === SHIFT_TYPES.ROPE || shift.shiftType === 'Rope Setting'
              const isOver = isRope && total > max
              return (
                <>
                  <span style={isOver ? { color: '#ef4444', fontWeight: 700 } : undefined}>
                    {total} setter{total !== 1 ? 's' : ''}
                    {isRope && extraCount > 0 && ` (${shift.assignedStaff.length}+${extraCount})`}
                  </span>
                  {isOver && (
                    <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '10px' }}>
                      {' '}/{max} MAX
                    </span>
                  )}
                </>
              )
            })()}
            {shift.holdWasher && <span style={{ color: '#06b6d4' }}> + 1 wash</span>}
            {shift.section && currentShiftType === SHIFT_TYPES.BOULDER && (
              <span>
                {' '}/ {getSectionSettersRequired(gymName, shift.section)} req
              </span>
            )}
          </div>

          {shift.holdWasher && (
            <div style={baseStyles.holdWasher}>
              <Droplets size={12} />
              {getStaffName(shift.holdWasher)}
            </div>
          )}

          {shift.flexHoldWashers?.length > 0 && (
            <div style={baseStyles.flexWash}>
              <Droplets size={11} />
              <span style={{ fontWeight: 700 }}>Flex Wash</span>
              {shift.flexHoldWashers.map((id) => (
                <span key={id} style={{ marginLeft: '4px' }}>{getStaffName(id)}</span>
              ))}
            </div>
          )}

          {shift.additionalSections?.length > 0 && shift.additionalSections.map((extraSec, idx) => (
            <div
              key={idx}
              style={{
                marginTop: '6px', paddingTop: '6px',
                borderTop: '1px solid rgba(139,92,246,0.2)',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#a78bfa', marginBottom: '2px' }}>
                {extraSec.section}
              </div>
              {extraSec.assignedStaff?.map((id) => (
                <div key={id} style={{ ...baseStyles.staffItem, fontSize: '11px' }}>
                  {getStaffName(id)}
                </div>
              ))}
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                {extraSec.assignedStaff?.length || 0} setter{(extraSec.assignedStaff?.length || 0) !== 1 ? 's' : ''}
              </div>
            </div>
          ))}

          {shift.multiDayProgress && (
            <div style={{ fontSize: '11px', color: 'var(--t-secondary)', marginTop: '4px' }}>
              Day {shift.multiDayProgress.day}/{shift.multiDayProgress.total}
            </div>
          )}

          {makeupRecords.length > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '10px', fontWeight: 700, color: '#06b6d4',
                marginTop: '6px', paddingTop: '6px',
                borderTop: '1px dashed rgba(6,182,212,0.3)',
              }}
              title={makeupRecords.map((r) =>
                r.incompleteAnchors.length > 0
                  ? `Makeup: ${r.section} anchors ${r.incompleteAnchors.join(', ')} (from Wk${r.weekNumber})`
                  : `Makeup: ${r.section} (from Wk${r.weekNumber})`
              ).join('\n')}
            >
              🔧 Makeup work
            </div>
          )}

          {shift.shiftType === 'Rope Setting' && shift.section && (() => {
            const secDef = (ROPE_SECTIONS[gymName] || []).find((s) => s.name === shift.section)
            if (!secDef?.anchors?.length) return null
            // Skip anchor tracking display for sections with special rules
            if (secDef.specialRules) return null
            const total = secDef.anchors.length
            const completed = shift.completedAnchors || []
            const prevDone = shift.anchorAssignments?.previouslyCompleted || []
            const prevSet = new Set(prevDone)

            // Calculate total done: previously completed + this shift's completed anchors
            let allDone, newDone, titleText
            if (completed.length > 0 || prevDone.length > 0) {
              const mergedSet = new Set([...prevDone, ...completed])
              allDone = secDef.anchors.filter((a) => mergedSet.has(a))
              newDone = completed.filter((a) => !prevSet.has(a))
              const remaining = secDef.anchors.filter((a) => !mergedSet.has(a))
              titleText = allDone.length >= total
                ? `All ${total} anchors complete`
                : `This shift: ${newDone.length > 0 ? newDone.join(', ') : 'none'}` +
                  (prevDone.length > 0 ? `\nPrior: ${prevDone.join(', ')}` : '') +
                  (remaining.length > 0 ? `\nRemaining: ${remaining.join(', ')}` : '')
            } else if (shift.assignedStaff?.length > 0) {
              // Auto-calculate from setter count
              const effectiveSetters = shift.assignedStaff.filter((id) => id !== shift.holdWasher).length
              allDone = secDef.anchors.slice(0, Math.min(effectiveSetters, total))
              newDone = allDone
              titleText = allDone.length >= total
                ? `All ${total} anchors (${effectiveSetters} setters)`
                : `~${allDone.length}/${total} anchors (${effectiveSetters} setter${effectiveSetters !== 1 ? 's' : ''})`
            } else {
              return null
            }

            if (allDone.length === 0) return null
            const pct = Math.round((allDone.length / total) * 100)
            const isComplete = allDone.length >= total

            return (
              <>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '10px', fontWeight: 700,
                    color: isComplete ? '#10b981' : '#f59e0b',
                    marginTop: '6px', paddingTop: '6px',
                    borderTop: `1px dashed ${isComplete ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  }}
                  title={titleText}
                >
                  <ClipboardCheck size={10} />
                  {isComplete
                    ? `${total}/${total} anchors`
                    : prevDone.length > 0
                      ? `${allDone.length}/${total} (${newDone.length} new, ${prevDone.length} prior)`
                      : `${allDone.length}/${total} anchors (${pct}%)`}
                </div>
                {shift.anchorAssignments?.setterAssignments?.length > 0 && (
                  <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '2px', lineHeight: '1.3' }}>
                    {shift.anchorAssignments.setterAssignments.map((sa) => {
                      const setter = STAFF.find((s) => s.id === sa.setterId)
                      const initials = setter?.name?.split(' ').map((n) => n[0]).join('') || `#${sa.setterId}`
                      return sa.anchors.length > 0 ? `${initials}:${sa.anchors.join(',')}` : null
                    }).filter(Boolean).join(' · ')}
                  </div>
                )}
              </>
            )
          })()}

          {incompleteRecords.length > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '10px', fontWeight: 700, color: '#f59e0b',
                marginTop: '6px', paddingTop: '6px',
                borderTop: '1px dashed rgba(245,158,11,0.3)',
              }}
              title={incompleteRecords.map((r) =>
                r.incompleteAnchors.length > 0
                  ? `Anchors ${r.incompleteAnchors.join(', ')} incomplete`
                  : `${r.section} incomplete`
              ).join('\n')}
            >
              <AlertTriangle size={10} />
              {totalIncompleteAnchors > 0
                ? `${totalIncompleteAnchors} anchor${totalIncompleteAnchors !== 1 ? 's' : ''} incomplete`
                : `${incompleteRecords.length} incomplete`}
            </div>
          )}
        </>
      ) : (
        <div style={baseStyles.unassignedCell}>
          <div style={baseStyles.shiftType(currentShiftType)}>
            {shiftTypes.length > 1
              ? shiftTypes.map((t) => t.replace(' Setting', '')).join(' / ')
              : currentShiftType}
          </div>
          <div style={baseStyles.addPrompt}>Click to assign</div>
          {canHoldWash && (
            <div style={{ ...baseStyles.holdWasher, borderTop: 'none', marginTop: 0 }}>
              <Droplets size={11} /> Hold wash day
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ScheduleGrid({ schedule, currentWeek, onCellClick, violationMap, violations }) {
  const weekSchedule = schedule[currentWeek] || {}

  // Count unassigned setters per day from violations
  const unassignedByDay = {}
  if (violations) {
    violations.forEach((v) => {
      if (v.day && v.severity === 'error') {
        unassignedByDay[v.day] = (unassignedByDay[v.day] || 0) + 1
      }
    })
  }

  // Check for inspections on each day
  const inspRecords = useMemo(() => loadInspectionRecords(), [])
  const inspectionsByDay = useMemo(() => {
    const map = {}
    DAYS.forEach((day) => {
      const dayInsps = hasInspectionOnDay(inspRecords, currentWeek, day)
      if (dayInsps.length > 0) map[day] = dayInsps
    })
    return map
  }, [inspRecords, currentWeek])

  return (
    <div style={baseStyles.grid}>
      {/* Corner cell */}
      <div style={{ ...baseStyles.dayHeader, ...baseStyles.cornerCell }} />

      {/* Day headers */}
      {DAYS.map((day) => {
        const unassignedCount = unassignedByDay[day] || 0
        const dayInspections = inspectionsByDay[day]
        return (
          <div key={day} style={{
            ...baseStyles.dayHeader,
            ...(unassignedCount > 0 ? { background: 'rgba(var(--t-error-rgb),0.12)' } : {}),
          }}>
            <div>{day}</div>
            {dayInspections && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                marginTop: '4px', fontSize: '10px', fontWeight: 700,
                color: '#06b6d4', background: 'rgba(6,182,212,0.12)',
                padding: '2px 7px', borderRadius: '4px',
                border: '1px solid rgba(6,182,212,0.25)',
              }}
                title={`Inspection Day — ${dayInspections[0].gyms.join(' & ')}`}
              >
                <ClipboardCheck size={10} />
                Inspection — {dayInspections[0].gyms.join(' & ')}
              </div>
            )}
            {unassignedCount > 0 && (
              <div style={baseStyles.unassignedDayBadge}>
                <XCircle size={10} />
                {unassignedCount} unassigned
              </div>
            )}
          </div>
        )
      })}

      {/* Gym rows */}
      {GYMS.map((gym) => (
        <Fragment key={gym.name}>
          <div style={baseStyles.gymLabel}>
            {gym.name}
          </div>
          {DAYS.map((day) => {
            const key = `${gym.name}-${day}`
            return (
              <ShiftCell
                key={key}
                gymName={gym.name}
                gym={gym}
                day={day}
                weekNumber={currentWeek}
                shift={weekSchedule[key] || null}
                onCellClick={onCellClick}
                cellViolations={violationMap?.[key] || null}
              />
            )
          })}
        </Fragment>
      ))}
    </div>
  )
}
