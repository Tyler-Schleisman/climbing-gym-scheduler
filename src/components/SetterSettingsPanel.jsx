import { useState, useRef, useMemo } from 'react'
import {
  X, Users, Download, Upload, Plus, Trash2,
  Calendar, Repeat, ChevronLeft, ChevronRight, UserX, Heart,
} from 'lucide-react'
import { nextStaffId } from '../data/settings'
import { loadPreferences, savePreferences, getSetterPrefs, defaultSetterPrefs } from '../data/setter-preferences'
import {
  ABSENCE_TYPES,
  weekDayToDate,
  parseDate,
  exportAvailabilityJSON,
  importAvailabilityJSON,
} from '../data/availability-overrides'

const TABS = [
  { id: 'roster',       label: 'Roster & Availability', icon: Users },
  { id: 'vacation',     label: 'Vacation & Sick Days',  icon: UserX },
  { id: 'preferences',  label: 'Preferences',           icon: Heart },
]

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const ROLES = ['Director', 'Head Setter', 'Spec Setter', 'Setter']
const GYM_NAMES = ['Ogden', 'SLC', 'Soma']

const AVAIL_BASE_DATE = new Date(2025, 0, 6)

function getWeekMonday(weekNumber) {
  const d = new Date(AVAIL_BASE_DATE)
  d.setDate(d.getDate() + weekNumber * 7)
  return d
}

function fmtDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ============================================================================
// Tab 1: Roster & Availability
// ============================================================================

