import { useState, useMemo, useRef, useEffect } from 'react'
import {
  AlertTriangle, Droplets, XCircle, AlertCircle, Users, UserX,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Calendar, Home,
  ClipboardCheck,
} from 'lucide-react'
import { GYMS } from '../data/gyms'
import { STAFF } from '../data/staff'
import { validateSchedule, buildViolationMap } from '../utils/validation'
import { analyzeWeeklyAssignments } from '../utils/analytics'
import { loadInspectionRecords, hasInspectionOnDay } from '../data/inspections'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const GYM_ABBREV = { Ogden: 'OG', SLC: 'SLC', Soma: 'SO' }
const GYM_COLOR = { Ogden: '#f59e0b', SLC: '#3b82f6', Soma: '#8b5cf6' }

const SHIFT_TYPE_DOT = {
  'Boulder Setting': '#3b82f6',
  'Rope Setting': '#8b5cf6',
  'Hold Washing': '#06b6d4',
  'Flex': '#10b981',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Convert week number to Monday date (same base as WeekNavigation) */
function getWeekMonday(weekNumber) {
  const base = new Date(2025, 0, 6) // Monday Jan 6, 2025 = week 0
  const d = new Date(base)
  d.setDate(d.getDate() + weekNumber * 7)
  return d
}

/** Get month and year for a given week (using Wednesday as representative) */
function getMonthInfo(weekNumber) {
  const mon = getWeekMonday(weekNumber)
  const mid = new Date(mon)
  mid.setDate(mid.getDate() + 2)
  return { month: mid.getMonth(), year: mid.getFullYear() }
}

/** Get the month name + year for a given week */
function getMonthLabel(weekNumber) {
  const { month, year } = getMonthInfo(weekNumber)
  return `${MONTH_NAMES[month]} ${year}`
}

/** Get all weeks that fall in the same month as `centerWeek` */
function getMonthWeeks(centerWeek) {
  const { month, year } = getMonthInfo(centerWeek)

  const weeks = []

  // Search backward
  for (let w = centerWeek; w >= 0; w--) {
    const info = getMonthInfo(w)
    if (info.month !== month || info.year !== year) break
    weeks.unshift(w)
  }

  // Search forward
  for (let w = centerWeek + 1; ; w++) {
    const info = getMonthInfo(w)
    if (info.month !== month || info.year !== year) break
    weeks.push(w)
  }

  return weeks
}

/** Get the date range string for a set of weeks */
function getDateRange(weeks) {
  if (weeks.length === 0) return ''
  const firstMon = getWeekMonday(weeks[0])
  const lastMon = getWeekMonday(weeks[weeks.length - 1])
  const lastFri = new Date(lastMon)
  lastFri.setDate(lastFri.getDate() + 4)
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const year = lastFri.getFullYear()
  return `${fmt(firstMon)} – ${fmt(lastFri)}, ${year}`
}

/** Find the first week of the next month */
function getNextMonthWeek(centerWeek) {
  const { month, year } = getMonthInfo(centerWeek)
  for (let w = centerWeek + 1; ; w++) {
    const info = getMonthInfo(w)
    if (info.month !== month || info.year !== year) return w
  }
}

/** Find the first week of the previous month */
function getPrevMonthWeek(centerWeek) {
  const { month, year } = getMonthInfo(centerWeek)
  // Go backward to find the first week not in this month
  let prevWeek = centerWeek
  for (let w = centerWeek - 1; w >= 0; w--) {
    const info = getMonthInfo(w)
    if (info.month !== month || info.year !== year) {
      prevWeek = w
      break
    }
  }
  // Now find the first week of that month
  const prevInfo = getMonthInfo(prevWeek)
  for (let w = prevWeek - 1; w >= 0; w--) {
    const info = getMonthInfo(w)
    if (info.month !== prevInfo.month || info.year !== prevInfo.year) return w + 1
  }
  return 0
}

/** Get the week number for today */
function getTodayWeek() {
  const base = new Date(2025, 0, 6)
  const now = new Date()
  const diff = Math.floor((now - base) / (7 * 24 * 60 * 60 * 1000))
  return Math.max(0, diff)
}


// ---- Month Picker Dropdown ----

function MonthPicker({ currentWeek, onNavigate, onClose }) {
  const ref = useRef(null)
  const { year } = getMonthInfo(currentWeek)
  const [pickerYear, setPickerYear] = useState(year)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const currentInfo = getMonthInfo(currentWeek)

  // Find week number for a given month/year
  const getWeekForMonth = (month, yr) => {
    const base = new Date(2025, 0, 6)
    // Find the first day of target month
    const target = new Date(yr, month, 15) // mid-month
    const diff = Math.floor((target - base) / (7 * 24 * 60 * 60 * 1000))
    return Math.max(0, diff)
  }

  return (
    <div ref={ref} style={styles.monthPicker}>
      <div style={styles.monthPickerYearRow}>
        <button
          style={styles.monthPickerYearBtn}
          onClick={() => setPickerYear((y) => y - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <span style={styles.monthPickerYear}>{pickerYear}</span>
        <button
          style={styles.monthPickerYearBtn}
          onClick={() => setPickerYear((y) => y + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div style={styles.monthPickerGrid}>
        {MONTH_NAMES.map((name, i) => {
          const isActive = currentInfo.month === i && currentInfo.year === pickerYear
          return (
            <button
              key={i}
              style={{
                ...styles.monthPickerBtn,
                background: isActive ? 'rgba(59,130,246,0.2)' : 'transparent',
                color: isActive ? '#60a5fa' : '#94a3b8',
                borderColor: isActive ? 'rgba(59,130,246,0.4)' : 'transparent',
              }}
              onClick={() => {
                onNavigate(getWeekForMonth(i, pickerYear))
                onClose()
              }}
            >
              {name.slice(0, 3)}
            </button>
          )
        })}
      </div>
      <button
        style={styles.monthPickerToday}
        onClick={() => {
          onNavigate(getTodayWeek())
          onClose()
        }}
      >
        <Home size={12} />
        Today
      </button>
    </div>
  )
}


// ---- Month Statistics ----

function MonthStatistics({ scheduleHistory, monthWeeks, violationWeeks, weekViolationMaps }) {
  const stats = useMemo(() => {
    let totalShifts = 0
    let totalSetterAssignments = 0
    let totalErrors = 0
    let totalWarnings = 0
    const settersUsed = new Set()
    const sectionsUsed = new Set()

    monthWeeks.forEach((w) => {
      const sched = scheduleHistory[w] || {}
      Object.entries(sched).forEach(([key, shift]) => {
        if (!shift) return
        totalShifts++
        if (shift.assignedStaff) {
          shift.assignedStaff.forEach((id) => {
            totalSetterAssignments++
            settersUsed.add(id)
          })
        }
        if (shift.additionalSections?.length) {
          shift.additionalSections.forEach((es) => {
            ;(es.assignedStaff || []).forEach((id) => {
              totalSetterAssignments++
              settersUsed.add(id)
            })
            if (es.section) sectionsUsed.add(`${key.split('-')[0]}-${es.section}`)
          })
        }
        if (shift.section) sectionsUsed.add(`${key.split('-')[0]}-${shift.section}`)
      })

      const vMap = weekViolationMaps[w]
      if (vMap) {
        Object.values(vMap).flat().forEach((v) => {
          if (v.severity === 'error') totalErrors++
          else totalWarnings++
        })
      }
    })

    return {
      totalShifts,
      totalSetterAssignments,
      totalErrors,
      totalWarnings,
      uniqueSetters: settersUsed.size,
      uniqueSections: sectionsUsed.size,
      utilization: STAFF.length > 0 ? Math.round((settersUsed.size / STAFF.length) * 100) : 0,
    }
  }, [scheduleHistory, monthWeeks, weekViolationMaps])

  return (
    <div style={styles.statsRow}>
      <div style={styles.statCard}>
        <div style={styles.statValue}>{stats.totalShifts}</div>
        <div style={styles.statLabel}>Shifts</div>
      </div>
      <div style={styles.statCard}>
        <div style={styles.statValue}>{stats.totalSetterAssignments}</div>
        <div style={styles.statLabel}>Assignments</div>
      </div>
      <div style={styles.statCard}>
        <div style={styles.statValue}>{stats.uniqueSetters}/{STAFF.length}</div>
        <div style={styles.statLabel}>Setters ({stats.utilization}%)</div>
      </div>
      <div style={styles.statCard}>
        <div style={styles.statValue}>{stats.uniqueSections}</div>
        <div style={styles.statLabel}>Sections</div>
      </div>
      {stats.totalErrors > 0 && (
        <div style={{ ...styles.statCard, borderColor: 'rgba(239,68,68,0.3)' }}>
          <div style={{ ...styles.statValue, color: '#f87171' }}>{stats.totalErrors}</div>
          <div style={styles.statLabel}>Errors</div>
        </div>
      )}
      {stats.totalWarnings > 0 && (
        <div style={{ ...styles.statCard, borderColor: 'rgba(251,191,36,0.3)' }}>
          <div style={{ ...styles.statValue, color: '#fbbf24' }}>{stats.totalWarnings}</div>
          <div style={styles.statLabel}>Warnings</div>
        </div>
      )}
    </div>
  )
}


// ---- Day Cell ----

function DayCell({ weekNumber, dayIndex, schedule, dayViolations, isCurrentWeek, onDayClick, dayInspections }) {
  const day = DAYS[dayIndex]
  const weekSchedule = schedule[weekNumber] || {}

  const mon = getWeekMonday(weekNumber)
  const cellDate = new Date(mon)
  cellDate.setDate(cellDate.getDate() + dayIndex)
  const dateNum = cellDate.getDate()

  // Check if this is today
  const now = new Date()
  const isToday = cellDate.getFullYear() === now.getFullYear() &&
    cellDate.getMonth() === now.getMonth() &&
    cellDate.getDate() === now.getDate()

  const hasInspection = dayInspections && dayInspections.length > 0

  const gymEntries = []
  GYMS.forEach((gym) => {
    const key = `${gym.name}-${day}`
    const shift = weekSchedule[key]
    if (!shift) return
    gymEntries.push({
      gym: gym.name,
      shiftType: shift.shiftType,
      section: shift.section,
      staffCount: shift.assignedStaff?.length || 0,
      hasHoldWasher: !!shift.holdWasher,
    })
  })

  const isEmpty = gymEntries.length === 0
  const dayErrors = dayViolations?.filter((v) => v.severity === 'error') || []
  const dayWarnings = dayViolations?.filter((v) => v.severity === 'warning') || []
  const hasErrors = dayErrors.length > 0
  const hasWarnings = dayWarnings.length > 0

  return (
    <button
      style={{
        ...styles.dayCell,
        background: isToday
          ? 'rgba(16,185,129,0.1)'
          : isCurrentWeek
            ? 'rgba(59,130,246,0.08)'
            : hasErrors
              ? 'rgba(var(--t-error-rgb),0.06)'
              : isEmpty
                ? 'rgba(255,255,255,0.01)'
                : 'rgba(255,255,255,0.03)',
        borderColor: isToday
          ? 'rgba(16,185,129,0.5)'
          : hasErrors
            ? 'rgba(var(--t-error-rgb),0.4)'
            : isCurrentWeek
              ? 'rgba(59,130,246,0.3)'
              : hasWarnings
                ? 'rgba(var(--t-warning-rgb),0.3)'
                : 'rgba(255,255,255,0.06)',
      }}
      onClick={() => onDayClick(weekNumber)}
      title={`Week ${weekNumber} — ${day}${isToday ? ' (Today)' : ''}${hasErrors ? `\n${dayErrors.length} error(s)` : ''}${hasWarnings ? `\n${dayWarnings.length} warning(s)` : ''}\nClick to open weekly view`}
    >
      <div style={styles.dateRow}>
        <span style={{
          ...styles.dateNum,
          color: isToday ? '#10b981' : isCurrentWeek ? '#60a5fa' : '#94a3b8',
          fontWeight: isToday || isCurrentWeek ? 700 : 500,
        }}>
          {dateNum}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {hasInspection && (
            <span
              style={{ display: 'flex', alignItems: 'center', color: '#06b6d4', flexShrink: 0 }}
              title={`Inspection — ${dayInspections[0].gyms.join(' & ')}`}
            >
              <ClipboardCheck size={9} />
            </span>
          )}
          {hasErrors && (
            <span style={styles.dayErrorDot} title={`${dayErrors.length} error(s)`}>
              <XCircle size={8} />
              {dayErrors.length > 1 && <span style={{ fontSize: '8px', fontWeight: 700 }}>{dayErrors.length}</span>}
            </span>
          )}
          {hasWarnings && (
            <span style={styles.dayWarningDot} title={`${dayWarnings.length} warning(s)`}>
              <AlertCircle size={8} />
            </span>
          )}
        </div>
      </div>

      {gymEntries.length > 0 ? (
        <div style={styles.gymList}>
          {gymEntries.map((entry, i) => (
            <div key={i} style={styles.gymEntry}>
              <span style={{ ...styles.gymAbbrev, color: GYM_COLOR[entry.gym] }}>
                {GYM_ABBREV[entry.gym]}
              </span>
              <span
                style={{ ...styles.typeDot, background: SHIFT_TYPE_DOT[entry.shiftType] || '#64748b' }}
                title={entry.shiftType}
              />
              {entry.section && (
                <span style={styles.sectionName}>
                  {entry.section.length > 8 ? entry.section.slice(0, 7) + '.' : entry.section}
                </span>
              )}
              <span style={styles.staffCount}>{entry.staffCount}</span>
              {entry.hasHoldWasher && (
                <Droplets size={8} color="#06b6d4" style={{ flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.emptyCell}>—</div>
      )}
    </button>
  )
}


// ---- Week Row ----

function WeekRow({ weekNumber, schedule, violationWeeks, weekViolationMap, currentWeek, onDayClick, inspectionRecords }) {
  const isCurrentWeek = weekNumber === currentWeek

  const mon = getWeekMonday(weekNumber)
  const weekLabel = mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const dayViolationsMap = useMemo(() => {
    const map = {}
    if (!weekViolationMap) return map
    DAYS.forEach((day) => {
      const dayViols = []
      Object.entries(weekViolationMap).forEach(([key, viols]) => {
        if (key.endsWith(`-${day}`)) dayViols.push(...viols)
      })
      if (dayViols.length > 0) map[day] = dayViols
    })
    return map
  }, [weekViolationMap])

  const dayInspectionsMap = useMemo(() => {
    const map = {}
    DAYS.forEach((day) => {
      const insps = hasInspectionOnDay(inspectionRecords, weekNumber, day)
      if (insps.length > 0) map[day] = insps
    })
    return map
  }, [inspectionRecords, weekNumber])

  const errorCount = Object.values(weekViolationMap || {}).flat().filter((v) => v.severity === 'error').length
  const warningCount = Object.values(weekViolationMap || {}).flat().filter((v) => v.severity === 'warning').length

  return (
    <div style={styles.weekRow}>
      <div style={{
        ...styles.weekLabel,
        color: isCurrentWeek ? '#60a5fa' : '#64748b',
        fontWeight: isCurrentWeek ? 700 : 500,
      }}>
        <span>Wk {weekNumber}</span>
        <span style={styles.weekDate}>{weekLabel}</span>
        {errorCount > 0 && (
          <span style={styles.weekErrorBadge}>
            <XCircle size={9} /> {errorCount}
          </span>
        )}
        {warningCount > 0 && !errorCount && (
          <span style={styles.weekWarningBadge}>
            <AlertCircle size={9} /> {warningCount}
          </span>
        )}
      </div>

      {DAYS.map((day, di) => (
        <DayCell
          key={di}
          weekNumber={weekNumber}
          dayIndex={di}
          schedule={schedule}
          dayViolations={dayViolationsMap[day] || null}
          isCurrentWeek={isCurrentWeek}
          onDayClick={onDayClick}
          dayInspections={dayInspectionsMap[day] || null}
        />
      ))}
    </div>
  )
}


// ---- Monthly Assignment Summary ----

function MonthlyAssignmentSummary({ scheduleHistory, monthWeeks }) {
  const [expanded, setExpanded] = useState(false)

  const setterMonthData = useMemo(() => {
    const data = STAFF.map((s) => {
      const weekAssignments = monthWeeks.map((w) => {
        const sched = scheduleHistory[w] || {}
        const stats = analyzeWeeklyAssignments(sched)
        return stats[s.id]?.totalShifts || 0
      })
      const totalShifts = weekAssignments.reduce((sum, c) => sum + c, 0)
      const weeksWithZero = weekAssignments.filter((c) => c === 0).length

      let maxConsecutiveZero = 0
      let currentStreak = 0
      weekAssignments.forEach((c) => {
        if (c === 0) {
          currentStreak++
          maxConsecutiveZero = Math.max(maxConsecutiveZero, currentStreak)
        } else {
          currentStreak = 0
        }
      })

      return { ...s, weekAssignments, totalShifts, weeksWithZero, maxConsecutiveZero }
    })

    return data.sort((a, b) => a.totalShifts - b.totalShifts)
  }, [scheduleHistory, monthWeeks])

  const concerns = setterMonthData.filter(
    (s) => s.maxConsecutiveZero >= 2 || (s.weeksWithZero === monthWeeks.length && s.role !== 'Director')
  )

  const totalAssigned = setterMonthData.filter((s) => s.totalShifts > 0).length

  return (
    <div style={styles.monthlySummary}>
      <button
        style={styles.monthlySummaryHeader}
        onClick={() => setExpanded((p) => !p)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={14} color="#8b5cf6" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
            Monthly Assignment Summary
          </span>
          <span style={{
            fontSize: '10px', color: '#64748b',
            background: 'rgba(255,255,255,0.06)',
            padding: '2px 8px', borderRadius: '8px',
          }}>
            {totalAssigned}/{STAFF.length} assigned
          </span>
          {concerns.length > 0 && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: '3px',
              fontSize: '10px', fontWeight: 600,
              color: 'var(--t-warning)',
              background: 'rgba(var(--t-warning-rgb),0.15)',
              padding: '2px 8px', borderRadius: '8px',
            }}>
              <UserX size={10} />
              {concerns.length} concern{concerns.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
      </button>

      {expanded && (
        <div style={styles.monthlySummaryBody}>
          {concerns.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{
                fontSize: '10px', fontWeight: 700, color: 'var(--t-warning)',
                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
              }}>
                Scheduling Concerns
              </div>
              {concerns.map((s) => (
                <div key={s.id} style={styles.concernRow}>
                  <UserX size={12} color="var(--t-warning)" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#fde68a' }}>{s.name}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {' '}— {s.weeksWithZero === monthWeeks.length
                        ? 'not scheduled at all this month'
                        : `not scheduled in ${s.maxConsecutiveZero} consecutive weeks`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            Week-by-Week Assignments
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ width: '64px', flexShrink: 0 }} />
              {monthWeeks.map((w) => (
                <span key={w} style={{
                  flex: 1, textAlign: 'center', fontSize: '9px', color: '#64748b', fontWeight: 600,
                }}>Wk{w}</span>
              ))}
              <span style={{ width: '28px', flexShrink: 0, textAlign: 'right', fontSize: '9px', color: '#64748b', fontWeight: 600 }}>
                Tot
              </span>
            </div>

            {setterMonthData.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                <span style={{
                  width: '64px', flexShrink: 0, fontSize: '10px',
                  color: s.totalShifts === 0 ? 'var(--t-warning)' : '#cbd5e1',
                  fontWeight: s.totalShifts === 0 ? 700 : 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{s.name}</span>
                {s.weekAssignments.map((count, wi) => (
                  <div key={wi} style={{
                    flex: 1, height: '18px', borderRadius: '3px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '9px', fontWeight: 700,
                    background: count === 0
                      ? 'rgba(var(--t-warning-rgb),0.12)'
                      : count >= 3 ? 'rgba(59,130,246,0.3)'
                        : count >= 2 ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.1)',
                    color: count === 0 ? 'var(--t-warning)' : count >= 2 ? '#60a5fa' : '#94a3b8',
                    border: count === 0 ? '1px solid rgba(var(--t-warning-rgb),0.2)' : '1px solid transparent',
                  }}>{count || '—'}</div>
                ))}
                <span style={{
                  width: '28px', flexShrink: 0, textAlign: 'right',
                  fontSize: '10px', fontWeight: 700,
                  color: s.totalShifts === 0 ? 'var(--t-warning)' : '#94a3b8',
                }}>{s.totalShifts}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


// ---- Main Component ----

export default function MonthlyView({ scheduleHistory, currentWeek, onWeekSelect, onMonthNavigate }) {
  const [showPicker, setShowPicker] = useState(false)
  const monthWeeks = useMemo(() => getMonthWeeks(currentWeek), [currentWeek])
  const monthLabel = useMemo(() => getMonthLabel(currentWeek), [currentWeek])
  const dateRange = useMemo(() => getDateRange(monthWeeks), [monthWeeks])
  const inspectionRecords = useMemo(() => loadInspectionRecords(), [])

  const { violationWeeks, weekViolationMaps } = useMemo(() => {
    const set = new Set()
    const maps = {}
    monthWeeks.forEach((w) => {
      const sched = scheduleHistory[w]
      if (!sched || Object.keys(sched).length === 0) return
      const v = validateSchedule(sched, w)
      if (v.length > 0) {
        maps[w] = buildViolationMap(v)
        if (v.some((x) => x.severity === 'error')) set.add(w)
      }
    })
    return { violationWeeks: set, weekViolationMaps: maps }
  }, [monthWeeks, scheduleHistory])

  const navigateMonth = onMonthNavigate || onWeekSelect

  const handlePrevMonth = () => navigateMonth(getPrevMonthWeek(currentWeek))
  const handleNextMonth = () => navigateMonth(getNextMonthWeek(currentWeek))
  const handleToday = () => navigateMonth(getTodayWeek())

  return (
    <div style={styles.container}>
      {/* Month navigation header */}
      <div style={styles.navHeader}>
        <div style={styles.navLeft}>
          <button
            style={styles.navBtn}
            onClick={handlePrevMonth}
            title="Previous month"
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          >
            <ChevronLeft size={20} />
          </button>

          <div style={styles.monthTitleGroup}>
            <button
              style={styles.monthTitleBtn}
              onClick={() => setShowPicker((p) => !p)}
              title="Click to pick month"
            >
              <Calendar size={18} color="var(--t-secondary)" />
              <h2 style={styles.monthTitle}>{monthLabel}</h2>
              <ChevronDown size={14} color="#64748b" />
            </button>
            {showPicker && (
              <MonthPicker
                currentWeek={currentWeek}
                onNavigate={navigateMonth}
                onClose={() => setShowPicker(false)}
              />
            )}
          </div>

          <button
            style={styles.navBtn}
            onClick={handleNextMonth}
            title="Next month"
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          >
            <ChevronRight size={20} />
          </button>

          <button
            style={styles.todayBtn}
            onClick={handleToday}
            title="Jump to current month"
          >
            <Home size={13} />
            Today
          </button>
        </div>

        <div style={styles.navRight}>
          <span style={styles.dateRangeLabel}>{dateRange}</span>
          <span style={styles.weekCount}>Weeks {monthWeeks[0]}–{monthWeeks[monthWeeks.length - 1]}</span>
          {violationWeeks.size > 0 && (
            <span style={styles.violationBadge}>
              <XCircle size={12} />
              {violationWeeks.size} week{violationWeeks.size !== 1 ? 's' : ''} with errors
            </span>
          )}
        </div>
      </div>

      {/* Month statistics */}
      <MonthStatistics
        scheduleHistory={scheduleHistory}
        monthWeeks={monthWeeks}
        violationWeeks={violationWeeks}
        weekViolationMaps={weekViolationMaps}
      />

      {/* Legend */}
      <div style={styles.legend}>
        {Object.entries(SHIFT_TYPE_DOT).map(([type, color]) => (
          <div key={type} style={styles.legendItem}>
            <span style={{ ...styles.typeDot, background: color }} />
            <span style={styles.legendLabel}>
              {type === 'Boulder Setting' ? 'Boulder' : type === 'Rope Setting' ? 'Rope' : type === 'Hold Washing' ? 'Wash' : 'Flex'}
            </span>
          </div>
        ))}
        <div style={styles.legendDivider} />
        {GYMS.map((gym) => (
          <div key={gym.name} style={styles.legendItem}>
            <span style={{ ...styles.gymAbbrev, color: GYM_COLOR[gym.name], fontSize: '10px' }}>
              {GYM_ABBREV[gym.name]}
            </span>
            <span style={styles.legendLabel}>{gym.name}</span>
          </div>
        ))}
      </div>

      {/* Day headers */}
      <div style={styles.dayHeaderRow}>
        <div style={styles.weekLabelHeader} />
        {DAY_HEADERS.map((d) => (
          <div key={d} style={styles.dayHeader}>{d}</div>
        ))}
      </div>

      {/* Week rows */}
      <div style={styles.grid}>
        {monthWeeks.map((w) => (
          <WeekRow
            key={w}
            weekNumber={w}
            schedule={scheduleHistory}
            violationWeeks={violationWeeks}
            weekViolationMap={weekViolationMaps[w] || null}
            currentWeek={currentWeek}
            onDayClick={onWeekSelect}
            inspectionRecords={inspectionRecords}
          />
        ))}
      </div>

      {/* Click hint */}
      <div style={styles.hint}>
        Click any day to jump to that week's detailed view
      </div>

      {/* Monthly Assignment Summary */}
      <MonthlyAssignmentSummary
        scheduleHistory={scheduleHistory}
        monthWeeks={monthWeeks}
      />
    </div>
  )
}

// Export for use in App.jsx keyboard shortcuts
export { getNextMonthWeek, getPrevMonthWeek, getTodayWeek }


const styles = {
  container: {
    animation: 'fadeIn 0.25s ease-out',
  },
  navHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  navLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  navBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    color: 'var(--t-text)',
    padding: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
    minWidth: '40px',
    minHeight: '40px',
  },
  monthTitleGroup: {
    position: 'relative',
  },
  monthTitleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '8px',
    transition: 'background 0.15s',
  },
  monthTitle: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 800,
    color: '#f1f5f9',
    letterSpacing: '-0.3px',
  },
  todayBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    color: '#94a3b8',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginLeft: '4px',
    minHeight: '38px',
  },
  dateRangeLabel: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  weekCount: {
    fontSize: '11px',
    color: '#64748b',
    background: 'rgba(255,255,255,0.06)',
    padding: '2px 10px',
    borderRadius: '10px',
    fontWeight: 500,
  },
  violationBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#f87171',
    background: 'rgba(239,68,68,0.1)',
    padding: '3px 10px',
    borderRadius: '10px',
  },
  // Month picker
  monthPicker: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    zIndex: 100,
    width: '280px',
    background: 'rgba(30, 41, 59, 0.98)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '14px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.25)',
    padding: '14px',
    backdropFilter: 'blur(16px)',
    animation: 'slideInUp 0.15s ease-out',
  },
  monthPickerYearRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  monthPickerYear: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#f1f5f9',
  },
  monthPickerYearBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    color: '#94a3b8',
    padding: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  monthPickerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '4px',
    marginBottom: '10px',
  },
  monthPickerBtn: {
    padding: '10px 4px',
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    textAlign: 'center',
    transition: 'all 0.15s',
    minHeight: '38px',
  },
  monthPickerToday: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    width: '100%',
    padding: '9px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#94a3b8',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    minHeight: '38px',
  },
  // Stats
  statsRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '14px',
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: '90px',
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 800,
    color: '#f1f5f9',
    lineHeight: 1.2,
    letterSpacing: '-0.3px',
  },
  statLabel: {
    fontSize: '11px',
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginTop: '4px',
  },
  // Existing styles
  dayErrorDot: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    color: 'var(--t-error)',
    flexShrink: 0,
  },
  dayWarningDot: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--t-warning)',
    flexShrink: 0,
  },
  weekErrorBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: '9px',
    fontWeight: 700,
    color: 'var(--t-error)',
    background: 'rgba(var(--t-error-rgb),0.15)',
    padding: '1px 5px',
    borderRadius: '8px',
  },
  weekWarningBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: '9px',
    fontWeight: 700,
    color: 'var(--t-warning)',
    background: 'rgba(var(--t-warning-rgb),0.15)',
    padding: '1px 5px',
    borderRadius: '8px',
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.06)',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  legendLabel: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  legendDivider: {
    width: '1px',
    height: '16px',
    background: 'rgba(255,255,255,0.1)',
  },
  dayHeaderRow: {
    display: 'grid',
    gridTemplateColumns: '72px repeat(5, 1fr)',
    gap: '4px',
    marginBottom: '4px',
  },
  weekLabelHeader: {},
  dayHeader: {
    textAlign: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '6px 0',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  weekRow: {
    display: 'grid',
    gridTemplateColumns: '72px repeat(5, 1fr)',
    gap: '4px',
    minHeight: '72px',
  },
  weekLabel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    fontSize: '11px',
    padding: '4px',
  },
  weekDate: {
    fontSize: '9px',
    opacity: 0.7,
  },
  dayCell: {
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    transition: 'all 0.15s',
    minHeight: '72px',
  },
  dateRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateNum: {
    fontSize: '12px',
    lineHeight: 1,
  },
  gymList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  gymEntry: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    lineHeight: 1.2,
  },
  gymAbbrev: {
    fontWeight: 700,
    fontSize: '9px',
    letterSpacing: '0.3px',
    minWidth: '22px',
    flexShrink: 0,
  },
  typeDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
    display: 'inline-block',
  },
  sectionName: {
    color: '#cbd5e1',
    fontSize: '10px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
  staffCount: {
    color: '#64748b',
    fontSize: '9px',
    fontWeight: 600,
    flexShrink: 0,
  },
  emptyCell: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#334155',
    fontSize: '12px',
  },
  hint: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#475569',
    marginTop: '12px',
    fontStyle: 'italic',
  },
  monthlySummary: {
    marginTop: '20px',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
  },
  monthlySummaryHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: 'none',
    cursor: 'pointer',
    color: '#f1f5f9',
  },
  monthlySummaryBody: {
    padding: '10px 14px 14px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  concernRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '5px 8px',
    marginBottom: '3px',
    borderRadius: '6px',
    background: 'rgba(var(--t-warning-rgb),0.06)',
    border: '1px solid rgba(var(--t-warning-rgb),0.12)',
  },
}
