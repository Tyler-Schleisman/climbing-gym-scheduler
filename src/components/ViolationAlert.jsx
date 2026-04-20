import { useState, useCallback, useRef, useEffect } from 'react'
import {
  AlertTriangle, ChevronDown, ChevronUp, XCircle, AlertCircle,
  Shield, Info, Zap, Filter, Volume2, VolumeX, Wrench, X,
} from 'lucide-react'

// Categorize violations by type for filtering
const VIOLATION_CATEGORIES = {
  staffing: { label: 'Staffing', icon: 'users', match: (m) => /setter|staff|assigned|washer|director/i.test(m) },
  scheduling: { label: 'Scheduling', icon: 'calendar', match: (m) => /day|monday|tuesday|wednesday|week|schedule/i.test(m) },
  workload: { label: 'Workload', icon: 'balance', match: (m) => /workload|shift|balance|hard section|wash shift|boulder shift/i.test(m) },
  safety: { label: 'Safety', icon: 'shield', match: (m) => /rope|minimum|maximum|safety|require/i.test(m) },
}

function categorize(violation) {
  for (const [key, cat] of Object.entries(VIOLATION_CATEGORIES)) {
    if (cat.match(violation.message)) return key
  }
  return 'other'
}

// Generate fix suggestions based on violation message patterns
function getFixSuggestion(violation) {
  const msg = violation.message
  if (/Head Setter.*must be assigned/i.test(msg)) return 'Assign the Head Setter to their home gym for this shift.'
  if (/Head Setter.*cannot be at/i.test(msg)) return 'Remove Head Setter from this gym — they should be at their assigned gym Mon–Wed.'
  if (/Rope.*minimum.*setter/i.test(msg)) return 'Add at least one more setter to this rope shift for safety compliance.'
  if (/Rope.*exceeds max/i.test(msg)) return 'Remove a setter from this rope shift to stay within the gym capacity.'
  if (/requires exactly.*setters/i.test(msg)) return 'Adjust staffing to match the section\'s required setter count.'
  if (/Spec Setter.*can only work/i.test(msg)) return 'Move Spec Setter to Monday or Tuesday only.'
  if (/Spec Setter.*cannot do rope/i.test(msg)) return 'Reassign Spec Setter to boulder or hold wash instead of rope.'
  if (/cannot be assigned as hold washer/i.test(msg)) return 'Assign a regular Setter as hold washer instead.'
  if (/not available on/i.test(msg)) return 'Remove this setter or check their availability settings.'
  if (/Director.*should only set on Monday/i.test(msg)) return 'Move Director to a Monday shift only.'
  if (/Director.*odd week/i.test(msg)) return 'Director sets on even weeks only — remove from this week.'
  if (/hard sections/i.test(msg)) return 'Distribute hard sections more evenly across setters.'
  if (/hold wash shifts/i.test(msg)) return 'Spread hold wash duties across more setters.'
  if (/boulder shift/i.test(msg)) return 'Ensure this setter gets at least one boulder shift per week.'
  if (/Ogden/i.test(msg)) return 'Rotate Ogden assignments so no one travels there too frequently.'
  if (/workload.*unbalanced/i.test(msg)) return 'Redistribute shifts more evenly across the team.'
  if (/not assigned \(available\)/i.test(msg)) return 'Click a gym cell for this day to assign this setter.'
  return null
}

const NOTIFICATION_KEY = 'climbing-violation-notifications'

