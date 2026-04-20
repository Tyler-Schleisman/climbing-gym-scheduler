import { useState, useMemo } from 'react'
import { BarChart3, Users, RefreshCw, AlertTriangle, Mountain, UserX, CheckCircle, Eye, EyeOff, ClipboardCheck } from 'lucide-react'
import { STAFF } from '../data/staff'
import { GYMS } from '../data/gyms'
import {
  analyzeWeeklyAssignments,
  computeRotationTracking,
  getRotationStatus,
} from '../utils/analytics'
import { loadAvailability, getUpcomingAbsences, getSetterAbsence, ABSENCE_TYPES } from '../data/availability-overrides'
import { loadInspectionRecords, getUpcomingInspections, getOverdueInspections, formatDate, todayWeek } from '../data/inspections'

function getRoleBadge(role) {
  switch (role) {
    case 'Director': return { label: 'DIR', bg: 'rgba(139,92,246,0.3)', color: '#a78bfa' }
    case 'Head Setter': return { label: 'HEAD', bg: 'rgba(59,130,246,0.3)', color: '#60a5fa' }
    case 'Spec Setter': return { label: 'SPEC', bg: 'rgba(245,158,11,0.3)', color: '#fbbf24' }
    default: return null
  }
}

function StatPill({ label, value, color, warn }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '4px 8px',
      borderRadius: '6px',
      background: warn ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
      border: warn ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.06)',
      minWidth: '40px',
    }}>
      <span style={{ fontSize: '14px', fontWeight: 700, color: color || '#e2e8f0' }}>
        {value}
      </span>
      <span style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        {label}
      </span>
    </div>
  )
}

function RotationBar({ current, goal, overdue }) {
  const pct = current != null ? Math.min((current / goal) * 100, 100) : 0
  const barColor = overdue ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#3b82f6'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
      <div style={{
        flex: 1,
        height: '6px',
        borderRadius: '3px',
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: '3px',
          background: barColor,
          transition: 'width 0.3s',
        }} />
      </div>
      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        color: overdue ? '#f87171' : '#94a3b8',
        minWidth: '36px',
        textAlign: 'right',
      }}>
        {current != null ? current : '—'}/{goal}
      </span>
    </div>
  )
}

