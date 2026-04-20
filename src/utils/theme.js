/**
 * Theme management — persisted to localStorage, applied via CSS custom properties.
 *
 * Components can reference theme colors in inline styles as:
 *   color: 'var(--t-primary)'
 *
 * Or import getTheme() for programmatic access to the current color values.
 */

const THEME_STORAGE_KEY = 'climbing-scheduler-theme'

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return { r, g, b }
}

export function rgbString(hex) {
  const { r, g, b } = hexToRgb(hex)
  return `${r},${g},${b}`
}

export function lighten(hex, amount = 0.2) {
  const { r, g, b } = hexToRgb(hex)
  const lr = Math.min(255, Math.round(r + (255 - r) * amount))
  const lg = Math.min(255, Math.round(g + (255 - g) * amount))
  const lb = Math.min(255, Math.round(b + (255 - b) * amount))
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Default theme (matches current hardcoded colors)
// ---------------------------------------------------------------------------

export const DEFAULT_THEME = {
  name: 'Default',
  primary:          '#3b82f6',
  secondary:        '#8b5cf6',
  success:          '#10b981',
  warning:          '#f59e0b',
  error:            '#ef4444',
  info:             '#06b6d4',

  bgGradient1:      '#0f172a',
  bgGradient2:      '#1e293b',
  bgGradient3:      '#334155',

  textPrimary:       '#f1f5f9',
  textSecondary:     '#e2e8f0',
  textTertiary:      '#cbd5e1',
  textMuted:         '#94a3b8',
  textDim:           '#64748b',

  difficultyEasy:    '#10b981',
  difficultyMedium:  '#f59e0b',
  difficultyHard:    '#ef4444',
}

// ---------------------------------------------------------------------------
// Preset themes
// ---------------------------------------------------------------------------

export const THEME_PRESETS = {
  Default: { ...DEFAULT_THEME },

  Ocean: {
    name: 'Ocean',
    primary:          '#0ea5e9',
    secondary:        '#06b6d4',
    success:          '#14b8a6',
    warning:          '#eab308',
    error:            '#f43f5e',
    info:             '#38bdf8',
    bgGradient1:      '#0c1929',
    bgGradient2:      '#0f2942',
    bgGradient3:      '#1a3a5c',
    textPrimary:       '#f0f9ff',
    textSecondary:     '#e0f2fe',
    textTertiary:      '#bae6fd',
    textMuted:         '#7dd3fc',
    textDim:           '#38bdf8',
    difficultyEasy:    '#14b8a6',
    difficultyMedium:  '#eab308',
    difficultyHard:    '#f43f5e',
  },

  Sunset: {
    name: 'Sunset',
    primary:          '#f97316',
    secondary:        '#ec4899',
    success:          '#22c55e',
    warning:          '#eab308',
    error:            '#ef4444',
    info:             '#f97316',
    bgGradient1:      '#1c1017',
    bgGradient2:      '#2d1a24',
    bgGradient3:      '#422030',
    textPrimary:       '#fef2f2',
    textSecondary:     '#fecaca',
    textTertiary:      '#fca5a5',
    textMuted:         '#f87171',
    textDim:           '#b45309',
    difficultyEasy:    '#22c55e',
    difficultyMedium:  '#eab308',
    difficultyHard:    '#ef4444',
  },

  Forest: {
    name: 'Forest',
    primary:          '#22c55e',
    secondary:        '#84cc16',
    success:          '#10b981',
    warning:          '#eab308',
    error:            '#ef4444',
    info:             '#06b6d4',
    bgGradient1:      '#0a1a0f',
    bgGradient2:      '#132a1a',
    bgGradient3:      '#1f3a26',
    textPrimary:       '#f0fdf4',
    textSecondary:     '#dcfce7',
    textTertiary:      '#bbf7d0',
    textMuted:         '#86efac',
    textDim:           '#4ade80',
    difficultyEasy:    '#22c55e',
    difficultyMedium:  '#eab308',
    difficultyHard:    '#ef4444',
  },

  Monochrome: {
    name: 'Monochrome',
    primary:          '#a1a1aa',
    secondary:        '#71717a',
    success:          '#a1a1aa',
    warning:          '#d4d4d8',
    error:            '#f4f4f5',
    info:             '#a1a1aa',
    bgGradient1:      '#09090b',
    bgGradient2:      '#18181b',
    bgGradient3:      '#27272a',
    textPrimary:       '#fafafa',
    textSecondary:     '#e4e4e7',
    textTertiary:      '#d4d4d8',
    textMuted:         '#a1a1aa',
    textDim:           '#71717a',
    difficultyEasy:    '#a1a1aa',
    difficultyMedium:  '#d4d4d8',
    difficultyHard:    '#fafafa',
  },

  'High Contrast': {
    name: 'High Contrast',
    primary:          '#60a5fa',
    secondary:        '#c084fc',
    success:          '#4ade80',
    warning:          '#fbbf24',
    error:            '#f87171',
    info:             '#67e8f9',
    bgGradient1:      '#000000',
    bgGradient2:      '#0a0a0a',
    bgGradient3:      '#141414',
    textPrimary:       '#ffffff',
    textSecondary:     '#f5f5f5',
    textTertiary:      '#e5e5e5',
    textMuted:         '#d4d4d4',
    textDim:           '#a3a3a3',
    difficultyEasy:    '#4ade80',
    difficultyMedium:  '#fbbf24',
    difficultyHard:    '#f87171',
  },
}

// ---------------------------------------------------------------------------
// CSS variable generation
// ---------------------------------------------------------------------------

export function generateCSSVariables(theme) {
  const vars = []

  // Direct color values
  vars.push(`--t-primary: ${theme.primary}`)
  vars.push(`--t-secondary: ${theme.secondary}`)
  vars.push(`--t-success: ${theme.success}`)
  vars.push(`--t-warning: ${theme.warning}`)
  vars.push(`--t-error: ${theme.error}`)
  vars.push(`--t-info: ${theme.info}`)

  // RGB triplets for rgba() usage: rgba(var(--t-primary-rgb), 0.2)
  vars.push(`--t-primary-rgb: ${rgbString(theme.primary)}`)
  vars.push(`--t-secondary-rgb: ${rgbString(theme.secondary)}`)
  vars.push(`--t-success-rgb: ${rgbString(theme.success)}`)
  vars.push(`--t-warning-rgb: ${rgbString(theme.warning)}`)
  vars.push(`--t-error-rgb: ${rgbString(theme.error)}`)
  vars.push(`--t-info-rgb: ${rgbString(theme.info)}`)

  // Background gradient
  vars.push(`--t-bg1: ${theme.bgGradient1}`)
  vars.push(`--t-bg2: ${theme.bgGradient2}`)
  vars.push(`--t-bg3: ${theme.bgGradient3}`)
  vars.push(`--t-bg-gradient: linear-gradient(135deg, ${theme.bgGradient1} 0%, ${theme.bgGradient2} 50%, ${theme.bgGradient3} 100%)`)

  // Text
  vars.push(`--t-text: ${theme.textPrimary}`)
  vars.push(`--t-text-secondary: ${theme.textSecondary}`)
  vars.push(`--t-text-tertiary: ${theme.textTertiary}`)
  vars.push(`--t-text-muted: ${theme.textMuted}`)
  vars.push(`--t-text-dim: ${theme.textDim}`)

  // Difficulty
  vars.push(`--t-easy: ${theme.difficultyEasy}`)
  vars.push(`--t-medium: ${theme.difficultyMedium}`)
  vars.push(`--t-hard: ${theme.difficultyHard}`)
  vars.push(`--t-easy-rgb: ${rgbString(theme.difficultyEasy)}`)
  vars.push(`--t-medium-rgb: ${rgbString(theme.difficultyMedium)}`)
  vars.push(`--t-hard-rgb: ${rgbString(theme.difficultyHard)}`)

  // Lighter variants for badges/hover
  vars.push(`--t-primary-light: ${lighten(theme.primary, 0.25)}`)
  vars.push(`--t-secondary-light: ${lighten(theme.secondary, 0.25)}`)

  // Title gradient
  vars.push(`--t-title-gradient: linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`)

  return `:root {\n  ${vars.join(';\n  ')};\n}`
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_THEME }
    const parsed = JSON.parse(raw)
    // Merge with defaults so new keys always exist
    return { ...DEFAULT_THEME, ...parsed }
  } catch {
    return { ...DEFAULT_THEME }
  }
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme))
}

