import { useState, useRef, useEffect } from 'react'
import { Settings, RotateCcw, X } from 'lucide-react'

export const DEFAULT_OPTIONS = {
  prioritizeWorkloadBalance: true,
  minimizeOgdenFrequency: true,
  optimizeForRotations: true,
  maximizeAssignments: true,
  fillAllDays: false,
  respectSetterPreferences: true,
  allowFlexHoldWash: true,
  allowStandaloneWash: false,
}

const OPTIONS_STORAGE_KEY = 'climbing-schedule-options'

export function loadOptionsFromStorage() {
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_OPTIONS }
    return { ...DEFAULT_OPTIONS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}

export function saveOptionsToStorage(options) {
  localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options))
}

const OPTION_META = [
  {
    key: 'prioritizeWorkloadBalance',
    label: 'Prioritize Workload Balance',
    tooltip: 'Spread shifts evenly across setters. When enabled, setters with many shifts get lower priority for additional assignments.',
  },
  {
    key: 'minimizeOgdenFrequency',
    label: 'Minimize Ogden Frequency',
    tooltip: 'Limit setters to 1 Ogden day per week. When enabled, a strong penalty is applied to assigning the same setter to Ogden multiple days.',
  },
  {
    key: 'optimizeForRotations',
    label: 'Optimize for Rotations',
    tooltip: 'Prioritize the most overdue sections when selecting what to set. When disabled, sections are chosen without considering how long since they were last reset.',
  },
  {
    key: 'maximizeAssignments',
    label: 'Maximize Assignments',
    tooltip: 'Add extra rope shifts on flex days to assign ALL available setters each day. Creates additional shifts at SLC and Soma when setters remain unassigned after filling required shifts.',
  },
  {
    key: 'fillAllDays',
    label: 'Fill All Days',
    tooltip: 'Schedule optional/flex days in addition to required boulder and rope days. When disabled, only days with required setting are auto-scheduled.',
  },
  {
    key: 'respectSetterPreferences',
    label: 'Respect Setter Preferences',
    tooltip: 'Future feature: factor in setter gym and section preferences when assigning shifts. Currently a placeholder for upcoming functionality.',
    disabled: true,
  },
  {
    key: 'allowFlexHoldWash',
    label: 'Allow Flex Hold Wash',
    tooltip: 'When enabled, the auto-scheduler can add hold wash shifts on non-standard days to absorb unassigned setters. Spec setters (Aliyah, Brayden) are prioritized for these assignments.',
  },
  {
    key: 'allowStandaloneWash',
    label: 'Allow Standalone Wash Days',
    tooltip: 'Allow hold wash assignments even on days when a gym has no setting shift. These are labeled as maintenance/deep clean days.',
  },
]

