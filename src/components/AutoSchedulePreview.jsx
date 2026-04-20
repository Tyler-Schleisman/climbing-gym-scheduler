import { useMemo } from 'react'
import {
  Sparkles, X, Check, AlertTriangle, Users, Pencil,
  ArrowRight, Plus, Minus, RefreshCw, Lightbulb, BarChart3,
  CheckCircle, XCircle,
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

function diffShifts(currentShift, proposedShift) {
  if (!currentShift && !proposedShift) return 'unchanged'
  if (!currentShift && proposedShift) return 'new'
  if (currentShift && !proposedShift) return 'removed'

  const curStaff = new Set(currentShift.assignedStaff || [])
  const proStaff = new Set(proposedShift.assignedStaff || [])
  const sameSection = currentShift.section === proposedShift.section
  const sameType = currentShift.shiftType === proposedShift.shiftType
  const sameStaff = curStaff.size === proStaff.size &&
    [...curStaff].every((id) => proStaff.has(id))

  if (sameSection && sameType && sameStaff) return 'unchanged'
  return 'modified'
}

function getChangeColor(type) {
  switch (type) {
    case 'new': return { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', text: '#10b981' }
    case 'modified': return { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', text: '#3b82f6' }
    case 'removed': return { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', text: '#ef4444' }
    default: return { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', text: '#64748b' }
  }
}

function getChangeLabel(type) {
  switch (type) {
    case 'new': return 'NEW'
    case 'modified': return 'CHANGED'
    case 'removed': return 'REMOVED'
    default: return null
  }
}

function StaffChip({ id, isNew, isRemoved }) {
  const badge = getRoleBadge(id)
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      fontSize: '11px',
      padding: '2px 6px',
      borderRadius: '4px',
      background: isNew ? 'rgba(16,185,129,0.15)' : isRemoved ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
      color: isNew ? '#10b981' : isRemoved ? '#f87171' : '#cbd5e1',
      border: `1px solid ${isNew ? 'rgba(16,185,129,0.3)' : isRemoved ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
    }}>
      {isNew && <Plus size={9} />}
      {isRemoved && <Minus size={9} />}
      {badge && (
        <span style={{
          fontSize: '8px', fontWeight: 700, padding: '0 3px',
          borderRadius: '2px', background: badge.bg, color: badge.color,
        }}>{badge.label}</span>
      )}
      {getStaffName(id)}
    </span>
  )
}

function ShiftCompare({ shiftKey, currentShift, proposedShift, changeType, onAdjust }) {
  const colors = getChangeColor(changeType)
  const label = getChangeLabel(changeType)
  const shift = proposedShift || currentShift

  const curIds = new Set(currentShift?.assignedStaff || [])
  const proIds = new Set(proposedShift?.assignedStaff || [])
  const addedIds = [...proIds].filter((id) => !curIds.has(id))
  const removedIds = [...curIds].filter((id) => !proIds.has(id))
  const keptIds = [...proIds].filter((id) => curIds.has(id))

  if (changeType === 'unchanged') return null

  // Parse shiftKey into readable label
  const idx = shiftKey.lastIndexOf('-')
  const gymName = shiftKey.slice(0, idx)
  const day = shiftKey.slice(idx + 1)

  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '8px',
      background: colors.bg,
      borderLeft: `3px solid ${colors.border}`,
      marginBottom: '6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>
            {gymName}
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{day}</span>
          {label && (
            <span style={{
              fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px',
              background: colors.border, color: '#fff', letterSpacing: '0.5px',
            }}>{label}</span>
          )}
        </div>
        {onAdjust && (
          <button
            onClick={() => onAdjust(shiftKey)}
            style={styles.adjustBtn}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            <Pencil size={11} /> Adjust
          </button>
        )}
      </div>

      {shift && (
        <>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
            {shift.shiftType}
            {shift.section && <span style={{ color: '#e2e8f0', fontWeight: 600 }}> — {shift.section}</span>}
            {shift.additionalSections?.length > 0 && (
              <span style={{ color: '#a78bfa', fontWeight: 600 }}>
                {' '}+ {shift.additionalSections.map((s) => s.section).join(', ')}
              </span>
            )}
            {shift.multiDayProgress && (
              <span style={{ color: '#8b5cf6' }}> (Day {shift.multiDayProgress.day}/{shift.multiDayProgress.total})</span>
            )}
          </div>

          {/* Before/After comparison for modified shifts */}
          {changeType === 'modified' && currentShift && proposedShift && (
            <div style={styles.compareRow}>
              <div style={styles.compareSide}>
                <span style={styles.compareLabel}>Before</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  {(currentShift.assignedStaff || []).map((id) => (
                    <span key={id} style={{
                      fontSize: '10px', padding: '1px 5px', borderRadius: '3px',
                      background: proIds.has(id) ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.15)',
                      color: proIds.has(id) ? '#94a3b8' : '#f87171',
                      textDecoration: proIds.has(id) ? 'none' : 'line-through',
                    }}>{getStaffName(id)}</span>
                  ))}
                </div>
              </div>
              <ArrowRight size={14} color="#475569" style={{ flexShrink: 0, marginTop: '14px' }} />
              <div style={styles.compareSide}>
                <span style={{ ...styles.compareLabel, color: '#3b82f6' }}>After</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  {keptIds.map((id) => <StaffChip key={id} id={id} />)}
                  {addedIds.map((id) => <StaffChip key={id} id={id} isNew />)}
                </div>
              </div>
            </div>
          )}

          {/* Simple staff list for new/removed shifts */}
          {changeType !== 'modified' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {keptIds.map((id) => <StaffChip key={id} id={id} />)}
              {addedIds.map((id) => <StaffChip key={id} id={id} isNew />)}
              {removedIds.map((id) => <StaffChip key={id} id={id} isRemoved />)}
            </div>
          )}

          {/* Hold washer indicator */}
          {proposedShift?.holdWasher && (
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
              Hold washer: <span style={{ color: '#cbd5e1' }}>{getStaffName(proposedShift.holdWasher)}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function AutoSchedulePreview({
  proposedSchedule,
  currentSchedule,
  weekNumber,
  warnings,
  capacityAnalysis,
  suggestions,
  success,
  message,
  options,
  onApply,
  onCancel,
  onAdjust,
}) {
  // Compute all shift keys (union of current and proposed)
  const allKeys = useMemo(() => {
    const keys = new Set([
      ...Object.keys(currentSchedule || {}),
      ...Object.keys(proposedSchedule || {}),
    ])
    return [...keys].sort((a, b) => {
      const [aGym, aDay] = [a.slice(0, a.lastIndexOf('-')), a.slice(a.lastIndexOf('-') + 1)]
      const [bGym, bDay] = [b.slice(0, b.lastIndexOf('-')), b.slice(b.lastIndexOf('-') + 1)]
      const gymOrder = GYMS.findIndex((g) => g.name === aGym) - GYMS.findIndex((g) => g.name === bGym)
      if (gymOrder !== 0) return gymOrder
      return DAYS.indexOf(aDay) - DAYS.indexOf(bDay)
    })
  }, [currentSchedule, proposedSchedule])

  // Build change list
  const changes = useMemo(() => {
    return allKeys.map((key) => ({
      key,
      current: currentSchedule?.[key] || null,
      proposed: proposedSchedule?.[key] || null,
      changeType: diffShifts(currentSchedule?.[key], proposedSchedule?.[key]),
    }))
  }, [allKeys, currentSchedule, proposedSchedule])

  const changedShifts = changes.filter((c) => c.changeType !== 'unchanged')
  const newCount = changes.filter((c) => c.changeType === 'new').length
  const modifiedCount = changes.filter((c) => c.changeType === 'modified').length
  const removedCount = changes.filter((c) => c.changeType === 'removed').length

  // Proposed schedule violations
  const proposedViolations = useMemo(
    () => validateSchedule(proposedSchedule || {}, weekNumber),
    [proposedSchedule, weekNumber]
  )
  const errorCount = proposedViolations.filter((v) => v.severity === 'error').length
  const warningCount = proposedViolations.filter((v) => v.severity === 'warning').length

  // Workload summary
  const workload = useMemo(
    () => analyzeWeeklyAssignments(proposedSchedule || {}),
    [proposedSchedule]
  )
  const activeSetters = STAFF
    .map((s) => workload[s.id])
    .filter((s) => s.totalShifts > 0)
    .sort((a, b) => b.totalShifts - a.totalShifts)

  const totalShifts = Object.keys(proposedSchedule || {}).length
  const uniqueSetters = new Set(
    Object.values(proposedSchedule || {}).flatMap((s) => s.assignedStaff || [])
  ).size

  return (
    <>
      {/* Modal animation keyframes */}
      <style>{`
        @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInModal { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

      <div style={styles.overlay} onClick={onCancel}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={styles.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={styles.sparkleIcon}>
                <Sparkles size={18} color="#10b981" />
              </div>
              <div>
                <h2 style={styles.title}>Auto-Schedule Preview</h2>
                <p style={styles.subtitle}>Week {weekNumber}</p>
              </div>
            </div>
            <button
              style={styles.closeBtn}
              onClick={onCancel}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            >
              <X size={18} />
            </button>
          </div>

          {/* Status banner */}
          <div style={{
            ...styles.statusBanner,
            background: success ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
            borderColor: success ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
          }}>
            {success
              ? <Check size={16} color="#10b981" />
              : <AlertTriangle size={16} color="#f59e0b" />}
            <span style={{ fontSize: '13px', color: success ? '#10b981' : '#fbbf24', flex: 1 }}>
              {message}
            </span>
          </div>

          {/* Summary stats */}
          <div style={styles.statsRow}>
            {[
              { value: totalShifts, label: 'Shifts', color: '#e2e8f0' },
              { value: uniqueSetters, label: 'Setters', color: '#e2e8f0' },
              { value: newCount, label: 'New', color: newCount > 0 ? '#10b981' : '#475569' },
              { value: modifiedCount, label: 'Changed', color: modifiedCount > 0 ? '#3b82f6' : '#475569' },
              { value: errorCount, label: 'Errors', color: errorCount > 0 ? '#ef4444' : '#10b981' },
              { value: warningCount, label: 'Warnings', color: warningCount > 0 ? '#f59e0b' : '#475569' },
            ].map((s) => (
              <div key={s.label} style={styles.stat}>
                <span style={{ ...styles.statValue, color: s.color }}>{s.value}</span>
                <span style={styles.statLabel}>{s.label}</span>
              </div>
            ))}
          </div>

          <div style={styles.scrollBody}>
            {/* Changes */}
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <RefreshCw size={14} color="#3b82f6" />
                <span>Changes ({changedShifts.length})</span>
              </div>
              {changedShifts.length === 0 ? (
                <div style={styles.empty}>No changes from current schedule</div>
              ) : (
                changedShifts.map((c) => (
                  <ShiftCompare
                    key={c.key}
                    shiftKey={c.key}
                    currentShift={c.current}
                    proposedShift={c.proposed}
                    changeType={c.changeType}
                    onAdjust={onAdjust}
                  />
                ))
              )}
            </div>

            {/* Workload distribution */}
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <Users size={14} color="#8b5cf6" />
                <span>Workload Distribution</span>
              </div>
              <div style={styles.workloadGrid}>
                {activeSetters.map((s) => {
                  const maxShifts = 5
                  const pct = Math.min((s.totalShifts / maxShifts) * 100, 100)
                  const barColor = s.totalShifts >= 5 ? '#ef4444' : s.totalShifts >= 4 ? '#f59e0b' : '#3b82f6'
                  const badge = getRoleBadge(s.id)
                  return (
                    <div key={s.id} style={styles.workloadRow}>
                      <div style={styles.workloadName}>
                        {badge && (
                          <span style={{
                            fontSize: '8px', fontWeight: 700, padding: '1px 3px', borderRadius: '2px',
                            background: badge.bg, color: badge.color,
                          }}>{badge.label}</span>
                        )}
                        <span style={{ fontSize: '11px', color: '#e2e8f0' }}>{s.name}</span>
                      </div>
                      <div style={styles.workloadBar}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: barColor, transition: 'width 0.4s ease-out' }} />
                      </div>
                      <div style={styles.workloadStats}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: barColor }}>{s.totalShifts}</span>
                        <span style={{ fontSize: '9px', color: '#64748b' }}>
                          B{s.boulderShifts} H{s.hardSections} W{s.washShifts}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Capacity Analysis */}
            {capacityAnalysis && capacityAnalysis.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <BarChart3 size={14} color="#8b5cf6" />
                  <span>Capacity Analysis</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {capacityAnalysis.map((ca) => {
                    const allAssigned = ca.unassigned.length === 0
                    return (
                      <div key={ca.day} style={{
                        padding: '8px 12px', borderRadius: '8px',
                        background: allAssigned ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                        border: `1px solid ${allAssigned ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {allAssigned
                              ? <CheckCircle size={12} color="#10b981" />
                              : <XCircle size={12} color="#ef4444" />}
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>{ca.day}</span>
                          </div>
                          <span style={{
                            fontSize: '11px', fontWeight: 600,
                            color: allAssigned ? '#10b981' : '#f87171',
                          }}>
                            {ca.assigned}/{ca.available} assigned
                            {allAssigned ? ' ✓' : ` — ${ca.unassigned.length} unplaced`}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: ca.unassigned.length > 0 ? '6px' : 0 }}>
                          {ca.gymSlots.map((gs) => (
                            <span key={gs.gym} style={{
                              fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                              background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
                              border: '1px solid rgba(255,255,255,0.08)',
                            }}>
                              {gs.gym}: {gs.count}{gs.shiftType ? ` (${gs.shiftType.replace(' Setting', '')})` : ''}{gs.flexWashCount > 0 ? ` +${gs.flexWashCount} wash` : ''}
                            </span>
                          ))}
                        </div>
                        {ca.unassigned.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {ca.unassigned.map((u) => (
                              <div key={u.name} style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                fontSize: '11px', color: '#f87171',
                              }}>
                                <XCircle size={10} style={{ flexShrink: 0 }} />
                                <span>{u.name}</span>
                                <span style={{ color: '#64748b', fontSize: '10px' }}>— {u.reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Violations (excluding unassigned-setter errors shown in capacity analysis) */}
            {(() => {
              const filteredViolations = proposedViolations.filter((v) => !v.day)
              if (filteredViolations.length === 0) return null
              const filteredErrorCount = filteredViolations.filter((v) => v.severity === 'error').length
              return (
                <div style={styles.section}>
                  <div style={styles.sectionHeader}>
                    <AlertTriangle size={14} color={filteredErrorCount > 0 ? '#ef4444' : '#f59e0b'} />
                    <span>Remaining Violations ({filteredViolations.length})</span>
                  </div>
                  <div style={styles.violationList}>
                    {filteredViolations.map((v, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '8px',
                        padding: '5px 8px', fontSize: '12px', borderRadius: '4px',
                        background: v.severity === 'error' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
                        color: v.severity === 'error' ? '#f87171' : '#fbbf24',
                      }}>
                        <div style={{
                          width: '6px', height: '6px', borderRadius: '50%', marginTop: '5px', flexShrink: 0,
                          background: v.severity === 'error' ? '#ef4444' : '#f59e0b',
                        }} />
                        <span style={{ flex: 1 }}>{v.message}</span>
                        {v.shiftKey && <span style={{ color: '#475569', fontFamily: 'monospace', fontSize: '10px', flexShrink: 0 }}>{v.shiftKey}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Suggestions */}
            {suggestions && suggestions.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <Lightbulb size={14} color="#f59e0b" />
                  <span>Suggestions</span>
                </div>
                <div style={styles.suggestionList}>
                  {suggestions.map((s, i) => (
                    <div key={i} style={styles.suggestionItem}>
                      <ArrowRight size={10} color="#f59e0b" style={{ flexShrink: 0, marginTop: '3px' }} />
                      <span style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.4 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <button
              style={styles.cancelBtn}
              onClick={onCancel}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            >
              Cancel
            </button>
            <button
              style={styles.applyBtn}
              onClick={onApply}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <Check size={16} />
              Apply All
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

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
    animation: 'fadeInOverlay 0.15s ease-out',
  },
  modal: {
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.1)',
    width: '100%',
    maxWidth: '780px',
    maxHeight: '92vh',
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
  sparkleIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { margin: 0, fontSize: '18px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.2px' },
  subtitle: { margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' },
  closeBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#94a3b8', padding: '6px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.1s',
  },
  statusBanner: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 24px', border: '1px solid', borderLeft: 'none', borderRight: 'none',
    flexShrink: 0,
  },
  statsRow: {
    display: 'flex', gap: '4px', padding: '12px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
  },
  stat: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '8px 6px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)',
  },
  statValue: { fontSize: '20px', fontWeight: 800, color: '#e2e8f0', lineHeight: 1 },
  statLabel: { fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' },
  scrollBody: {
    overflowY: 'auto', flex: 1,
  },
  section: {
    padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  sectionHeader: {
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '12px', fontWeight: 700, color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
  },
  empty: { fontSize: '12px', color: '#475569', fontStyle: 'italic', padding: '8px 0' },
  adjustBtn: {
    display: 'flex', alignItems: 'center', gap: '4px',
    fontSize: '10px', fontWeight: 600, color: '#94a3b8',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '4px', padding: '3px 8px', cursor: 'pointer',
    transition: 'background 0.1s',
  },
  compareRow: {
    display: 'flex', alignItems: 'flex-start', gap: '10px',
    padding: '6px 0',
  },
  compareSide: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0,
  },
  compareLabel: {
    fontSize: '9px', fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  workloadGrid: { display: 'flex', flexDirection: 'column', gap: '4px' },
  workloadRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  workloadName: { width: '90px', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 },
  workloadBar: {
    flex: 1, height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
  },
  workloadStats: {
    width: '60px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0,
  },
  violationList: { display: 'flex', flexDirection: 'column', gap: '4px' },
  suggestionList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  suggestionItem: { display: 'flex', gap: '8px', alignItems: 'flex-start' },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px',
    padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
    position: 'sticky', bottom: 0, background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(12px)',
  },
  cancelBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '10px', color: '#94a3b8', padding: '9px 20px', cursor: 'pointer',
    fontSize: '13px', fontWeight: 600, transition: 'background 0.1s', minHeight: '40px',
  },
  applyBtn: {
    display: 'flex', alignItems: 'center', gap: '8px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    border: 'none', borderRadius: '10px', color: '#fff', padding: '9px 24px',
    cursor: 'pointer', fontSize: '14px', fontWeight: 700, transition: 'opacity 0.15s',
    minHeight: '40px', boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
  },
}
