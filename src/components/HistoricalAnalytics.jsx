import { useState, useMemo, useCallback } from 'react'
import {
  TrendingUp, Users, BarChart3, Calendar, Mountain,
  ChevronDown, ChevronRight, AlertTriangle, Download,
  Target, Activity, Zap, Shield, X,
} from 'lucide-react'
import { STAFF } from '../data/staff'
import { GYMS } from '../data/gyms'
import { BOULDER_SECTIONS, ROPE_SECTIONS } from '../data/sections'
import { validateSchedule } from '../utils/validation'
import { loadAvailability, getSetterAbsence } from '../data/availability-overrides'

// ---- Helpers ----

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const SHIFT_TYPES = {
  BOULDER: 'Boulder Setting',
  ROPE: 'Rope Setting',
}

function parseKey(key) {
  const idx = key.lastIndexOf('-')
  return { gymName: key.slice(0, idx), day: key.slice(idx + 1) }
}

function getSectionDifficulty(gymName, sectionName, shiftType) {
  if (!sectionName) return null
  const pool = shiftType === SHIFT_TYPES.BOULDER
    ? BOULDER_SECTIONS[gymName]
    : ROPE_SECTIONS[gymName]
  return pool?.find((s) => s.name === sectionName)?.difficulty || null
}

function getWeekDateStr(weekNumber) {
  const base = new Date(2025, 0, 6)
  const d = new Date(base)
  d.setDate(d.getDate() + weekNumber * 7)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getCurrentWeekNumber() {
  const base = new Date(2025, 0, 6)
  const now = new Date()
  return Math.max(0, Math.floor((now - base) / (7 * 24 * 60 * 60 * 1000)))
}

function getRoleBadge(role) {
  switch (role) {
    case 'Director': return { label: 'DIR', bg: 'rgba(139,92,246,0.3)', color: '#a78bfa' }
    case 'Head Setter': return { label: 'HEAD', bg: 'rgba(59,130,246,0.3)', color: '#60a5fa' }
    case 'Spec Setter': return { label: 'SPEC', bg: 'rgba(245,158,11,0.3)', color: '#fbbf24' }
    default: return null
  }
}

// Color palette for setters in charts
const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e879f9', '#22d3ee', '#a3e635', '#fb923c',
  '#818cf8',
]

// ---- Period presets ----
const PERIOD_PRESETS = [
  { label: '4 Weeks', weeks: 4 },
  { label: '8 Weeks', weeks: 8 },
  { label: '13 Weeks', weeks: 13 },
  { label: '26 Weeks', weeks: 26 },
  { label: 'All Time', weeks: null },
]

// ---- Data computation ----