function RosterTab({ settings, onChange, availability, onAvailabilityChange }) {
  const { staff } = settings

  const updateStaff = (idx, field, value) => {
    const next = staff.map((s, i) => i === idx ? { ...s, [field]: value } : s)
    onChange({ ...settings, staff: next })
  }

  const toggleDay = (idx, day) => {
    const st = staff[idx]
    const avail = st.availability.includes(day)
      ? st.availability.filter((d) => d !== day)
      : [...st.availability, day]
    updateStaff(idx, 'availability', avail)
  }

  const addSetter = () => {
    const id = nextStaffId(staff)
    onChange({
      ...settings,
      staff: [...staff, { id, name: `Setter ${id}`, role: 'Setter', availability: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] }],
    })
  }

  const removeSetter = (idx) => {
    onChange({ ...settings, staff: staff.filter((_, i) => i !== idx) })
  }

  const absenceCounts = useMemo(() => {
    const counts = {}
    staff.forEach((st) => {
      const overrides = availability?.overrides?.[st.id]
      const overrideCount = overrides ? Object.keys(overrides).length : 0
      const recurringCount = availability?.recurring?.filter((r) => r.setterId === st.id).length || 0
      counts[st.id] = overrideCount + recurringCount
    })
    return counts
  }, [availability, staff])

  return (
    <div style={s.tabBody}>
      <div style={s.tabDesc}>
        Edit setter names, roles, and weekly availability. Use the "Vacation & Sick Days" tab for date-specific absences.
      </div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>ID</th>
              <th style={{ ...s.th, minWidth: '120px' }}>Name</th>
              <th style={{ ...s.th, minWidth: '110px' }}>Role</th>
              <th style={s.th}>Gym</th>
              {DAY_SHORT.map((d) => <th key={d} style={{ ...s.th, textAlign: 'center', width: '48px' }}>{d}</th>)}
              <th style={{ ...s.th, width: '50px', textAlign: 'center' }}>Abs</th>
              <th style={{ ...s.th, width: '36px' }} />
            </tr>
          </thead>
          <tbody>
            {staff.map((setter, idx) => (
              <tr key={setter.id} style={s.tr}>
                <td style={s.td}><span style={s.idBadge}>{setter.id}</span></td>
                <td style={s.td}>
                  <input style={s.cellInput} value={setter.name} onChange={(e) => updateStaff(idx, 'name', e.target.value)} />
                </td>
                <td style={s.td}>
                  <select style={s.cellSelect} value={setter.role} onChange={(e) => updateStaff(idx, 'role', e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={s.td}>
                  {setter.role === 'Head Setter' ? (
                    <select style={s.cellSelect} value={setter.gym || ''} onChange={(e) => updateStaff(idx, 'gym', e.target.value)}>
                      <option value="">—</option>
                      {GYM_NAMES.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  ) : (
                    <span style={{ color: '#475569', fontSize: '11px' }}>—</span>
                  )}
                </td>
                {DAYS.map((day) => (
                  <td key={day} style={{ ...s.td, textAlign: 'center' }}>
                    <input type="checkbox" checked={setter.availability.includes(day)} onChange={() => toggleDay(idx, day)} style={s.checkbox} />
                  </td>
                ))}
                <td style={{ ...s.td, textAlign: 'center' }}>
                  {absenceCounts[setter.id] > 0 ? (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#f87171', background: 'rgba(239,68,68,0.15)', padding: '2px 7px', borderRadius: '8px' }}>
                      {absenceCounts[setter.id]}
                    </span>
                  ) : (
                    <span style={{ fontSize: '10px', color: '#475569' }}>0</span>
                  )}
                </td>
                <td style={s.td}>
                  <button style={s.rowDeleteBtn} onClick={() => removeSetter(idx)} title="Remove setter">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button style={s.addRowBtn} onClick={addSetter}>
        <Plus size={13} /> Add Setter
      </button>
    </div>
  )
}

// ============================================================================
// Tab 2: Vacation & Sick Days
// ============================================================================

function VacationTab({ settings, availability, onAvailabilityChange }) {
  const { staff } = settings
  const [selectedSetter, setSelectedSetter] = useState(staff[0]?.id || null)
  const [viewWeekStart, setViewWeekStart] = useState(0)
  const [clickType, setClickType] = useState('sick')
  const [addingRange, setAddingRange] = useState(false)
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [rangeType, setRangeType] = useState('vacation')
  const [rangeNotes, setRangeNotes] = useState('')
  const [addingRecurring, setAddingRecurring] = useState(false)
  const [newRecurDay, setNewRecurDay] = useState('Friday')
  const [newRecurType, setNewRecurType] = useState('personal')
  const [newRecurNotes, setNewRecurNotes] = useState('')
  const availFileRef = useRef(null)

  const selectedStaff = staff.find((st) => st.id === selectedSetter)

  const absenceCounts = useMemo(() => {
    const counts = {}
    staff.forEach((st) => {
      const overrides = availability?.overrides?.[st.id]
      const overrideCount = overrides ? Object.keys(overrides).length : 0
      const recurringCount = availability?.recurring?.filter((r) => r.setterId === st.id).length || 0
      counts[st.id] = overrideCount + recurringCount
    })
    return counts
  }, [availability, staff])

  const handleToggleDate = (weekNumber, dayName, dateStr) => {
    if (!selectedSetter) return
    const sid = selectedSetter
    const setterOverrides = { ...(availability.overrides[sid] || {}) }
    if (setterOverrides[dateStr]) {
      delete setterOverrides[dateStr]
    } else {
      setterOverrides[dateStr] = { type: clickType, notes: '' }
    }
    onAvailabilityChange({
      ...availability,
      overrides: { ...availability.overrides, [sid]: setterOverrides },
    })
  }

  const handleAddRange = () => {
    if (!rangeStart || !rangeEnd || !selectedSetter) return
    const start = parseDate(rangeStart)
    const end = parseDate(rangeEnd)
    if (isNaN(start) || isNaN(end) || start > end) return
    const sid = selectedSetter
    const setterOverrides = { ...(availability.overrides[sid] || {}) }
    const current = new Date(start)
    while (current <= end) {
      const dayOfWeek = current.getDay()
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const y = current.getFullYear()
        const m = String(current.getMonth() + 1).padStart(2, '0')
        const d = String(current.getDate()).padStart(2, '0')
        setterOverrides[`${y}-${m}-${d}`] = { type: rangeType, notes: rangeNotes }
      }
      current.setDate(current.getDate() + 1)
    }
    onAvailabilityChange({
      ...availability,
      overrides: { ...availability.overrides, [sid]: setterOverrides },
    })
    setAddingRange(false)
    setRangeStart('')
    setRangeEnd('')
    setRangeNotes('')
  }

  const recurringPatterns = selectedSetter
    ? (availability?.recurring || []).filter((r) => r.setterId === selectedSetter)
    : []

  const addRecurringPattern = () => {
    if (!selectedSetter) return
    onAvailabilityChange({
      ...availability,
      recurring: [
        ...availability.recurring,
        { setterId: selectedSetter, dayOfWeek: newRecurDay, type: newRecurType, notes: newRecurNotes },
      ],
    })
    setAddingRecurring(false)
    setNewRecurNotes('')
  }

  const removeRecurringPattern = (patternIdx) => {
    let count = 0
    const actualIdx = availability.recurring.findIndex((r) => {
      if (r.setterId === selectedSetter) {
        if (count === patternIdx) return true
        count++
      }
      return false
    })
    if (actualIdx === -1) return
    onAvailabilityChange({
      ...availability,
      recurring: availability.recurring.filter((_, i) => i !== actualIdx),
    })
  }

  const handleAvailExport = () => {
    const json = exportAvailabilityJSON(availability)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'availability-overrides.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAvailImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const imported = importAvailabilityJSON(reader.result)
      if (imported) onAvailabilityChange(imported)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Calendar grid
  const renderCalendarGrid = () => {
    if (!selectedSetter) return null
    const weeks = [viewWeekStart, viewWeekStart + 1, viewWeekStart + 2, viewWeekStart + 3]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(5, 1fr)', gap: '3px' }}>
          <div />
          {DAY_SHORT.map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', padding: '4px 0' }}>{d}</div>
          ))}
        </div>
        {weeks.map((wk) => {
          const mon = getWeekMonday(wk)
          return (
            <div key={wk} style={{ display: 'grid', gridTemplateColumns: '64px repeat(5, 1fr)', gap: '3px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
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
                      padding: '6px', borderRadius: '6px',
                      border: `1px solid ${typeData ? typeData.color + '40' : 'rgba(255,255,255,0.06)'}`,
                      cursor: 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: '2px',
                      minHeight: '40px', background: typeData ? typeData.bg : 'rgba(255,255,255,0.02)',
                    }}
                    onClick={() => handleToggleDate(wk, day, dateStr)}
                    title={info ? `${ABSENCE_TYPES[info.type].label}${info.notes ? ': ' + info.notes : ''}` : `${day}, ${fmtDate(cellDate)} — click to mark unavailable`}
                  >
                    <span style={{ fontSize: '11px', color: typeData ? typeData.color : '#64748b' }}>
                      {cellDate.getDate()}
                    </span>
                    {typeData && (
                      <span style={{ fontSize: '8px', fontWeight: 700, color: typeData.color, letterSpacing: '0.3px' }}>
                        {typeData.icon}
                      </span>
                    )}
                    {isRecurring && <Repeat size={7} color={typeData?.color || '#64748b'} />}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  function getRoleBadge(role) {
    switch (role) {
      case 'Director': return { label: 'DIR', bg: 'rgba(139,92,246,0.3)', color: '#a78bfa' }
      case 'Head Setter': return { label: 'HEAD', bg: 'rgba(59,130,246,0.3)', color: '#60a5fa' }
      case 'Spec Setter': return { label: 'SPEC', bg: 'rgba(245,158,11,0.3)', color: '#fbbf24' }
      default: return null
    }
  }

  return (
    <div style={s.tabBody}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={s.tabDesc}>
          Mark dates when setters are unavailable. Select a setter, then click dates on the calendar or add a date range.
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
          <button style={s.availSmBtn} onClick={handleAvailExport} title="Export availability data">
            <Download size={12} /> Export
          </button>
          <button style={s.availSmBtn} onClick={() => availFileRef.current?.click()} title="Import availability data">
            <Upload size={12} /> Import
          </button>
          <input ref={availFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleAvailImport} />
        </div>
      </div>

      {/* Two-pane layout: setter list + calendar */}
      <div style={s.vacationLayout}>
        {/* Left: Setter list */}
        <div style={s.setterList}>
          <div style={s.listHeader}>Setters</div>
          {staff.map((st) => {
            const badge = getRoleBadge(st.role)
            const count = absenceCounts[st.id]
            const isSelected = st.id === selectedSetter
            return (
              <button
                key={st.id}
                style={{
                  ...s.setterBtn,
                  background: isSelected ? 'rgba(59,130,246,0.15)' : 'transparent',
                  borderColor: isSelected ? 'rgba(59,130,246,0.4)' : 'transparent',
                }}
                onClick={() => setSelectedSetter(st.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                  {badge && (
                    <span style={{
                      fontSize: '8px', fontWeight: 700, padding: '1px 4px',
                      borderRadius: '3px', background: badge.bg, color: badge.color, flexShrink: 0,
                    }}>{badge.label}</span>
                  )}
                  <span style={{
                    fontSize: '12px', color: isSelected ? '#e2e8f0' : '#94a3b8',
                    fontWeight: isSelected ? 600 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{st.name}</span>
                </div>
                {count > 0 && (
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#f87171', background: 'rgba(239,68,68,0.15)', padding: '1px 6px', borderRadius: '8px', flexShrink: 0 }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Right: Calendar & controls */}
        <div style={s.rightPane}>
          {selectedStaff ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>{selectedStaff.name}</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>{selectedStaff.role} · {selectedStaff.availability.join(', ')}</span>
              </div>

              {/* Click-to-mark type selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>Click to mark as:</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {Object.entries(ABSENCE_TYPES).map(([key, info]) => (
                    <button
                      key={key}
                      style={{
                        padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        background: clickType === key ? info.bg : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${clickType === key ? info.color : 'rgba(255,255,255,0.1)'}`,
                        color: clickType === key ? info.color : '#94a3b8',
                      }}
                      onClick={() => setClickType(key)}
                    >{info.icon} {info.label}</button>
                  ))}
                </div>
              </div>

              {/* Calendar navigation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
                <button style={s.calNavBtn} onClick={() => setViewWeekStart((w) => Math.max(0, w - 4))}><ChevronLeft size={16} /></button>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Weeks {viewWeekStart}–{viewWeekStart + 3}</span>
                <button style={s.calNavBtn} onClick={() => setViewWeekStart((w) => w + 4)}><ChevronRight size={16} /></button>
              </div>

              {renderCalendarGrid()}

              {/* Date range */}
              {addingRange ? (
                <div style={s.availRangeForm}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <Calendar size={13} color="#3b82f6" />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>Add Date Range</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input type="date" style={s.dateInput} value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                    <span style={{ fontSize: '12px', color: '#64748b' }}>to</span>
                    <input type="date" style={s.dateInput} value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {Object.entries(ABSENCE_TYPES).map(([key, info]) => (
                      <button key={key} style={{
                        padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        background: rangeType === key ? info.bg : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${rangeType === key ? info.color : 'rgba(255,255,255,0.1)'}`,
                        color: rangeType === key ? info.color : '#94a3b8',
                      }} onClick={() => setRangeType(key)}>{info.icon} {info.label}</button>
                    ))}
                  </div>
                  <input style={s.availInput} placeholder="Notes (optional)" value={rangeNotes} onChange={(e) => setRangeNotes(e.target.value)} />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={s.availAddBtn} onClick={handleAddRange}>Add Range</button>
                    <button style={s.availCancelBtn} onClick={() => setAddingRange(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button style={s.availDashedBtn} onClick={() => setAddingRange(true)}>
                  <Calendar size={13} /> Add Date Range (multi-day absence)
                </button>
              )}

              {/* Recurring patterns */}
              <div style={s.recurSection}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Repeat size={13} color="#8b5cf6" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recurring Patterns</span>
                </div>
                {recurringPatterns.length === 0 && !addingRecurring && (
                  <div style={{ fontSize: '12px', color: '#475569', fontStyle: 'italic', padding: '4px 0' }}>No recurring patterns</div>
                )}
                {recurringPatterns.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                      background: ABSENCE_TYPES[p.type].bg,
                      border: `1px solid ${ABSENCE_TYPES[p.type].color}40`,
                      color: ABSENCE_TYPES[p.type].color,
                    }}>Every {p.dayOfWeek}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', flex: 1 }}>
                      {ABSENCE_TYPES[p.type].label}{p.notes ? ` — ${p.notes}` : ''}
                    </span>
                    <button
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px', color: '#f87171', padding: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      onClick={() => removeRecurringPattern(i)}
                      title="Remove pattern"
                    ><Trash2 size={12} /></button>
                  </div>
                ))}
                {addingRecurring ? (
                  <div style={s.availRangeForm}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>Every</span>
                      <select style={s.availSelect} value={newRecurDay} onChange={(e) => setNewRecurDay(e.target.value)}>
                        {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <select style={s.availSelect} value={newRecurType} onChange={(e) => setNewRecurType(e.target.value)}>
                        {Object.entries(ABSENCE_TYPES).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                    <input style={s.availInput} placeholder="Notes (optional)" value={newRecurNotes} onChange={(e) => setNewRecurNotes(e.target.value)} />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button style={s.availAddBtn} onClick={addRecurringPattern}>Add</button>
                      <button style={s.availCancelBtn} onClick={() => setAddingRecurring(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'rgba(139,92,246,0.08)', border: '1px dashed rgba(139,92,246,0.3)', borderRadius: '6px', color: '#a78bfa', cursor: 'pointer', fontSize: '11px', fontWeight: 500 }}
                    onClick={() => setAddingRecurring(true)}
                  ><Plus size={12} /> Add Recurring Pattern</button>
                )}
              </div>
            </>
          ) : (
            <div style={s.availPlaceholder}>Select a setter from the list to manage their vacation, sick days, and recurring absences.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Tab 3: Setter Preferences
// ============================================================================

function PreferencesTab({ settings }) {
  const { staff } = settings
  const [prefs, setPrefs] = useState(() => loadPreferences())
  const [selectedSetter, setSelectedSetter] = useState(staff[0]?.id || null)

  const setter = staff.find((st) => st.id === selectedSetter)
  const p = setter ? getSetterPrefs(prefs, setter.id) : defaultSetterPrefs()

  const updatePref = (field, value) => {
    if (!setter) return
    const current = getSetterPrefs(prefs, setter.id)
    const next = { ...prefs, [setter.id]: { ...current, [field]: value } }
    setPrefs(next)
    savePreferences(next)
  }

  const toggleArrayItem = (field, item) => {
    const arr = p[field] || []
    const next = arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]
    updatePref(field, next)
  }

  const WORKLOAD_OPTIONS = [
    { value: null, label: 'No Preference' },
    { value: 'light', label: 'Light' },
    { value: 'normal', label: 'Normal' },
    { value: 'heavy', label: 'Heavy' },
  ]

  const allSections = useMemo(() => {
    const result = []
    const seen = new Set()
    for (const gymName of GYM_NAMES) {
      for (const sec of (settings.boulderSections?.[gymName] || [])) {
        if (!seen.has(sec.name)) { seen.add(sec.name); result.push({ name: sec.name, type: 'boulder', gym: gymName }) }
      }
      for (const sec of (settings.ropeSections?.[gymName] || [])) {
        if (!seen.has(sec.name)) { seen.add(sec.name); result.push({ name: sec.name, type: 'rope', gym: gymName }) }
      }
    }
    return result
  }, [settings])

  return (
    <div style={s.tabBody}>
      <div style={s.tabDesc}>
        Set low-priority scheduling preferences per setter. These are hints for the auto-scheduler (small tie-breaker bonuses), not hard constraints.
      </div>

      {/* Setter selector */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {staff.map((st) => (
          <button
            key={st.id}
            style={{
              padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.1s',
              background: selectedSetter === st.id ? 'rgba(236,72,153,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${selectedSetter === st.id ? 'rgba(236,72,153,0.4)' : 'rgba(255,255,255,0.1)'}`,
              color: selectedSetter === st.id ? '#f472b6' : '#94a3b8',
            }}
            onClick={() => setSelectedSetter(st.id)}
          >{st.name}</button>
        ))}
      </div>

      {setter && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Gym preferences */}
          <div style={prefStyles.card}>
            <div style={prefStyles.cardTitle}>Gym Preferences</div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={prefStyles.subLabel}>Preferred Gyms</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {GYM_NAMES.map((g) => (
                    <button key={g} style={{
                      ...prefStyles.chip,
                      background: p.preferredGyms.includes(g) ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)',
                      borderColor: p.preferredGyms.includes(g) ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)',
                      color: p.preferredGyms.includes(g) ? '#34d399' : '#94a3b8',
                    }} onClick={() => {
                      if (!p.preferredGyms.includes(g) && p.avoidGyms.includes(g)) toggleArrayItem('avoidGyms', g)
                      toggleArrayItem('preferredGyms', g)
                    }}>{g}</button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={prefStyles.subLabel}>Prefer to Avoid</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {GYM_NAMES.map((g) => (
                    <button key={g} style={{
                      ...prefStyles.chip,
                      background: p.avoidGyms.includes(g) ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                      borderColor: p.avoidGyms.includes(g) ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)',
                      color: p.avoidGyms.includes(g) ? '#f87171' : '#94a3b8',
                    }} onClick={() => {
                      if (!p.avoidGyms.includes(g) && p.preferredGyms.includes(g)) toggleArrayItem('preferredGyms', g)
                      toggleArrayItem('avoidGyms', g)
                    }}>{g}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Difficulty comfort */}
          <div style={prefStyles.card}>
            <div style={prefStyles.cardTitle}>Difficulty Comfort Level</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[null, 'easy', 'medium', 'hard'].map((d) => {
                const label = d ? d.charAt(0).toUpperCase() + d.slice(1) : 'No Preference'
                const colors = { null: '#94a3b8', easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' }
                const active = p.difficultyComfort === d
                return (
                  <button key={d || 'none'} style={{
                    ...prefStyles.chip,
                    background: active ? `${colors[d]}20` : 'rgba(255,255,255,0.03)',
                    borderColor: active ? `${colors[d]}60` : 'rgba(255,255,255,0.1)',
                    color: active ? colors[d] : '#94a3b8',
                  }} onClick={() => updatePref('difficultyComfort', d)}>{label}</button>
                )
              })}
            </div>
          </div>

          {/* Workload preference */}
          <div style={prefStyles.card}>
            <div style={prefStyles.cardTitle}>Workload Preference</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {WORKLOAD_OPTIONS.map(({ value, label }) => {
                const active = p.workloadPreference === value
                return (
                  <button key={label} style={{
                    ...prefStyles.chip,
                    background: active ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                    borderColor: active ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)',
                    color: active ? '#a78bfa' : '#94a3b8',
                  }} onClick={() => updatePref('workloadPreference', value)}>{label}</button>
                )
              })}
            </div>
          </div>

          {/* Section preferences */}
          <div style={prefStyles.card}>
            <div style={prefStyles.cardTitle}>Section Preferences</div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={prefStyles.subLabel}>Preferred Sections</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {allSections.map(({ name, type, gym }) => (
                    <button key={name} style={{
                      ...prefStyles.chip, fontSize: '10px',
                      background: p.preferredSections.includes(name) ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)',
                      borderColor: p.preferredSections.includes(name) ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)',
                      color: p.preferredSections.includes(name) ? '#34d399' : '#64748b',
                    }} onClick={() => {
                      if (!p.preferredSections.includes(name) && p.avoidSections.includes(name)) toggleArrayItem('avoidSections', name)
                      toggleArrayItem('preferredSections', name)
                    }} title={`${gym} — ${type}`}>{name}</button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={prefStyles.subLabel}>Prefer to Avoid</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {allSections.map(({ name, type, gym }) => (
                    <button key={name} style={{
                      ...prefStyles.chip, fontSize: '10px',
                      background: p.avoidSections.includes(name) ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                      borderColor: p.avoidSections.includes(name) ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)',
                      color: p.avoidSections.includes(name) ? '#f87171' : '#64748b',
                    }} onClick={() => {
                      if (!p.avoidSections.includes(name) && p.preferredSections.includes(name)) toggleArrayItem('preferredSections', name)
                      toggleArrayItem('avoidSections', name)
                    }} title={`${gym} — ${type}`}>{name}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Partner preferences */}
          <div style={prefStyles.card}>
            <div style={prefStyles.cardTitle}>Preferred Partners</div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {staff.filter((st) => st.id !== setter.id).map((st) => (
                <button key={st.id} style={{
                  ...prefStyles.chip,
                  background: p.partnerPrefs.includes(st.id) ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                  borderColor: p.partnerPrefs.includes(st.id) ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)',
                  color: p.partnerPrefs.includes(st.id) ? '#60a5fa' : '#94a3b8',
                }} onClick={() => toggleArrayItem('partnerPrefs', st.id)}>{st.name}</button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div style={prefStyles.card}>
            <div style={prefStyles.cardTitle}>Notes</div>
            <textarea
              style={{
                width: '100%', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                color: '#e2e8f0', padding: '8px 10px', fontSize: '12px',
                fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                boxSizing: 'border-box', minHeight: '60px',
              }}
              value={p.notes}
              onChange={(e) => updatePref('notes', e.target.value)}
              placeholder="Any scheduling notes or preferences for this setter..."
            />
          </div>
        </div>
      )}
    </div>
  )
}

const prefStyles = {
  card: {
    background: 'rgba(255,255,255,0.02)', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.06)', padding: '14px',
  },
  cardTitle: {
    fontSize: '13px', fontWeight: 700, color: '#e2e8f0', marginBottom: '10px',
  },
  subLabel: {
    fontSize: '11px', fontWeight: 600, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px',
  },
  chip: {
    padding: '4px 10px', borderRadius: '5px',
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer', fontSize: '11px', fontWeight: 600,
    transition: 'all 0.1s', background: 'rgba(255,255,255,0.03)',
  },
}

// ============================================================================
// Main Panel
// ============================================================================

export default function SetterSettingsPanel({ settings, onChange, onClose, availability, onAvailabilityChange }) {
  const [activeTab, setActiveTab] = useState('roster')

  const TabContent = {
    roster: RosterTab,
    vacation: VacationTab,
    preferences: PreferencesTab,
  }[activeTab]

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={20} color="#3b82f6" />
            <div>
              <h2 style={s.title}>Setter Settings</h2>
              <p style={s.subtitle}>Manage team roster, availability, and preferences</p>
            </div>
          </div>
          <button style={s.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div style={s.tabBar}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              style={{
                ...s.tabBtn,
                background: activeTab === id ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: activeTab === id ? '#60a5fa' : '#64748b',
                borderColor: activeTab === id ? 'rgba(59,130,246,0.4)' : 'transparent',
              }}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={s.tabContent}>
          <TabContent settings={settings} onChange={onChange} availability={availability} onAvailabilityChange={onAvailabilityChange} />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100, padding: '16px',
    animation: 'modalFadeIn 0.2s ease-out',
  },
  modal: {
    background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
    width: '100%', maxWidth: '960px', maxHeight: '92vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)',
    animation: 'modalSlideIn 0.25s ease-out', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
  },
  title: { margin: 0, fontSize: '18px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.2px' },
  subtitle: { margin: '2px 0 0', fontSize: '12px', color: '#64748b' },
  closeBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px', color: '#94a3b8', padding: '8px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', transition: 'all 0.15s',
    minWidth: '36px', minHeight: '36px', justifyContent: 'center',
  },
  tabBar: {
    display: 'flex', gap: '2px', padding: '12px 24px 0', flexShrink: 0,
    borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto',
  },
  tabBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '10px 16px', border: '1px solid transparent',
    borderBottom: 'none', borderRadius: '10px 10px 0 0',
    cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.15s',
    whiteSpace: 'nowrap', minHeight: '40px',
  },
  tabContent: { flex: 1, overflowY: 'auto', minHeight: 0 },
  tabBody: {
    padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px',
  },
  tabDesc: {
    fontSize: '13px', color: '#94a3b8', lineHeight: 1.6,
    padding: '10px 14px', background: 'rgba(255,255,255,0.02)',
    borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)',
  },

  // ---- table styles ----
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    padding: '8px 10px', textAlign: 'left',
    fontSize: '11px', fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.04)' },
  td: { padding: '7px 10px', verticalAlign: 'middle' },
  cellInput: {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
    color: '#e2e8f0', padding: '7px 10px', fontSize: '13px',
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  cellSelect: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#e2e8f0', padding: '7px 8px',
    fontSize: '13px', fontFamily: 'inherit', colorScheme: 'dark', minHeight: '34px',
  },
  checkbox: { accentColor: '#3b82f6', cursor: 'pointer', width: '16px', height: '16px' },
  idBadge: {
    fontSize: '11px', fontWeight: 700, color: '#64748b',
    background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '6px',
  },
  rowDeleteBtn: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: '6px', color: '#f87171', padding: '6px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', transition: 'all 0.15s',
    minWidth: '28px', minHeight: '28px', justifyContent: 'center',
  },
  addRowBtn: {
    display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start',
    padding: '9px 16px', background: 'rgba(59,130,246,0.1)',
    border: '1px dashed rgba(59,130,246,0.3)', borderRadius: '10px',
    color: '#60a5fa', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    transition: 'all 0.15s', minHeight: '38px',
  },

  // ---- vacation tab layout ----
  vacationLayout: {
    display: 'flex', flex: 1, overflow: 'hidden', minHeight: '400px',
    border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px',
  },
  setterList: {
    width: '180px', flexShrink: 0,
    borderRight: '1px solid rgba(255,255,255,0.06)',
    overflowY: 'auto', padding: '8px 0',
  },
  listHeader: {
    padding: '4px 14px 8px', fontSize: '10px', fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  setterBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    width: '100%', padding: '6px 14px',
    border: '1px solid transparent', background: 'transparent',
    cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s',
  },
  rightPane: {
    flex: 1, overflowY: 'auto', padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: '12px',
  },
  availPlaceholder: {
    padding: '20px', textAlign: 'center', fontSize: '13px', color: '#64748b',
    background: 'rgba(255,255,255,0.02)', borderRadius: '10px',
    border: '1px dashed rgba(255,255,255,0.08)',
  },

  // ---- availability controls ----
  availSmBtn: {
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '5px 10px', fontSize: '11px', fontWeight: 600,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px', color: '#94a3b8', cursor: 'pointer',
  },
  calNavBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#94a3b8', padding: '6px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', minWidth: '32px', minHeight: '32px', justifyContent: 'center',
  },
  availDashedBtn: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '8px 14px', background: 'rgba(255,255,255,0.04)',
    border: '1px dashed rgba(255,255,255,0.15)', borderRadius: '8px',
    color: '#94a3b8', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
  },
  availRangeForm: {
    padding: '12px', background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex', flexDirection: 'column', gap: '10px',
  },
  dateInput: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px', color: '#e2e8f0', padding: '6px 10px',
    fontSize: '12px', fontFamily: 'inherit', colorScheme: 'dark',
  },
  availInput: {
    width: '100%', background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
    color: '#e2e8f0', padding: '6px 10px', fontSize: '12px',
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  },
  availSelect: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px', color: '#e2e8f0', padding: '5px 8px',
    fontSize: '12px', fontFamily: 'inherit', colorScheme: 'dark',
  },
  availAddBtn: {
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    border: 'none', borderRadius: '8px', color: '#fff',
    padding: '7px 18px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, minHeight: '34px',
  },
  availCancelBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px', color: '#94a3b8', padding: '7px 14px',
    cursor: 'pointer', fontSize: '12px', minHeight: '34px',
  },
  recurSection: {
    padding: '12px', background: 'rgba(255,255,255,0.02)',
    borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column', gap: '8px',
  },
}
