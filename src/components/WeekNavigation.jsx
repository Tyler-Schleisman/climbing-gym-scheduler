import { ChevronLeft, ChevronRight, Save, Check, Loader, CalendarDays, ClipboardCheck } from 'lucide-react'
import AutoScheduleButton from './AutoScheduleButton'
import { loadInspectionRecords, hasInspectionOnWeek } from '../data/inspections'

function getCurrentWeekNumber() {
  const base = new Date(2025, 0, 6)
  const now = new Date()
  const diff = Math.floor((now - base) / (7 * 24 * 60 * 60 * 1000))
  return Math.max(0, diff)
}

function getWeekDateRange(weekNumber) {
  const baseDate = new Date(2025, 0, 6) // Monday Jan 6, 2025 as week 0
  const start = new Date(baseDate)
  start.setDate(start.getDate() + weekNumber * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 4) // Friday
  const fmt = (d) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt(start)} — ${fmt(end)}`
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0 16px',
    marginBottom: '20px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  navGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  navButton: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    color: 'var(--t-text)',
    padding: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
    minWidth: '40px',
    minHeight: '40px',
  },
  weekInfo: {
    textAlign: 'center',
    minWidth: '160px',
  },
  weekNumber: {
    fontSize: '20px',
    fontWeight: 800,
    color: 'var(--t-text)',
    margin: 0,
    letterSpacing: '-0.3px',
    lineHeight: 1.2,
  },
  dateRange: {
    fontSize: '13px',
    color: 'var(--t-text-muted)',
    margin: '4px 0 0 0',
    lineHeight: 1.4,
  },
  todayButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    borderRadius: '10px',
    border: '1px solid rgba(16,185,129,0.35)',
    background: 'rgba(16,185,129,0.1)',
    color: '#10b981',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    minHeight: '38px',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  saveButton: {
    background: 'linear-gradient(135deg, var(--t-primary), var(--t-secondary))',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    padding: '10px 24px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'all 0.15s',
    boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
    minHeight: '40px',
  },
}

export default function WeekNavigation({
  currentWeek,
  onWeekChange,
  onSave,
  saveState = 'idle',
  onAutoSchedule,
  onScheduleGym,
  onScheduleDay,
  onFillGaps,
  onExtended,
  autoScheduleLoading,
}) {
  const saveIcon = saveState === 'saving'
    ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
    : saveState === 'saved'
      ? <Check size={16} />
      : <Save size={16} />

  const saveLabel = saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved!' : 'Save Week'

  const saveBg = saveState === 'saved'
    ? 'linear-gradient(135deg, var(--t-success), color-mix(in srgb, var(--t-success) 80%, black))'
    : 'linear-gradient(135deg, var(--t-primary), var(--t-secondary))'

  // Check for inspections this week
  const inspRecords = loadInspectionRecords()
  const weekInspections = hasInspectionOnWeek(inspRecords, currentWeek)

  return (
    <div style={styles.container}>
      <div style={styles.navGroup}>
        <button
          style={styles.navButton}
          onClick={() => onWeekChange(currentWeek - 1)}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
        >
          <ChevronLeft size={20} />
        </button>
        <div style={styles.weekInfo}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <p style={styles.weekNumber}>Week {currentWeek}</p>
            {weekInspections.length > 0 && (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                  fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px',
                  background: 'rgba(6,182,212,0.15)', color: '#06b6d4',
                  border: '1px solid rgba(6,182,212,0.25)',
                }}
                title={`${weekInspections[0].gyms.join(' & ')} inspection scheduled this ${weekInspections[0].day}`}
              >
                <ClipboardCheck size={10} /> Inspection
              </span>
            )}
          </div>
          <p style={styles.dateRange}>{getWeekDateRange(currentWeek)}</p>
        </div>
        <button
          style={styles.navButton}
          onClick={() => onWeekChange(currentWeek + 1)}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
        >
          <ChevronRight size={20} />
        </button>
        {currentWeek !== getCurrentWeekNumber() && (
          <button
            style={styles.todayButton}
            onClick={() => onWeekChange(getCurrentWeekNumber())}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(16,185,129,0.2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(16,185,129,0.1)')}
            title="Jump to current week (T)"
          >
            <CalendarDays size={14} />
            Today
          </button>
        )}
      </div>

      <div style={styles.actions}>
        <AutoScheduleButton
          onClick={onAutoSchedule}
          onScheduleGym={onScheduleGym}
          onScheduleDay={onScheduleDay}
          onFillGaps={onFillGaps}
          onExtended={onExtended}
          loading={autoScheduleLoading}
        />
        <button
          style={{
            ...styles.saveButton,
            background: saveBg,
            cursor: saveState === 'saving' ? 'wait' : 'pointer',
          }}
          onClick={saveState === 'idle' ? onSave : undefined}
          onMouseEnter={(e) => { if (saveState === 'idle') e.currentTarget.style.opacity = '0.85' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          title="Ctrl+S"
        >
          {saveIcon} {saveLabel}
        </button>
      </div>
    </div>
  )
}