function computeHistoricalData(scheduleHistory, startWeek, endWeek) {
  const weeks = []
  const perSetterPerWeek = {} // setterId -> [{ week, shifts, boulder, rope, hard, wash, gyms }]
  const perSetterTotals = {} // setterId -> cumulative stats
  const perGymPerSetter = {} // setterId -> { gymName -> count }
  const violationHistory = [] // [{ week, errors, warnings, types }]
  const dayPatterns = {} // day -> { totalAssigned, totalShifts }
  const sectionResets = {} // `gymName-sectionName` -> [weekNumbers]
  const partialSections = {} // `gymName-sectionName` -> { completedAnchors, totalAnchors, week, gym, section }
  const gymShiftTypes = {} // gymName -> { boulder, rope, flex, holdWash }

  STAFF.forEach((s) => {
    perSetterPerWeek[s.id] = []
    perSetterTotals[s.id] = {
      id: s.id, name: s.name, role: s.role,
      totalShifts: 0, boulderShifts: 0, ropeShifts: 0,
      hardSections: 0, washShifts: 0, ogdenDays: 0,
      weeksActive: 0, availableDays: 0, assignedDays: 0,
    }
    perGymPerSetter[s.id] = {}
    GYMS.forEach((g) => { perGymPerSetter[s.id][g.name] = 0 })
  })

  GYMS.forEach((g) => {
    gymShiftTypes[g.name] = { boulder: 0, rope: 0, flex: 0, holdWash: 0 }
  })

  DAYS.forEach((d) => { dayPatterns[d] = { totalAssigned: 0, totalShifts: 0 } })

  const availData = loadAvailability()

  for (let w = startWeek; w <= endWeek; w++) {
    const weekSchedule = scheduleHistory[w]
    if (!weekSchedule || Object.keys(weekSchedule).length === 0) continue

    weeks.push(w)

    // Per-setter weekly stats
    const weekSetterStats = {}
    STAFF.forEach((s) => {
      weekSetterStats[s.id] = {
        shifts: 0, boulder: 0, rope: 0, hard: 0, wash: 0,
        gyms: new Set(), days: new Set(),
      }
    })

    // Process shifts
    Object.entries(weekSchedule).forEach(([key, shift]) => {
      if (!shift) return
      const { gymName, day } = parseKey(key)
      const difficulty = getSectionDifficulty(gymName, shift.section, shift.shiftType)

      // Track section resets
      if (shift.section && shift.assignedStaff?.length > 0) {
        const resetKey = `${gymName}-${shift.section}`
        if (!sectionResets[resetKey]) sectionResets[resetKey] = []
        sectionResets[resetKey].push(w)
      }
      // Track additional section resets
      if (shift.additionalSections?.length) {
        shift.additionalSections.forEach((es) => {
          if (es.section && es.assignedStaff?.length > 0) {
            const resetKey = `${gymName}-${es.section}`
            if (!sectionResets[resetKey]) sectionResets[resetKey] = []
            sectionResets[resetKey].push(w)
          }
        })
      }

      // Track partial rope completions (skip sections with special rules)
      if (shift.shiftType === SHIFT_TYPES.ROPE && shift.section && shift.assignedStaff?.length > 0) {
        const secDef = ROPE_SECTIONS[gymName]?.find((s) => s.name === shift.section)
        if (secDef?.anchors?.length && !secDef.specialRules) {
          const completed = shift.completedAnchors || []
          const effectiveSetters = shift.assignedStaff.filter((id) => id !== shift.holdWasher).length
          const done = completed.length > 0 ? completed.length : Math.min(effectiveSetters, secDef.anchors.length)
          const pKey = `${gymName}-${shift.section}`
          if (done > 0 && done < secDef.anchors.length) {
            // Accumulate partial progress
            const existing = partialSections[pKey]
            if (existing) {
              const newDone = Math.min(existing.completedAnchors + done, secDef.anchors.length)
              if (newDone >= secDef.anchors.length) {
                delete partialSections[pKey] // fully complete now
              } else {
                partialSections[pKey] = { ...existing, completedAnchors: newDone, week: w }
              }
            } else {
              partialSections[pKey] = { completedAnchors: done, totalAnchors: secDef.anchors.length, week: w, startedWeek: w, gym: gymName, section: shift.section }
            }
          } else if (done >= secDef.anchors.length) {
            delete partialSections[pKey] // fully complete
          }
        }
      }

      // Gym shift type counts
      if (gymShiftTypes[gymName]) {
        if (shift.shiftType === SHIFT_TYPES.BOULDER) gymShiftTypes[gymName].boulder++
        else if (shift.shiftType === SHIFT_TYPES.ROPE) gymShiftTypes[gymName].rope++
        else gymShiftTypes[gymName].flex++
        if (shift.holdWasher || shift.flexHoldWashers?.length) gymShiftTypes[gymName].holdWash++
      }

      // Day patterns
      if (dayPatterns[day]) {
        dayPatterns[day].totalShifts++
        const extraCount = (shift.additionalSections || []).reduce((sum, s) => sum + (s.assignedStaff?.length || 0), 0)
        dayPatterns[day].totalAssigned += (shift.assignedStaff?.length || 0) + extraCount
      }

      // Per-setter
      if (shift.assignedStaff?.length) {
        shift.assignedStaff.forEach((id) => {
          if (!weekSetterStats[id]) return
          const ss = weekSetterStats[id]
          ss.shifts++
          ss.days.add(day)
          ss.gyms.add(gymName)
          if (shift.shiftType === SHIFT_TYPES.BOULDER) ss.boulder++
          if (shift.shiftType === SHIFT_TYPES.ROPE) ss.rope++
          if (difficulty === 'hard') ss.hard++

          perGymPerSetter[id][gymName] = (perGymPerSetter[id][gymName] || 0) + 1
        })
      }

      // Per-setter from additional sections
      if (shift.additionalSections?.length) {
        shift.additionalSections.forEach((es) => {
          const extraDifficulty = getSectionDifficulty(gymName, es.section, shift.shiftType)
          ;(es.assignedStaff || []).forEach((id) => {
            if (!weekSetterStats[id]) return
            const ss = weekSetterStats[id]
            ss.shifts++
            ss.days.add(day)
            ss.gyms.add(gymName)
            if (shift.shiftType === SHIFT_TYPES.ROPE) ss.rope++
            if (extraDifficulty === 'hard') ss.hard++
            perGymPerSetter[id][gymName] = (perGymPerSetter[id][gymName] || 0) + 1
          })
        })
      }

      if (shift.holdWasher && weekSetterStats[shift.holdWasher]) {
        weekSetterStats[shift.holdWasher].wash++
      }
      if (shift.flexHoldWashers) {
        shift.flexHoldWashers.forEach((id) => {
          if (!weekSetterStats[id]) return
          weekSetterStats[id].wash++
          weekSetterStats[id].shifts++
          weekSetterStats[id].days.add(day)
          weekSetterStats[id].gyms.add(gymName)
          perGymPerSetter[id][gymName] = (perGymPerSetter[id][gymName] || 0) + 1
        })
      }
    })

    // Aggregate per-setter weekly
    STAFF.forEach((s) => {
      const ws = weekSetterStats[s.id]
      perSetterPerWeek[s.id].push({
        week: w, shifts: ws.shifts, boulder: ws.boulder,
        rope: ws.rope, hard: ws.hard, wash: ws.wash,
      })
      const t = perSetterTotals[s.id]
      t.totalShifts += ws.shifts
      t.boulderShifts += ws.boulder
      t.ropeShifts += ws.rope
      t.hardSections += ws.hard
      t.washShifts += ws.wash
      if (ws.gyms.has('Ogden')) t.ogdenDays++
      if (ws.shifts > 0) t.weeksActive++

      // Utilization: count available days vs assigned days
      s.availability.forEach((day) => {
        if (s.role === 'Director' && (day !== 'Monday' || w % 2 !== 0)) return
        const absence = getSetterAbsence(availData, s.id, w, day)
        if (!absence) {
          t.availableDays++
          if (ws.days.has(day)) t.assignedDays++
        }
      })
    })

    // Violations for this week
    const violations = validateSchedule(weekSchedule, w)
    const errorCount = violations.filter((v) => v.severity === 'error').length
    const warningCount = violations.filter((v) => v.severity === 'warning').length
    const typeCount = {}
    violations.forEach((v) => {
      const typeKey = v.message.replace(/^[^:]+:\s*/, '').replace(/\(.*/, '').trim().slice(0, 40)
      typeCount[typeKey] = (typeCount[typeKey] || 0) + 1
    })
    violationHistory.push({ week: w, errors: errorCount, warnings: warningCount, types: typeCount })
  }

  return {
    weeks,
    perSetterPerWeek,
    perSetterTotals,
    perGymPerSetter,
    violationHistory,
    dayPatterns,
    sectionResets,
    partialSections,
    gymShiftTypes,
  }
}


// ---- Mini SVG Chart Components ----

function MiniLineChart({ data, width = 320, height = 80, color = '#3b82f6', label }) {
  if (!data.length) return null
  const max = Math.max(...data.map((d) => d.value), 1)
  const padX = 28
  const padY = 8
  const chartW = width - padX * 2
  const chartH = height - padY * 2

  const points = data.map((d, i) => {
    const x = padX + (i / Math.max(data.length - 1, 1)) * chartW
    const y = padY + chartH - (d.value / max) * chartH
    return { x, y, ...d }
  })

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  return (
    <div style={{ position: 'relative' }}>
      {label && <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>{label}</div>}
      <svg width={width} height={height} style={{ display: 'block' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padY + chartH - frac * chartH
          return (
            <line key={frac} x1={padX} y1={y} x2={width - padX} y2={y}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          )
        })}
        {/* Y axis labels */}
        <text x={padX - 4} y={padY + 4} fill="#475569" fontSize="9" textAnchor="end">{max}</text>
        <text x={padX - 4} y={padY + chartH + 3} fill="#475569" fontSize="9" textAnchor="end">0</text>
        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />
        ))}
      </svg>
    </div>
  )
}

