import { useState, useMemo } from 'react'
import { UserX, ChevronDown, ChevronUp, Zap, Calendar, AlertCircle, XCircle, CheckCircle } from 'lucide-react'
import { STAFF } from '../data/staff'
import { GYMS } from '../data/gyms'
import { loadAvailability, getSetterAbsence, ABSENCE_TYPES } from '../data/availability-overrides'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

function getRoleBadge(role) {
  switch (role) {
    case 'Director': return { label: 'DIR', bg: 'rgba(139,92,246,0.3)', color: '#a78bfa' }
    case 'Head Setter': return { label: 'HEAD', bg: 'rgba(59,130,246,0.3)', color: '#60a5fa' }
    case 'Spec Setter': return { label: 'SPEC', bg: 'rgba(245,158,11,0.3)', color: '#fbbf24' }
    default: return null
  }
}

/**
 * For each setter, compute per-day status across all gyms.
 * Returns detailed per-day breakdown of assigned/available/absent status.
 */
function analyzeSetterDays(setter, weekNumber, weekSchedule, availData) {
  const days = []

  // Director: only sets every other Monday
  const isDirectorOffWeek = setter.role === 'Director' && weekNumber % 2 !== 0

  setter.availability.forEach((day) => {
    // Check for vacation/sick
    const absence = getSetterAbsence(availData, setter.id, weekNumber, day)
    if (absence) {
      days.push({ day, status: 'absent', absenceType: absence.type, notes: absence.notes })
      return
    }

    // Director off-week: treat as unavailable
    if (isDirectorOffWeek) {
      days.push({ day, status: 'unavailable', reason: 'Director off-week' })
      return
    }

    // Check if assigned to any shift across all gyms on this day
    let assignedAsStaff = false
    let assignedAsWasher = false
    const assignedGyms = []

    if (weekSchedule) {
      GYMS.forEach((gym) => {
        const key = `${gym.name}-${day}`
        const shift = weekSchedule[key]
        if (!shift) return
        if (shift.assignedStaff?.includes(setter.id) || shift.additionalSections?.some((es) => es.assignedStaff?.includes(setter.id))) {
          assignedAsStaff = true
          assignedGyms.push(gym.name)
        }
        if (shift.holdWasher === setter.id) {
          assignedAsWasher = true
          if (!assignedGyms.includes(gym.name)) assignedGyms.push(gym.name)
        }
      })
    }

    if (assignedAsStaff) {
      days.push({ day, status: 'assigned', gyms: assignedGyms, isWasherOnly: false })
    } else if (assignedAsWasher) {
      days.push({ day, status: 'assigned', gyms: assignedGyms, isWasherOnly: true })
    } else {
      days.push({ day, status: 'available', gyms: [] })
    }
  })

  return days
}

/**
 * Determine severity level based on utilization.
 * 'not_assigned' — 0 days assigned out of available (RED)
 * 'underutilized' — assigned < 50% of available days (YELLOW)
 * 'ok' — assigned 50%+ of available days
 * 'full' — assigned all available days
 * 'off' — director off-week or fully absent
 */
function getUtilizationLevel(dayBreakdown) {
  const availableDays = dayBreakdown.filter((d) => d.status === 'available' || d.status === 'assigned')
  const assignedDays = dayBreakdown.filter((d) => d.status === 'assigned')
  const absentDays = dayBreakdown.filter((d) => d.status === 'absent')
  const unavailDays = dayBreakdown.filter((d) => d.status === 'unavailable')

  // All days are absent or unavailable — legitimately off
  if (availableDays.length === 0) {
    if (unavailDays.length > 0) return 'off'
    if (absentDays.length > 0) return 'off'
    return 'off'
  }

  if (assignedDays.length === 0) return 'not_assigned'
  if (assignedDays.length === availableDays.length) return 'full'
  if (assignedDays.length < availableDays.length * 0.5) return 'underutilized'
  return 'ok'
}

/**
 * Generate smart suggestions for unassigned days.
 */