export default function AnalyticsPanel({ scheduleHistory, currentWeek }) {
  const currentSchedule = scheduleHistory[currentWeek] || {}
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false)

  const weekStats = useMemo(
    () => analyzeWeeklyAssignments(currentSchedule),
    [currentSchedule]
  )

  const rotationTracking = useMemo(
    () => computeRotationTracking(scheduleHistory, currentWeek),
    [scheduleHistory, currentWeek]
  )

  const rotationStatus = useMemo(
    () => getRotationStatus(rotationTracking, currentWeek),
    [rotationTracking, currentWeek]
  )

  // All staff with assignment info
  const allStaffStats = useMemo(
    () => STAFF.map((s) => weekStats[s.id]),
    [weekStats]
  )

  // Filter to only show staff with at least one shift
  const activeStaff = useMemo(
    () => allStaffStats.filter((s) => s.totalShifts > 0)
      .sort((a, b) => b.totalShifts - a.totalShifts),
    [allStaffStats]
  )

  const unassignedStaff = useMemo(
    () => allStaffStats.filter((s) => s.totalShifts === 0),
    [allStaffStats]
  )

  // Assignment coverage computation
  const availData = useMemo(() => loadAvailability(), [])
  const coverageInfo = useMemo(() => {
    const total = STAFF.length
    const assigned = activeStaff.length
    // Count "available" setters (have at least one non-absent day this week)
    let availableCount = 0
    STAFF.forEach((s) => {
      // Skip Director on odd weeks
      if (s.role === 'Director' && currentWeek % 2 !== 0) return
      const hasAvailDay = s.availability.some((day) => {
        const absence = getSetterAbsence(availData, s.id, currentWeek, day)
        return !absence
      })
      if (hasAvailDay) availableCount++
    })
    const pct = availableCount > 0 ? Math.round((assigned / availableCount) * 100) : 0
    return { total, assigned, available: availableCount, pct }
  }, [activeStaff, currentWeek, availData])

  const overdueCount = rotationStatus.filter((r) => r.overdue).length

  const upcomingAbsences = useMemo(() => {
    const data = loadAvailability()
    return getUpcomingAbsences(data, currentWeek, 4)
  }, [currentWeek])

  const inspectionData = useMemo(() => {
    const records = loadInspectionRecords()
    return {
      upcoming: getUpcomingInspections(records, 5),
      overdue: getOverdueInspections(records),
    }
  }, [currentWeek])

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <BarChart3 size={18} color="#8b5cf6" />
        <h3 style={styles.panelTitle}>Analytics</h3>
      </div>

      {/* Assignment Coverage */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <CheckCircle size={14} color={coverageInfo.pct >= 100 ? '#10b981' : '#f59e0b'} />
          <span>Assignment Coverage</span>
          <span style={styles.sectionCount}>
            {coverageInfo.assigned}/{coverageInfo.available} available
          </span>
        </div>

        {/* Coverage percentage */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '10px',
        }}>
          <span style={{
            fontSize: '22px',
            fontWeight: 800,
            color: coverageInfo.pct >= 100 ? '#10b981' : coverageInfo.pct >= 70 ? '#f59e0b' : '#ef4444',
          }}>
            {coverageInfo.pct}%
          </span>
          <div style={{ flex: 1 }}>
            <div style={{
              height: '8px',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.min(coverageInfo.pct, 100)}%`,
                height: '100%',
                borderRadius: '4px',
                background: coverageInfo.pct >= 100
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : coverageInfo.pct >= 70
                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                    : 'linear-gradient(90deg, #ef4444, #f87171)',
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
              {coverageInfo.assigned} of {coverageInfo.available} available setters assigned
              {coverageInfo.total !== coverageInfo.available && ` (${coverageInfo.total - coverageInfo.available} off)`}
            </div>
          </div>
        </div>

        {/* Assignment distribution bar chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px' }}>
          {allStaffStats.sort((a, b) => b.totalShifts - a.totalShifts).map((s) => {
            const maxShifts = Math.max(...allStaffStats.map((x) => x.totalShifts), 1)
            const barWidth = s.totalShifts > 0 ? Math.max((s.totalShifts / maxShifts) * 100, 4) : 0
            const badge = getRoleBadge(s.role)
            const isUnassigned = s.totalShifts === 0

            if (showUnassignedOnly && !isUnassigned) return null

            return (
              <div key={s.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: isUnassigned ? 0.5 : 1,
              }}>
                <span style={{
                  fontSize: '10px',
                  color: isUnassigned ? 'var(--t-warning)' : '#cbd5e1',
                  fontWeight: isUnassigned ? 700 : 500,
                  width: '52px',
                  textAlign: 'right',
                  flexShrink: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {s.name}
                </span>
                <div style={{
                  flex: 1,
                  height: '10px',
                  borderRadius: '3px',
                  background: 'rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                }}>
                  {barWidth > 0 ? (
                    <div style={{
                      width: `${barWidth}%`,
                      height: '100%',
                      borderRadius: '3px',
                      background: badge
                        ? badge.color
                        : '#3b82f6',
                      transition: 'width 0.3s',
                    }} />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(var(--t-warning-rgb),0.15) 3px, rgba(var(--t-warning-rgb),0.15) 6px)',
                    }} />
                  )}
                </div>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: isUnassigned ? 'var(--t-warning)' : '#94a3b8',
                  width: '14px',
                  textAlign: 'right',
                  flexShrink: 0,
                }}>
                  {s.totalShifts}
                </span>
              </div>
            )
          })}
        </div>

        {/* Toggle */}
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: showUnassignedOnly ? 'rgba(var(--t-warning-rgb),0.15)' : 'rgba(255,255,255,0.04)',
            color: showUnassignedOnly ? 'var(--t-warning)' : '#94a3b8',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.12s',
            width: '100%',
            justifyContent: 'center',
          }}
          onClick={() => setShowUnassignedOnly((p) => !p)}
        >
          {showUnassignedOnly ? <EyeOff size={12} /> : <Eye size={12} />}
          {showUnassignedOnly ? 'Show All Setters' : `Show Unassigned Only (${unassignedStaff.length})`}
        </button>
      </div>

      {/* Setter Workload */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <Users size={14} color="#3b82f6" />
          <span>Setter Workload</span>
          <span style={styles.sectionCount}>{activeStaff.length} active</span>
        </div>

        {activeStaff.length === 0 ? (
          <div style={styles.empty}>No assignments this week</div>
        ) : (
          <div style={styles.staffList}>
            {activeStaff.map((s) => {
              const badge = getRoleBadge(s.role)
              return (
                <div key={s.id} style={styles.staffRow}>
                  <div style={styles.staffName}>
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
                    <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 500 }}>
                      {s.name}
                    </span>
                  </div>
                  <div style={styles.statsRow}>
                    <StatPill label="Total" value={s.totalShifts} color="#3b82f6" />
                    <StatPill label="Bldr" value={s.boulderShifts} color="#10b981" />
                    <StatPill label="Hard" value={s.hardSections} color="#ef4444" warn={s.hardSections > 2} />
                    <StatPill label="Wash" value={s.washShifts} color="#06b6d4" warn={s.washShifts > 1} />
                    <StatPill label="Ogdn" value={s.ogdenDays} color="#f59e0b" warn={s.ogdenDays > 1} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Rotation Status */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <RefreshCw size={14} color="#10b981" />
          <span>Rotation Status</span>
          {overdueCount > 0 && (
            <span style={styles.overdueBadge}>
              <AlertTriangle size={10} />
              {overdueCount} overdue
            </span>
          )}
        </div>

        {GYMS.map((gym) => {
          const gymRotations = rotationStatus.filter((r) => r.gymName === gym.name)
          const gymOverdue = gymRotations.filter((r) => r.overdue)

          return (
            <div key={gym.name} style={styles.gymBlock}>
              <div style={styles.gymHeader}>
                <Mountain size={12} color="#94a3b8" />
                <span style={styles.gymName}>{gym.name}</span>
                {gymOverdue.length > 0 && (
                  <span style={{ fontSize: '10px', color: '#f87171' }}>
                    {gymOverdue.length} overdue
                  </span>
                )}
              </div>

              {/* Boulder rotations */}
              {gymRotations.filter((r) => r.type === 'boulder').map((r) => (
                <div key={r.sectionName} style={styles.rotationRow}>
                  <div style={styles.rotationLabel}>
                    {r.overdue && <AlertTriangle size={10} color="#ef4444" />}
                    <span style={{
                      fontSize: '11px',
                      color: r.overdue ? '#f87171' : '#cbd5e1',
                      fontWeight: r.overdue ? 600 : 400,
                    }}>
                      {r.sectionName}
                    </span>
                    <span style={styles.rotationType}>B</span>
                  </div>
                  <RotationBar current={r.weeksSinceReset} goal={r.rotationGoal} overdue={r.overdue} />
                </div>
              ))}

              {/* Rope rotations */}
              {gymRotations.filter((r) => r.type === 'rope' || r.type === 'autobelay').map((r) => (
                <div key={r.sectionName} style={styles.rotationRow}>
                  <div style={styles.rotationLabel}>
                    {r.overdue && <AlertTriangle size={10} color="#ef4444" />}
                    <span style={{
                      fontSize: '11px',
                      color: r.overdue ? '#f87171' : '#cbd5e1',
                      fontWeight: r.overdue ? 600 : 400,
                    }}>
                      {r.sectionName}
                    </span>
                    <span style={{
                      ...styles.rotationType,
                      color: r.type === 'autobelay' ? '#f59e0b' : '#8b5cf6',
                    }}>
                      {r.type === 'autobelay' ? 'AB' : 'R'}
                    </span>
                  </div>
                  <RotationBar current={r.weeksSinceReset} goal={r.rotationGoal} overdue={r.overdue} />
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Upcoming Absences */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <UserX size={14} color="#ef4444" />
          <span>Upcoming Absences</span>
          {upcomingAbsences.length > 0 && (
            <span style={styles.sectionCount}>{upcomingAbsences.length} in next 4 weeks</span>
          )}
        </div>

        {upcomingAbsences.length === 0 ? (
          <div style={styles.empty}>No upcoming absences</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {upcomingAbsences.slice(0, 12).map((a, i) => {
              const staff = STAFF.find((s) => s.id === a.setterId)
              const info = ABSENCE_TYPES[a.type]
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: info?.bg || 'rgba(255,255,255,0.03)',
                  border: `1px solid ${info?.color || '#64748b'}20`,
                }}>
                  <span style={{
                    fontSize: '8px',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '3px',
                    background: info?.bg,
                    color: info?.color,
                  }}>
                    {info?.icon}
                  </span>
                  <span style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 500, flex: 1 }}>
                    {staff?.name || `#${a.setterId}`}
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    {a.dayName.slice(0, 3)} Wk{a.weekNumber}
                  </span>
                </div>
              )
            })}
            {upcomingAbsences.length > 12 && (
              <div style={{ fontSize: '10px', color: '#475569', textAlign: 'center', padding: '2px' }}>
                +{upcomingAbsences.length - 12} more
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upcoming Inspections */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <ClipboardCheck size={14} color="#06b6d4" />
          <span>Upcoming Inspections</span>
          {inspectionData.overdue.length > 0 && (
            <span style={styles.overdueBadge}>
              <AlertTriangle size={10} />
              {inspectionData.overdue.length} overdue
            </span>
          )}
        </div>

        {inspectionData.overdue.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
            {inspectionData.overdue.map((insp) => (
              <div key={insp.id} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 8px', borderRadius: '6px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              }}>
                <AlertTriangle size={12} color="#ef4444" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f87171' }}>
                    {insp.gyms.join(' & ')} — Week {insp.weekNumber}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                    {insp.day} · {formatDate(insp.date)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {inspectionData.upcoming.length === 0 && inspectionData.overdue.length === 0 ? (
          <div style={styles.empty}>No inspections scheduled</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {inspectionData.upcoming.map((insp) => {
              const weeksAway = insp.weekNumber - todayWeek()
              const urgencyColor = weeksAway <= 1 ? '#ef4444' : weeksAway <= 2 ? '#f59e0b' : '#10b981'
              return (
                <div key={insp.id} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '5px 8px', borderRadius: '6px',
                  background: 'rgba(6,182,212,0.06)',
                  border: '1px solid rgba(6,182,212,0.15)',
                }}>
                  <div style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: urgencyColor, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0' }}>
                      {insp.gyms.join(' & ')}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {insp.day} · Wk{insp.weekNumber} · {formatDate(insp.date)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '10px', fontWeight: 600, color: urgencyColor,
                    whiteSpace: 'nowrap',
                  }}>
                    {weeksAway === 0 ? 'This week' : weeksAway === 1 ? 'Next week' : `${weeksAway}wk`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  panel: {
    width: '360px',
    flexShrink: 0,
    background: 'rgba(255,255,255,0.03)',
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    overflow: 'hidden',
    maxHeight: 'calc(100vh - 140px)',
    overflowY: 'auto',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '18px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    position: 'sticky',
    top: 0,
    background: 'rgba(15,23,42,0.95)',
    backdropFilter: 'blur(12px)',
    zIndex: 1,
  },
  panelTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 800,
    color: '#e2e8f0',
    letterSpacing: '-0.2px',
  },
  section: {
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: '14px',
  },
  sectionCount: {
    marginLeft: 'auto',
    fontSize: '11px',
    fontWeight: 500,
    color: '#64748b',
    textTransform: 'none',
  },
  empty: {
    fontSize: '12px',
    color: '#475569',
    fontStyle: 'italic',
    padding: '8px 0',
  },
  staffList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  staffRow: {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '10px',
    padding: '10px 12px',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  staffName: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  },
  statsRow: {
    display: 'flex',
    gap: '4px',
  },
  gymBlock: {
    marginBottom: '12px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '10px',
    padding: '12px',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  gymHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '8px',
    paddingBottom: '6px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  gymName: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  rotationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '3px 0',
  },
  rotationLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '140px',
    flexShrink: 0,
  },
  rotationType: {
    fontSize: '9px',
    fontWeight: 700,
    padding: '1px 4px',
    borderRadius: '3px',
    background: 'rgba(59,130,246,0.2)',
    color: '#3b82f6',
    letterSpacing: '0.3px',
    marginLeft: 'auto',
  },
  overdueBadge: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    fontWeight: 600,
    color: '#f87171',
    background: 'rgba(239,68,68,0.1)',
    padding: '2px 8px',
    borderRadius: '4px',
    textTransform: 'none',
  },
}
