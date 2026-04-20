import { useState, useMemo } from 'react'
import {
  X, Palette, RotateCcw, Check, Sparkles, Download, Upload,
  Sun, Moon, Droplets, TreePine, Eye, Contrast,
} from 'lucide-react'
import {
  DEFAULT_THEME, THEME_PRESETS, THEME_COLOR_KEYS,
  hexToRgb, rgbString, lighten,
} from '../utils/theme'

const PRESET_ICONS = {
  Default: Sparkles,
  Ocean: Droplets,
  Sunset: Sun,
  Forest: TreePine,
  Monochrome: Moon,
  'High Contrast': Contrast,
}

const PRESET_COLORS = {
  Default: ['#3b82f6', '#8b5cf6'],
  Ocean: ['#0ea5e9', '#06b6d4'],
  Sunset: ['#f97316', '#ec4899'],
  Forest: ['#22c55e', '#84cc16'],
  Monochrome: ['#a1a1aa', '#71717a'],
  'High Contrast': ['#60a5fa', '#c084fc'],
}

const GROUPS = ['Accents', 'Background', 'Text', 'Difficulty']

function ColorInput({ label, desc, value, onChange }) {
  return (
    <div style={cs.colorRow}>
      <div style={cs.colorSwatch}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={cs.colorPicker}
        />
        <div style={{ ...cs.swatchPreview, background: value }} />
      </div>
      <div style={cs.colorInfo}>
        <span style={cs.colorLabel}>{label}</span>
        {desc && <span style={cs.colorDesc}>{desc}</span>}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
          else onChange(v) // allow partial typing
        }}
        onBlur={(e) => {
          if (!/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(value)
        }}
        style={cs.hexInput}
        maxLength={7}
      />
    </div>
  )
}

