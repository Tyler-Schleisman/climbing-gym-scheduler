import { useState, useMemo, useCallback } from 'react'
import {
  X, AlertTriangle, Check, Calendar, Clock, MapPin,
  ChevronDown, ChevronUp, Trash2, Plus, ArrowRight,
  Edit3, Zap, CheckCircle, AlertCircle, RotateCcw, Wrench,
} from 'lucide-react'
import { STAFF } from '../data/staff'
import { GYMS } from '../data/gyms'
import { ROPE_SECTIONS, BOULDER_SECTIONS } from '../data/sections'
import {
  MISSED_REASONS,
  loadMissedShifts,
  addMissedShift,
  updateMissedShift,
  markAsScheduled,
  markAsCompleted,
  removeMissedShift,
  addEditHistory,
  getOpenRecords,
  findMakeupSlots,
  validateMakeupAssignment,
  getRecordAge,
  getRecordAgeStatus,
} from '../data/missed-shifts'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

function getStaffName(id) {
  return STAFF.find((s) => s.id === id)?.name || `#${id}`
}

// ============================================================================
// Report Missed Shift Modal (with auto-schedule option after submit)
// ============================================================================

function ReportModal({ weekNumber, weekSchedule, scheduleHistory, onClose, onReport, prefill }) {
  const [selectedShiftKey, setSelectedShiftKey] = useState(
    prefill ? `${prefill.gymName}-${prefill.day}` : null
  )
  const [missedAnchors, setMissedAnchors] = useState([])
  const [missedReason, setMissedReason] = useState('sick')
  const [missedNotes, setMissedNotes] = useState('')
  const [submitted, setSubmitted] = useState(null) // holds the created record after submit

  const assignedShifts = useMemo(() => {
    const shifts = []
    Object.entries(weekSchedule || {}).forEach(([key, shift]) => {
      if (!shift || !shift.assignedStaff?.length) return
      const [gymName, day] = key.split('-')
      shifts.push({ key, gymName, day, ...shift })
    })
    return shifts.sort((a, b) => {
      const dayOrder = DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
      if (dayOrder !== 0) return dayOrder
      return a.gymName.localeCompare(b.gymName)
    })
  }, [weekSchedule])

  const selectedShift = assignedShifts.find((s) => s.key === selectedShiftKey)

  const sectionAnchors = useMemo(() => {
    if (!selectedShift || selectedShift.shiftType !== 'Rope Setting') return []
    const sec = (ROPE_SECTIONS[selectedShift.gymName] || [])
      .find((s) => s.name === selectedShift.section)
    return sec?.anchors || []
  }, [selectedShift])

  const toggleAnchor = (anchor) => {
    setMissedAnchors((prev) =>
      prev.includes(anchor) ? prev.filter((a) => a !== anchor) : [...prev, anchor]
    )
  }

  const handleSubmit = () => {
    if (!selectedShift) return
    const record = {
      weekNumber,
      day: selectedShift.day,
      gymName: selectedShift.gymName,
      section: selectedShift.section || '(no section)',
      shiftType: selectedShift.shiftType,
      incompleteAnchors: missedAnchors,
      missedBy: selectedShift.assignedStaff,
      missedReason,
      missedNotes,
    }
    const entry = addMissedShift(record)
    setSubmitted(entry)
  }

  const handleAutoSchedule = () => {
    onReport(submitted, 'auto')
    onClose()
  }

  const handleManualLater = () => {
    onReport(submitted, 'manual')
    onClose()
  }

  // After-submit view: choose auto or manual scheduling
  if (submitted) {
    return (
      <div style={ms.overlay} onClick={onClose}>
        <div style={{ ...ms.modal, maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
          <div style={ms.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CheckCircle size={20} color="#10b981" />
              <h2 style={ms.title}>Shift Reported</h2>
            </div>
            <button style={ms.closeBtn} onClick={() => { onReport(submitted, 'none'); onClose() }}><X size={18} /></button>
          </div>
          <div style={ms.body}>
            <div style={ms.recordSummary}>
              <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{submitted.gymName}</span>
              <span style={{ color: '#94a3b8' }}>·</span>
              <span style={{ color: '#94a3b8' }}>{submitted.section}</span>
              {submitted.incompleteAnchors.length > 0 && (
                <span style={{ color: '#f87171', fontSize: '12px' }}>
                  ({submitted.incompleteAnchors.length} anchors)
                </span>
              )}
            </div>

            <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>
              How would you like to handle the makeup work?
            </div>

            <button
              style={{
                ...ms.confirmBlueBtn, width: '100%', justifyContent: 'center',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                padding: '14px 20px', fontSize: '14px',
              }}
              onClick={handleAutoSchedule}
            >
              <Zap size={16} /> Auto-Schedule Makeup Work
            </button>

            <button
              style={{ ...ms.cancelBtn, width: '100%', textAlign: 'center' }}
              onClick={handleManualLater}
            >
              <Clock size={14} style={{ marginRight: '6px' }} />
              Manually Schedule Later
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={ms.overlay} onClick={onClose}>
      <div style={ms.modal} onClick={(e) => e.stopPropagation()}>
        <div style={ms.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#f59e0b" />
            <h2 style={ms.title}>Report Missed Shift</h2>
          </div>
          <button style={ms.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={ms.body}>
          <div style={ms.stepLabel}>1. Select the shift</div>
          {assignedShifts.length === 0 ? (
            <div style={ms.emptyNote}>No assigned shifts this week.</div>
          ) : (
            <div style={ms.shiftList}>
              {assignedShifts.map((s) => {
                const isSelected = selectedShiftKey === s.key
                return (
                  <button
                    key={s.key}
                    style={{
                      ...ms.shiftItem,
                      background: isSelected ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)',
                      borderColor: isSelected ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)',
                    }}
                    onClick={() => { setSelectedShiftKey(s.key); setMissedAnchors([]) }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: s.shiftType === 'Boulder Setting' ? '#3b82f6' : '#8b5cf6', textTransform: 'uppercase' }}>
                        {s.shiftType === 'Boulder Setting' ? 'BLD' : s.shiftType === 'Rope Setting' ? 'RPE' : 'FLX'}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{s.gymName}</span>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>— {s.day}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {s.section || 'No section'} · {s.assignedStaff.map(getStaffName).join(', ')}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {selectedShift && sectionAnchors.length > 0 && (
            <>
              <div style={ms.stepLabel}>2. Which anchors were NOT completed?</div>
              <div style={ms.anchorGrid}>
                {sectionAnchors.map((anchor) => {
                  const isMissed = missedAnchors.includes(anchor)
                  return (
                    <button
                      key={anchor}
                      style={{
                        ...ms.anchorBtn,
                        background: isMissed ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                        borderColor: isMissed ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)',
                        color: isMissed ? '#f87171' : '#94a3b8',
                      }}
                      onClick={() => toggleAnchor(anchor)}
                    >
                      #{anchor}
                      {isMissed && <X size={10} />}
                    </button>
                  )
                })}
              </div>
              <button
                style={ms.selectAllBtn}
                onClick={() => setMissedAnchors(
                  missedAnchors.length === sectionAnchors.length ? [] : [...sectionAnchors]
                )}
              >
                {missedAnchors.length === sectionAnchors.length ? 'Deselect All' : 'Select All Anchors'}
              </button>
            </>
          )}

          {selectedShift && (
            <>
              <div style={ms.stepLabel}>
                {sectionAnchors.length > 0 ? '3' : '2'}. Reason
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {Object.entries(MISSED_REASONS).map(([key, info]) => (
                  <button
                    key={key}
                    style={{
                      ...ms.reasonChip,
                      background: missedReason === key ? info.bg : 'rgba(255,255,255,0.04)',
                      borderColor: missedReason === key ? info.color : 'rgba(255,255,255,0.1)',
                      color: missedReason === key ? info.color : '#94a3b8',
                    }}
                    onClick={() => setMissedReason(key)}
                  >
                    {info.icon} {info.label}
                  </button>
                ))}
              </div>

              <textarea
                style={ms.textarea}
                value={missedNotes}
                onChange={(e) => setMissedNotes(e.target.value)}
                placeholder="Additional notes (optional)..."
                rows={2}
              />
            </>
          )}
        </div>

        <div style={ms.footer}>
          <button style={ms.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{
              ...ms.confirmBtn,
              opacity: selectedShift ? 1 : 0.5,
              cursor: selectedShift ? 'pointer' : 'not-allowed',
            }}
            onClick={selectedShift ? handleSubmit : undefined}
            disabled={!selectedShift}
          >
            <AlertTriangle size={14} /> Mark as Incomplete
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Auto-Schedule Preview Modal
// ============================================================================

function AutoSchedulePreview({ record, scheduleHistory, currentWeek, onClose, onConfirm, onManual }) {
  const slots = useMemo(
    () => findMakeupSlots(record, scheduleHistory, 4),
    [record, scheduleHistory]
  )

  const [selectedIdx, setSelectedIdx] = useState(0)
  const best = slots[selectedIdx] || null

  if (slots.length === 0) {
    return (
      <div style={ms.overlay} onClick={onClose}>
        <div style={{ ...ms.modal, maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
          <div style={ms.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={20} color="#f59e0b" />
              <h2 style={ms.title}>No Slots Found</h2>
            </div>
            <button style={ms.closeBtn} onClick={onClose}><X size={18} /></button>
          </div>
          <div style={ms.body}>
            <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '12px' }}>
              No available shifts found with capacity for makeup work in the next 4 weeks.
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
              Suggestions:
              <ul style={{ margin: '6px 0', paddingLeft: '18px' }}>
                <li>Add a {record.shiftType.toLowerCase().replace(' setting', '')} shift on a flex day at {record.gymName}</li>
                <li>Reduce setters on another shift to make room</li>
                <li>Schedule manually for a specific date</li>
              </ul>
            </div>
          </div>
          <div style={ms.footer}>
            <button style={ms.cancelBtn} onClick={onClose}>Close</button>
            <button style={ms.confirmBlueBtn} onClick={() => { onManual(record); onClose() }}>
              <Calendar size={14} /> Manually Schedule
            </button>
          </div>
        </div>
      </div>
    )
  }

  const validation = best ? validateMakeupAssignment(record, best.weekNumber, best.day, scheduleHistory) : null

  const handleConfirm = () => {
    const notes = record.incompleteAnchors.length > 0
      ? `Makeup work: Complete ${record.section} anchors ${record.incompleteAnchors.join(', ')}`
      : `Makeup work from Week ${record.weekNumber} ${record.day}`
    markAsScheduled(record.id, best.weekNumber, best.day, notes)
    onConfirm(best)
    onClose()
  }

  return (
    <div style={ms.overlay} onClick={onClose}>
      <div style={{ ...ms.modal, maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
        <div style={ms.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Zap size={20} color="#3b82f6" />
            <h2 style={ms.title}>Auto-Schedule Preview</h2>
          </div>
          <button style={ms.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={ms.body}>
          {/* What's being scheduled */}
          <div style={ms.recordSummary}>
            <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{record.gymName}</span>
            <span style={{ color: '#94a3b8' }}>·</span>
            <span style={{ color: '#94a3b8' }}>{record.section}</span>
            {record.incompleteAnchors.length > 0 && (
              <span style={{ color: '#f87171', fontSize: '12px' }}>
                anchors {record.incompleteAnchors.join(', ')}
              </span>
            )}
          </div>

          {/* Top candidates */}
          <div style={ms.stepLabel}>Best available slots</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {slots.slice(0, 5).map((slot, i) => {
              const isSelected = i === selectedIdx
              const slotVal = validateMakeupAssignment(record, slot.weekNumber, slot.day, scheduleHistory)
              return (
                <button
                  key={`${slot.weekNumber}-${slot.day}`}
                  style={{
                    ...ms.shiftItem,
                    background: isSelected ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                    borderColor: isSelected ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)',
                  }}
                  onClick={() => setSelectedIdx(i)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                        {slot.day}, Week {slot.weekNumber}
                      </span>
                      {slot.sameSection && (
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                          Same Section
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontSize: '10px', color: slot.hasCapacity ? '#94a3b8' : '#f87171',
                      }}>
                        {slot.staffCount}/{slot.maxSetters} setters
                      </span>
                      {slotVal.valid ? (
                        <CheckCircle size={12} color="#10b981" />
                      ) : (
                        <AlertCircle size={12} color="#ef4444" />
                      )}
                    </div>
                  </div>
                  {slot.section && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      Current section: {slot.section}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Validation feedback */}
          {validation && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {validation.valid && validation.warnings.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#10b981', fontWeight: 600 }}>
                  <CheckCircle size={14} /> Valid assignment
                </div>
              )}
              {validation.warnings.map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#f59e0b' }}>
                  <AlertTriangle size={12} /> {w}
                </div>
              ))}
              {validation.errors.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ef4444' }}>
                  <AlertCircle size={12} /> {e}
                </div>
              ))}
            </div>
          )}

          {/* Selected slot summary */}
          {best && (
            <div style={{
              padding: '10px 12px', borderRadius: '8px',
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
              fontSize: '12px', color: '#94a3b8', lineHeight: 1.6,
            }}>
              Makeup work will be assigned to <strong style={{ color: '#e2e8f0' }}>{best.day}, Week {best.weekNumber}</strong>
              {best.existingStaff.length > 0 && (
                <> with {best.existingStaff.map(getStaffName).join(', ')}</>
              )}
              {best.staffCount > 0 && <> · Current shift has {best.staffCount} setter{best.staffCount !== 1 ? 's' : ''}</>}
            </div>
          )}
        </div>

        <div style={ms.footer}>
          <button style={ms.cancelBtn} onClick={() => { onManual(record); onClose() }}>
            Choose Different Shift
          </button>
          <button
            style={{
              ...ms.confirmBlueBtn,
              opacity: validation?.valid ? 1 : 0.5,
              cursor: validation?.valid ? 'pointer' : 'not-allowed',
            }}
            onClick={validation?.valid ? handleConfirm : undefined}
          >
            <Check size={14} /> Approve & Schedule
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Manual Schedule Modal with Live Validation
// ============================================================================

function ManualScheduleModal({ record, currentWeek, scheduleHistory, onClose, onSchedule }) {
  const [makeupWeek, setMakeupWeek] = useState(currentWeek + 1)
  const [makeupDay, setMakeupDay] = useState('Monday')
  const [makeupNotes, setMakeupNotes] = useState(
    record.incompleteAnchors.length > 0
      ? `Complete anchors ${record.incompleteAnchors.join(', ')} from Week ${record.weekNumber} ${record.day}`
      : `Makeup work from Week ${record.weekNumber} ${record.day}`
  )

  const validation = useMemo(
    () => validateMakeupAssignment(record, makeupWeek, makeupDay, scheduleHistory),
    [record, makeupWeek, makeupDay, scheduleHistory]
  )

  // Get available shifts for the gym in next 4 weeks
  const availableShifts = useMemo(() => {
    const gym = GYMS.find((g) => g.name === record.gymName)
    if (!gym) return []
    const isRope = record.shiftType === 'Rope Setting'
    const compatDays = isRope
      ? [...(gym.ropeDays || []), ...(gym.flexDays || [])]
      : [...(gym.boulderDays || []), ...(gym.flexDays || [])]

    const shifts = []
    for (let w = currentWeek; w <= currentWeek + 4; w++) {
      const sched = scheduleHistory[w] || {}
      compatDays.forEach((day) => {
        const key = `${record.gymName}-${day}`
        const shift = sched[key]
        const staffCount = shift?.assignedStaff?.length || 0
        const maxSetters = gym.maxRopeSetters || 6
        shifts.push({
          weekNumber: w, day,
          section: shift?.section || null,
          staffCount, maxSetters,
          hasCapacity: staffCount < maxSetters,
          sameSection: shift?.section === record.section,
        })
      })
    }
    return shifts
  }, [record, currentWeek, scheduleHistory])

  const handleConfirm = () => {
    if (!validation.valid) return
    markAsScheduled(record.id, makeupWeek, makeupDay, makeupNotes)
    addEditHistory(record.id, `Manually scheduled for Week ${makeupWeek} ${makeupDay}`)
    onSchedule()
    onClose()
  }

  return (
    <div style={ms.overlay} onClick={onClose}>
      <div style={{ ...ms.modal, maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div style={ms.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={18} color="#3b82f6" />
            <h2 style={ms.title}>Schedule Makeup Work</h2>
          </div>
          <button style={ms.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={ms.body}>
          <div style={ms.recordSummary}>
            <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{record.gymName}</span>
            <span style={{ color: '#94a3b8' }}>·</span>
            <span style={{ color: '#94a3b8' }}>{record.section}</span>
            {record.incompleteAnchors.length > 0 && (
              <span style={{ color: '#f87171', fontSize: '12px' }}>
                ({record.incompleteAnchors.length} anchors)
              </span>
            )}
          </div>

          {/* Available shifts quick-pick */}
          <div style={ms.stepLabel}>Select a shift</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '200px', overflowY: 'auto' }}>
            {availableShifts.map((s) => {
              const isSelected = makeupWeek === s.weekNumber && makeupDay === s.day
              return (
                <button
                  key={`${s.weekNumber}-${s.day}`}
                  style={{
                    ...ms.shiftItem,
                    background: isSelected ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                    borderColor: isSelected ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)',
                    padding: '8px 12px',
                  }}
                  onClick={() => { setMakeupWeek(s.weekNumber); setMakeupDay(s.day) }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
                        Week {s.weekNumber} · {s.day}
                      </span>
                      {s.section && (
                        <span style={{ fontSize: '10px', color: '#64748b' }}>{s.section}</span>
                      )}
                      {s.sameSection && s.section && (
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                          Match
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{
                        width: '40px', height: '6px', borderRadius: '3px',
                        background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${Math.min((s.staffCount / s.maxSetters) * 100, 100)}%`,
                          height: '100%', borderRadius: '3px',
                          background: s.hasCapacity ? '#3b82f6' : '#ef4444',
                        }} />
                      </div>
                      <span style={{ fontSize: '10px', color: s.hasCapacity ? '#94a3b8' : '#f87171', minWidth: '32px', textAlign: 'right' }}>
                        {s.staffCount}/{s.maxSetters}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Live validation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {validation.valid && validation.warnings.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#10b981', fontWeight: 600 }}>
                <CheckCircle size={14} /> Valid assignment — {validation.staffCount}/{validation.maxSetters} setters
              </div>
            )}
            {validation.valid && validation.warnings.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#10b981', fontWeight: 600 }}>
                <CheckCircle size={14} /> Valid (with warnings)
              </div>
            )}
            {!validation.valid && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>
                <AlertCircle size={14} /> Cannot assign to this shift
              </div>
            )}
            {validation.warnings.map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#f59e0b', paddingLeft: '20px' }}>
                <AlertTriangle size={10} /> {w}
              </div>
            ))}
            {validation.errors.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#ef4444', paddingLeft: '20px' }}>
                <AlertCircle size={10} /> {e}
              </div>
            ))}
          </div>

          <div style={ms.stepLabel}>Notes for makeup shift</div>
          <textarea
            style={ms.textarea}
            value={makeupNotes}
            onChange={(e) => setMakeupNotes(e.target.value)}
            rows={2}
          />
        </div>

        <div style={ms.footer}>
          <button style={ms.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{
              ...ms.confirmBlueBtn,
              opacity: validation.valid ? 1 : 0.5,
              cursor: validation.valid ? 'pointer' : 'not-allowed',
            }}
            onClick={validation.valid ? handleConfirm : undefined}
          >
            <Calendar size={14} /> Schedule Makeup
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Edit Record Modal
// ============================================================================

function EditRecordModal({ record, onClose, onSave }) {
  const [incompleteAnchors, setIncompleteAnchors] = useState([...record.incompleteAnchors])
  const [missedReason, setMissedReason] = useState(record.missedReason)
  const [missedNotes, setMissedNotes] = useState(record.missedNotes)
  const [missedBy, setMissedBy] = useState([...record.missedBy])

  const sectionAnchors = useMemo(() => {
    if (record.shiftType !== 'Rope Setting') return []
    const sec = (ROPE_SECTIONS[record.gymName] || [])
      .find((s) => s.name === record.section)
    return sec?.anchors || []
  }, [record])

  const toggleAnchor = (a) => {
    setIncompleteAnchors((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a])
  }

  const toggleSetter = (id) => {
    setMissedBy((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const handleSave = () => {
    const changes = []
    if (JSON.stringify(incompleteAnchors.sort()) !== JSON.stringify([...record.incompleteAnchors].sort())) {
      changes.push(`Anchors changed: ${record.incompleteAnchors.join(',')} → ${incompleteAnchors.join(',')}`)
    }
    if (missedReason !== record.missedReason) {
      changes.push(`Reason changed: ${record.missedReason} → ${missedReason}`)
    }
    if (missedNotes !== record.missedNotes) {
      changes.push('Notes updated')
    }
    if (JSON.stringify(missedBy.sort()) !== JSON.stringify([...record.missedBy].sort())) {
      changes.push(`Setters changed: ${record.missedBy.map(getStaffName).join(',')} → ${missedBy.map(getStaffName).join(',')}`)
    }

    updateMissedShift(record.id, {
      incompleteAnchors,
      missedReason,
      missedNotes,
      missedBy,
    })

    if (changes.length > 0) {
      addEditHistory(record.id, changes.join('; '))
    }

    onSave()
    onClose()
  }

  return (
    <div style={ms.overlay} onClick={onClose}>
      <div style={{ ...ms.modal, maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div style={ms.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Edit3 size={18} color="#3b82f6" />
            <h2 style={ms.title}>Edit Record</h2>
          </div>
          <button style={ms.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={ms.body}>
          <div style={ms.recordSummary}>
            <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{record.gymName} — {record.day}</span>
            <span style={{ color: '#94a3b8' }}>{record.section}</span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>Week {record.weekNumber}</span>
          </div>

          {/* Anchors */}
          {sectionAnchors.length > 0 && (
            <>
              <div style={ms.stepLabel}>Incomplete Anchors</div>
              <div style={ms.anchorGrid}>
                {sectionAnchors.map((a) => {
                  const sel = incompleteAnchors.includes(a)
                  return (
                    <button key={a} style={{
                      ...ms.anchorBtn,
                      background: sel ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                      borderColor: sel ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)',
                      color: sel ? '#f87171' : '#94a3b8',
                    }} onClick={() => toggleAnchor(a)}>
                      #{a} {sel && <X size={10} />}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Missed by */}
          <div style={ms.stepLabel}>Missed By</div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {STAFF.map((s) => {
              const sel = missedBy.includes(s.id)
              return (
                <button key={s.id} style={{
                  ...ms.reasonChip,
                  background: sel ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                  borderColor: sel ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)',
                  color: sel ? '#60a5fa' : '#64748b',
                  fontSize: '11px', padding: '4px 10px',
                }} onClick={() => toggleSetter(s.id)}>
                  {s.name}
                </button>
              )
            })}
          </div>

          {/* Reason */}
          <div style={ms.stepLabel}>Reason</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {Object.entries(MISSED_REASONS).map(([key, info]) => (
              <button key={key} style={{
                ...ms.reasonChip,
                background: missedReason === key ? info.bg : 'rgba(255,255,255,0.04)',
                borderColor: missedReason === key ? info.color : 'rgba(255,255,255,0.1)',
                color: missedReason === key ? info.color : '#94a3b8',
              }} onClick={() => setMissedReason(key)}>
                {info.icon} {info.label}
              </button>
            ))}
          </div>

          {/* Notes */}
          <div style={ms.stepLabel}>Notes</div>
          <textarea
            style={ms.textarea}
            value={missedNotes}
            onChange={(e) => setMissedNotes(e.target.value)}
            rows={2}
          />

          {/* Edit history */}
          {record.editHistory?.length > 0 && (
            <>
              <div style={ms.stepLabel}>Edit History</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {record.editHistory.map((h, i) => (
                  <div key={i} style={{ fontSize: '10px', color: '#475569', lineHeight: 1.4 }}>
                    {new Date(h.ts).toLocaleDateString()} — {h.change}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={ms.footer}>
          <button style={ms.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={ms.confirmBlueBtn} onClick={handleSave}>
            <Check size={14} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Missed Shift Manager (Dashboard Panel)
// ============================================================================

export default function MissedShiftManager({
  currentWeek,
  weekSchedule,
  scheduleHistory,
  onClose,
  showToast,
}) {
  const [records, setRecords] = useState(() => loadMissedShifts().records)
  const [showReport, setShowReport] = useState(false)
  const [showAutoSchedule, setShowAutoSchedule] = useState(null) // record
  const [showManualSchedule, setShowManualSchedule] = useState(null) // record
  const [showEdit, setShowEdit] = useState(null) // record
  const [filterStatus, setFilterStatus] = useState('open')
  const [sortBy, setSortBy] = useState('oldest')
  const [expandedId, setExpandedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const refreshRecords = useCallback(() => setRecords(loadMissedShifts().records), [])

  const filtered = useMemo(() => {
    let list = [...records]
    if (filterStatus !== 'all') {
      list = list.filter((r) => r.status === filterStatus)
    }
    if (sortBy === 'oldest') {
      list.sort((a, b) => new Date(a.missedDate) - new Date(b.missedDate))
    } else if (sortBy === 'gym') {
      list.sort((a, b) => a.gymName.localeCompare(b.gymName) || new Date(a.missedDate) - new Date(b.missedDate))
    } else if (sortBy === 'status') {
      const order = { open: 0, scheduled: 1, completed: 2 }
      list.sort((a, b) => (order[a.status] || 0) - (order[b.status] || 0))
    } else if (sortBy === 'age') {
      list.sort((a, b) => new Date(a.missedDate) - new Date(b.missedDate))
    }
    return list
  }, [records, filterStatus, sortBy])

  const openCount = records.filter((r) => r.status === 'open').length
  const scheduledCount = records.filter((r) => r.status === 'scheduled').length

  const handleComplete = (id) => {
    markAsCompleted(id)
    addEditHistory(id, 'Marked as completed')
    refreshRecords()
    showToast('Marked as completed', 'success')
  }

  const handleDelete = (id) => {
    removeMissedShift(id)
    refreshRecords()
    showToast('Record removed', 'info')
  }

  const handleReportDone = (entry, action) => {
    refreshRecords()
    if (action === 'auto') {
      setShowAutoSchedule(entry)
      showToast('Missed shift reported', 'info')
    } else if (action === 'manual') {
      setShowManualSchedule(entry)
      showToast('Missed shift reported', 'info')
    } else {
      showToast('Missed shift reported', 'info')
    }
  }

  const handleBatchComplete = () => {
    selectedIds.forEach((id) => {
      markAsCompleted(id)
      addEditHistory(id, 'Batch marked complete')
    })
    setSelectedIds(new Set())
    refreshRecords()
    showToast(`${selectedIds.size} records marked complete`, 'success')
  }

  const handleBatchAutoSchedule = () => {
    const openSelected = records.filter((r) => selectedIds.has(r.id) && r.status === 'open')
    let scheduled = 0
    openSelected.forEach((rec) => {
      const slots = findMakeupSlots(rec, scheduleHistory, 4)
      if (slots.length > 0 && validateMakeupAssignment(rec, slots[0].weekNumber, slots[0].day, scheduleHistory).valid) {
        const notes = rec.incompleteAnchors.length > 0
          ? `Makeup: ${rec.section} anchors ${rec.incompleteAnchors.join(', ')}`
          : `Makeup from Week ${rec.weekNumber} ${rec.day}`
        markAsScheduled(rec.id, slots[0].weekNumber, slots[0].day, notes)
        addEditHistory(rec.id, `Batch auto-scheduled for Week ${slots[0].weekNumber} ${slots[0].day}`)
        scheduled++
      }
    })
    setSelectedIds(new Set())
    refreshRecords()
    showToast(`${scheduled}/${openSelected.length} auto-scheduled`, scheduled === openSelected.length ? 'success' : 'info')
  }

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div style={ms.overlay} onClick={onClose}>
      <div style={{ ...ms.modal, maxWidth: '760px' }} onClick={(e) => e.stopPropagation()}>
        <div style={ms.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#f59e0b" />
            <h2 style={ms.title}>Missed Shifts & Incomplete Work</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              style={ms.reportBtn}
              onClick={() => setShowReport(true)}
            >
              <Plus size={14} /> Report Missed Shift
            </button>
            <button style={ms.closeBtn} onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* Stats bar */}
        <div style={ms.statsBar}>
          <div style={ms.statItem}>
            <span style={{ fontSize: '20px', fontWeight: 800, color: openCount > 0 ? '#f87171' : '#10b981' }}>
              {openCount}
            </span>
            <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Open</span>
          </div>
          <div style={ms.statItem}>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b' }}>
              {scheduledCount}
            </span>
            <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Scheduled</span>
          </div>
          <div style={ms.statItem}>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#94a3b8' }}>
              {records.length}
            </span>
            <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Total</span>
          </div>
        </div>

        {/* Batch actions */}
        {selectedIds.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px',
            background: 'rgba(59,130,246,0.06)', borderBottom: '1px solid rgba(59,130,246,0.15)',
          }}>
            <span style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 600 }}>
              {selectedIds.size} selected
            </span>
            <button style={{ ...ms.actionBtn, padding: '4px 10px', fontSize: '10px' }} onClick={handleBatchAutoSchedule}>
              <Zap size={10} /> Auto-Schedule
            </button>
            <button style={{ ...ms.actionBtn, padding: '4px 10px', fontSize: '10px', borderColor: 'rgba(16,185,129,0.3)', color: '#34d399' }} onClick={handleBatchComplete}>
              <Check size={10} /> Mark Complete
            </button>
            <button
              style={{ ...ms.actionBtn, padding: '4px 10px', fontSize: '10px', borderColor: 'rgba(255,255,255,0.1)', color: '#94a3b8', marginLeft: 'auto' }}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
        )}

        {/* Filters */}
        <div style={ms.filterBar}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { key: 'open', label: 'Open', color: '#f87171' },
              { key: 'scheduled', label: 'Scheduled', color: '#f59e0b' },
              { key: 'completed', label: 'Completed', color: '#10b981' },
              { key: 'all', label: 'All', color: '#94a3b8' },
            ].map((f) => (
              <button
                key={f.key}
                style={{
                  ...ms.filterChip,
                  background: filterStatus === f.key ? `${f.color}20` : 'rgba(255,255,255,0.03)',
                  borderColor: filterStatus === f.key ? `${f.color}60` : 'rgba(255,255,255,0.08)',
                  color: filterStatus === f.key ? f.color : '#64748b',
                }}
                onClick={() => setFilterStatus(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: 600 }}>Sort:</span>
            <select
              style={ms.sortSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="oldest">Oldest First</option>
              <option value="age">By Age</option>
              <option value="gym">By Gym</option>
              <option value="status">By Status</option>
            </select>
          </div>
        </div>

        {/* Records list */}
        <div style={ms.recordsContainer}>
          {filtered.length === 0 ? (
            <div style={ms.emptyState}>
              {filterStatus === 'open'
                ? 'No open incomplete work — great job!'
                : 'No records found for this filter.'}
            </div>
          ) : (
            filtered.map((r) => {
              const isExpanded = expandedId === r.id
              const reasonInfo = MISSED_REASONS[r.missedReason] || MISSED_REASONS.other
              const statusColors = {
                open: { bg: 'rgba(239,68,68,0.15)', color: '#f87171', label: 'Open' },
                scheduled: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', label: 'Scheduled' },
                completed: { bg: 'rgba(16,185,129,0.15)', color: '#34d399', label: 'Completed' },
              }
              const sc = statusColors[r.status] || statusColors.open
              const daysOld = getRecordAge(r)
              const ageStatus = getRecordAgeStatus(daysOld)
              const isSelected = selectedIds.has(r.id)

              return (
                <div key={r.id} style={{
                  ...ms.recordCard,
                  borderLeftColor: isSelected ? 'rgba(59,130,246,0.5)' : undefined,
                  borderLeft: isSelected ? '3px solid rgba(59,130,246,0.5)' : undefined,
                }}>
                  <div
                    style={ms.recordHeader}
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    {/* Checkbox */}
                    {r.status !== 'completed' && (
                      <button
                        style={{
                          width: '18px', height: '18px', borderRadius: '4px',
                          border: `1px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.2)'}`,
                          background: isSelected ? 'rgba(59,130,246,0.2)' : 'transparent',
                          cursor: 'pointer', flexShrink: 0, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', padding: 0,
                        }}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(r.id) }}
                      >
                        {isSelected && <Check size={10} color="#3b82f6" />}
                      </button>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                        background: sc.bg, color: sc.color, textTransform: 'uppercase', flexShrink: 0,
                      }}>
                        {sc.label}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                        {r.gymName}
                      </span>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {r.section}
                      </span>
                      {r.incompleteAnchors.length > 0 && (
                        <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>
                          {r.incompleteAnchors.length} anchor{r.incompleteAnchors.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {/* Age badge */}
                      {r.status !== 'completed' && (
                        <span style={{
                          fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                          background: `${ageStatus.color}15`, color: ageStatus.color,
                        }}>
                          {daysOld}d ago
                        </span>
                      )}
                      <span style={{ fontSize: '10px', color: '#475569' }}>
                        Wk {r.weekNumber} · {r.day.slice(0, 3)}
                      </span>
                      {isExpanded ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={ms.recordDetails}>
                      <div style={ms.detailGrid}>
                        <div style={ms.detailItem}>
                          <span style={ms.detailLabel}>Reported</span>
                          <span style={ms.detailValue}>{new Date(r.missedDate).toLocaleDateString()}</span>
                        </div>
                        <div style={ms.detailItem}>
                          <span style={ms.detailLabel}>Reason</span>
                          <span style={{ ...ms.detailValue, color: reasonInfo.color }}>
                            {reasonInfo.icon} {reasonInfo.label}
                          </span>
                        </div>
                        <div style={ms.detailItem}>
                          <span style={ms.detailLabel}>Shift Type</span>
                          <span style={ms.detailValue}>{r.shiftType}</span>
                        </div>
                        <div style={ms.detailItem}>
                          <span style={ms.detailLabel}>Assigned To</span>
                          <span style={ms.detailValue}>
                            {r.missedBy.map(getStaffName).join(', ')}
                          </span>
                        </div>
                      </div>

                      {r.incompleteAnchors.length > 0 && (
                        <div style={ms.anchorDetail}>
                          <span style={ms.detailLabel}>Incomplete Anchors</span>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                            {r.incompleteAnchors.map((a) => (
                              <span key={a} style={ms.anchorTag}>#{a}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {r.missedNotes && (
                        <div style={ms.notesBlock}>
                          <span style={ms.detailLabel}>Notes</span>
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{r.missedNotes}</span>
                        </div>
                      )}

                      {r.status === 'scheduled' && (
                        <div style={ms.makeupInfo}>
                          <Calendar size={12} color="#f59e0b" />
                          <span style={{ fontSize: '12px', color: '#fbbf24' }}>
                            Makeup: Week {r.makeupWeek}, {r.makeupDay}
                          </span>
                          {r.makeupNotes && (
                            <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>
                              — {r.makeupNotes}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Edit history */}
                      {r.editHistory?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={ms.detailLabel}>Edit History</span>
                          {r.editHistory.slice(-3).map((h, i) => (
                            <span key={i} style={{ fontSize: '10px', color: '#475569' }}>
                              {new Date(h.ts).toLocaleDateString()} — {h.change}
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={ms.recordActions}>
                        {r.status === 'open' && (
                          <>
                            <button
                              style={{ ...ms.actionBtn, background: 'rgba(59,130,246,0.1)' }}
                              onClick={() => setShowAutoSchedule(r)}
                            >
                              <Zap size={12} /> Auto-Schedule
                            </button>
                            <button
                              style={ms.actionBtn}
                              onClick={() => setShowManualSchedule(r)}
                            >
                              <Calendar size={12} /> Manual Schedule
                            </button>
                          </>
                        )}
                        {r.status === 'scheduled' && (
                          <button
                            style={ms.actionBtn}
                            onClick={() => setShowManualSchedule(r)}
                          >
                            <RotateCcw size={12} /> Reschedule
                          </button>
                        )}
                        <button
                          style={{ ...ms.actionBtn, borderColor: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}
                          onClick={() => setShowEdit(r)}
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                        {r.status !== 'completed' && (
                          <button
                            style={{ ...ms.actionBtn, borderColor: 'rgba(16,185,129,0.3)', color: '#34d399' }}
                            onClick={() => handleComplete(r.id)}
                          >
                            <Check size={12} /> Complete
                          </button>
                        )}
                        <button
                          style={{ ...ms.actionBtn, borderColor: 'rgba(239,68,68,0.2)', color: '#f87171', marginLeft: 'auto' }}
                          onClick={() => handleDelete(r.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Sub-modals */}
      {showReport && (
        <ReportModal
          weekNumber={currentWeek}
          weekSchedule={weekSchedule}
          scheduleHistory={scheduleHistory}
          onClose={() => setShowReport(false)}
          onReport={handleReportDone}
        />
      )}

      {showAutoSchedule && (
        <AutoSchedulePreview
          record={showAutoSchedule}
          scheduleHistory={scheduleHistory}
          currentWeek={currentWeek}
          onClose={() => setShowAutoSchedule(null)}
          onConfirm={(slot) => {
            refreshRecords()
            showToast(`Makeup scheduled: ${slot.day}, Week ${slot.weekNumber}`, 'success')
          }}
          onManual={(rec) => setShowManualSchedule(rec)}
        />
      )}

      {showManualSchedule && (
        <ManualScheduleModal
          record={showManualSchedule}
          currentWeek={currentWeek}
          scheduleHistory={scheduleHistory}
          onClose={() => setShowManualSchedule(null)}
          onSchedule={() => {
            refreshRecords()
            showToast('Makeup work scheduled', 'success')
          }}
        />
      )}

      {showEdit && (
        <EditRecordModal
          record={showEdit}
          onClose={() => setShowEdit(null)}
          onSave={() => {
            refreshRecords()
            showToast('Record updated', 'success')
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// Inline Report Modal (for ShiftModal integration)
// ============================================================================

export function InlineReportButton({ gymName, day, weekNumber, shift, showToast }) {
  const [showModal, setShowModal] = useState(false)
  const [missedAnchors, setMissedAnchors] = useState([])
  const [missedReason, setMissedReason] = useState('sick')
  const [missedNotes, setMissedNotes] = useState('')

  if (!shift || !shift.assignedStaff?.length) return null

  const sectionAnchors = shift.shiftType === 'Rope Setting'
    ? ((ROPE_SECTIONS[gymName] || []).find((s) => s.name === shift.section)?.anchors || [])
    : []

  const toggleAnchor = (a) => {
    setMissedAnchors((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a])
  }

  const handleSubmit = () => {
    addMissedShift({
      weekNumber,
      day,
      gymName,
      section: shift.section || '(no section)',
      shiftType: shift.shiftType,
      incompleteAnchors: missedAnchors,
      missedBy: shift.assignedStaff,
      missedReason,
      missedNotes,
    })
    setShowModal(false)
    setMissedAnchors([])
    setMissedNotes('')
    if (showToast) showToast('Shift reported as incomplete', 'info')
  }

  return (
    <>
      <button style={ms.inlineReportBtn} onClick={() => setShowModal(true)}>
        <AlertTriangle size={12} /> Report Incomplete
      </button>

      {showModal && (
        <div style={ms.overlay} onClick={() => setShowModal(false)}>
          <div style={{ ...ms.modal, maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div style={ms.header}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={18} color="#f59e0b" />
                <h2 style={{ ...ms.title, fontSize: '16px' }}>Report Incomplete</h2>
              </div>
              <button style={ms.closeBtn} onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div style={ms.body}>
              <div style={ms.recordSummary}>
                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{gymName} — {day}</span>
                <span style={{ color: '#94a3b8' }}>{shift.section}</span>
              </div>

              {sectionAnchors.length > 0 && (
                <>
                  <div style={ms.stepLabel}>Incomplete anchors</div>
                  <div style={ms.anchorGrid}>
                    {sectionAnchors.map((a) => {
                      const sel = missedAnchors.includes(a)
                      return (
                        <button key={a} style={{
                          ...ms.anchorBtn,
                          background: sel ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                          borderColor: sel ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)',
                          color: sel ? '#f87171' : '#94a3b8',
                        }} onClick={() => toggleAnchor(a)}>
                          #{a}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              <div style={ms.stepLabel}>Reason</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {Object.entries(MISSED_REASONS).map(([k, info]) => (
                  <button key={k} style={{
                    ...ms.reasonChip,
                    background: missedReason === k ? info.bg : 'rgba(255,255,255,0.04)',
                    borderColor: missedReason === k ? info.color : 'rgba(255,255,255,0.1)',
                    color: missedReason === k ? info.color : '#94a3b8',
                  }} onClick={() => setMissedReason(k)}>
                    {info.icon} {info.label}
                  </button>
                ))}
              </div>

              <textarea
                style={ms.textarea}
                value={missedNotes}
                onChange={(e) => setMissedNotes(e.target.value)}
                placeholder="Notes (optional)..."
                rows={2}
              />
            </div>
            <div style={ms.footer}>
              <button style={ms.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
              <button style={ms.confirmBtn} onClick={handleSubmit}>
                <AlertTriangle size={14} /> Mark Incomplete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================================
// Styles
// ============================================================================

const ms = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1200, padding: '16px',
    animation: 'modalFadeIn 0.2s ease-out',
  },
  modal: {
    background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
    width: '100%', maxWidth: '600px', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
    animation: 'modalSlideIn 0.25s ease-out', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
  },
  title: {
    margin: 0, fontSize: '18px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.2px',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px', color: '#94a3b8', padding: '8px', cursor: 'pointer',
    display: 'flex', alignItems: 'center',
  },
  body: {
    padding: '18px 20px', overflowY: 'auto', flex: 1,
    display: 'flex', flexDirection: 'column', gap: '14px',
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: '10px',
    padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  cancelBtn: {
    padding: '9px 18px', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
    color: '#94a3b8', fontSize: '13px', fontWeight: 600, cursor: 'pointer', minHeight: '38px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  confirmBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '9px 20px', borderRadius: '10px', border: 'none',
    background: 'rgba(245,158,11,0.9)', color: '#fff',
    fontSize: '13px', fontWeight: 700, cursor: 'pointer', minHeight: '38px',
    boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
  },
  confirmBlueBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '9px 20px', borderRadius: '10px', border: 'none',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
    fontSize: '13px', fontWeight: 700, cursor: 'pointer', minHeight: '38px',
    boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
  },
  reportBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '7px 14px', borderRadius: '8px',
    border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)',
    color: '#f59e0b', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  },
  stepLabel: {
    fontSize: '12px', fontWeight: 700, color: '#cbd5e1',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  shiftList: {
    display: 'flex', flexDirection: 'column', gap: '4px',
    maxHeight: '220px', overflowY: 'auto',
  },
  shiftItem: {
    padding: '10px 12px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer', textAlign: 'left',
  },
  anchorGrid: {
    display: 'flex', gap: '6px', flexWrap: 'wrap',
  },
  anchorBtn: {
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '6px 12px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer', fontSize: '13px', fontWeight: 600, minHeight: '34px',
  },
  selectAllBtn: {
    padding: '5px 10px', borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
    color: '#94a3b8', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
    alignSelf: 'flex-start',
  },
  reasonChip: {
    padding: '6px 12px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
  },
  textarea: {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
    color: '#e2e8f0', padding: '10px 12px', fontSize: '13px',
    fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
  },
  emptyNote: {
    fontSize: '13px', color: '#475569', fontStyle: 'italic', padding: '12px 0',
  },
  statsBar: {
    display: 'flex', gap: '2px', padding: '0 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  statItem: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
    padding: '12px 20px', flex: 1,
  },
  filterBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
    flexWrap: 'wrap', gap: '8px',
  },
  filterChip: {
    padding: '4px 10px', borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer', fontSize: '11px', fontWeight: 600,
  },
  sortSelect: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px', color: '#e2e8f0', padding: '4px 8px',
    fontSize: '11px', fontFamily: 'inherit', colorScheme: 'dark',
  },
  recordsContainer: {
    flex: 1, overflowY: 'auto', padding: '12px 20px', minHeight: 0,
    display: 'flex', flexDirection: 'column', gap: '6px',
  },
  emptyState: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '40px 20px', fontSize: '14px', color: '#475569', fontStyle: 'italic',
  },
  recordCard: {
    borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)', overflow: 'hidden',
  },
  recordHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', cursor: 'pointer', gap: '8px',
  },
  recordDetails: {
    padding: '0 14px 14px',
    borderTop: '1px solid rgba(255,255,255,0.04)',
    display: 'flex', flexDirection: 'column', gap: '10px',
    paddingTop: '10px',
  },
  detailGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px',
  },
  detailItem: {
    display: 'flex', flexDirection: 'column', gap: '2px',
  },
  detailLabel: {
    fontSize: '10px', fontWeight: 700, color: '#475569',
    textTransform: 'uppercase', letterSpacing: '0.3px',
  },
  detailValue: {
    fontSize: '12px', color: '#e2e8f0',
  },
  anchorDetail: {
    padding: '8px 0',
  },
  anchorTag: {
    fontSize: '11px', fontWeight: 700, padding: '2px 8px',
    borderRadius: '4px', background: 'rgba(245,158,11,0.15)',
    color: '#fbbf24',
  },
  notesBlock: {
    display: 'flex', flexDirection: 'column', gap: '4px',
  },
  makeupInfo: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '8px 10px', borderRadius: '6px',
    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
  },
  recordActions: {
    display: 'flex', gap: '6px', paddingTop: '6px', flexWrap: 'wrap',
    borderTop: '1px solid rgba(255,255,255,0.04)',
  },
  actionBtn: {
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '5px 10px', borderRadius: '6px',
    border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)',
    color: '#60a5fa', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
  },
  recordSummary: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '10px 12px', borderRadius: '8px',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    fontSize: '13px',
  },
  adjBtn: {
    width: '32px', height: '32px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)',
    color: '#e2e8f0', fontSize: '16px', fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  inlineReportBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '8px 14px', borderRadius: '8px',
    border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)',
    color: '#f59e0b', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
    minHeight: '36px',
  },
}
