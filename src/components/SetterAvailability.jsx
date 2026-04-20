import { useState, useMemo, useRef } from 'react'
import {
  X, UserX, Calendar, Plus, Trash2, Upload, Download, Repeat, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { STAFF } from '../data/staff'
import {
  ABSENCE_TYPES,
  weekDayToDate,
  parseDate,
  exportAvailabilityJSON,
  importAvailabilityJSON,
} from '../data/availability-overrides'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const BASE_DATE = new Date(2025, 0, 6)

function getWeekMonday(weekNumber) {
  const d = new Date(BASE_DATE)
  d.setDate(d.getDate() + weekNumber * 7)
  return d
}

function fmtDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getRoleBadge(role) {
  switch (role) {
    case 'Director': return { label: 'DIR', bg: 'rgba(139,92,246,0.3)', color: '#a78bfa' }
    case 'Head Setter': return { label: 'HEAD', bg: 'rgba(59,130,246,0.3)', color: '#60a5fa' }
    case 'Spec Setter': return { label: 'SPEC', bg: 'rgba(245,158,11,0.3)', color: '#fbbf24' }
    default: return null
  }
}

// ---- Sub-components ----

function AbsenceTypePicker({ value, onChange }) {
  return (
    <div style={styles.typePicker}>
      {Object.entries(ABSENCE_TYPES).map(([key, info]) => (
        <button
          key={key}
          style={{
            ...styles.typeChip,
            background: value === key ? info.bg : 'rgba(255,255,255,0.04)',
            borderColor: value === key ? info.color : 'rgba(255,255,255,0.1)',
            color: value === key ? info.color : '#94a3b8',
          }}
          onClick={() => onChange(key)}
        >
          {info.icon} {info.label}
        </button>
      ))}
    </div>
  )
}

function CalendarGrid({ viewWeekStart, availability, selectedSetter, onToggleDate }) {
  // Show 4 weeks starting from viewWeekStart
  const weeks = [viewWeekStart, viewWeekStart + 1, viewWeekStart + 2, viewWeekStart + 3]

  return (
    <div style={styles.calGrid}>
      {/* Day headers */}
      <div style={styles.calHeaderRow}>
        <div style={styles.calWeekLabel} />
        {DAY_SHORT.map((d) => (
          <div key={d} style={styles.calDayHeader}>{d}</div>
        ))}
      </div>

      {weeks.map((wk) => {
        const mon = getWeekMonday(wk)
        return (
          <div key={wk} style={styles.calWeekRow}>
            <div style={styles.calWeekLabel}>
              <span style={{ fontSize: '10px', color: '#64748b' }}>Wk {wk}</span>
              <span style={{ fontSize: '9px', color: '#475569' }}>{fmtDate(mon)}</span>
            </div>
            {DAYS.map((day, di) => {
              const dateStr = weekDayToDate(wk, day)
              const setterOverrides = availability.overrides[selectedSetter] || {}
              const absence = setterOverrides[dateStr]
              const isRecurring = !absence && availability.recurring.some(
                (r) => r.setterId === selectedSetter && r.dayOfWeek === day
              )
              const recInfo = isRecurring
                ? availability.recurring.find((r) => r.setterId === selectedSetter && r.dayOfWeek === day)
                : null
              const info = absence || (recInfo ? { type: recInfo.type } : null)
              const typeData = info ? ABSENCE_TYPES[info.type] : null

              const cellDate = new Date(mon)
              cellDate.setDate(cellDate.getDate() + di)

              return (
                <button
                  key={day}
                  style={{
                    ...styles.calCell,
                    background: typeData ? typeData.bg : 'rgba(255,255,255,0.02)',
                    borderColor: typeData ? typeData.color + '40' : 'rgba(255,255,255,0.06)',
                  }}
                  onClick={() => onToggleDate(wk, day, dateStr)}
                  title={info ? `${ABSENCE_TYPES[info.type].label}${info.notes ? ': ' + info.notes : ''}` : `${day}, ${fmtDate(cellDate)} — click to mark unavailable`}
                >
                  <span style={{ fontSize: '11px', color: typeData ? typeData.color : '#64748b' }}>
                    {cellDate.getDate()}
                  </span>
                  {typeData && (
                    <span style={{
                      fontSize: '8px',
                      fontWeight: 700,
                      color: typeData.color,
                      letterSpacing: '0.3px',
                    }}>
                      {typeData.icon}
                    </span>
                  )}
                  {isRecurring && (
                    <Repeat size={7} color={typeData?.color || '#64748b'} />
                  )}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function RecurringPatterns({ availability, selectedSetter, onChange }) {
  const patterns = availability.recurring.filter((r) => r.setterId === selectedSetter)
  const [adding, setAdding] = useState(false)
  const [newDay, setNewDay] = useState('Friday')
  const [newType, setNewType] = useState('personal')
  const [newNotes, setNewNotes] = useState('')

  const addPattern = () => {
    const updated = {
      ...availability,
      recurring: [
        ...availability.recurring,
        { setterId: selectedSetter, dayOfWeek: newDay, type: newType, notes: newNotes },
      ],
    }
    onChange(updated)
    setAdding(false)
    setNewNotes('')
  }

  const removePattern = (idx) => {
    // idx is within the full recurring array — find the actual index
    let count = 0
    const actualIdx = availability.recurring.findIndex((r) => {
      if (r.setterId === selectedSetter) {
        if (count === idx) return true
        count++
      }
      return false
    })
    if (actualIdx === -1) return
    const updated = {
      ...availability,
      recurring: availability.recurring.filter((_, i) => i !== actualIdx),
    }
    onChange(updated)
  }

  return (
    <div style={styles.recurSection}>
      <div style={styles.recurHeader}>
        <Repeat size={13} color="#8b5cf6" />
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Recurring Patterns
        </span>
      </div>

      {patterns.length === 0 && !adding && (
        <div style={{ fontSize: '12px', color: '#475569', fontStyle: 'italic', padding: '4px 0' }}>
          No recurring patterns
        </div>
      )}

      {patterns.map((p, i) => (
        <div key={i} style={styles.recurRow}>
          <span style={{
            ...styles.typeChip,
            background: ABSENCE_TYPES[p.type].bg,
            borderColor: ABSENCE_TYPES[p.type].color + '40',
            color: ABSENCE_TYPES[p.type].color,
            padding: '2px 8px',
            fontSize: '11px',
          }}>
            Every {p.dayOfWeek}
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8', flex: 1 }}>
            {ABSENCE_TYPES[p.type].label}{p.notes ? ` — ${p.notes}` : ''}
          </span>
          <button style={styles.removeBtn} onClick={() => removePattern(i)} title="Remove pattern">
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {adding ? (
        <div style={styles.addForm}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Every</span>
            <select
              style={styles.select}
              value={newDay}
              onChange={(e) => setNewDay(e.target.value)}
            >
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              style={styles.select}
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
            >
              {Object.entries(ABSENCE_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <input
            style={styles.input}
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={styles.addBtn} onClick={addPattern}>Add</button>
            <button style={styles.cancelSmBtn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button style={styles.addPatternBtn} onClick={() => setAdding(true)}>
          <Plus size={12} /> Add Recurring Pattern
        </button>
      )}
    </div>
  )
}

// ---- Main component ----

export default function SetterAvailability({ availability, onChange, onClose }) {
  const [selectedSetter, setSelectedSetter] = useState(STAFF[0].id)
  const [viewWeekStart, setViewWeekStart] = useState(0)
  const [addingRange, setAddingRange] = useState(false)
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [rangeType, setRangeType] = useState('vacation')
  const [rangeNotes, setRangeNotes] = useState('')
  const [clickType, setClickType] = useState('sick')
  const fileInputRef = useRef(null)

  const selectedStaff = STAFF.find((s) => s.id === selectedSetter)

  // Count absences per setter for the list badges
  const absenceCounts = useMemo(() => {
    const counts = {}
    STAFF.forEach((s) => {
      const overrides = availability.overrides[s.id]
      const overrideCount = overrides ? Object.keys(overrides).length : 0
      const recurringCount = availability.recurring.filter((r) => r.setterId === s.id).length
      counts[s.id] = overrideCount + recurringCount
    })
    return counts
  }, [availability])

  // Toggle a single date
  const handleToggleDate = (weekNumber, dayName, dateStr) => {
    const sid = selectedSetter
    const setterOverrides = { ...(availability.overrides[sid] || {}) }

    if (setterOverrides[dateStr]) {
      // Remove the override
      delete setterOverrides[dateStr]
    } else {
      // Add override with current clickType
      setterOverrides[dateStr] = { type: clickType, notes: '' }
    }

    onChange({
      ...availability,
      overrides: { ...availability.overrides, [sid]: setterOverrides },
    })
  }

  // Add date range
  const handleAddRange = () => {
    if (!rangeStart || !rangeEnd) return
    const start = parseDate(rangeStart)
    const end = parseDate(rangeEnd)
    if (isNaN(start) || isNaN(end) || start > end) return

    const sid = selectedSetter
    const setterOverrides = { ...(availability.overrides[sid] || {}) }

    // Iterate through each day in range
    const current = new Date(start)
    while (current <= end) {
      const dayOfWeek = current.getDay() // 0=Sun ... 6=Sat
      // Only include weekdays (Mon=1 through Fri=5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const y = current.getFullYear()
        const m = String(current.getMonth() + 1).padStart(2, '0')
        const d = String(current.getDate()).padStart(2, '0')
        const dateStr = `${y}-${m}-${d}`
        setterOverrides[dateStr] = { type: rangeType, notes: rangeNotes }
      }
      current.setDate(current.getDate() + 1)
    }

    onChange({
      ...availability,
      overrides: { ...availability.overrides, [sid]: setterOverrides },
    })
    setAddingRange(false)
    setRangeStart('')
    setRangeEnd('')
    setRangeNotes('')
  }

  // Bulk export
  const handleExport = () => {
    const json = exportAvailabilityJSON(availability)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'availability-overrides.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Bulk import
  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const imported = importAvailabilityJSON(reader.result)
      if (imported) {
        onChange(imported)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UserX size={20} color="#ef4444" />
            <h2 style={styles.title}>Manage Availability</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button style={styles.iconBtn} onClick={handleExport} title="Export availability data">
              <Download size={14} />
            </button>
            <button
              style={styles.iconBtn}
              onClick={() => fileInputRef.current?.click()}
              title="Import availability data"
            >
              <Upload size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
            <button style={styles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={styles.body}>
          {/* Left: Setter list */}
          <div style={styles.setterList}>
            <div style={styles.listHeader}>Setters</div>
            {STAFF.map((s) => {
              const badge = getRoleBadge(s.role)
              const count = absenceCounts[s.id]
              const isSelected = s.id === selectedSetter
              return (
                <button
                  key={s.id}
                  style={{
                    ...styles.setterBtn,
                    background: isSelected ? 'rgba(59,130,246,0.15)' : 'transparent',
                    borderColor: isSelected ? 'rgba(59,130,246,0.4)' : 'transparent',
                  }}
                  onClick={() => setSelectedSetter(s.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                    {badge && (
                      <span style={{
                        fontSize: '8px', fontWeight: 700, padding: '1px 4px',
                        borderRadius: '3px', background: badge.bg, color: badge.color,
                        flexShrink: 0,
                      }}>
                        {badge.label}
                      </span>
                    )}
                    <span style={{
                      fontSize: '12px', color: isSelected ? '#e2e8f0' : '#94a3b8',
                      fontWeight: isSelected ? 600 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {s.name}
                    </span>
                  </div>
                  {count > 0 && (
                    <span style={styles.countBadge}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Right: Calendar + controls */}
          <div style={styles.rightPane}>
            {/* Setter name + click type */}
            <div style={styles.setterHeader}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>
                {selectedStaff?.name}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                {selectedStaff?.role} · {selectedStaff?.availability.join(', ')}
              </span>
            </div>

            {/* Click-to-mark type selector */}
            <div style={styles.clickTypeRow}>
              <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>Click to mark as:</span>
              <AbsenceTypePicker value={clickType} onChange={setClickType} />
            </div>

            {/* Calendar navigation */}
            <div style={styles.calNav}>
              <button
                style={styles.calNavBtn}
                onClick={() => setViewWeekStart((w) => Math.max(0, w - 4))}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                Weeks {viewWeekStart}–{viewWeekStart + 3}
              </span>
              <button
                style={styles.calNavBtn}
                onClick={() => setViewWeekStart((w) => w + 4)}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Calendar grid */}
            <CalendarGrid
              viewWeekStart={viewWeekStart}
              availability={availability}
              selectedSetter={selectedSetter}
              onToggleDate={handleToggleDate}
            />

            {/* Date range selector */}
            {addingRange ? (
              <div style={styles.rangeForm}>
                <div style={styles.rangeFormHeader}>
                  <Calendar size={13} color="#3b82f6" />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>Add Date Range</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="date"
                    style={styles.dateInput}
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                  />
                  <span style={{ fontSize: '12px', color: '#64748b' }}>to</span>
                  <input
                    type="date"
                    style={styles.dateInput}
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                  />
                </div>
                <AbsenceTypePicker value={rangeType} onChange={setRangeType} />
                <input
                  style={styles.input}
                  placeholder="Notes (optional)"
                  value={rangeNotes}
                  onChange={(e) => setRangeNotes(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button style={styles.addBtn} onClick={handleAddRange}>Add Range</button>
                  <button style={styles.cancelSmBtn} onClick={() => setAddingRange(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button style={styles.addRangeBtn} onClick={() => setAddingRange(true)}>
                <Calendar size={13} /> Add Date Range (multi-day absence)
              </button>
            )}

            {/* Recurring patterns */}
            <RecurringPatterns
              availability={availability}
              selectedSetter={selectedSetter}
              onChange={onChange}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Styles ----

const styles = {
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
    animation: 'modalFadeIn 0.15s ease-out',
  },
  modal: {
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.1)',
    width: '100%',
    maxWidth: '900px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
    animation: 'modalSlideIn 0.2s ease-out',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 800,
    color: '#f1f5f9',
    letterSpacing: '-0.2px',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#94a3b8',
    padding: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  iconBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    color: '#94a3b8',
    padding: '5px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    transition: 'all 0.12s',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },

  // ---- Setter list (left pane) ----
  setterList: {
    width: '180px',
    flexShrink: 0,
    borderRight: '1px solid rgba(255,255,255,0.06)',
    overflowY: 'auto',
    padding: '8px 0',
  },
  listHeader: {
    padding: '4px 14px 8px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  setterBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '6px 14px',
    border: '1px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.1s',
  },
  countBadge: {
    fontSize: '9px',
    fontWeight: 700,
    color: '#f87171',
    background: 'rgba(239,68,68,0.15)',
    padding: '1px 6px',
    borderRadius: '8px',
    flexShrink: 0,
  },

  // ---- Right pane ----
  rightPane: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  setterHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  clickTypeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  typePicker: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  typeChip: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.1s',
    whiteSpace: 'nowrap',
  },

  // ---- Calendar ----
  calNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    justifyContent: 'center',
  },
  calNavBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#94a3b8',
    padding: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    minWidth: '32px',
    minHeight: '32px',
    justifyContent: 'center',
  },
  calGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  calHeaderRow: {
    display: 'grid',
    gridTemplateColumns: '64px repeat(5, 1fr)',
    gap: '3px',
  },
  calDayHeader: {
    textAlign: 'center',
    fontSize: '10px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    padding: '4px 0',
  },
  calWeekRow: {
    display: 'grid',
    gridTemplateColumns: '64px repeat(5, 1fr)',
    gap: '3px',
  },
  calWeekLabel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1px',
  },
  calCell: {
    padding: '6px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    minHeight: '40px',
    transition: 'all 0.1s',
  },

  // ---- Date range ----
  addRangeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px dashed rgba(255,255,255,0.15)',
    borderRadius: '8px',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'all 0.12s',
  },
  rangeForm: {
    padding: '12px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  rangeFormHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '2px',
  },
  dateInput: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: '12px',
    fontFamily: 'inherit',
    colorScheme: 'dark',
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    color: '#e2e8f0',
    padding: '5px 8px',
    fontSize: '12px',
    fontFamily: 'inherit',
    colorScheme: 'dark',
  },
  addBtn: {
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    padding: '7px 18px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    minHeight: '34px',
  },
  cancelSmBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    color: '#94a3b8',
    padding: '7px 14px',
    cursor: 'pointer',
    fontSize: '12px',
    minHeight: '34px',
  },

  // ---- Recurring ----
  recurSection: {
    padding: '12px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  recurHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  recurRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  removeBtn: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: '4px',
    color: '#f87171',
    padding: '3px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  addPatternBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    background: 'rgba(139,92,246,0.08)',
    border: '1px dashed rgba(139,92,246,0.3)',
    borderRadius: '6px',
    color: '#a78bfa',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
  },
  addForm: {
    padding: '10px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
}