function LivePreview({ theme }) {
  const rgb = rgbString(theme.primary)
  const secRgb = rgbString(theme.secondary)

  return (
    <div style={{
      ...cs.preview,
      background: `linear-gradient(135deg, ${theme.bgGradient1}, ${theme.bgGradient2}, ${theme.bgGradient3})`,
    }}>
      <div style={cs.previewHeader}>
        <span style={{
          fontSize: '14px', fontWeight: 700,
          backgroundImage: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
          backgroundClip: 'text', WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent', color: 'transparent',
        }}>
          Climbing Scheduler
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <span style={{
            fontSize: '10px', fontWeight: 600, padding: '3px 8px',
            borderRadius: '4px', background: `rgba(${rgb}, 0.2)`, color: theme.primary,
          }}>Weekly</span>
          <span style={{
            fontSize: '10px', fontWeight: 600, padding: '3px 8px',
            borderRadius: '4px', color: theme.textDim,
          }}>Monthly</span>
        </div>
      </div>

      <div style={cs.previewBody}>
        {/* Sample grid cells */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          {['Ogden', 'SLC', 'Soma'].map((gym) => (
            <div key={gym} style={{
              flex: 1, padding: '6px 8px', borderRadius: '6px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: theme.textSecondary }}>{gym}</span>
              <div style={{ fontSize: '9px', color: theme.textMuted, marginTop: '2px' }}>Boulder Setting</div>
              <div style={{ display: 'flex', gap: '2px', marginTop: '4px', flexWrap: 'wrap' }}>
                {['Tyler', 'Luke'].map((n) => (
                  <span key={n} style={{
                    fontSize: '8px', padding: '1px 4px', borderRadius: '2px',
                    background: `rgba(${rgb}, 0.15)`, color: theme.primary,
                  }}>{n}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
          <span style={{
            fontSize: '9px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px',
            background: `linear-gradient(135deg, ${theme.success}, ${lighten(theme.success, -0.15)})`,
            color: '#fff',
          }}>Auto-Schedule</span>
          <span style={{
            fontSize: '9px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px',
            background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
            color: '#fff',
          }}>Save</span>
        </div>

        {/* Status badges */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '8px', fontWeight: 600, padding: '2px 5px', borderRadius: '3px',
            background: `rgba(${rgbString(theme.difficultyEasy)}, 0.15)`, color: theme.difficultyEasy,
          }}>Easy</span>
          <span style={{
            fontSize: '8px', fontWeight: 600, padding: '2px 5px', borderRadius: '3px',
            background: `rgba(${rgbString(theme.difficultyMedium)}, 0.15)`, color: theme.difficultyMedium,
          }}>Medium</span>
          <span style={{
            fontSize: '8px', fontWeight: 600, padding: '2px 5px', borderRadius: '3px',
            background: `rgba(${rgbString(theme.difficultyHard)}, 0.15)`, color: theme.difficultyHard,
          }}>Hard</span>
          <span style={{
            fontSize: '8px', fontWeight: 600, padding: '2px 5px', borderRadius: '3px',
            background: `rgba(${rgbString(theme.success)}, 0.15)`, color: theme.success,
          }}>OK</span>
          <span style={{
            fontSize: '8px', fontWeight: 600, padding: '2px 5px', borderRadius: '3px',
            background: `rgba(${rgbString(theme.warning)}, 0.15)`, color: theme.warning,
          }}>Warn</span>
          <span style={{
            fontSize: '8px', fontWeight: 600, padding: '2px 5px', borderRadius: '3px',
            background: `rgba(${rgbString(theme.error)}, 0.15)`, color: theme.error,
          }}>Error</span>
        </div>

        {/* Text samples */}
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ fontSize: '9px', color: theme.textPrimary }}>Primary text sample</span>
          <span style={{ fontSize: '9px', color: theme.textSecondary }}>Secondary text sample</span>
          <span style={{ fontSize: '9px', color: theme.textMuted }}>Muted text sample</span>
          <span style={{ fontSize: '9px', color: theme.textDim }}>Dim text sample</span>
        </div>
      </div>
    </div>
  )
}

export default function ThemeCustomizer({ theme, onChange, onClose }) {
  const [activeGroup, setActiveGroup] = useState('Accents')
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useState(null)

  const isDefault = useMemo(
    () => JSON.stringify(theme) === JSON.stringify(DEFAULT_THEME),
    [theme]
  )

  const activePreset = useMemo(() => {
    for (const [name, preset] of Object.entries(THEME_PRESETS)) {
      const match = Object.keys(DEFAULT_THEME).every((k) => k === 'name' || theme[k] === preset[k])
      if (match) return name
    }
    return null
  }, [theme])

  const handlePreset = (name) => {
    onChange({ ...THEME_PRESETS[name] })
  }

  const handleColorChange = (key, value) => {
    onChange({ ...theme, [key]: value, name: 'Custom' })
  }

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 3000)
      return
    }
    onChange({ ...DEFAULT_THEME })
    setConfirmReset(false)
  }

  const handleExport = () => {
    const json = JSON.stringify(theme, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'scheduler-theme.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        if (parsed && typeof parsed === 'object' && parsed.primary) {
          onChange({ ...DEFAULT_THEME, ...parsed, name: parsed.name || 'Imported' })
        }
      } catch { /* ignore bad files */ }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const groupKeys = THEME_COLOR_KEYS.filter((k) => k.group === activeGroup)

  return (
    <>
      <style>{`
        @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInModal { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

      <div style={cs.overlay} onClick={onClose}>
        <div style={cs.modal} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={cs.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Palette size={20} color={theme.secondary} />
              <h2 style={cs.title}>Theme Customizer</h2>
              {activePreset && (
                <span style={cs.presetBadge}>{activePreset}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button style={cs.headerBtn} onClick={handleExport} title="Export theme as JSON">
                <Download size={13} /> Export
              </button>
              <label style={{ ...cs.headerBtn, cursor: 'pointer' }} title="Import theme from JSON">
                <Upload size={13} /> Import
                <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
              </label>
              <button
                style={{
                  ...cs.headerBtn,
                  background: confirmReset ? 'rgba(239,68,68,0.2)' : undefined,
                  borderColor: confirmReset ? 'rgba(239,68,68,0.4)' : undefined,
                  color: confirmReset ? '#f87171' : undefined,
                }}
                onClick={handleReset}
                title="Reset to default theme"
              >
                <RotateCcw size={13} />
                {confirmReset ? 'Confirm' : 'Reset'}
              </button>
              <button style={cs.closeBtn} onClick={onClose}>
                <X size={18} />
              </button>
            </div>
          </div>

          <div style={cs.body}>
            {/* Left: Presets + Color Pickers */}
            <div style={cs.left}>
              {/* Preset Themes */}
              <div style={cs.section}>
                <div style={cs.sectionHeader}>Preset Themes</div>
                <div style={cs.presetGrid}>
                  {Object.keys(THEME_PRESETS).map((name) => {
                    const Icon = PRESET_ICONS[name] || Sparkles
                    const colors = PRESET_COLORS[name] || ['#888', '#666']
                    const isActive = activePreset === name
                    return (
                      <button
                        key={name}
                        style={{
                          ...cs.presetBtn,
                          borderColor: isActive ? colors[0] : 'rgba(255,255,255,0.1)',
                          background: isActive ? `rgba(${rgbString(colors[0])}, 0.08)` : 'rgba(255,255,255,0.02)',
                        }}
                        onClick={() => handlePreset(name)}
                      >
                        <div style={cs.presetIconRow}>
                          <Icon size={14} color={colors[0]} />
                          {isActive && <Check size={10} color={colors[0]} />}
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: isActive ? colors[0] : '#e2e8f0' }}>
                          {name}
                        </span>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          {colors.map((c, i) => (
                            <div key={i} style={{ width: '12px', height: '12px', borderRadius: '3px', background: c }} />
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Color group tabs */}
              <div style={cs.groupTabs}>
                {GROUPS.map((g) => (
                  <button
                    key={g}
                    style={{
                      ...cs.groupTab,
                      background: activeGroup === g ? `rgba(${rgbString(theme.primary)}, 0.15)` : 'transparent',
                      color: activeGroup === g ? theme.primary : '#94a3b8',
                      borderColor: activeGroup === g ? `rgba(${rgbString(theme.primary)}, 0.3)` : 'transparent',
                    }}
                    onClick={() => setActiveGroup(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {/* Color pickers for active group */}
              <div style={cs.colorList}>
                {groupKeys.map((k) => (
                  <ColorInput
                    key={k.key}
                    label={k.label}
                    desc={k.desc}
                    value={theme[k.key] || DEFAULT_THEME[k.key]}
                    onChange={(v) => handleColorChange(k.key, v)}
                  />
                ))}
              </div>
            </div>

            {/* Right: Live Preview */}
            <div style={cs.right}>
              <div style={cs.sectionHeader}>Live Preview</div>
              <LivePreview theme={theme} />

              {/* Color palette summary */}
              <div style={{ marginTop: '12px' }}>
                <div style={cs.sectionHeader}>Full Palette</div>
                <div style={cs.paletteGrid}>
                  {THEME_COLOR_KEYS.map((k) => (
                    <div key={k.key} style={cs.paletteItem} title={`${k.label}: ${theme[k.key]}`}>
                      <div style={{ ...cs.paletteSwatch, background: theme[k.key] }} />
                      <span style={cs.paletteLabel}>{k.label.replace(/^(Difficulty |Background )/, '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={cs.footer}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {isDefault ? 'Using default theme' : `Custom theme: ${theme.name || 'Custom'}`}
            </span>
            <button style={cs.doneBtn} onClick={onClose}>
              <Check size={14} />
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const cs = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100, padding: '16px',
    animation: 'fadeInOverlay 0.15s ease-out',
  },
  modal: {
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
    width: '100%', maxWidth: '920px', maxHeight: '92vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
    animation: 'slideInModal 0.2s ease-out', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
  },
  title: { margin: 0, fontSize: '18px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.2px' },
  presetBadge: {
    fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
    background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#94a3b8', padding: '6px', cursor: 'pointer',
    display: 'flex', alignItems: 'center',
  },
  headerBtn: {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '5px 10px', fontSize: '11px', fontWeight: 600,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px', color: '#94a3b8', cursor: 'pointer', transition: 'all 0.12s',
  },
  body: {
    display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0,
  },
  left: {
    flex: 1, overflowY: 'auto', padding: '14px 20px',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column', gap: '14px',
  },
  right: {
    width: '300px', flexShrink: 0, overflowY: 'auto', padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: '8px',
  },
  section: {},
  sectionHeader: {
    fontSize: '10px', fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px',
  },
  presetGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px',
  },
  presetBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
    padding: '10px 8px', borderRadius: '8px', cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.1)',
    transition: 'all 0.15s', textAlign: 'center',
  },
  presetIconRow: {
    display: 'flex', alignItems: 'center', gap: '4px',
  },
  groupTabs: {
    display: 'flex', gap: '4px',
  },
  groupTab: {
    flex: 1, padding: '8px 10px', borderRadius: '8px',
    border: '1px solid transparent', cursor: 'pointer',
    fontSize: '12px', fontWeight: 600, textAlign: 'center',
    transition: 'all 0.12s', minHeight: '34px',
  },
  colorList: {
    display: 'flex', flexDirection: 'column', gap: '6px',
  },
  colorRow: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '6px 8px', borderRadius: '6px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  colorSwatch: {
    position: 'relative', width: '28px', height: '28px',
    borderRadius: '6px', overflow: 'hidden', flexShrink: 0,
    border: '1px solid rgba(255,255,255,0.15)',
  },
  colorPicker: {
    position: 'absolute', inset: '-4px',
    width: 'calc(100% + 8px)', height: 'calc(100% + 8px)',
    cursor: 'pointer', opacity: 0,
  },
  swatchPreview: {
    width: '100%', height: '100%', borderRadius: '5px',
  },
  colorInfo: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0,
  },
  colorLabel: {
    fontSize: '12px', fontWeight: 600, color: '#e2e8f0',
  },
  colorDesc: {
    fontSize: '10px', color: '#64748b', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  hexInput: {
    width: '72px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#94a3b8', padding: '4px 6px', fontSize: '11px',
    fontFamily: 'monospace', textAlign: 'center', flexShrink: 0,
  },
  preview: {
    borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  previewHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  previewBody: {
    padding: '8px 10px',
  },
  paletteGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px',
  },
  paletteItem: {
    display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 0',
  },
  paletteSwatch: {
    width: '14px', height: '14px', borderRadius: '3px',
    border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0,
  },
  paletteLabel: {
    fontSize: '9px', color: '#94a3b8', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
  },
  doneBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    border: 'none', borderRadius: '10px', color: '#fff',
    padding: '9px 24px', cursor: 'pointer', fontSize: '14px', fontWeight: 700,
    minHeight: '40px', boxShadow: '0 2px 8px rgba(139,92,246,0.3)',
  },
}
