import { useState, useMemo, useCallback } from 'react'
import {
  Calendar, X, Check, AlertTriangle, AlertCircle, Users, ChevronDown, ChevronRight,
  BarChart3, Download, RefreshCw, Sparkles, Printer, CheckSquare, Square,
  Filter,
} from 'lucide-react'
import { STAFF } from '../data/staff'
import { GYMS } from '../data/gyms'
import { validateSchedule } from '../utils/validation'
import { analyzeWeeklyAssignments } from '../utils/analytics'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

function getStaffName(id) {
  return STAFF.find((s) => s.id === id)?.name || `#${id}`
}

function getRoleBadge(id) {
  const s = STAFF.find((st) => st.id === id)
  if (!s) return null
  switch (s.role) {
    case 'Director': return { label: 'DIR', bg: 'rgba(139,92,246,0.3)', color: '#a78bfa' }
    case 'Head Setter': return { label: 'HEAD', bg: 'rgba(59,130,246,0.3)', color: '#60a5fa' }
    case 'Spec Setter': return { label: 'SPEC', bg: 'rgba(245,158,11,0.3)', color: '#fbbf24' }
    default: return null
  }
}

function getWeekDateRange(weekNumber) {
  const baseDate = new Date(2025, 0, 6)
  const start = new Date(baseDate)
  start.setDate(start.getDate() + weekNumber * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 4)
  const fmt = (d) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} — ${fmt(end)}`
}

function ViolationItem({ violation }) {
  const isError = violation.severity === 'error'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '8px',
      padding: '8px 12px', borderRadius: '6px', marginBottom: '4px',
      backgroundColor: isError ? 'rgba(239,68,68,0.08)' : 'rgba(251,146,60,0.08)',
      borderLeft: `3px solid ${isError ? '#ef4444' : '#fb923c'}`,
    }}>
      {isError
        ? <AlertCircle size={12} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
        : <AlertTriangle size={12} color="#fb923c" style={{ flexShrink: 0, marginTop: '2px' }} />
      }
      <span style={{
        fontSize: '11px', lineHeight: 1.4,
        color: isError ? '#fca5a5' : '#fed7aa',
      }}>
        {violation.message}
      </span>
    </div>
  )
}

function WeekSummaryCard({ weekNumber, schedule, warnings, expanded, onToggle, selected, onSelect }) {
  const violations = useMemo(
    () => validateSchedule(schedule || {}, weekNumber),
    [schedule, weekNumber]
  )
  const errors = violations.filter((v) => v.severity === 'error')
  const warns = violations.filter((v) => v.severity === 'warning')
  const shiftCount = Object.keys(schedule || {}).length
  const uniqueSetters = new Set(
    Object.values(schedule || {}).flatMap((s) => s.assignedStaff || [])
  ).size

  const [showErrors, setShowErrors] = useState(true)
  const [showWarnings, setShowWarnings] = useState(false)

  return (
    <div style={{
      ...cardStyles.card,
      borderColor: selected
        ? (errors.length > 0 ? 'rgba(139,92,246,0.4)' : 'rgba(139,92,246,0.4)')
        : (errors.length > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)'),
      opacity: selected ? 1 : 0.55,
      transition: 'all 0.2s ease',
    }}>
      <div style={cardStyles.header}>
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(weekNumber) }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0', marginRight: '6px', display: 'flex', flexShrink: 0,
          }}
          title={selected ? 'Deselect this week' : 'Select this week'}
        >
          {selected
            ? <CheckSquare size={18} color="#8b5cf6" />
            : <Square size={18} color="#475569" />
          }
        </button>

        {/* Expandable header content */}
        <button style={{ ...cardStyles.headerContent }} onClick={onToggle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <span style={cardStyles.weekBadge}>W{weekNumber}</span>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                Week {weekNumber}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>
                {getWeekDateRange(weekNumber)}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {shiftCount} shifts · {uniqueSetters} setters
            </span>
            {errors.length > 0 && (
              <span style={cardStyles.errorBadge}>
                <AlertCircle size={10} />
                {errors.length}
              </span>
            )}
            {warns.length > 0 && (
              <span style={cardStyles.warnBadge}>
                <AlertTriangle size={10} />
                {warns.length}
              </span>
            )}
            {errors.length === 0 && warns.length === 0 && (
              <Check size={14} color="#10b981" />
            )}
            {expanded ? <ChevronDown size={14} color="#64748b" /> : <ChevronRight size={14} color="#64748b" />}
          </div>
        </button>
      </div>

      {expanded && (
        <div style={cardStyles.body}>
          {/* Shifts by gym */}
          {GYMS.map((gym) => {
            const gymShifts = Object.entries(schedule || {}).filter(
              ([key]) => key.startsWith(gym.name + '-')
            )
            if (gymShifts.length === 0) return null
            return (
              <div key={gym.name} style={cardStyles.gymSection}>
                <div style={cardStyles.gymLabel}>{gym.name}</div>
                {gymShifts.sort((a, b) => DAYS.indexOf(a[0].split('-').pop()) - DAYS.indexOf(b[0].split('-').pop())).map(([key, shift]) => {
                  const day = key.slice(key.lastIndexOf('-') + 1)
                  return (
                    <div key={key} style={cardStyles.shiftRow}>
                      <span style={cardStyles.dayLabel}>{day.slice(0, 3)}</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', minWidth: '100px' }}>
                        {shift.shiftType === 'Boulder Setting' ? 'Boulder' : 'Rope'}
                        {shift.section && ` — ${shift.section}`}
                        {shift.additionalSections?.length > 0 && ` +${shift.additionalSections.length}`}
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', flex: 1 }}>
                        {(shift.assignedStaff || []).map((id) => (
                          <span key={id} style={cardStyles.staffChip}>
                            {getStaffName(id)}
                          </span>
                        ))}
                        {shift.holdWasher && (
                          <span style={{ ...cardStyles.staffChip, background: 'rgba(251,146,60,0.15)', color: '#fbbf24' }}>
                            {getStaffName(shift.holdWasher)} (wash)
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Validation violations — collapsible by severity */}
          {(errors.length > 0 || warns.length > 0) && (
            <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
              {/* Errors section */}
              {errors.length > 0 && (
                <div style={{ marginBottom: '6px' }}>
                  <button
                    onClick={() => setShowErrors((p) => !p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      background: 'rgba(239,68,68,0.08)', border: 'none',
                      borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
                      width: '100%', textAlign: 'left', marginBottom: '4px',
                    }}
                  >
                    <AlertCircle size={12} color="#ef4444" />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', flex: 1 }}>
                      {errors.length} Critical Error{errors.length !== 1 ? 's' : ''}
                    </span>
                    {showErrors
                      ? <ChevronDown size={12} color="#ef4444" />
                      : <ChevronRight size={12} color="#ef4444" />
                    }
                  </button>
                  {showErrors && errors.map((v, i) => <ViolationItem key={i} violation={v} />)}
                </div>
              )}

              {/* Warnings section */}
              {warns.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowWarnings((p) => !p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      background: 'rgba(251,146,60,0.08)', border: 'none',
                      borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
                      width: '100%', textAlign: 'left', marginBottom: '4px',
                    }}
                  >
                    <AlertTriangle size={12} color="#fb923c" />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#fb923c', flex: 1 }}>
                      {warns.length} Warning{warns.length !== 1 ? 's' : ''}
                    </span>
                    {showWarnings
                      ? <ChevronDown size={12} color="#fb923c" />
                      : <ChevronRight size={12} color="#fb923c" />
                    }
                  </button>
                  {showWarnings && warns.map((v, i) => <ViolationItem key={i} violation={v} />)}
                </div>
              )}
            </div>
          )}

          {/* Auto-scheduler warnings (from the scheduler itself, not validation) */}
          {warnings && warnings.length > 0 && (
            <div style={{ padding: '8px 0' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                Scheduler Notes
              </div>
              {warnings.map((w, i) => (
                <div key={i} style={cardStyles.warningRow}>
                  <AlertTriangle size={10} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ fontSize: '11px', color: '#fbbf24' }}>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ExtendedSchedulePreview({
  results,
  cumulativeStats,
  startWeek,
  endWeek,
  scheduleHistory,
  onApplyAll,
  onApplySelected,
  onRejectAll,
  onApplyWeek,
  onRejectWeek,
  onClose,
}) {
  const [expandedWeeks, setExpandedWeeks] = useState(new Set())
  const [activeTab, setActiveTab] = useState('weeks') // 'weeks' | 'workload' | 'issues'
  const [issueFilter, setIssueFilter] = useState('all') // 'all' | 'errors' | 'warnings'

  const weekNumbers = useMemo(
    () => Object.keys(results).map(Number).sort((a, b) => a - b),
    [results]
  )
  const weekCount = weekNumbers.length

  // Per-week validation results (cached)
  const weekValidations = useMemo(() => {
    const map = {}
    weekNumbers.forEach((wn) => {
      const v = validateSchedule(results[wn].schedule, wn)
      map[wn] = {
        all: v,
        errors: v.filter((x) => x.severity === 'error'),
        warnings: v.filter((x) => x.severity === 'warning'),
      }
    })
    return map
  }, [results, weekNumbers])

  // Smart defaults: select error-free weeks by default
  const [selectedWeeks, setSelectedWeeks] = useState(() => {
    const initial = new Set()
    weekNumbers.forEach((wn) => {
      const v = validateSchedule(results[wn].schedule, wn)
      if (v.filter((x) => x.severity === 'error').length === 0) {
        initial.add(wn)
      }
    })
    // If all weeks have errors, select them all anyway
    if (initial.size === 0) weekNumbers.forEach((wn) => initial.add(wn))
    return initial
  })

  const toggleWeek = (wn) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(wn)) next.delete(wn)
      else next.add(wn)
      return next
    })
  }

  const toggleWeekSelection = useCallback((wn) => {
    setSelectedWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(wn)) next.delete(wn)
      else next.add(wn)
      return next
    })
  }, [])

  const selectAllWeeks = useCallback(() => {
    setSelectedWeeks(new Set(weekNumbers))
  }, [weekNumbers])

  const deselectAllWeeks = useCallback(() => {
    setSelectedWeeks(new Set())
  }, [])

  const selectErrorFreeWeeks = useCallback(() => {
    const errorFree = new Set()
    weekNumbers.forEach((wn) => {
      if (weekValidations[wn].errors.length === 0) errorFree.add(wn)
    })
    setSelectedWeeks(errorFree)
  }, [weekNumbers, weekValidations])

  // Aggregate stats
  const aggregateStats = useMemo(() => {
    const totalShifts = weekNumbers.reduce(
      (sum, wn) => sum + Object.keys(results[wn].schedule).length, 0
    )
    let totalErrors = 0
    let totalWarnings = 0
    weekNumbers.forEach((wn) => {
      totalErrors += weekValidations[wn].errors.length
      totalWarnings += weekValidations[wn].warnings.length
    })

    // Per-setter totals across all weeks
    const setterTotals = {}
    STAFF.forEach((s) => {
      setterTotals[s.id] = { id: s.id, name: s.name, role: s.role, totalShifts: 0, hardSections: 0, gyms: {}, weekBreakdown: {} }
    })
    weekNumbers.forEach((wn) => {
      const weekStats = analyzeWeeklyAssignments(results[wn].schedule)
      Object.entries(weekStats).forEach(([id, st]) => {
        const numId = Number(id)
        if (!setterTotals[numId]) return
        setterTotals[numId].totalShifts += st.totalShifts
        setterTotals[numId].hardSections += st.hardSections
        Object.entries(st.gyms).forEach(([gym, count]) => {
          setterTotals[numId].gyms[gym] = (setterTotals[numId].gyms[gym] || 0) + count
        })
        setterTotals[numId].weekBreakdown[wn] = st.totalShifts
      })
    })

    return { totalShifts, totalWarnings, totalErrors, setterTotals }
  }, [results, weekNumbers, weekValidations])

  const activeSetters = Object.values(aggregateStats.setterTotals)
    .filter((s) => s.totalShifts > 0)
    .sort((a, b) => b.totalShifts - a.totalShifts)

  // Issues detection (cross-week analysis)
  const issues = useMemo(() => {
    const list = []
    const avgShifts = activeSetters.length > 0
      ? activeSetters.reduce((s, a) => s + a.totalShifts, 0) / activeSetters.length
      : 0

    activeSetters.forEach((s) => {
      if (s.totalShifts > avgShifts + weekCount) {
        list.push({
          severity: 'warning',
          message: `${s.name} has ${s.totalShifts} total shifts (avg ${Math.round(avgShifts)}) — may be overloaded`,
        })
      }
      if (s.totalShifts < avgShifts - weekCount && s.totalShifts > 0) {
        list.push({
          severity: 'info',
          message: `${s.name} has only ${s.totalShifts} shifts (avg ${Math.round(avgShifts)}) — possibly underutilized`,
        })
      }
    })

    if (cumulativeStats) {
      Object.entries(cumulativeStats).forEach(([id, stats]) => {
        const name = STAFF.find((s) => s.id === Number(id))?.name
        if (stats.hardSections > weekCount) {
          list.push({
            severity: 'warning',
            message: `${name || id} has ${stats.hardSections} hard sections across ${weekCount} weeks`,
          })
        }
      })
    }

    return list
  }, [activeSetters, weekCount, cumulativeStats])

  // Counts for selection
  const selectedCount = selectedWeeks.size
  const errorFreeCount = weekNumbers.filter((wn) => weekValidations[wn].errors.length === 0).length
  const selectedWithErrors = weekNumbers.filter((wn) => selectedWeeks.has(wn) && weekValidations[wn].errors.length > 0)

  // Apply handler
  const handleApplySelected = useCallback(() => {
    if (selectedCount === 0) return

    if (selectedWithErrors.length > 0) {
      const ok = window.confirm(
        `${selectedWithErrors.length} selected week${selectedWithErrors.length !== 1 ? 's have' : ' has'} ` +
        `validation errors (Week${selectedWithErrors.length !== 1 ? 's' : ''} ${selectedWithErrors.join(', ')}). ` +
        `These schedules may have constraint violations. Apply anyway?`
      )
      if (!ok) return
    }

    if (onApplySelected) {
      onApplySelected(Array.from(selectedWeeks))
    } else if (onApplyAll && selectedCount === weekCount) {
      onApplyAll()
    }
  }, [selectedCount, selectedWithErrors, selectedWeeks, weekCount, onApplySelected, onApplyAll])

  // Export CSV
  const handleExportCSV = () => {
    const rows = [['Week', 'Gym', 'Day', 'Type', 'Section', 'Staff', 'Hold Washer']]
    weekNumbers.forEach((wn) => {
      Object.entries(results[wn].schedule).forEach(([key, shift]) => {
        const idx = key.lastIndexOf('-')
        const gym = key.slice(0, idx)
        const day = key.slice(idx + 1)
        rows.push([
          wn,
          gym,
          day,
          shift.shiftType || '',
          [shift.section, ...(shift.additionalSections || []).map((s) => s.section)].filter(Boolean).join(' + ') || '',
          [...(shift.assignedStaff || []), ...(shift.additionalSections || []).flatMap((s) => s.assignedStaff || [])].map(getStaffName).join('; '),
          shift.holdWasher ? getStaffName(shift.holdWasher) : '',
        ])
      })
    })
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schedule_weeks_${startWeek}-${endWeek}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Print-friendly export
  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (!win) return

    let html = `<html><head><title>Schedule Weeks ${startWeek}-${endWeek}</title>
    <style>
      body { font-family: -apple-system, sans-serif; padding: 20px; color: #1e293b; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      h2 { font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
      h3 { font-size: 12px; margin: 8px 0 4px; color: #64748b; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 12px; font-size: 11px; }
      th, td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: left; }
      th { background: #f8fafc; font-weight: 600; }
      .badge { display: inline-block; padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: 700; }
      @media print { body { padding: 0; } }
    </style></head><body>`
    html += `<h1>Extended Schedule — Weeks ${startWeek} to ${endWeek}</h1>`
    html += `<p style="color:#64748b;font-size:12px;">${weekCount} weeks · ${aggregateStats.totalShifts} shifts · ${activeSetters.length} setters</p>`

    weekNumbers.forEach((wn) => {
      html += `<h2>Week ${wn} — ${getWeekDateRange(wn)}</h2>`
      html += '<table><tr><th>Gym</th><th>Day</th><th>Type</th><th>Section</th><th>Staff</th></tr>'
      Object.entries(results[wn].schedule)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([key, shift]) => {
          const idx = key.lastIndexOf('-')
          html += `<tr>
            <td>${key.slice(0, idx)}</td>
            <td>${key.slice(idx + 1)}</td>
            <td>${shift.shiftType || ''}</td>
            <td>${[shift.section, ...(shift.additionalSections || []).map((s) => s.section)].filter(Boolean).join(' + ') || ''}</td>
            <td>${[...(shift.assignedStaff || []), ...(shift.additionalSections || []).flatMap((s) => s.assignedStaff || [])].map(getStaffName).join(', ')}</td>
          </tr>`
        })
      html += '</table>'
    })

    // Workload summary
    html += '<h2>Workload Summary</h2>'
    html += '<table><tr><th>Setter</th><th>Role</th><th>Total Shifts</th><th>Hard Sections</th>'
    weekNumbers.forEach((wn) => { html += `<th>W${wn}</th>` })
    html += '</tr>'
    activeSetters.forEach((s) => {
      html += `<tr><td>${s.name}</td><td>${s.role}</td><td>${s.totalShifts}</td><td>${s.hardSections}</td>`
      weekNumbers.forEach((wn) => { html += `<td>${s.weekBreakdown[wn] || 0}</td>` })
      html += '</tr>'
    })
    html += '</table></body></html>'

    win.document.write(html)
    win.document.close()
    win.print()
  }

  return (
    <>
      <style>{`
        @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInModal { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

      <div style={pvStyles.overlay} onClick={onClose}>
        <div style={pvStyles.modal} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={pvStyles.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={pvStyles.iconWrap}>
                <Sparkles size={18} color="#8b5cf6" />
              </div>
              <div>
                <h2 style={pvStyles.title}>Extended Schedule Preview</h2>
                <p style={pvStyles.subtitle}>
                  {weekCount} weeks — Week {startWeek} through {endWeek}
                </p>
              </div>
            </div>
            <button style={pvStyles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          {/* Summary stats */}
          <div style={pvStyles.statsRow}>
            <div style={pvStyles.stat}>
              <span style={{ ...pvStyles.statValue, color: '#8b5cf6' }}>{selectedCount}/{weekCount}</span>
              <span style={pvStyles.statLabel}>Selected</span>
            </div>
            <div style={pvStyles.stat}>
              <span style={{ ...pvStyles.statValue, color: '#e2e8f0' }}>{aggregateStats.totalShifts}</span>
              <span style={pvStyles.statLabel}>Total Shifts</span>
            </div>
            <div style={pvStyles.stat}>
              <span style={{ ...pvStyles.statValue, color: '#e2e8f0' }}>{activeSetters.length}</span>
              <span style={pvStyles.statLabel}>Setters</span>
            </div>
            <div style={{
              ...pvStyles.stat,
              background: aggregateStats.totalErrors > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {aggregateStats.totalErrors > 0 && <AlertCircle size={14} color="#ef4444" />}
                <span style={{ ...pvStyles.statValue, color: aggregateStats.totalErrors > 0 ? '#ef4444' : '#10b981' }}>
                  {aggregateStats.totalErrors}
                </span>
              </div>
              <span style={pvStyles.statLabel}>Errors</span>
            </div>
            <div style={{
              ...pvStyles.stat,
              background: aggregateStats.totalWarnings > 0 ? 'rgba(251,146,60,0.06)' : 'rgba(255,255,255,0.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {aggregateStats.totalWarnings > 0 && <AlertTriangle size={14} color="#fb923c" />}
                <span style={{ ...pvStyles.statValue, color: aggregateStats.totalWarnings > 0 ? '#fb923c' : '#475569' }}>
                  {aggregateStats.totalWarnings}
                </span>
              </div>
              <span style={pvStyles.statLabel}>Warnings</span>
            </div>
          </div>

          {/* Tabs */}
          <div style={pvStyles.tabRow}>
            {[
              { id: 'weeks', label: 'Week-by-Week', icon: Calendar },
              { id: 'workload', label: 'Workload', icon: BarChart3 },
              { id: 'issues', label: `Issues (${aggregateStats.totalErrors + aggregateStats.totalWarnings + issues.length})`, icon: AlertTriangle },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                style={{
                  ...pvStyles.tab,
                  background: activeTab === id ? 'rgba(139,92,246,0.15)' : 'transparent',
                  color: activeTab === id ? '#a78bfa' : '#64748b',
                  borderColor: activeTab === id ? 'rgba(139,92,246,0.3)' : 'transparent',
                }}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>

          <div style={pvStyles.scrollBody}>
            {/* Week-by-Week tab */}
            {activeTab === 'weeks' && (
              <div style={{ padding: '8px 24px' }}>
                {/* Selection toolbar */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '10px', flexWrap: 'wrap',
                }}>
                  <button style={pvStyles.selBtn} onClick={selectAllWeeks}>
                    <CheckSquare size={12} />
                    Select All
                  </button>
                  <button style={pvStyles.selBtn} onClick={deselectAllWeeks}>
                    <Square size={12} />
                    Deselect All
                  </button>
                  <button
                    style={{
                      ...pvStyles.selBtn,
                      background: 'rgba(16,185,129,0.1)',
                      borderColor: 'rgba(16,185,129,0.2)',
                      color: '#34d399',
                    }}
                    onClick={selectErrorFreeWeeks}
                  >
                    <Check size={12} />
                    Error-Free Only ({errorFreeCount})
                  </button>
                  <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>
                    {selectedCount} week{selectedCount !== 1 ? 's' : ''} selected
                  </span>
                </div>

                {weekNumbers.map((wn) => (
                  <WeekSummaryCard
                    key={wn}
                    weekNumber={wn}
                    schedule={results[wn].schedule}
                    warnings={results[wn].warnings}
                    expanded={expandedWeeks.has(wn)}
                    onToggle={() => toggleWeek(wn)}
                    selected={selectedWeeks.has(wn)}
                    onSelect={toggleWeekSelection}
                  />
                ))}
              </div>
            )}

            {/* Workload tab */}
            {activeTab === 'workload' && (
              <div style={{ padding: '14px 24px' }}>
                <div style={pvStyles.sectionHeader}>
                  <Users size={14} color="#8b5cf6" />
                  <span>Total Shifts Per Setter</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {activeSetters.map((s) => {
                    const maxExpected = weekCount * 5
                    const pct = Math.min((s.totalShifts / maxExpected) * 100, 100)
                    const barColor = s.totalShifts > weekCount * 4 ? '#ef4444'
                      : s.totalShifts > weekCount * 3 ? '#f59e0b' : '#3b82f6'
                    const badge = getRoleBadge(s.id)
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '90px', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          {badge && (
                            <span style={{
                              fontSize: '8px', fontWeight: 700, padding: '1px 3px',
                              borderRadius: '2px', background: badge.bg, color: badge.color,
                            }}>{badge.label}</span>
                          )}
                          <span style={{ fontSize: '11px', color: '#e2e8f0' }}>{s.name}</span>
                        </div>
                        <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: barColor, transition: 'width 0.4s' }} />
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: barColor, width: '24px', textAlign: 'right' }}>
                          {s.totalShifts}
                        </span>
                        <span style={{ fontSize: '9px', color: '#64748b', width: '80px' }}>
                          H{s.hardSections} · {Object.entries(s.gyms).map(([g, c]) => `${g.slice(0, 3)}:${c}`).join(' ')}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Week breakdown mini-heatmap */}
                <div style={{ marginTop: '20px' }}>
                  <div style={pvStyles.sectionHeader}>
                    <Calendar size={14} color="#3b82f6" />
                    <span>Weekly Breakdown</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={pvStyles.heatTable}>
                      <thead>
                        <tr>
                          <th style={pvStyles.heatTh}>Setter</th>
                          {weekNumbers.map((wn) => (
                            <th key={wn} style={pvStyles.heatTh}>W{wn}</th>
                          ))}
                          <th style={pvStyles.heatTh}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeSetters.map((s) => (
                          <tr key={s.id}>
                            <td style={{ ...pvStyles.heatTd, fontWeight: 600, color: '#e2e8f0' }}>{s.name}</td>
                            {weekNumbers.map((wn) => {
                              const val = s.weekBreakdown[wn] || 0
                              const bg = val === 0 ? 'transparent'
                                : val >= 5 ? 'rgba(239,68,68,0.2)'
                                : val >= 4 ? 'rgba(245,158,11,0.2)'
                                : val >= 2 ? 'rgba(59,130,246,0.15)'
                                : 'rgba(255,255,255,0.05)'
                              return (
                                <td key={wn} style={{ ...pvStyles.heatTd, background: bg }}>
                                  {val > 0 ? val : '\u2014'}
                                </td>
                              )
                            })}
                            <td style={{ ...pvStyles.heatTd, fontWeight: 700, color: '#e2e8f0' }}>{s.totalShifts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Issues tab */}
            {activeTab === 'issues' && (
              <div style={{ padding: '14px 24px' }}>
                {/* Filter bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                  <Filter size={12} color="#64748b" />
                  {[
                    { id: 'all', label: 'All Issues' },
                    { id: 'errors', label: `Errors (${aggregateStats.totalErrors})`, color: '#ef4444' },
                    { id: 'warnings', label: `Warnings (${aggregateStats.totalWarnings})`, color: '#fb923c' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setIssueFilter(f.id)}
                      style={{
                        fontSize: '11px', fontWeight: 600, padding: '4px 10px',
                        borderRadius: '6px', cursor: 'pointer', border: '1px solid',
                        background: issueFilter === f.id ? (f.color ? `${f.color}15` : 'rgba(139,92,246,0.15)') : 'transparent',
                        color: issueFilter === f.id ? (f.color || '#a78bfa') : '#64748b',
                        borderColor: issueFilter === f.id ? (f.color ? `${f.color}30` : 'rgba(139,92,246,0.3)') : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Cross-week issues */}
                {issues.length > 0 && (issueFilter === 'all' || issueFilter === 'warnings') && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={pvStyles.sectionHeader}>
                      <Sparkles size={14} color="#8b5cf6" />
                      <span>Cross-Week Analysis</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {issues.map((issue, i) => (
                        <ViolationItem key={`cross-${i}`} violation={{ ...issue, severity: issue.severity === 'info' ? 'warning' : issue.severity }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Per-week validation */}
                <div>
                  <div style={pvStyles.sectionHeader}>
                    <RefreshCw size={14} color="#ef4444" />
                    <span>Per-Week Validation</span>
                  </div>
                  {weekNumbers.map((wn) => {
                    const { errors, warnings: warns } = weekValidations[wn]
                    const filteredViolations = issueFilter === 'errors' ? errors
                      : issueFilter === 'warnings' ? warns
                      : [...errors, ...warns]

                    if (filteredViolations.length === 0 && issueFilter !== 'all') return null

                    return (
                      <div key={wn} style={{
                        marginBottom: '12px', borderRadius: '8px',
                        border: errors.length > 0 ? '1px solid rgba(239,68,68,0.15)' : '1px solid rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '8px 12px',
                          background: errors.length > 0 ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.02)',
                        }}>
                          {selectedWeeks.has(wn)
                            ? <CheckSquare size={14} color="#8b5cf6" />
                            : <Square size={14} color="#475569" />
                          }
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', flex: 1 }}>
                            Week {wn}
                            <span style={{ fontWeight: 400, color: '#64748b', marginLeft: '8px', fontSize: '11px' }}>
                              {getWeekDateRange(wn)}
                            </span>
                          </span>
                          {errors.length > 0 && (
                            <span style={{
                              fontSize: '10px', fontWeight: 700, padding: '2px 8px',
                              borderRadius: '10px', background: 'rgba(239,68,68,0.15)', color: '#f87171',
                              display: 'flex', alignItems: 'center', gap: '4px',
                            }}>
                              <AlertCircle size={10} />
                              {errors.length}
                            </span>
                          )}
                          {warns.length > 0 && (
                            <span style={{
                              fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                              borderRadius: '10px', background: 'rgba(251,146,60,0.15)', color: '#fbbf24',
                              display: 'flex', alignItems: 'center', gap: '4px',
                            }}>
                              <AlertTriangle size={10} />
                              {warns.length}
                            </span>
                          )}
                          {errors.length === 0 && warns.length === 0 && (
                            <Check size={14} color="#10b981" />
                          )}
                        </div>
                        {filteredViolations.length > 0 && (
                          <div style={{ padding: '6px 8px' }}>
                            {filteredViolations.map((v, i) => (
                              <ViolationItem key={i} violation={v} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={pvStyles.footer}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button style={pvStyles.exportBtn} onClick={handleExportCSV} title="Export to CSV">
                <Download size={14} />
                CSV
              </button>
              <button style={pvStyles.exportBtn} onClick={handlePrint} title="Print-friendly view">
                <Printer size={14} />
                Print
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {selectedWithErrors.length > 0 && (
                <span style={{ fontSize: '10px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={10} />
                  {selectedWithErrors.length} with errors
                </span>
              )}
              <button style={pvStyles.rejectBtn} onClick={onRejectAll}>
                Reject All
              </button>
              <button
                style={{
                  ...pvStyles.applyBtn,
                  opacity: selectedCount > 0 ? 1 : 0.5,
                  cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
                }}
                onClick={handleApplySelected}
                disabled={selectedCount === 0}
              >
                <Check size={16} />
                Apply {selectedCount} Week{selectedCount !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

const cardStyles = {
  card: {
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
    marginBottom: '8px',
    overflow: 'hidden',
    transition: 'opacity 0.2s, border-color 0.2s',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '10px 14px',
  },
  headerContent: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: '#f1f5f9',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '13px',
    padding: 0,
  },
  weekBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: '4px',
    background: 'rgba(139,92,246,0.15)',
    color: '#a78bfa',
    flexShrink: 0,
  },
  errorBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '10px',
    background: 'rgba(239,68,68,0.15)',
    color: '#f87171',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  warnBadge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '10px',
    background: 'rgba(251,146,60,0.15)',
    color: '#fbbf24',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  body: {
    padding: '0 14px 12px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  gymSection: {
    marginTop: '8px',
  },
  gymLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  shiftRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '3px 0',
    fontSize: '11px',
  },
  dayLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#64748b',
    width: '28px',
    flexShrink: 0,
  },
  staffChip: {
    fontSize: '10px',
    padding: '1px 5px',
    borderRadius: '3px',
    background: 'rgba(255,255,255,0.06)',
    color: '#cbd5e1',
  },
  warningRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'flex-start',
    padding: '2px 0',
  },
}

const pvStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
    animation: 'fadeInOverlay 0.15s ease-out',
  },
  modal: {
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.1)',
    width: '100%',
    maxWidth: '900px',
    maxHeight: '94vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
    animation: 'slideInModal 0.2s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '20px 24px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  iconWrap: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'rgba(139,92,246,0.1)',
    border: '1px solid rgba(139,92,246,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { margin: 0, fontSize: '18px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.2px' },
  subtitle: { margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' },
  closeBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#94a3b8',
    padding: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    display: 'flex',
    gap: '4px',
    padding: '12px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  stat: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 6px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.03)',
  },
  statValue: { fontSize: '20px', fontWeight: 800, lineHeight: 1 },
  statLabel: { fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' },
  tabRow: {
    display: 'flex',
    gap: '4px',
    padding: '8px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    border: '1px solid transparent',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    transition: 'all 0.15s',
    minHeight: '36px',
  },
  scrollBody: {
    overflowY: 'auto',
    flex: 1,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '10px',
  },
  heatTable: {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: '11px',
  },
  heatTh: {
    padding: '4px 8px',
    textAlign: 'center',
    fontSize: '10px',
    fontWeight: 700,
    color: '#64748b',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  heatTd: {
    padding: '4px 8px',
    textAlign: 'center',
    fontSize: '11px',
    color: '#94a3b8',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
    position: 'sticky', bottom: 0, background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(12px)',
  },
  exportBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '7px 12px',
    cursor: 'pointer',
    minHeight: '34px',
  },
  selBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    padding: '5px 10px',
    cursor: 'pointer',
  },
  rejectBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '10px',
    color: '#94a3b8',
    padding: '9px 20px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    minHeight: '40px',
  },
  applyBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    padding: '9px 24px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 700,
    minHeight: '40px',
    boxShadow: '0 2px 8px rgba(139,92,246,0.3)',
    transition: 'opacity 0.2s',
  },
}