function getSuggestions(setter, dayBreakdown, weekSchedule) {
  const unassignedDays = dayBreakdown.filter((d) => d.status === 'available').map((d) => d.day)
  if (unassignedDays.length === 0) return []

  const suggestions = []
  const dayList = unassignedDays.map((d) => d.slice(0, 3)).join(', ')

  if (setter.role === 'Director') {
    suggestions.push('Assign to Monday boulder setting at any gym')
    return suggestions
  }

  if (setter.role === 'Spec Setter') {
    const specDays = unassignedDays.filter((d) => ['Monday', 'Tuesday'].includes(d))
    if (specDays.length > 0) {
      suggestions.push(`Assign to boulder setting on ${specDays.map((d) => d.slice(0, 3)).join(' or ')}`)
      suggestions.push('Can also do hold washing')
    }
    return suggestions
  }

  if (setter.role === 'Head Setter') {
    suggestions.push(`Assign to ${setter.gym || 'home gym'} on ${dayList}`)
    return suggestions
  }

  // Regular setter — check which gyms need staff on unassigned days
  unassignedDays.forEach((day) => {
    const needsStaff = []
    GYMS.forEach((gym) => {
      const key = `${gym.name}-${day}`
      const shift = weekSchedule?.[key]
      if (!shift) return
      // Check if shift exists but has few setters
      const staffCount = shift.assignedStaff?.length || 0
      if (staffCount === 0) {
        needsStaff.push(`${gym.name} (empty)`)
      } else if (staffCount <= 2) {
        needsStaff.push(`${gym.name} (${staffCount} setter${staffCount !== 1 ? 's' : ''})`)
      }
    })
    if (needsStaff.length > 0) {
      suggestions.push(`${day.slice(0, 3)}: ${needsStaff.join(', ')} — needs more setters`)
    }
  })

  if (suggestions.length === 0) {
    suggestions.push(`${setter.name} is available ${dayList} but not assigned — click to auto-assign`)
  }

  return suggestions
}