// ---------------------------------------------------------------------------
// Active theme accessor (for components that need programmatic access)
// ---------------------------------------------------------------------------

let _activeTheme = null

export function setActiveTheme(theme) {
  _activeTheme = theme
}

export function getTheme() {
  return _activeTheme || DEFAULT_THEME
}

// ---------------------------------------------------------------------------
// Theme color keys metadata (for the customizer UI)
// ---------------------------------------------------------------------------

export const THEME_COLOR_KEYS = [
  { key: 'primary',          label: 'Primary Accent',     group: 'Accents',      desc: 'Main accent (buttons, links, badges)' },
  { key: 'secondary',        label: 'Secondary Accent',   group: 'Accents',      desc: 'Secondary accent (monthly view, modals)' },
  { key: 'success',          label: 'Success',            group: 'Accents',      desc: 'Success states and auto-schedule' },
  { key: 'warning',          label: 'Warning',            group: 'Accents',      desc: 'Warning indicators and caution' },
  { key: 'error',            label: 'Error',              group: 'Accents',      desc: 'Error states and critical alerts' },
  { key: 'info',             label: 'Info',               group: 'Accents',      desc: 'Informational highlights (hold washing)' },
  { key: 'bgGradient1',      label: 'Background Dark',    group: 'Background',   desc: 'Darkest gradient stop' },
  { key: 'bgGradient2',      label: 'Background Mid',     group: 'Background',   desc: 'Middle gradient stop' },
  { key: 'bgGradient3',      label: 'Background Light',   group: 'Background',   desc: 'Lightest gradient stop' },
  { key: 'textPrimary',      label: 'Primary Text',       group: 'Text',         desc: 'Main text and headings' },
  { key: 'textSecondary',    label: 'Secondary Text',     group: 'Text',         desc: 'Staff names, labels' },
  { key: 'textTertiary',     label: 'Tertiary Text',      group: 'Text',         desc: 'Less prominent text' },
  { key: 'textMuted',        label: 'Muted Text',         group: 'Text',         desc: 'Descriptions, hints' },
  { key: 'textDim',          label: 'Dim Text',           group: 'Text',         desc: 'Disabled, faint elements' },
  { key: 'difficultyEasy',   label: 'Easy Difficulty',    group: 'Difficulty',   desc: 'Easy section indicators' },
  { key: 'difficultyMedium', label: 'Medium Difficulty',  group: 'Difficulty',   desc: 'Medium section indicators' },
  { key: 'difficultyHard',   label: 'Hard Difficulty',    group: 'Difficulty',   desc: 'Hard section indicators' },
]
