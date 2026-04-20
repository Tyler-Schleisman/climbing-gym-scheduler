import { useState, useRef, useEffect } from 'react'
import { Sparkles, Loader, ChevronDown, Calendar } from 'lucide-react'

const GYMS = ['Ogden', 'SLC', 'Soma']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri' }

const TOOLTIPS = {
  fullWeek: 'Generate a complete schedule for the entire week from scratch (Ctrl+Shift+A)',
  gym: (name) => `Auto-schedule only ${name} — other gyms are left untouched`,
  day: (day) => `Auto-schedule ${day} across all gyms — other days are left untouched`,
  fillGaps: 'Only fill shifts that have no staff assigned yet — existing assignments are preserved',
}

export default function AutoScheduleButton({ onClick, onScheduleGym, onScheduleDay, onFillGaps, onExtended, loading }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  const handleAction = (action) => {
    setOpen(false)
    action()
  }

  return (
    <div ref={ref} style={styles.wrapper}>
      {/* Main button */}
      <button
        style={{
          ...styles.mainButton,
          opacity: loading ? 0.7 : 1,
          cursor: loading ? 'wait' : 'pointer',
        }}
        onClick={loading ? undefined : () => handleAction(onClick)}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.85' }}
        onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = '1' }}
        title={TOOLTIPS.fullWeek}
      >
        {loading ? (
          <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <Sparkles size={16} />
        )}
        {loading ? 'Scheduling...' : 'Auto-Schedule'}
      </button>

      {/* Dropdown toggle */}
      <button
        style={{
          ...styles.dropdownToggle,
          opacity: loading ? 0.7 : 1,
          cursor: loading ? 'wait' : 'pointer',
          background: open
            ? 'linear-gradient(135deg, color-mix(in srgb, var(--t-success) 70%, black) 0%, color-mix(in srgb, var(--t-success) 60%, black) 100%)'
            : 'linear-gradient(135deg, var(--t-success) 0%, color-mix(in srgb, var(--t-success) 80%, black) 100%)',
        }}
        onClick={loading ? undefined : () => setOpen((prev) => !prev)}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.85' }}
        onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = '1' }}
        title="More scheduling options"
      >
        <ChevronDown
          size={14}
          style={{
            transition: 'transform 0.15s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div style={styles.dropdown}>
          {/* Full week */}
          <button
            style={styles.menuItem}
            onClick={() => handleAction(onClick)}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            title={TOOLTIPS.fullWeek}
          >
            <Sparkles size={14} style={{ color: 'var(--t-success)', flexShrink: 0 }} />
            <div style={styles.menuText}>
              <span style={styles.menuLabel}>Full Week</span>
              <span style={styles.menuDesc}>Schedule all gyms &amp; days</span>
            </div>
            <span style={styles.shortcut}>Ctrl+Shift+A</span>
          </button>

          <div style={styles.divider} />

          {/* By gym */}
          <div style={styles.sectionHeader}>By Gym</div>
          {GYMS.map((gym) => (
            <button
              key={gym}
              style={styles.menuItem}
              onClick={() => handleAction(() => onScheduleGym(gym))}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              title={TOOLTIPS.gym(gym)}
            >
              <span style={styles.gymDot(gym)} />
              <div style={styles.menuText}>
                <span style={styles.menuLabel}>{gym}</span>
                <span style={styles.menuDesc}>Only schedule {gym} shifts</span>
              </div>
            </button>
          ))}

          <div style={styles.divider} />

          {/* By day */}
          <div style={styles.sectionHeader}>By Day</div>
          {DAYS.map((day) => (
            <button
              key={day}
              style={styles.menuItem}
              onClick={() => handleAction(() => onScheduleDay(day))}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              title={TOOLTIPS.day(day)}
            >
              <span style={styles.dayBadge}>{DAY_SHORT[day]}</span>
              <div style={styles.menuText}>
                <span style={styles.menuLabel}>{day}</span>
                <span style={styles.menuDesc}>All gyms on {day}</span>
              </div>
            </button>
          ))}

          <div style={styles.divider} />

          {/* Fill gaps */}
          <button
            style={styles.menuItem}
            onClick={() => handleAction(onFillGaps)}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            title={TOOLTIPS.fillGaps}
          >
            <span style={styles.fillIcon}>+</span>
            <div style={styles.menuText}>
              <span style={styles.menuLabel}>Fill Remaining Gaps</span>
              <span style={styles.menuDesc}>Keep existing, fill empty shifts</span>
            </div>
          </button>

          <div style={styles.divider} />

          {/* Extended multi-week */}
          <button
            style={styles.menuItem}
            onClick={() => handleAction(onExtended)}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            title="Schedule multiple weeks or an entire month at once"
          >
            <Calendar size={14} style={{ color: 'var(--t-secondary)', flexShrink: 0 }} />
            <div style={styles.menuText}>
              <span style={styles.menuLabel}>Extended Schedule</span>
              <span style={styles.menuDesc}>Multi-week or full month scheduling</span>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

function gymColor(gym) {
  if (gym === 'Ogden') return '#f59e0b'
  if (gym === 'SLC') return '#3b82f6'
  return '#8b5cf6'
}

const styles = {
  wrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
  },
  mainButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: 'linear-gradient(135deg, var(--t-success) 0%, color-mix(in srgb, var(--t-success) 80%, black) 100%)',
    border: 'none',
    borderRadius: '10px 0 0 10px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
    minHeight: '40px',
  },
  dropdownToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 10px',
    background: 'linear-gradient(135deg, var(--t-success) 0%, color-mix(in srgb, var(--t-success) 80%, black) 100%)',
    border: 'none',
    borderLeft: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '0 10px 10px 0',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.15s',
    minWidth: '36px',
    minHeight: '40px',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    width: '300px',
    background: 'rgba(30, 41, 59, 0.98)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '12px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.25)',
    zIndex: 1000,
    padding: '6px 0',
    backdropFilter: 'blur(16px)',
    animation: 'slideInUp 0.15s ease-out',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '10px 16px',
    background: 'transparent',
    border: 'none',
    color: '#f1f5f9',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.12s',
    fontSize: '14px',
    minHeight: '42px',
  },
  menuText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    flex: 1,
    minWidth: 0,
  },
  menuLabel: {
    fontWeight: 600,
    fontSize: '13px',
    lineHeight: '1.3',
  },
  menuDesc: {
    fontSize: '11px',
    color: '#94a3b8',
    lineHeight: '1.3',
  },
  shortcut: {
    fontSize: '10px',
    color: '#64748b',
    background: 'rgba(255,255,255,0.06)',
    padding: '2px 6px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  divider: {
    height: '1px',
    background: 'rgba(255,255,255,0.08)',
    margin: '4px 0',
  },
  sectionHeader: {
    padding: '6px 14px 2px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  gymDot: (gym) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: gymColor(gym),
    flexShrink: 0,
  }),
  dayBadge: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#94a3b8',
    background: 'rgba(255,255,255,0.06)',
    padding: '2px 6px',
    borderRadius: '4px',
    minWidth: '28px',
    textAlign: 'center',
    flexShrink: 0,
  },
  fillIcon: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: '1.5px dashed var(--t-success)',
    color: 'var(--t-success)',
    fontSize: '14px',
    fontWeight: 700,
    flexShrink: 0,
  },
}