export default function ViolationAlert({ violations, onFixAll }) {
  const [errorsExpanded, setErrorsExpanded] = useState(true)
  const [warningsExpanded, setWarningsExpanded] = useState(false)
  const [filter, setFilter] = useState('all') // 'all' | 'errors' | 'warnings'
  const [categoryFilter, setCategoryFilter] = useState(null) // null or category key
  const [showFilterBar, setShowFilterBar] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem(NOTIFICATION_KEY) === 'true' } catch { return false }
  })
  const prevErrorCountRef = useRef(0)

  // Play alert sound when new errors appear
  useEffect(() => {
    if (!soundEnabled) return
    const errorCount = violations?.filter((v) => v.severity === 'error').length || 0
    if (errorCount > prevErrorCountRef.current && prevErrorCountRef.current >= 0) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 520
        osc.type = 'sine'
        gain.gain.value = 0.15
        osc.start()
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
        osc.stop(ctx.currentTime + 0.3)
      } catch { /* ignore audio errors */ }
    }
    prevErrorCountRef.current = errorCount
  }, [violations, soundEnabled])

  // Toggle sound and persist
  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev
      try { localStorage.setItem(NOTIFICATION_KEY, String(next)) } catch {}
      return next
    })
  }, [])

  if (!violations || violations.length === 0) return null

  const errors = violations.filter((v) => v.severity === 'error')
  const warnings = violations.filter((v) => v.severity === 'warning')

  // Apply filters
  let filteredErrors = errors
  let filteredWarnings = warnings
  if (filter === 'errors') filteredWarnings = []
  if (filter === 'warnings') filteredErrors = []
  if (categoryFilter) {
    const cat = VIOLATION_CATEGORIES[categoryFilter]
    if (cat) {
      filteredErrors = filteredErrors.filter((v) => cat.match(v.message))
      filteredWarnings = filteredWarnings.filter((v) => cat.match(v.message))
    }
  }

  // Category counts for filter chips
  const categoryCounts = {}
  for (const key of Object.keys(VIOLATION_CATEGORIES)) {
    const cat = VIOLATION_CATEGORIES[key]
    categoryCounts[key] = violations.filter((v) => cat.match(v.message)).length
  }
  const otherCount = violations.filter((v) => categorize(v) === 'other').length

  return (
    <div style={styles.outerContainer}>
      {/* Large summary bar */}
      <div style={styles.summaryBar(errors.length > 0)}>
        <div style={styles.summaryLeft}>
          {errors.length > 0 && (
            <div style={styles.countBlock('error')}>
              <div style={styles.countBadge('error')}>
                <XCircle size={16} />
                <span style={styles.countNumber}>{errors.length}</span>
              </div>
              <span style={styles.countLabel('error')}>
                CRITICAL ERROR{errors.length !== 1 ? 'S' : ''}
              </span>
            </div>
          )}
          {errors.length > 0 && warnings.length > 0 && (
            <div style={styles.countDivider} />
          )}
          {warnings.length > 0 && (
            <div style={styles.countBlock('warning')}>
              <div style={styles.countBadge('warning')}>
                <AlertCircle size={16} />
                <span style={styles.countNumber}>{warnings.length}</span>
              </div>
              <span style={styles.countLabel('warning')}>
                ADVISOR{warnings.length !== 1 ? 'IES' : 'Y'}
              </span>
            </div>
          )}
        </div>

        <div style={styles.summaryActions}>
          {/* Sound toggle */}
          <button
            style={styles.iconBtn}
            onClick={toggleSound}
            title={soundEnabled ? 'Disable error alert sound' : 'Enable error alert sound'}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>

          {/* Filter toggle */}
          <button
            style={{
              ...styles.iconBtn,
              background: showFilterBar ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
            }}
            onClick={() => setShowFilterBar((p) => !p)}
            title="Filter violations"
          >
            <Filter size={14} />
          </button>

          {/* Fix All button */}
          {errors.length > 0 && onFixAll && (
            <button
              style={styles.fixAllBtn}
              onClick={onFixAll}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              title="Auto-schedule to fix all critical errors"
            >
              <Zap size={14} />
              Fix All Errors
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      {showFilterBar && (
        <div style={styles.filterBar}>
          <div style={styles.filterGroup}>
            <span style={styles.filterLabel}>Severity:</span>
            {['all', 'errors', 'warnings'].map((f) => (
              <button
                key={f}
                style={{
                  ...styles.filterChip,
                  background: filter === f ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
                  color: filter === f ? '#f1f5f9' : '#94a3b8',
                  borderColor: filter === f ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
                }}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'errors' ? `Errors (${errors.length})` : `Warnings (${warnings.length})`}
              </button>
            ))}
          </div>
          <div style={styles.filterGroup}>
            <span style={styles.filterLabel}>Type:</span>
            <button
              style={{
                ...styles.filterChip,
                background: !categoryFilter ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
                color: !categoryFilter ? '#f1f5f9' : '#94a3b8',
                borderColor: !categoryFilter ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
              }}
              onClick={() => setCategoryFilter(null)}
            >
              All Types
            </button>
            {Object.entries(VIOLATION_CATEGORIES).map(([key, cat]) => (
              categoryCounts[key] > 0 && (
                <button
                  key={key}
                  style={{
                    ...styles.filterChip,
                    background: categoryFilter === key ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
                    color: categoryFilter === key ? '#f1f5f9' : '#94a3b8',
                    borderColor: categoryFilter === key ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
                  }}
                  onClick={() => setCategoryFilter(key)}
                >
                  {cat.label} ({categoryCounts[key]})
                </button>
              )
            ))}
            {otherCount > 0 && (
              <button
                style={{
                  ...styles.filterChip,
                  background: categoryFilter === 'other' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
                  color: categoryFilter === 'other' ? '#f1f5f9' : '#94a3b8',
                  borderColor: categoryFilter === 'other' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
                }}
                onClick={() => setCategoryFilter('other')}
              >
                Other ({otherCount})
              </button>
            )}
          </div>
        </div>
      )}

      {/* ERRORS section */}
      {filteredErrors.length > 0 && (() => {
        const unassignedErrors = filteredErrors.filter((v) => v.day)
        const otherErrors = filteredErrors.filter((v) => !v.day)
        const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
        const unassignedByDay = {}
        unassignedErrors.forEach((v) => {
          if (!unassignedByDay[v.day]) unassignedByDay[v.day] = []
          unassignedByDay[v.day].push(v)
        })

        return (
          <div style={styles.section('error')}>
            <button
              style={styles.sectionHeader('error')}
              onClick={() => setErrorsExpanded((p) => !p)}
            >
              <div style={styles.sectionHeaderLeft}>
                <div style={styles.severityBadge('error')}>
                  <Shield size={12} />
                  CRITICAL
                </div>
                <span style={styles.sectionTitle('error')}>
                  {filteredErrors.length} Error{filteredErrors.length !== 1 ? 's' : ''} — Immediate attention required
                </span>
              </div>
              {errorsExpanded ? <ChevronUp size={16} color="#f87171" /> : <ChevronDown size={16} color="#f87171" />}
            </button>

            {errorsExpanded && (
              <div style={styles.sectionBody}>
                {otherErrors.map((v, i) => (
                  <ViolationItem key={`e-${i}`} violation={v} />
                ))}

                {/* Unassigned setters grouped by day */}
                {DAY_ORDER.map((day) => {
                  const dayViolations = unassignedByDay[day]
                  if (!dayViolations?.length) return null
                  return (
                    <div key={day} style={styles.dayGroup}>
                      <div style={styles.dayGroupHeader}>
                        <XCircle size={12} />
                        {day.toUpperCase()} — {dayViolations.length} setter{dayViolations.length !== 1 ? 's' : ''} not assigned
                      </div>
                      {dayViolations.map((v, i) => (
                        <ViolationItem key={`ua-${day}-${i}`} violation={v} />
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* WARNINGS section */}
      {filteredWarnings.length > 0 && (
        <div style={styles.section('warning')}>
          <button
            style={styles.sectionHeader('warning')}
            onClick={() => setWarningsExpanded((p) => !p)}
          >
            <div style={styles.sectionHeaderLeft}>
              <div style={styles.severityBadge('warning')}>
                <Info size={12} />
                ADVISORY
              </div>
              <span style={styles.sectionTitle('warning')}>
                {filteredWarnings.length} Warning{filteredWarnings.length !== 1 ? 's' : ''} — Review recommended
              </span>
            </div>
            {warningsExpanded ? <ChevronUp size={16} color="#fbbf24" /> : <ChevronDown size={16} color="#fbbf24" />}
          </button>

          {warningsExpanded && (
            <div style={styles.sectionBody}>
              {filteredWarnings.map((v, i) => (
                <ViolationItem key={`w-${i}`} violation={v} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ViolationItem({ violation }) {
  const [showDetails, setShowDetails] = useState(false)
  const isError = violation.severity === 'error'
  const suggestion = getFixSuggestion(violation)
  const category = categorize(violation)
  const catInfo = VIOLATION_CATEGORIES[category]

  return (
    <div style={styles.item(isError)}>
      <div style={styles.itemHeader}>
        <div style={styles.itemLeft}>
          <div style={styles.itemIcon(isError)}>
            {isError ? <XCircle size={14} /> : <AlertCircle size={14} />}
          </div>
          <div style={styles.itemContent}>
            <span style={styles.itemMessage(isError)}>{violation.message}</span>
            <div style={styles.itemMeta}>
              {violation.shiftKey && (
                <span style={styles.itemShift}>{violation.shiftKey}</span>
              )}
              {catInfo && (
                <span style={styles.categoryTag}>{catInfo.label}</span>
              )}
            </div>
          </div>
        </div>
        {suggestion && (
          <button
            style={styles.detailsToggle}
            onClick={(e) => { e.stopPropagation(); setShowDetails((p) => !p) }}
            title={showDetails ? 'Hide fix suggestion' : 'Show fix suggestion'}
          >
            <Wrench size={12} />
            {showDetails ? 'Hide fix' : 'Fix'}
          </button>
        )}
      </div>

      {showDetails && suggestion && (
        <div style={styles.suggestion(isError)}>
          <Wrench size={12} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{suggestion}</span>
        </div>
      )}
    </div>
  )
}

const styles = {
  outerContainer: {
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    animation: 'slideInUp 0.3s ease-out',
    borderRadius: '14px',
    overflow: 'hidden',
  },
  summaryBar: (hasErrors) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderRadius: '12px 12px 4px 4px',
    background: hasErrors
      ? 'linear-gradient(135deg, rgba(var(--t-error-rgb),0.15) 0%, rgba(var(--t-error-rgb),0.08) 100%)'
      : 'linear-gradient(135deg, rgba(var(--t-warning-rgb),0.12) 0%, rgba(var(--t-warning-rgb),0.06) 100%)',
    border: `1px solid ${hasErrors ? 'rgba(var(--t-error-rgb),0.3)' : 'rgba(var(--t-warning-rgb),0.3)'}`,
    borderBottom: 'none',
  }),
  summaryLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  countBlock: () => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }),
  countBadge: (type) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: type === 'error' ? 'var(--t-error)' : 'var(--t-warning)',
  }),
  countNumber: {
    fontSize: '24px',
    fontWeight: 800,
    lineHeight: 1,
  },
  countLabel: (type) => ({
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.8px',
    color: type === 'error' ? 'var(--t-error)' : 'var(--t-warning)',
    opacity: 0.8,
  }),
  countDivider: {
    width: '1px',
    height: '32px',
    background: 'rgba(255,255,255,0.12)',
  },
  summaryActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '34px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  fixAllBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '9px 16px',
    background: 'linear-gradient(135deg, var(--t-error) 0%, color-mix(in srgb, var(--t-error) 70%, black) 100%)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(239,68,68,0.3)',
    minHeight: '38px',
  },
  filterBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px 18px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderTop: 'none',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  filterLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    minWidth: '56px',
  },
  filterChip: {
    padding: '6px 12px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)',
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
    minHeight: '32px',
  },
  section: (type) => ({
    borderRadius: '4px',
    overflow: 'hidden',
    border: `1px solid ${type === 'error' ? 'rgba(var(--t-error-rgb),0.25)' : 'rgba(var(--t-warning-rgb),0.2)'}`,
    background: type === 'error'
      ? 'rgba(var(--t-error-rgb),0.04)'
      : 'rgba(var(--t-warning-rgb),0.03)',
  }),
  sectionHeader: (type) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: type === 'error'
      ? 'rgba(var(--t-error-rgb),0.08)'
      : 'rgba(var(--t-warning-rgb),0.06)',
    border: 'none',
    cursor: 'pointer',
    color: '#f1f5f9',
    borderBottom: `1px solid ${type === 'error' ? 'rgba(var(--t-error-rgb),0.15)' : 'rgba(var(--t-warning-rgb),0.12)'}`,
  }),
  sectionHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  severityBadge: (type) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.8px',
    color: type === 'error' ? '#fff' : '#000',
    background: type === 'error' ? 'var(--t-error)' : 'var(--t-warning)',
    animation: type === 'error' ? 'violationPulse 2s ease-in-out infinite' : 'none',
  }),
  sectionTitle: (type) => ({
    fontSize: '13px',
    fontWeight: 600,
    color: type === 'error' ? '#fca5a5' : '#fde68a',
  }),
  sectionBody: {
    padding: '6px 12px 10px',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  item: (isError) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    padding: '8px 10px',
    marginBottom: '4px',
    borderRadius: '6px',
    borderLeft: `3px solid ${isError ? 'var(--t-error)' : 'var(--t-warning)'}`,
    background: isError ? 'rgba(var(--t-error-rgb),0.06)' : 'rgba(var(--t-warning-rgb),0.04)',
    transition: 'background 0.12s',
  }),
  itemHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
  },
  itemLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    flex: 1,
    minWidth: 0,
  },
  itemIcon: (isError) => ({
    color: isError ? 'var(--t-error)' : 'var(--t-warning)',
    flexShrink: 0,
    marginTop: '1px',
  }),
  itemContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minWidth: 0,
  },
  itemMessage: (isError) => ({
    fontSize: '14px',
    color: isError ? '#fecaca' : '#fef3c7',
    lineHeight: 1.5,
    fontWeight: 500,
  }),
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  itemShift: {
    fontSize: '10px',
    color: '#64748b',
    fontFamily: 'monospace',
    background: 'rgba(255,255,255,0.06)',
    padding: '1px 6px',
    borderRadius: '3px',
  },
  categoryTag: {
    fontSize: '10px',
    color: '#94a3b8',
    background: 'rgba(255,255,255,0.04)',
    padding: '1px 6px',
    borderRadius: '3px',
    fontWeight: 500,
  },
  detailsToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.12s',
    whiteSpace: 'nowrap',
  },
  dayGroup: {
    marginTop: '8px',
    marginBottom: '4px',
    borderRadius: '6px',
    border: '1px solid rgba(var(--t-error-rgb),0.15)',
    background: 'rgba(var(--t-error-rgb),0.03)',
    overflow: 'hidden',
  },
  dayGroupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.8px',
    color: '#f87171',
    background: 'rgba(var(--t-error-rgb),0.08)',
    borderBottom: '1px solid rgba(var(--t-error-rgb),0.12)',
  },
  suggestion: (isError) => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginTop: '8px',
    padding: '8px 10px',
    borderRadius: '4px',
    background: isError ? 'rgba(var(--t-error-rgb),0.08)' : 'rgba(var(--t-warning-rgb),0.06)',
    border: `1px solid ${isError ? 'rgba(var(--t-error-rgb),0.15)' : 'rgba(var(--t-warning-rgb),0.12)'}`,
    fontSize: '12px',
    color: '#cbd5e1',
    lineHeight: 1.4,
  }),
}
