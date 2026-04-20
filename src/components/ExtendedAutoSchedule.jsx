import { useState, useMemo } from 'react'
import {
  Calendar, X, Sparkles, Loader, Clock, ChevronRight,
  BarChart3, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { GYMS } from '../data/gyms'
import { STAFF } from '../data/staff'
import { computeRotationTracking, getRotationStatus } from '../utils/analytics'

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

function getWeekMonday(weekNumber) {
  const baseDate = new Date(2025, 0, 6)
  const d = new Date(baseDate)
  d.setDate(d.getDate() + weekNumber * 7)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const QUICK_OPTIONS = [
  { label: 'Next 2 Weeks', weeks: 2 },
  { label: 'Next 4 Weeks', weeks: 4 },
  { label: 'Next Month', weeks: 4 },
  { label: 'Custom Range', weeks: null },
]

export default function ExtendedAutoSchedule({
  currentWeek,
  scheduleHistory,
  options,
  onSchedule,
  onClose,
  loading,
  progress,
}) {
  const [mode, setMode] = useState(null) // null = picking, 'custom' = custom range
  const [startWeek, setStartWeek] = useState(currentWeek)
  const [endWeek, setEndWeek] = useState(currentWeek + 3)

  // Extended options
  const [rotateGyms, setRotateGyms] = useState(true)
  const [staggerHardSections, setStaggerHardSections] = useState(true)
  const [balanceWorkload, setBalanceWorkload] = useState(true)
  const [respectVacations, setRespectVacations] = useState(true)

  const weekCount = endWeek - startWeek + 1

  // Compute which sections will need reset in the period
  const rotationPreview = useMemo(() => {
    const tracking = computeRotationTracking(scheduleHistory, startWeek - 1)
    const status = getRotationStatus(tracking, startWeek)
    const resets = []

    status.forEach((entry) => {
      if (entry.weeksSinceReset == null) {
        resets.push({ ...entry, resetWeek: startWeek, reason: 'never set' })
        return
      }
      const weeksUntilDue = entry.rotationGoal - entry.weeksSinceReset
      if (weeksUntilDue <= weekCount) {
        const resetWeek = startWeek + Math.max(0, weeksUntilDue)
        resets.push({ ...entry, resetWeek, reason: weeksUntilDue <= 0 ? 'overdue' : 'due soon' })
      }
    })

    return resets.sort((a, b) => a.resetWeek - b.resetWeek)
  }, [scheduleHistory, startWeek, weekCount])

  const handleQuickSelect = (opt) => {
    if (opt.weeks === null) {
      setMode('custom')
      return
    }
    setStartWeek(currentWeek)
    setEndWeek(currentWeek + opt.weeks - 1)
    setMode('confirm')
  }

  const handleCustomConfirm = () => {
    if (startWeek > endWeek) return
    setMode('confirm')
  }

  const handleLaunch = () => {
    onSchedule(startWeek, endWeek, {
      ...options,
      rotateGyms,
      staggerHardSections,
      trackCumulativeWorkload: balanceWorkload,
      respectVacations,
    })
  }

  return (
    <>
      <style>{`
        @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInModal { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={styles.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={styles.iconWrap}>
                <Calendar size={18} color="#8b5cf6" />
              </div>
              <div>
                <h2 style={styles.title}>Extended Auto-Schedule</h2>
                <p style={styles.subtitle}>Schedule multiple weeks at once</p>
              </div>
            </div>
            <button style={styles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div style={styles.scrollBody}>
            {/* Loading state */}
            {loading && (
              <div style={styles.loadingSection}>
                <div style={styles.loadingContent}>
                  <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: '#8b5cf6' }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>
                      Scheduling {weekCount} weeks...
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {progress ? `Week ${progress.current} of ${progress.total}` : 'Initializing...'}
                    </div>
                  </div>
                </div>
                {progress && (
                  <div style={styles.progressBar}>
                    <div style={{
                      ...styles.progressFill,
                      width: `${(progress.current / progress.total) * 100}%`,
                    }} />
                  </div>
                )}
              </div>
            )}

            {/* Step 1: Quick options */}
            {!mode && !loading && (
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <Clock size={14} color="#8b5cf6" />
                  <span>Select Range</span>
                </div>
                <div style={styles.quickGrid}>
                  {QUICK_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      style={styles.quickBtn}
                      onClick={() => handleQuickSelect(opt)}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#8b5cf6')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                    >
                      <span style={styles.quickLabel}>{opt.label}</span>
                      {opt.weeks && (
                        <span style={styles.quickDesc}>
                          Week {currentWeek} — {currentWeek + opt.weeks - 1}
                          <br />
                          {getWeekDateRange(currentWeek)} to {getWeekMonday(currentWeek + opt.weeks - 1)}
                        </span>
                      )}
                      {!opt.weeks && (
                        <span style={styles.quickDesc}>Choose your own start and end weeks</span>
                      )}
                      <ChevronRight size={14} style={{ color: '#64748b', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1b: Custom range */}
            {mode === 'custom' && !loading && (
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <Calendar size={14} color="#8b5cf6" />
                  <span>Custom Range</span>
                </div>
                <div style={styles.rangeInputs}>
                  <div style={styles.inputGroup}>
                    <label style={styles.inputLabel}>Start Week</label>
                    <input
                      type="number"
                      min={0}
                      value={startWeek}
                      onChange={(e) => setStartWeek(Math.max(0, parseInt(e.target.value) || 0))}
                      style={styles.input}
                    />
                    <span style={styles.inputHint}>{getWeekDateRange(startWeek)}</span>
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.inputLabel}>End Week</label>
                    <input
                      type="number"
                      min={startWeek}
                      value={endWeek}
                      onChange={(e) => setEndWeek(Math.max(startWeek, parseInt(e.target.value) || startWeek))}
                      style={styles.input}
                    />
                    <span style={styles.inputHint}>{getWeekDateRange(endWeek)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button style={styles.backBtn} onClick={() => setMode(null)}>Back</button>
                  <button
                    style={{
                      ...styles.confirmBtn,
                      opacity: startWeek > endWeek ? 0.5 : 1,
                      cursor: startWeek > endWeek ? 'not-allowed' : 'pointer',
                    }}
                    onClick={handleCustomConfirm}
                    disabled={startWeek > endWeek}
                  >
                    Continue ({weekCount} weeks)
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Confirm & options */}
            {mode === 'confirm' && !loading && (
              <>
                {/* Summary */}
                <div style={styles.summaryBanner}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Calendar size={16} color="#8b5cf6" />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>
                        {weekCount} weeks — Week {startWeek} through Week {endWeek}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                        {getWeekDateRange(startWeek)} to {getWeekDateRange(endWeek)}
                      </div>
                    </div>
                  </div>
                  <button style={styles.changeBtn} onClick={() => setMode(null)}>Change</button>
                </div>

                {/* Optimization options */}
                <div style={styles.section}>
                  <div style={styles.sectionHeader}>
                    <Sparkles size={14} color="#10b981" />
                    <span>Optimization Settings</span>
                  </div>
                  <div style={styles.optionsList}>
                    {[
                      { label: 'Rotate setters through different gyms', desc: 'Minimize same-gym assignments across weeks', checked: rotateGyms, onChange: setRotateGyms },
                      { label: 'Stagger hard sections', desc: 'Avoid giving any setter hard sections in consecutive weeks', checked: staggerHardSections, onChange: setStaggerHardSections },
                      { label: 'Balance workload across period', desc: 'Target 8-12 shifts per setter per month', checked: balanceWorkload, onChange: setBalanceWorkload },
                      { label: 'Respect vacations & sick days', desc: 'Skip absent setters when scheduling', checked: respectVacations, onChange: setRespectVacations },
                    ].map((opt) => (
                      <label key={opt.label} style={styles.optionRow}>
                        <input
                          type="checkbox"
                          checked={opt.checked}
                          onChange={(e) => opt.onChange(e.target.checked)}
                          style={styles.checkbox}
                        />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{opt.label}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{opt.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Rotation preview */}
                {rotationPreview.length > 0 && (
                  <div style={styles.section}>
                    <div style={styles.sectionHeader}>
                      <RefreshCw size={14} color="#f59e0b" />
                      <span>Section Resets in Period ({rotationPreview.length})</span>
                    </div>
                    <div style={styles.resetList}>
                      {rotationPreview.slice(0, 15).map((entry, i) => (
                        <div key={i} style={styles.resetRow}>
                          <span style={{
                            ...styles.resetBadge,
                            background: entry.reason === 'overdue' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                            color: entry.reason === 'overdue' ? '#f87171' : '#fbbf24',
                          }}>
                            {entry.reason === 'overdue' ? 'OVERDUE' : entry.reason === 'never set' ? 'NEW' : 'DUE'}
                          </span>
                          <span style={{ fontSize: '12px', color: '#e2e8f0', flex: 1 }}>
                            {entry.gymName} — {entry.sectionName}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {entry.type} · Week {entry.resetWeek}
                          </span>
                        </div>
                      ))}
                      {rotationPreview.length > 15 && (
                        <div style={{ fontSize: '11px', color: '#64748b', padding: '4px 0' }}>
                          ...and {rotationPreview.length - 15} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Staffing warnings */}
                <div style={styles.section}>
                  <div style={styles.sectionHeader}>
                    <BarChart3 size={14} color="#3b82f6" />
                    <span>Staffing Overview</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                    <div>{STAFF.length} setters available across {GYMS.length} gyms</div>
                    <div>Target: ~{Math.round(weekCount * 3)} shifts per setter over {weekCount} weeks</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <button style={styles.cancelBtn} onClick={onClose}>
              {loading ? 'Cancel' : 'Close'}
            </button>
            {mode === 'confirm' && !loading && (
              <button style={styles.launchBtn} onClick={handleLaunch}>
                <Sparkles size={16} />
                Schedule {weekCount} Weeks
              </button>
            )}
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
    maxWidth: '640px',
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
  scrollBody: {
    overflowY: 'auto',
    flex: 1,
  },
  section: {
    padding: '14px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
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
  quickGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  quickBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    color: '#f1f5f9',
    transition: 'border-color 0.15s',
  },
  quickLabel: {
    fontSize: '14px',
    fontWeight: 600,
    minWidth: '120px',
  },
  quickDesc: {
    fontSize: '11px',
    color: '#64748b',
    flex: 1,
    lineHeight: 1.4,
  },
  rangeInputs: {
    display: 'flex',
    gap: '16px',
  },
  inputGroup: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  inputLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    color: '#f1f5f9',
    padding: '8px 12px',
    fontSize: '14px',
    fontWeight: 600,
    width: '100%',
    boxSizing: 'border-box',
  },
  inputHint: {
    fontSize: '11px',
    color: '#64748b',
  },
  backBtn: {
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    color: '#94a3b8',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  confirmBtn: {
    flex: 1,
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  summaryBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    background: 'rgba(139,92,246,0.06)',
    borderBottom: '1px solid rgba(139,92,246,0.15)',
  },
  changeBtn: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#8b5cf6',
    background: 'rgba(139,92,246,0.1)',
    border: '1px solid rgba(139,92,246,0.25)',
    borderRadius: '6px',
    padding: '4px 12px',
    cursor: 'pointer',
  },
  optionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  optionRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.02)',
    cursor: 'pointer',
  },
  checkbox: {
    marginTop: '2px',
    accentColor: '#8b5cf6',
  },
  resetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  resetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
  },
  resetBadge: {
    fontSize: '9px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '3px',
    letterSpacing: '0.5px',
    minWidth: '48px',
    textAlign: 'center',
  },
  loadingSection: {
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  loadingContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  progressBar: {
    width: '100%',
    height: '6px',
    borderRadius: '3px',
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '3px',
    background: 'linear-gradient(90deg, #8b5cf6, #7c3aed)',
    transition: 'width 0.3s ease-out',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '16px 24px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
    position: 'sticky', bottom: 0, background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(12px)',
  },
  cancelBtn: {
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
  launchBtn: {
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
  },
}