function HorizontalBar({ label, value, maxValue, color, subLabel, badge }) {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
      <div style={{
        width: '58px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px',
        overflow: 'hidden',
      }}>
        {badge && (
          <span style={{
            fontSize: '8px', fontWeight: 700, padding: '1px 3px', borderRadius: '2px',
            background: badge.bg, color: badge.color, flexShrink: 0,
          }}>{badge.label}</span>
        )}
        <span style={{
          fontSize: '11px', color: '#cbd5e1', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</span>
      </div>
      <div style={{
        flex: 1, height: '12px', borderRadius: '3px',
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: '3px',
          background: color, transition: 'width 0.3s',
        }} />
        {subLabel && (
          <span style={{
            position: 'absolute', right: '4px', top: '0', lineHeight: '12px',
            fontSize: '8px', color: '#94a3b8', fontWeight: 600,
          }}>{subLabel}</span>
        )}
      </div>
      <span style={{
        width: '28px', fontSize: '11px', fontWeight: 700,
        color: '#94a3b8', textAlign: 'right', flexShrink: 0,
      }}>{value}</span>
    </div>
  )
}

function HeatmapCell({ value, maxValue, label }) {
  const intensity = maxValue > 0 ? value / maxValue : 0
  const alpha = Math.max(intensity * 0.7, value > 0 ? 0.08 : 0)
  return (
    <div
      style={{
        width: '100%', aspectRatio: '1', borderRadius: '4px',
        background: `rgba(59,130,246,${alpha})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '10px', fontWeight: 700,
        color: intensity > 0.5 ? '#e2e8f0' : intensity > 0 ? '#94a3b8' : '#334155',
        border: '1px solid rgba(255,255,255,0.04)',
      }}
      title={label}
    >
      {value || ''}
    </div>
  )
}

function FairnessGauge({ score, size = 60 }) {
  // score 0-100, higher = more fair
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s' }} />
      </svg>
      <div>
        <div style={{ fontSize: '18px', fontWeight: 800, color }}>{score}%</div>
        <div style={{ fontSize: '10px', color: '#64748b' }}>Fairness</div>
      </div>
    </div>
  )
}


// ---- Collapsible Section ----

function Section({ icon: Icon, iconColor, title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={s.section}>
      <button style={s.sectionHeader} onClick={() => setOpen((p) => !p)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} color={iconColor} />
        <span>{title}</span>
        {count != null && <span style={s.sectionCount}>{count}</span>}
      </button>
      {open && <div style={s.sectionBody}>{children}</div>}
    </div>
  )
}


// ---- CSV Export ----

function exportCSV(data, headers, filename) {
  const csvRows = [headers.join(',')]
  data.forEach((row) => {
    csvRows.push(headers.map((h) => {
      const val = row[h] ?? ''
      return typeof val === 'string' && val.includes(',') ? `"${val}"` : val
    }).join(','))
  })
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}


// ---- Main Component ----

export default function HistoricalAnalytics({ scheduleHistory, currentWeek, onClose }) {
  const [periodWeeks, setPeriodWeeks] = useState(13) // default 13 weeks
  const nowWeek = getCurrentWeekNumber()

  const { startWeek, endWeek } = useMemo(() => {
    const end = Math.min(currentWeek, nowWeek)
    const start = periodWeeks ? Math.max(0, end - periodWeeks + 1) : 0
    return { startWeek: start, endWeek: end }
  }, [currentWeek, nowWeek, periodWeeks])

  const data = useMemo(
    () => computeHistoricalData(scheduleHistory, startWeek, endWeek),
    [scheduleHistory, startWeek, endWeek]
  )

  const weekCount = data.weeks.length

  // ---- Derived stats ----

  // Setter rankings
  const setterRankings = useMemo(() => {
    return STAFF
      .map((s) => data.perSetterTotals[s.id])
      .filter((t) => t.totalShifts > 0)
      .sort((a, b) => b.totalShifts - a.totalShifts)
  }, [data])

  const maxSetterShifts = setterRankings.length > 0 ? setterRankings[0].totalShifts : 1

  // Fairness score: based on coefficient of variation of shifts among active setters
  const fairnessScore = useMemo(() => {
    const active = setterRankings.filter((s) => s.role !== 'Director')
    if (active.length < 2) return 100
    const avg = active.reduce((sum, s) => sum + s.totalShifts, 0) / active.length
    if (avg === 0) return 100
    const variance = active.reduce((sum, s) => sum + (s.totalShifts - avg) ** 2, 0) / active.length
    const cv = Math.sqrt(variance) / avg
    return Math.max(0, Math.round((1 - cv) * 100))
  }, [setterRankings])

  // Hard section distribution fairness
  const hardFairness = useMemo(() => {
    const active = setterRankings.filter((s) => s.hardSections > 0)
    if (active.length < 2) return 100
    const avg = active.reduce((sum, s) => sum + s.hardSections, 0) / active.length
    if (avg === 0) return 100
    const variance = active.reduce((sum, s) => sum + (s.hardSections - avg) ** 2, 0) / active.length
    const cv = Math.sqrt(variance) / avg
    return Math.max(0, Math.round((1 - cv) * 100))
  }, [setterRankings])

  // Violation trends
  const totalErrors = data.violationHistory.reduce((sum, v) => sum + v.errors, 0)
  const totalWarnings = data.violationHistory.reduce((sum, v) => sum + v.warnings, 0)
  const zeroViolationWeeks = data.violationHistory.filter((v) => v.errors === 0 && v.warnings === 0).length

  // Avg shifts per setter per week
  const avgShiftsPerWeek = useMemo(() => {
    if (weekCount === 0) return 0
    const totalAll = setterRankings.reduce((sum, s) => sum + s.totalShifts, 0)
    const active = setterRankings.length || 1
    return (totalAll / active / weekCount).toFixed(1)
  }, [setterRankings, weekCount])

  // Most common violation types
  const violationTypeCounts = useMemo(() => {
    const counts = {}
    data.violationHistory.forEach((v) => {
      Object.entries(v.types).forEach(([type, count]) => {
        counts[type] = (counts[type] || 0) + count
      })
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [data])

  // Section rotation analysis
  const rotationAnalysis = useMemo(() => {
    const results = []
    GYMS.forEach((gym) => {
      ;[
        ...(BOULDER_SECTIONS[gym.name] || []).map((sec) => ({ ...sec, type: 'boulder', gym: gym.name, goal: gym.boulderRotationWeeks })),
        ...(ROPE_SECTIONS[gym.name] || []).filter((sec) => !sec.specialRules?.includes('manual only')).map((sec) => ({
          ...sec, type: sec.autobelay ? 'autobelay' : 'rope', gym: gym.name,
          goal: sec.autobelay ? 5 : gym.ropeRotationWeeks,
        })),
      ].forEach((sec) => {
        const key = `${sec.gym}-${sec.name}`
        const resets = data.sectionResets[key] || []
        const intervals = []
        for (let i = 1; i < resets.length; i++) {
          intervals.push(resets[i] - resets[i - 1])
        }
        const avgInterval = intervals.length > 0
          ? (intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1)
          : null
        const lastReset = resets.length > 0 ? resets[resets.length - 1] : null
        const weeksSince = lastReset != null ? endWeek - lastReset : null
        const overdue = weeksSince != null && weeksSince >= sec.goal

        results.push({
          gym: sec.gym, name: sec.name, type: sec.type,
          goal: sec.goal, resetCount: resets.length,
          avgInterval, weeksSince, lastReset, overdue,
        })
      })
    })
    return results
  }, [data, endWeek])

  const overdueCount = rotationAnalysis.filter((r) => r.overdue).length

  // Gym heatmap data
  const heatmapMax = useMemo(() => {
    let max = 0
    STAFF.forEach((s) => {
      GYMS.forEach((g) => {
        const v = data.perGymPerSetter[s.id]?.[g.name] || 0
        if (v > max) max = v
      })
    })
    return max
  }, [data])

  // Export handler
  const handleExport = useCallback(() => {
    const rows = STAFF.map((s) => {
      const t = data.perSetterTotals[s.id]
      const utilPct = t.availableDays > 0 ? Math.round((t.assignedDays / t.availableDays) * 100) : 0
      return {
        Name: t.name, Role: t.role,
        'Total Shifts': t.totalShifts,
        'Boulder Shifts': t.boulderShifts,
        'Rope Shifts': t.ropeShifts,
        'Hard Sections': t.hardSections,
        'Wash Shifts': t.washShifts,
        'Weeks Active': t.weeksActive,
        'Available Days': t.availableDays,
        'Assigned Days': t.assignedDays,
        'Utilization %': utilPct,
        ...Object.fromEntries(GYMS.map((g) => [`${g.name} Shifts`, data.perGymPerSetter[s.id]?.[g.name] || 0])),
      }
    })
    const headers = Object.keys(rows[0])
    exportCSV(rows, headers, `setter-analytics-wk${startWeek}-${endWeek}.csv`)
  }, [data, startWeek, endWeek])

  if (weekCount === 0) {
    return (
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={(e) => e.stopPropagation()}>
          <div style={s.modalHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <TrendingUp size={20} color="#8b5cf6" />
              <h2 style={s.modalTitle}>Historical Analytics</h2>
            </div>
            <button onClick={onClose} style={s.closeBtn}><X size={18} /></button>
          </div>
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
            No scheduled weeks found in the selected period.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TrendingUp size={20} color="#8b5cf6" />
            <h2 style={s.modalTitle}>Historical Analytics</h2>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              {weekCount} week{weekCount !== 1 ? 's' : ''} &middot; Wk{startWeek}&ndash;{endWeek}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={handleExport} style={s.exportBtn} title="Export as CSV">
              <Download size={14} /> CSV
            </button>
            <button onClick={onClose} style={s.closeBtn}><X size={18} /></button>
          </div>
        </div>

        {/* Period selector */}
        <div style={s.periodBar}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Period:</span>
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.label}
              style={{
                ...s.periodBtn,
                background: periodWeeks === p.weeks ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                color: periodWeeks === p.weeks ? '#a78bfa' : '#64748b',
                borderColor: periodWeeks === p.weeks ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)',
              }}
              onClick={() => setPeriodWeeks(p.weeks)}
            >
              {p.label}
            </button>
          ))}
          <span style={{ fontSize: '10px', color: '#475569', marginLeft: 'auto' }}>
            {getWeekDateStr(startWeek)} &ndash; {getWeekDateStr(endWeek)}
          </span>
        </div>

        {/* Summary cards */}
        <div style={s.summaryRow}>
          <div style={s.summaryCard}>
            <Activity size={16} color="#3b82f6" />
            <div>
              <div style={s.summaryValue}>{avgShiftsPerWeek}</div>
              <div style={s.summaryLabel}>Avg shifts/setter/wk</div>
            </div>
          </div>
          <div style={s.summaryCard}>
            <Users size={16} color="#10b981" />
            <div>
              <div style={s.summaryValue}>{setterRankings.length}</div>
              <div style={s.summaryLabel}>Active setters</div>
            </div>
          </div>
          <div style={s.summaryCard}>
            <Shield size={16} color={fairnessScore >= 80 ? '#10b981' : '#f59e0b'} />
            <div>
              <div style={s.summaryValue}>{fairnessScore}%</div>
              <div style={s.summaryLabel}>Workload fairness</div>
            </div>
          </div>
          <div style={s.summaryCard}>
            <AlertTriangle size={16} color={totalErrors > 0 ? '#ef4444' : '#10b981'} />
            <div>
              <div style={s.summaryValue}>{totalErrors}</div>
              <div style={s.summaryLabel}>Total errors</div>
            </div>
          </div>
          <div style={s.summaryCard}>
            <Zap size={16} color="#f59e0b" />
            <div>
              <div style={s.summaryValue}>{zeroViolationWeeks}</div>
              <div style={s.summaryLabel}>Clean weeks</div>
            </div>
          </div>
        </div>

        <div style={s.scrollBody}>
          {/* 1. Setter Performance */}
          <Section icon={Users} iconColor="#3b82f6" title="Setter Performance" count={`${setterRankings.length} setters`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '12px' }}>
              {setterRankings.map((t) => (
                <HorizontalBar
                  key={t.id}
                  label={t.name}
                  badge={getRoleBadge(t.role)}
                  value={t.totalShifts}
                  maxValue={maxSetterShifts}
                  color={CHART_COLORS[(t.id - 1) % CHART_COLORS.length]}
                  subLabel={`${(t.totalShifts / Math.max(weekCount, 1)).toFixed(1)}/wk`}
                />
              ))}
            </div>

            {/* Shift trend line */}
            {data.weeks.length >= 2 && (
              <MiniLineChart
                data={data.weeks.map((w) => {
                  const total = STAFF.reduce((sum, st) => {
                    const wk = data.perSetterPerWeek[st.id]?.find((x) => x.week === w)
                    return sum + (wk?.shifts || 0)
                  }, 0)
                  return { label: `Wk${w}`, value: total }
                })}
                color="#3b82f6"
                label="Total shifts per week"
              />
            )}
          </Section>

          {/* 2. Workload Distribution */}
          <Section icon={Target} iconColor="#10b981" title="Workload Distribution">
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <FairnessGauge score={fairnessScore} />
              <FairnessGauge score={hardFairness} size={60} />
              <div style={{ flex: 1, minWidth: '120px' }}>
                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '6px' }}>Hard Sections Distribution</div>
                {setterRankings.filter((t) => t.hardSections > 0).slice(0, 8).map((t) => (
                  <HorizontalBar
                    key={t.id} label={t.name} value={t.hardSections}
                    maxValue={Math.max(...setterRankings.map((x) => x.hardSections), 1)}
                    color="#ef4444"
                  />
                ))}
              </div>
            </div>

            {/* Wash shift distribution */}
            <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>Hold Wash Distribution</div>
            {setterRankings.filter((t) => t.washShifts > 0).map((t) => (
              <HorizontalBar
                key={t.id} label={t.name} value={t.washShifts}
                maxValue={Math.max(...setterRankings.map((x) => x.washShifts), 1)}
                color="#06b6d4"
              />
            ))}
          </Section>

          {/* 3. Gym Assignment Heatmap */}
          <Section icon={Mountain} iconColor="#8b5cf6" title="Gym Assignment Patterns">
            <div style={{ overflowX: 'auto' }}>
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: `60px repeat(${GYMS.length}, 1fr)`,
                gap: '3px', marginBottom: '3px',
              }}>
                <div />
                {GYMS.map((g) => (
                  <div key={g.name} style={{
                    fontSize: '10px', fontWeight: 700, color: '#94a3b8',
                    textAlign: 'center', padding: '2px 0',
                  }}>{g.name}</div>
                ))}
              </div>
              {/* Rows */}
              {setterRankings.map((t) => (
                <div key={t.id} style={{
                  display: 'grid',
                  gridTemplateColumns: `60px repeat(${GYMS.length}, 1fr)`,
                  gap: '3px', marginBottom: '2px',
                }}>
                  <div style={{
                    fontSize: '10px', color: '#cbd5e1', fontWeight: 500,
                    display: 'flex', alignItems: 'center',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{t.name}</div>
                  {GYMS.map((g) => (
                    <HeatmapCell
                      key={g.name}
                      value={data.perGymPerSetter[t.id]?.[g.name] || 0}
                      maxValue={heatmapMax}
                      label={`${t.name} at ${g.name}: ${data.perGymPerSetter[t.id]?.[g.name] || 0} shifts`}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Gym shift type breakdown */}
            <div style={{ marginTop: '12px', fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>
              Shift Types by Gym
            </div>
            {GYMS.map((g) => {
              const gt = data.gymShiftTypes[g.name]
              const total = gt.boulder + gt.rope + gt.flex
              if (total === 0) return null
              return (
                <div key={g.name} style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0', marginBottom: '2px' }}>{g.name}</div>
                  <div style={{ display: 'flex', height: '10px', borderRadius: '3px', overflow: 'hidden', gap: '1px' }}>
                    {gt.boulder > 0 && (
                      <div style={{ flex: gt.boulder, background: '#3b82f6', borderRadius: '3px' }}
                        title={`Boulder: ${gt.boulder}`} />
                    )}
                    {gt.rope > 0 && (
                      <div style={{ flex: gt.rope, background: '#8b5cf6', borderRadius: '3px' }}
                        title={`Rope: ${gt.rope}`} />
                    )}
                    {gt.flex > 0 && (
                      <div style={{ flex: gt.flex, background: '#f59e0b', borderRadius: '3px' }}
                        title={`Flex: ${gt.flex}`} />
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '2px', fontSize: '9px', color: '#64748b' }}>
                    {gt.boulder > 0 && <span><span style={{ color: '#3b82f6' }}>●</span> Boulder {gt.boulder}</span>}
                    {gt.rope > 0 && <span><span style={{ color: '#8b5cf6' }}>●</span> Rope {gt.rope}</span>}
                    {gt.flex > 0 && <span><span style={{ color: '#f59e0b' }}>●</span> Flex {gt.flex}</span>}
                    {gt.holdWash > 0 && <span><span style={{ color: '#06b6d4' }}>●</span> Wash {gt.holdWash}</span>}
                  </div>
                </div>
              )
            })}
          </Section>

          {/* 4. Section Reset Tracking */}
          <Section icon={Calendar} iconColor="#10b981" title="Section Rotation Tracking"
            count={overdueCount > 0 ? `${overdueCount} overdue` : null} defaultOpen={false}>
            {GYMS.map((gym) => {
              const gymSections = rotationAnalysis.filter((r) => r.gym === gym.name)
              if (gymSections.length === 0) return null
              return (
                <div key={gym.name} style={{ marginBottom: '10px' }}>
                  <div style={{
                    fontSize: '12px', fontWeight: 700, color: '#e2e8f0',
                    marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <Mountain size={12} color="#94a3b8" /> {gym.name}
                  </div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 40px 50px 50px 50px',
                    gap: '2px', fontSize: '10px', color: '#64748b', marginBottom: '2px',
                    padding: '0 4px',
                  }}>
                    <span>Section</span>
                    <span style={{ textAlign: 'center' }}>Goal</span>
                    <span style={{ textAlign: 'center' }}>Avg</span>
                    <span style={{ textAlign: 'center' }}>Since</span>
                    <span style={{ textAlign: 'center' }}>Resets</span>
                  </div>
                  {gymSections.map((r) => (
                    <div key={r.name} style={{
                      display: 'grid', gridTemplateColumns: '1fr 40px 50px 50px 50px',
                      gap: '2px', fontSize: '11px', padding: '3px 4px', borderRadius: '4px',
                      background: r.overdue ? 'rgba(239,68,68,0.08)' : 'transparent',
                    }}>
                      <span style={{
                        color: r.overdue ? '#f87171' : '#cbd5e1', fontWeight: r.overdue ? 600 : 400,
                        display: 'flex', alignItems: 'center', gap: '4px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {r.overdue && <AlertTriangle size={10} color="#ef4444" />}
                        {r.name}
                        <span style={{
                          fontSize: '8px', fontWeight: 700, padding: '0 3px', borderRadius: '2px',
                          background: r.type === 'boulder' ? 'rgba(59,130,246,0.2)' : r.type === 'autobelay' ? 'rgba(245,158,11,0.2)' : 'rgba(139,92,246,0.2)',
                          color: r.type === 'boulder' ? '#3b82f6' : r.type === 'autobelay' ? '#f59e0b' : '#8b5cf6',
                        }}>
                          {r.type === 'boulder' ? 'B' : r.type === 'autobelay' ? 'AB' : 'R'}
                        </span>
                      </span>
                      <span style={{ textAlign: 'center', color: '#94a3b8' }}>{r.goal}wk</span>
                      <span style={{
                        textAlign: 'center',
                        color: r.avgInterval && Number(r.avgInterval) > r.goal ? '#f59e0b' : '#94a3b8',
                      }}>
                        {r.avgInterval ? `${r.avgInterval}wk` : '—'}
                      </span>
                      <span style={{
                        textAlign: 'center', fontWeight: 600,
                        color: r.overdue ? '#f87171' : r.weeksSince != null && r.weeksSince >= r.goal * 0.8 ? '#f59e0b' : '#94a3b8',
                      }}>
                        {r.weeksSince != null ? `${r.weeksSince}wk` : '—'}
                      </span>
                      <span style={{ textAlign: 'center', color: '#94a3b8' }}>{r.resetCount}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </Section>

          {/* 4b. Sections In Progress (Partial Completions) */}
          {Object.keys(data.partialSections).length > 0 && (
            <Section icon={Target} iconColor="#f59e0b" title="Sections In Progress"
              count={`${Object.keys(data.partialSections).length} partial`} defaultOpen={false}>
              {Object.entries(data.partialSections).map(([key, p]) => {
                const pct = Math.round((p.completedAnchors / p.totalAnchors) * 100)
                const weeksInProgress = p.startedWeek != null ? endWeek - p.startedWeek : 0
                return (
                  <div key={key} style={{
                    padding: '8px', borderRadius: '6px', marginBottom: '6px',
                    background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.15)',
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#fbbf24', marginBottom: '4px' }}>
                      {p.gym} — {p.section}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <div style={{
                        flex: 1, height: '6px', borderRadius: '3px',
                        background: 'rgba(255,255,255,0.08)',
                      }}>
                        <div style={{
                          width: `${pct}%`, height: '100%', borderRadius: '3px',
                          background: pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444',
                        }} />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#e2e8f0' }}>
                        {p.completedAnchors}/{p.totalAnchors} ({pct}%)
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {p.totalAnchors - p.completedAnchors} anchor{p.totalAnchors - p.completedAnchors !== 1 ? 's' : ''} remaining
                      {weeksInProgress > 0 && ` · in progress for ${weeksInProgress} week${weeksInProgress !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                )
              })}
            </Section>
          )}

          {/* 5. Violation History */}
          <Section icon={AlertTriangle} iconColor="#ef4444" title="Violation History"
            count={`${totalErrors} errors, ${totalWarnings} warnings`} defaultOpen={false}>
            {data.weeks.length >= 2 && (
              <MiniLineChart
                data={data.violationHistory.map((v) => ({ label: `Wk${v.week}`, value: v.errors }))}
                color="#ef4444"
                label="Errors per week"
              />
            )}
            {data.weeks.length >= 2 && (
              <div style={{ marginTop: '8px' }}>
                <MiniLineChart
                  data={data.violationHistory.map((v) => ({ label: `Wk${v.week}`, value: v.warnings }))}
                  color="#f59e0b"
                  label="Warnings per week"
                />
              </div>
            )}

            {violationTypeCounts.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>Most Common Issues</div>
                {violationTypeCounts.map(([type, count]) => (
                  <div key={type} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '3px 0', fontSize: '11px',
                  }}>
                    <span style={{
                      width: '24px', textAlign: 'right', fontWeight: 700,
                      color: '#ef4444', flexShrink: 0,
                    }}>{count}</span>
                    <span style={{
                      color: '#94a3b8', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{type}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 6. Day Patterns */}
          <Section icon={BarChart3} iconColor="#f59e0b" title="Scheduling Patterns" defaultOpen={false}>
            <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>Avg Setters per Day</div>
            {DAYS.slice(0, 4).map((day) => {
              const dp = data.dayPatterns[day]
              const avgAssigned = weekCount > 0 ? (dp.totalAssigned / weekCount).toFixed(1) : 0
              return (
                <HorizontalBar
                  key={day} label={day.slice(0, 3)} value={Number(avgAssigned)}
                  maxValue={Math.max(...DAYS.slice(0, 4).map((d) => weekCount > 0 ? data.dayPatterns[d].totalAssigned / weekCount : 0), 1)}
                  color="#f59e0b"
                  subLabel={`${avgAssigned}/wk`}
                />
              )
            })}
          </Section>

          {/* 7. Setter Utilization */}
          <Section icon={Activity} iconColor="#06b6d4" title="Setter Utilization" defaultOpen={false}>
            <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>
              % of available days assigned
            </div>
            {STAFF.filter((st) => data.perSetterTotals[st.id].availableDays > 0)
              .map((st) => {
                const t = data.perSetterTotals[st.id]
                const pct = Math.round((t.assignedDays / t.availableDays) * 100)
                return { ...t, pct }
              })
              .sort((a, b) => b.pct - a.pct)
              .map((t) => (
                <HorizontalBar
                  key={t.id} label={t.name} badge={getRoleBadge(t.role)}
                  value={t.pct} maxValue={100}
                  color={t.pct >= 80 ? '#10b981' : t.pct >= 50 ? '#f59e0b' : '#ef4444'}
                  subLabel={`${t.assignedDays}/${t.availableDays} days`}
                />
              ))}
          </Section>
        </div>
      </div>
    </div>
  )
}


// ---- Styles ----

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    animation: 'modalFadeIn 0.2s ease',
  },
  modal: {
    width: '680px',
    maxWidth: '95vw',
    maxHeight: '90vh',
    background: 'rgba(15,23,42,0.98)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
    animation: 'modalSlideIn 0.25s ease',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    background: 'rgba(15,23,42,0.95)',
    backdropFilter: 'blur(12px)',
    zIndex: 1,
  },
  modalTitle: {
    margin: 0, fontSize: '18px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.2px',
  },
  closeBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '34px', height: '34px', borderRadius: '8px',
    border: 'none', background: 'rgba(255,255,255,0.06)',
    color: '#94a3b8', cursor: 'pointer', transition: 'background 0.12s',
  },
  exportBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '7px 14px', borderRadius: '8px',
    border: '1px solid rgba(16,185,129,0.3)',
    background: 'rgba(16,185,129,0.1)',
    color: '#10b981', fontSize: '12px', fontWeight: 600,
    cursor: 'pointer', minHeight: '34px', transition: 'background 0.12s',
  },
  periodBar: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '12px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    flexShrink: 0, flexWrap: 'wrap',
  },
  periodBtn: {
    fontSize: '11px', fontWeight: 600,
    padding: '6px 12px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer', transition: 'all 0.12s', minHeight: '32px',
  },
  summaryRow: {
    display: 'flex', gap: '8px', padding: '14px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    flexShrink: 0, flexWrap: 'wrap',
  },
  summaryCard: {
    flex: 1, minWidth: '100px',
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 14px', borderRadius: '10px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  summaryValue: {
    fontSize: '18px', fontWeight: 800, color: '#e2e8f0',
  },
  summaryLabel: {
    fontSize: '10px', color: '#64748b',
  },
  scrollBody: {
    overflowY: 'auto', flex: 1,
  },
  section: {
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  sectionHeader: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '14px 24px',
    fontSize: '12px', fontWeight: 700,
    color: '#94a3b8', textTransform: 'uppercase',
    letterSpacing: '0.5px',
    cursor: 'pointer', background: 'none', border: 'none',
    width: '100%', textAlign: 'left',
    transition: 'background 0.1s', minHeight: '44px',
  },
  sectionBody: {
    padding: '0 24px 16px',
  },
  sectionCount: {
    marginLeft: 'auto', fontSize: '11px', fontWeight: 500,
    color: '#64748b', textTransform: 'none',
  },
}