export default function AutoScheduleOptions({ options, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  const handleToggle = (key) => {
    const next = { ...options, [key]: !options[key] }
    onChange(next)
  }

  const handleSelect = (key, value) => {
    const next = { ...options, [key]: value }
    onChange(next)
  }

  const handleReset = () => {
    onChange({ ...DEFAULT_OPTIONS })
  }

  const isDefault = OPTION_META.every((m) => options[m.key] === DEFAULT_OPTIONS[m.key])

  return (
    <div ref={ref} style={styles.wrapper}>
      <button
        style={{
          ...styles.gearButton,
          background: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
          borderColor: open ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
          color: open ? '#f1f5f9' : '#94a3b8',
        }}
        onClick={() => setOpen((prev) => !prev)}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
        title="Auto-schedule preferences"
      >
        <Settings size={15} />
      </button>

      {open && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Scheduling Options</span>
            <button
              style={styles.closeBtn}
              onClick={() => setOpen(false)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <X size={14} />
            </button>
          </div>

          <div style={styles.optionsList}>
            {OPTION_META.map((meta) => (
              <OptionRow
                key={meta.key}
                meta={meta}
                value={options[meta.key]}
                checked={meta.type === 'select' ? undefined : options[meta.key]}
                onToggle={() => handleToggle(meta.key)}
                onSelect={(val) => handleSelect(meta.key, val)}
              />
            ))}
          </div>

          <div style={styles.panelFooter}>
            <button
              style={{
                ...styles.resetBtn,
                opacity: isDefault ? 0.4 : 1,
                cursor: isDefault ? 'default' : 'pointer',
              }}
              onClick={isDefault ? undefined : handleReset}
              onMouseEnter={(e) => { if (!isDefault) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              title="Restore all options to their default values"
            >
              <RotateCcw size={12} />
              Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function OptionRow({ meta, value, checked, onToggle, onSelect }) {
  const [showTooltip, setShowTooltip] = useState(false)

  const isSelect = meta.type === 'select'

  return (
    <div
      style={{
        ...styles.optionRow,
        opacity: meta.disabled ? 0.5 : 1,
      }}
    >
      <div style={styles.optionLeft}>
        {isSelect ? (
          <select
            value={value || meta.selectOptions[0].value}
            onChange={(e) => onSelect(e.target.value)}
            style={styles.selectInput}
          >
            {meta.selectOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <button
            style={{
              ...styles.toggle,
              background: checked
                ? meta.disabled ? '#475569' : '#10b981'
                : 'rgba(255,255,255,0.1)',
              cursor: meta.disabled ? 'not-allowed' : 'pointer',
            }}
            onClick={meta.disabled ? undefined : onToggle}
          >
            <span
              style={{
                ...styles.toggleKnob,
                transform: checked ? 'translateX(22px)' : 'translateX(2px)',
              }}
            />
          </button>
        )}
        <div style={styles.optionText}>
          <span style={styles.optionLabel}>{meta.label}</span>
          {meta.disabled && <span style={styles.comingSoon}>Coming soon</span>}
        </div>
      </div>

      <div
        style={styles.tooltipWrapper}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span style={styles.infoIcon}>?</span>
        {showTooltip && (
          <div style={styles.tooltip}>
            {meta.tooltip}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    position: 'relative',
  },
  gearButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '38px',
    height: '38px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  panel: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    width: '340px',
    background: 'rgba(30, 41, 59, 0.98)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '12px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.25)',
    zIndex: 1000,
    backdropFilter: 'blur(16px)',
    animation: 'slideInUp 0.15s ease-out',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px 10px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  panelTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#f1f5f9',
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  optionsList: {
    padding: '8px 0',
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    gap: '10px',
  },
  optionLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
    minWidth: 0,
  },
  toggle: {
    position: 'relative',
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    border: 'none',
    flexShrink: 0,
    transition: 'background 0.15s',
    padding: 0,
    overflow: 'hidden',
  },
  selectInput: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#e2e8f0',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    padding: '3px 6px',
    cursor: 'pointer',
    outline: 'none',
    flexShrink: 0,
  },
  toggleKnob: {
    position: 'absolute',
    top: '2px',
    left: '0px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'transform 0.15s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  },
  optionText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
  },
  optionLabel: {
    fontSize: '12.5px',
    fontWeight: 600,
    color: '#f1f5f9',
    lineHeight: '1.3',
  },
  comingSoon: {
    fontSize: '10px',
    color: '#64748b',
    fontStyle: 'italic',
  },
  tooltipWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  infoIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.2)',
    fontSize: '10px',
    fontWeight: 700,
    color: '#64748b',
    cursor: 'help',
    flexShrink: 0,
  },
  tooltip: {
    position: 'absolute',
    right: '24px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '220px',
    padding: '8px 10px',
    background: 'rgba(15, 23, 42, 0.98)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    fontSize: '11px',
    color: '#cbd5e1',
    lineHeight: '1.5',
    zIndex: 1001,
  },
  panelFooter: {
    borderTop: '1px solid rgba(255,255,255,0.08)',
    padding: '8px 14px',
  },
  resetBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 600,
    transition: 'background 0.1s',
  },
}