export default function UnassignedSetterAlert({ weekSchedule, weekNumber, onAutoSchedule, onCellClick }) {
  const [expanded, setExpanded] = useState(false)

  const availData = useMemo(() => loadAvailability(), [])

  // Compute detailed per-setter per-day analysis
  const setterAnalysis = useMemo(() => {
    return STAFF.map((s) => {
      const dayBreakdown = analyzeSetterDays(s, weekNumber, weekSchedule, availData)
      const level = getUtilizationLevel(dayBreakdown)
      const suggestions = getSuggestions(s, dayBreakdown, weekSchedule)

      const availCount = dayBreakdown.filter((d) => d.status === 'available' || d.status === 'assigned').length
      const assignedCount = dayBreakdown.filter((d) => d.status === 'assigned').length
      const unassignedDays = dayBreakdown.filter((d) => d.status === 'available').map((d) => d.day)
      const absentDays = dayBreakdown.filter((d) => d.status === 'absent')

      return {
        ...s,
        dayBreakdown,
        level,
        suggestions,
        availCount,
        assignedCount,
        unassignedDays,
        absentDays,
      }
    })
  }, [weekSchedule, weekNumber, availData])

  const notAssigned = setterAnalysis.filter((s) => s.level === 'not_assigned')
  const underutilized = setterAnalysis.filter((s) => s.level === 'underutilized')
  const legitimatelyOff = setterAnalysis.filter((s) => s.level === 'off')
  const fullyAssigned = setterAnalysis.filter((s) => s.level === 'full' || s.level === 'ok')

  const problemCount = notAssigned.length + underutilized.length

  if (problemCount === 0 && legitimatelyOff.length === 0) return null

  return (
    <div style={{
      ...styles.container,
      borderColor: notAssigned.length > 0
        ? 'rgba(var(--t-error-rgb),0.25)'
        : underutilized.length > 0
          ? 'rgba(var(--t-warning-rgb),0.25)'
          : 'rgba(255,255,255,0.08)',
    }}>
      {/* Summary bar */}
      <button
        style={styles.summaryBar}
        onClick={() => setExpanded((p) => !p)}
      >
        <div style={styles.summaryLeft}>
          <UserX size={18} color={notAssigned.length > 0 ? 'var(--t-error)' : underutilized.length > 0 ? 'var(--t-warning)' : '#64748b'} />
          <div style={styles.summaryText}>
            {notAssigned.length > 0 && (
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--t-error)' }}>
                {notAssigned.length} setter{notAssigned.length !== 1 ? 's' : ''} available but not assigned
              </span>
            )}
            {underutilized.length > 0 && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t-warning)' }}>
                {notAssigned.length > 0 ? ' + ' : ''}{underutilized.length} underutilized
              </span>
            )}
            <span style={styles.summaryDetail}>
              {fullyAssigned.length} fully assigned
              {legitimatelyOff.length > 0 && ` · ${legitimatelyOff.length} off`}
            </span>
          </div>
        </div>
        <div style={styles.summaryRight}>
          <span style={styles.expandHint}>
            {expanded ? 'Hide' : 'Details'}
          </span>
          {expanded ? (
            <ChevronUp size={16} color="#94a3b8" />
          ) : (
            <ChevronDown size={16} color="#94a3b8" />
          )}
        </div>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div style={styles.body}>
          {/* NOT ASSIGNED (RED) */}
          {notAssigned.length > 0 && (
            <div style={styles.group}>
              <div style={styles.groupHeader}>
                <XCircle size={12} color="var(--t-error)" />
                <span style={{ color: 'var(--t-error)' }}>Not Assigned — Available but 0 shifts</span>
                <span style={styles.groupCount}>{notAssigned.length}</span>
              </div>
              {notAssigned.map((setter) => (
                <SetterRow
                  key={setter.id}
                  setter={setter}
                  onAutoSchedule={onAutoSchedule}
                  onCellClick={onCellClick}
                  severity="error"
                />
              ))}
            </div>
          )}

          {/* UNDERUTILIZED (YELLOW) */}
          {underutilized.length > 0 && (
            <div style={styles.group}>
              <div style={styles.groupHeader}>
                <AlertCircle size={12} color="var(--t-warning)" />
                <span style={{ color: 'var(--t-warning)' }}>Underutilized — Assigned fewer than half their available days</span>
                <span style={styles.groupCount}>{underutilized.length}</span>
              </div>
              {underutilized.map((setter) => (
                <SetterRow
                  key={setter.id}
                  setter={setter}
                  onAutoSchedule={onAutoSchedule}
                  onCellClick={onCellClick}
                  severity="warning"
                />
              ))}
            </div>
          )}

          {/* OFF / ABSENT */}
          {legitimatelyOff.length > 0 && (
            <div style={styles.group}>
              <div style={styles.groupHeader}>
                <Calendar size={12} color="#64748b" />
                <span style={{ color: '#94a3b8' }}>Unavailable / Off</span>
                <span style={styles.groupCount}>{legitimatelyOff.length}</span>
              </div>
              {legitimatelyOff.map((setter) => (
                <SetterRow
                  key={setter.id}
                  setter={setter}
                  onAutoSchedule={onAutoSchedule}
                  onCellClick={onCellClick}
                  severity="off"
                  dimmed
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SetterRow({ setter, onAutoSchedule, onCellClick, severity, dimmed }) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const badge = getRoleBadge(setter.role)

  const isError = severity === 'error'
  const isWarning = severity === 'warning'

  return (
    <div style={{
      ...styles.setterRow,
      opacity: dimmed ? 0.6 : 1,
      borderLeftColor: isError ? 'var(--t-error)' : isWarning ? 'var(--t-warning)' : 'transparent',
    }}>
      {/* Header: name + badge */}
      <div style={styles.setterNameRow}>
        {badge && (
          <span style={{
            fontSize: '8px',
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: '3px',
            background: badge.bg,
            color: badge.color,
            letterSpacing: '0.3px',
          }}>
            {badge.label}
          </span>
        )}
        <span style={styles.setterName}>{setter.name}</span>
        {/* Utilization summary */}
        <span style={{
          ...styles.utilizationBadge,
          background: isError
            ? 'rgba(var(--t-error-rgb),0.2)'
            : isWarning
              ? 'rgba(var(--t-warning-rgb),0.2)'
              : 'rgba(255,255,255,0.06)',
          color: isError
            ? 'var(--t-error)'
            : isWarning
              ? 'var(--t-warning)'
              : '#64748b',
        }}>
          {setter.assignedCount}/{setter.availCount} days
        </span>
      </div>

      {/* Message */}
      <div style={{
        fontSize: '12px',
        color: isError ? '#fca5a5' : isWarning ? '#fde68a' : '#94a3b8',
        fontWeight: 500,
        marginTop: '4px',
      }}>
        {isError && `Available ${setter.availCount} day${setter.availCount !== 1 ? 's' : ''} this week but assigned 0 days`}
        {isWarning && `Available ${setter.availCount} day${setter.availCount !== 1 ? 's' : ''} but only assigned ${setter.assignedCount} day${setter.assignedCount !== 1 ? 's' : ''}`}
        {severity === 'off' && (
          setter.absentDays.length > 0
            ? `Out: ${setter.absentDays.map((d) => `${d.day.slice(0, 3)} (${ABSENCE_TYPES[d.absenceType]?.label || d.absenceType})`).join(', ')}`
            : setter.dayBreakdown.find((d) => d.status === 'unavailable')?.reason || 'Unavailable this week'
        )}
      </div>

      {/* Per-day breakdown */}
      <div style={styles.dayGrid}>
        {setter.dayBreakdown.map((d) => (
          <DayPill
            key={d.day}
            dayInfo={d}
            setterId={setter.id}
            onCellClick={onCellClick}
          />
        ))}
      </div>

      {/* Unassigned days list */}
      {setter.unassignedDays.length > 0 && (
        <div style={styles.unassignedList}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Available but unassigned: </span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: isError ? '#fca5a5' : '#fde68a' }}>
            {setter.unassignedDays.join(', ')}
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={styles.setterActions}>
        {setter.suggestions.length > 0 && (
          <button
            style={styles.suggestBtn}
            onClick={() => setShowSuggestions((p) => !p)}
            title="View shift suggestions"
          >
            {showSuggestions ? 'Hide suggestions' : 'Suggest Assignments'}
          </button>
        )}
        {!dimmed && onAutoSchedule && (
          <button
            style={styles.quickAssignBtn}
            onClick={() => onAutoSchedule()}
            title={`Auto-assign ${setter.name} to available shifts`}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            <Zap size={11} />
            Auto-Assign
          </button>
        )}
      </div>

      {showSuggestions && setter.suggestions.length > 0 && (
        <div style={styles.suggestionsBox}>
          {setter.suggestions.map((s, i) => (
            <div key={i} style={styles.suggestionItem}>
              <span style={styles.suggestionBullet}>-</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DayPill({ dayInfo, setterId, onCellClick }) {
  const { day, status, absenceType, gyms, isWasherOnly } = dayInfo
  const short = day.slice(0, 3)

  let bg, color, icon, title, cursor
  switch (status) {
    case 'assigned':
      bg = 'rgba(16,185,129,0.2)'
      color = '#34d399'
      icon = isWasherOnly ? 'W' : '✓'
      title = `${day}: Assigned to ${gyms?.join(', ') || '?'}${isWasherOnly ? ' (hold washer only)' : ''}`
      cursor = 'default'
      break
    case 'available':
      bg = 'rgba(var(--t-error-rgb),0.15)'
      color = '#fca5a5'
      icon = '✗'
      title = `${day}: Available but NOT assigned — click to open assignment`
      cursor = onCellClick ? 'pointer' : 'default'
      break
    case 'absent':
      bg = 'rgba(var(--t-info-rgb),0.15)'
      color = 'var(--t-info)'
      icon = ABSENCE_TYPES[absenceType]?.icon || 'O'
      title = `${day}: ${ABSENCE_TYPES[absenceType]?.label || 'Absent'}`
      cursor = 'default'
      break
    case 'unavailable':
      bg = 'rgba(255,255,255,0.04)'
      color = '#475569'
      icon = '—'
      title = `${day}: ${dayInfo.reason || 'Unavailable'}`
      cursor = 'default'
      break
    default:
      bg = 'rgba(255,255,255,0.04)'
      color = '#475569'
      icon = '?'
      title = day
      cursor = 'default'
  }

  const handleClick = () => {
    if (status === 'available' && onCellClick) {
      // Open assignment for first gym that has a shift on this day, or first gym
      const targetGym = GYMS.find((g) => {
        return g.boulderDays?.includes(day) || g.ropeDays?.includes(day) || g.flexDays?.includes(day)
      })
      if (targetGym) {
        onCellClick(targetGym.name, day)
      }
    }
  }

  return (
    <button
      style={{
        ...styles.dayPill,
        background: bg,
        color,
        cursor,
        borderColor: status === 'available' ? 'rgba(var(--t-error-rgb),0.3)' : 'transparent',
      }}
      title={title}
      onClick={handleClick}
      disabled={status !== 'available'}
    >
      <span style={styles.dayPillIcon}>{icon}</span>
      <span style={styles.dayPillLabel}>{short}</span>
    </button>
  )
}

const styles = {
  container: {
    marginBottom: '12px',
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid rgba(var(--t-warning-rgb),0.2)',
    background: 'rgba(var(--t-warning-rgb),0.02)',
    animation: 'slideInUp 0.3s ease-out',
  },
  summaryBar: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 18px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#f1f5f9',
    minHeight: '48px',
  },
  summaryLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  summaryText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  summaryDetail: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  summaryRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  expandHint: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  body: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
    padding: '8px 12px 12px',
    maxHeight: '500px',
    overflowY: 'auto',
  },
  group: {
    marginBottom: '10px',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '6px 0',
  },
  groupCount: {
    marginLeft: 'auto',
    fontSize: '10px',
    color: '#64748b',
    background: 'rgba(255,255,255,0.06)',
    padding: '1px 6px',
    borderRadius: '8px',
    textTransform: 'none',
  },
  setterRow: {
    padding: '12px 14px',
    marginBottom: '6px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderLeft: '3px solid transparent',
  },
  setterNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  setterName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  utilizationBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '1px 8px',
    borderRadius: '4px',
    letterSpacing: '0.3px',
    marginLeft: 'auto',
  },
  dayGrid: {
    display: 'flex',
    gap: '4px',
    marginTop: '8px',
  },
  dayPill: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1px',
    padding: '4px 0',
    borderRadius: '6px',
    border: '1px solid transparent',
    flex: 1,
    minWidth: 0,
    transition: 'all 0.12s',
  },
  dayPillIcon: {
    fontSize: '12px',
    fontWeight: 700,
    lineHeight: 1,
  },
  dayPillLabel: {
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    opacity: 0.8,
  },
  unassignedList: {
    marginTop: '6px',
    padding: '4px 8px',
    borderRadius: '4px',
    background: 'rgba(255,255,255,0.03)',
  },
  setterActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    justifyContent: 'flex-end',
    marginTop: '6px',
  },
  suggestBtn: {
    padding: '5px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: '28px',
  },
  quickAssignBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 12px',
    borderRadius: '6px',
    border: 'none',
    background: 'linear-gradient(135deg, var(--t-warning) 0%, color-mix(in srgb, var(--t-warning) 70%, black) 100%)',
    color: '#000',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.12s',
    minHeight: '28px',
  },
  suggestionsBox: {
    marginTop: '6px',
    padding: '6px 10px',
    borderRadius: '4px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  suggestionItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    fontSize: '11px',
    color: '#cbd5e1',
    lineHeight: 1.4,
    padding: '2px 0',
  },
  suggestionBullet: {
    color: 'var(--t-warning)',
    fontWeight: 700,
    flexShrink: 0,
  },
}
