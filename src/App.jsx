import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Mountain, BarChart3, CalendarDays, LayoutGrid, Users, Settings, Palette, GripVertical, TrendingUp, Undo2, Redo2, AlertTriangle, ClipboardCheck } from 'lucide-react'
import WeekNavigation from './components/WeekNavigation'
import MonthlyView, { getNextMonthWeek, getPrevMonthWeek, getTodayWeek } from './components/MonthlyView'
import ScheduleGrid from './components/ScheduleGrid'
import ShiftModal from './components/ShiftModal'
import ViolationAlert from './components/ViolationAlert'
import UnassignedSetterAlert from './components/UnassignedSetterAlert'
import AnalyticsPanel from './components/AnalyticsPanel'
import AutoSchedulePreview from './components/AutoSchedulePreview'
import AutoScheduleOptions, { loadOptionsFromStorage, saveOptionsToStorage } from './components/AutoScheduleOptions'
// SetterAvailability functionality now in SetterSettingsPanel
import SettingsPanel from './components/SettingsPanel'
import SetterSettingsPanel from './components/SetterSettingsPanel'
import WelcomeOverlay from './components/WelcomeOverlay'
import { loadAvailability, saveAvailability } from './data/availability-overrides'
import { loadSettings, saveSettings } from './data/settings'
import { validateSchedule, buildViolationMap } from './utils/validation'
import { autoScheduleWeek, autoScheduleGym, autoScheduleDay, autoScheduleFillGaps, extendedAutoSchedule } from './utils/auto-scheduler'
import { resolveConflicts } from './utils/conflict-resolution'
import ExtendedAutoSchedule from './components/ExtendedAutoSchedule'
import ExtendedSchedulePreview from './components/ExtendedSchedulePreview'
import ThemeCustomizer from './components/ThemeCustomizer'
import DragDropScheduler from './components/DragDropScheduler'
import HistoricalAnalytics from './components/HistoricalAnalytics'
import QuickActions from './components/QuickActions'
import MissedShiftManager from './components/MissedShiftManager'
import { getOpenRecords } from './data/missed-shifts'
import InspectionScheduler from './components/InspectionScheduler'
import { loadInspectionRecords, getNextInspection, getOverdueInspections, hasInspectionOnWeek, todayWeek as inspTodayWeek, formatDate as inspFormatDate } from './data/inspections'
import NotificationSystem from './components/NotificationSystem'
import { loadTheme, saveTheme, setActiveTheme, generateCSSVariables, DEFAULT_THEME } from './utils/theme'
import {
  createUndoManager, pushUndo, undo as undoAction, redo as redoAction,
  canUndo, canRedo, getUndoLabel, getRedoLabel,
} from './utils/undo-manager'

// Helper: extract rgb triplet from hex for rgba() usage in inline styles
function _rgb(hex) {
  const h = hex.replace('#', '')
  return `${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)}`
}

const STORAGE_KEY = 'climbing-schedule'
const WELCOME_KEY = 'climbing-scheduler-welcomed'

function loadScheduleFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function App() {
  const [currentWeek, setCurrentWeek] = useState(0)
  const [scheduleHistory, setScheduleHistory] = useState(() => loadScheduleFromStorage())
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [analyticsVisible, setAnalyticsVisible] = useState(false)

  // View mode: 'weekly' | 'monthly'
  const [viewMode, setViewMode] = useState('weekly')

  // Drag-drop mode
  const [dragDropMode, setDragDropMode] = useState(false)

  // Modal state
  const [selectedShift, setSelectedShift] = useState(null)

  // Auto-schedule state
  const [autoPreview, setAutoPreview] = useState(null)
  const [autoLoading, setAutoLoading] = useState(false)

  // Auto-schedule options (persisted)
  const [autoScheduleOptions, setAutoScheduleOptions] = useState(() => loadOptionsFromStorage())

  // Toast state
  const [toast, setToast] = useState(null) // { message, type: 'success'|'info' }

  // Save button visual feedback: 'idle' | 'saving' | 'saved'
  const [saveState, setSaveState] = useState('idle')

  // Welcome overlay (first visit)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem(WELCOME_KEY))

  // Availability data (used by SetterSettingsPanel)
  const [availabilityData, setAvailabilityData] = useState(() => loadAvailability())

  const handleAvailabilityChange = useCallback((newData) => {
    setAvailabilityData(newData)
    saveAvailability(newData)
  }, [])

  // Extended auto-schedule state
  const [showExtendedSchedule, setShowExtendedSchedule] = useState(false)
  const [extendedLoading, setExtendedLoading] = useState(false)
  const [extendedProgress, setExtendedProgress] = useState(null)
  const [extendedPreview, setExtendedPreview] = useState(null)

  // Theme state
  const [theme, setTheme] = useState(() => {
    const t = loadTheme()
    setActiveTheme(t)
    return t
  })
  const [showThemeCustomizer, setShowThemeCustomizer] = useState(false)

  const handleThemeChange = useCallback((newTheme) => {
    setTheme(newTheme)
    setActiveTheme(newTheme)
    saveTheme(newTheme)
  }, [])

  // Settings panel
  const [showSettings, setShowSettings] = useState(false)

  // Setter settings panel
  const [showSetterSettings, setShowSetterSettings] = useState(false)

  // Missed shifts manager
  const [showMissedShifts, setShowMissedShifts] = useState(false)
  const [openMissedCount, setOpenMissedCount] = useState(() => getOpenRecords().length)

  // Inspections panel
  const [showInspections, setShowInspections] = useState(false)
  const [inspectionRecords, setInspectionRecords] = useState(() => loadInspectionRecords())

  // Historical analytics
  const [showHistorical, setShowHistorical] = useState(false)
  const [appSettings, setAppSettings] = useState(() => loadSettings())

  const handleSettingsChange = useCallback((newSettings) => {
    setAppSettings(newSettings)
    saveSettings(newSettings)
  }, [])

  // Debounce ref for auto-save
  const saveTimerRef = useRef(null)

  // Undo/Redo system (session-only, per-week)
  const [undoMgr, setUndoMgr] = useState(() => createUndoManager())
  const prevUndoWeekRef = useRef(currentWeek)

  // Reset undo history when week changes
  useEffect(() => {
    if (prevUndoWeekRef.current !== currentWeek) {
      setUndoMgr(createUndoManager())
      prevUndoWeekRef.current = currentWeek
    }
  }, [currentWeek])

  // Helper: snapshot current week before a mutation
  const snapshotBeforeMutation = useCallback((label = 'Change') => {
    const current = scheduleHistory[currentWeek] || {}
    setUndoMgr((prev) => pushUndo(prev, current, label))
  }, [scheduleHistory, currentWeek])

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const handleUndo = useCallback(() => {
    const current = scheduleHistory[currentWeek] || {}
    const result = undoAction(undoMgr, current)
    if (!result) return
    setUndoMgr(result.manager)
    setScheduleHistory((prev) => ({ ...prev, [currentWeek]: result.schedule }))
    showToast(`Undone: ${result.label}`, 'info')
  }, [undoMgr, scheduleHistory, currentWeek, showToast])

  const handleRedo = useCallback(() => {
    const current = scheduleHistory[currentWeek] || {}
    const result = redoAction(undoMgr, current)
    if (!result) return
    setUndoMgr(result.manager)
    setScheduleHistory((prev) => ({ ...prev, [currentWeek]: result.schedule }))
    showToast(`Redone: ${result.label}`, 'info')
  }, [undoMgr, scheduleHistory, currentWeek, showToast])

  const handleOptionsChange = useCallback((newOptions) => {
    setAutoScheduleOptions(newOptions)
    saveOptionsToStorage(newOptions)
  }, [])

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false)
    localStorage.setItem(WELCOME_KEY, '1')
  }, [])

  // Current week's schedule (derived)
  const currentSchedule = scheduleHistory[currentWeek] || {}

  // Real-time validation
  const violations = useMemo(
    () => validateSchedule(currentSchedule, currentWeek),
    [currentSchedule, currentWeek]
  )

  const violationMap = useMemo(
    () => buildViolationMap(violations),
    [violations]
  )

  // Debounced auto-save to localStorage on schedule changes (handles 50+ weeks efficiently)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scheduleHistory))
    }, 300)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [scheduleHistory])

  // Analytics panel slide animation
  useEffect(() => {
    if (showAnalytics) {
      // Small delay so the DOM element mounts before animating in
      requestAnimationFrame(() => setAnalyticsVisible(true))
    } else {
      setAnalyticsVisible(false)
    }
  }, [showAnalytics])

  // Consolidated keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      // Ctrl/Cmd + Shift + A: auto-schedule
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        if (!autoLoading && !autoPreview && !selectedShift) {
          handleAutoSchedule()
        }
        return
      }

      // Ctrl/Cmd + Z: undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        handleUndo()
        return
      }

      // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault()
        handleRedo()
        return
      }

      // Ctrl/Cmd + S: save
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 's') {
        e.preventDefault()
        handleSave()
        return
      }

      // ESC: close modals/overlays
      if (e.key === 'Escape') {
        if (autoPreview) {
          setAutoPreview(null)
          return
        }
        if (selectedShift) {
          setSelectedShift(null)
          return
        }
        return
      }

      // Arrow keys: week/month navigation (only when no modal is open and not in an input)
      if (!selectedShift && !autoPreview && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (viewMode === 'monthly') {
            setCurrentWeek((w) => getPrevMonthWeek(w))
          } else {
            setCurrentWeek((w) => Math.max(0, w - 1))
          }
          return
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          if (viewMode === 'monthly') {
            setCurrentWeek((w) => getNextMonthWeek(w))
          } else {
            setCurrentWeek((w) => w + 1)
          }
          return
        }
        // 'T' key: jump to today/current week (both views)
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault()
          setCurrentWeek(getTodayWeek())
          return
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const handleWeekChange = useCallback((newWeek) => {
    if (newWeek < 0) return
    setCurrentWeek(newWeek)
  }, [])

  const handleMonthlyWeekSelect = useCallback((weekNumber) => {
    setCurrentWeek(weekNumber)
    setViewMode('weekly')
  }, [])

  const handleMonthNavigate = useCallback((weekNumber) => {
    setCurrentWeek(weekNumber)
  }, [])

  const handleSave = useCallback(() => {
    setSaveState('saving')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scheduleHistory))
    setTimeout(() => {
      setSaveState('saved')
      showToast('Schedule saved!')
      setTimeout(() => setSaveState('idle'), 1500)
    }, 200)
  }, [scheduleHistory, showToast])

  const handleCellClick = useCallback((gymName, day) => {
    setSelectedShift({ gymName, day })
  }, [])

  const handleShiftSave = useCallback((shiftData) => {
    if (!selectedShift) return

    const key = `${selectedShift.gymName}-${selectedShift.day}`
    snapshotBeforeMutation(`Edit ${selectedShift.gymName} ${selectedShift.day}`)

    setScheduleHistory((prev) => {
      const weekData = { ...(prev[currentWeek] || {}) }

      if (shiftData === null) {
        delete weekData[key]
      } else {
        weekData[key] = shiftData
      }

      return { ...prev, [currentWeek]: weekData }
    })

    setSelectedShift(null)
  }, [selectedShift, currentWeek])

  const handleModalClose = useCallback(() => {
    setSelectedShift(null)
  }, [])

  // Direct key-based schedule update (for drag-drop)
  // Debounce snapshots for rapid drag-drop — snapshot only on first call within 500ms
  const dragSnapshotTimerRef = useRef(null)
  const dragSnapshotTakenRef = useRef(false)

  const handleScheduleKeyUpdate = useCallback((key, shiftData) => {
    if (!dragSnapshotTakenRef.current) {
      snapshotBeforeMutation('Drag & drop')
      dragSnapshotTakenRef.current = true
    }
    if (dragSnapshotTimerRef.current) clearTimeout(dragSnapshotTimerRef.current)
    dragSnapshotTimerRef.current = setTimeout(() => { dragSnapshotTakenRef.current = false }, 500)

    setScheduleHistory((prev) => {
      const weekData = { ...(prev[currentWeek] || {}) }
      if (shiftData === null) {
        delete weekData[key]
      } else {
        weekData[key] = shiftData
      }
      return { ...prev, [currentWeek]: weekData }
    })
  }, [currentWeek, snapshotBeforeMutation])

  // Batch update: replace entire week schedule (for quick actions)
  const handleBatchUpdate = useCallback((weekData) => {
    snapshotBeforeMutation('Quick action')
    setScheduleHistory((prev) => ({ ...prev, [currentWeek]: weekData }))
  }, [currentWeek, snapshotBeforeMutation])

  // Full history update (for copy-week across weeks)
  const handleScheduleHistoryUpdate = useCallback((newHistory) => {
    setScheduleHistory(newHistory)
  }, [])

  // ---- Auto-schedule flow ----

  // Shared auto-schedule runner with timing, error handling, and toasts
  const runAutoSchedule = useCallback((scheduleFn, label) => {
    setAutoLoading(true)

    // Use setTimeout to allow UI to show loading state before heavy computation
    setTimeout(() => {
      const t0 = performance.now()
      try {
        const { schedule: proposed, warnings, capacityAnalysis } = scheduleFn()

        if (!proposed || typeof proposed !== 'object') {
          throw new Error('Scheduler returned invalid schedule data')
        }

        const resolved = resolveConflicts(proposed, currentWeek)
        const elapsed = Math.round(performance.now() - t0)

        setAutoPreview({
          proposedSchedule: resolved.schedule,
          warnings,
          capacityAnalysis,
          suggestions: resolved.suggestions,
          success: resolved.success,
          message: resolved.message,
        })

        const shiftCount = Object.keys(resolved.schedule).length
        console.log(`[Auto-Schedule] ${label} completed in ${elapsed}ms — ${shiftCount} shifts`)

        if (resolved.success) {
          showToast(`Schedule generated in ${elapsed < 1000 ? elapsed + 'ms' : (elapsed / 1000).toFixed(1) + 's'}!`)
        } else {
          showToast('Schedule generated with issues — review below', 'info')
        }
      } catch (err) {
        const elapsed = Math.round(performance.now() - t0)
        console.error(`[Auto-Schedule ${label}] Failed after ${elapsed}ms:`, err)

        if (err.message?.includes('Maximum call stack')) {
          showToast('Auto-schedule hit a recursion limit. Try scheduling a smaller scope.', 'error')
        } else if (err.message?.includes('invalid schedule')) {
          showToast('Auto-schedule produced invalid data. Please try again.', 'error')
        } else {
          showToast(`Auto-schedule failed: ${err.message || 'Unknown error'}`, 'error')
        }
      }
      setAutoLoading(false)
    }, 50)
  }, [currentWeek, showToast])

  const handleAutoSchedule = useCallback(() => {
    runAutoSchedule(
      () => autoScheduleWeek(scheduleHistory, currentWeek, autoScheduleOptions),
      'Full Week',
    )
  }, [scheduleHistory, currentWeek, autoScheduleOptions, runAutoSchedule])

  const handleScheduleGym = useCallback((gymName) => {
    runAutoSchedule(
      () => autoScheduleGym(gymName, scheduleHistory, currentWeek, autoScheduleOptions),
      gymName,
    )
  }, [scheduleHistory, currentWeek, runAutoSchedule, autoScheduleOptions])

  const handleScheduleDay = useCallback((day) => {
    runAutoSchedule(
      () => autoScheduleDay(day, scheduleHistory, currentWeek, autoScheduleOptions),
      day,
    )
  }, [scheduleHistory, currentWeek, runAutoSchedule, autoScheduleOptions])

  const handleFillGaps = useCallback(() => {
    runAutoSchedule(
      () => autoScheduleFillGaps(scheduleHistory, currentWeek, autoScheduleOptions),
      'Fill Gaps',
    )
  }, [scheduleHistory, currentWeek, runAutoSchedule, autoScheduleOptions])

  const handleExtendedOpen = useCallback(() => {
    setShowExtendedSchedule(true)
  }, [])

  const handleExtendedSchedule = useCallback((startWeek, endWeek, extOptions) => {
    setExtendedLoading(true)
    setExtendedProgress({ current: 0, total: endWeek - startWeek + 1 })

    setTimeout(() => {
      const t0 = performance.now()
      try {
        const { results, cumulativeStats } = extendedAutoSchedule(
          startWeek, endWeek, scheduleHistory, extOptions
        )

        // Resolve conflicts for each week
        const resolvedResults = {}
        const weekNumbers = Object.keys(results).map(Number).sort((a, b) => a - b)
        weekNumbers.forEach((wn, idx) => {
          const resolved = resolveConflicts(results[wn].schedule, wn)
          resolvedResults[wn] = {
            schedule: resolved.schedule,
            warnings: [
              ...(results[wn].warnings || []),
              ...(resolved.suggestions || []),
            ],
          }
          setExtendedProgress({ current: idx + 1, total: weekNumbers.length })
        })

        const elapsed = Math.round(performance.now() - t0)
        console.log(`[Extended Auto-Schedule] Completed in ${elapsed}ms`)

        setExtendedPreview({
          results: resolvedResults,
          cumulativeStats,
          startWeek,
          endWeek,
        })
        setShowExtendedSchedule(false)
        showToast(`Extended schedule generated (${weekNumbers.length} weeks) in ${elapsed < 1000 ? elapsed + 'ms' : (elapsed / 1000).toFixed(1) + 's'}!`)
      } catch (err) {
        console.error('[Extended Auto-Schedule] Failed:', err)
        showToast(`Extended schedule failed: ${err.message || 'Unknown error'}`, 'error')
      }
      setExtendedLoading(false)
      setExtendedProgress(null)
    }, 50)
  }, [scheduleHistory, showToast])

  const handleExtendedApplyAll = useCallback(() => {
    if (!extendedPreview) return
    snapshotBeforeMutation('Extended auto-schedule')
    const { results } = extendedPreview

    setScheduleHistory((prev) => {
      const updated = { ...prev }
      Object.entries(results).forEach(([wn, { schedule }]) => {
        updated[Number(wn)] = schedule
      })
      return updated
    })

    const weekCount = Object.keys(results).length
    showToast(`Applied extended schedule for ${weekCount} weeks!`)
    setExtendedPreview(null)
  }, [extendedPreview, showToast])

  const handleExtendedApplySelected = useCallback((weekNumbers) => {
    if (!extendedPreview || !weekNumbers?.length) return
    snapshotBeforeMutation('Extended auto-schedule (selected weeks)')
    const { results } = extendedPreview

    setScheduleHistory((prev) => {
      const updated = { ...prev }
      weekNumbers.forEach((wn) => {
        if (results[wn]) updated[wn] = results[wn].schedule
      })
      return updated
    })

    showToast(`Applied schedule for ${weekNumbers.length} week${weekNumbers.length !== 1 ? 's' : ''}!`)
    setExtendedPreview(null)
  }, [extendedPreview, showToast])

  const handleExtendedRejectAll = useCallback(() => {
    setExtendedPreview(null)
    showToast('Extended schedule rejected', 'info')
  }, [showToast])

  const handleAutoApply = useCallback(() => {
    if (!autoPreview) return
    snapshotBeforeMutation('Auto-schedule')

    setScheduleHistory((prev) => ({
      ...prev,
      [currentWeek]: autoPreview.proposedSchedule,
    }))
    setAutoPreview(null)

    const errorCount = validateSchedule(autoPreview.proposedSchedule, currentWeek)
      .filter((v) => v.severity === 'error').length

    if (errorCount === 0) {
      showToast('Auto-schedule applied successfully!')
    } else {
      showToast(`Auto-schedule applied with ${errorCount} remaining error(s)`, 'info')
    }
  }, [autoPreview, currentWeek, showToast])

  const handleAutoCancel = useCallback(() => {
    setAutoPreview(null)
  }, [])

  const handleAutoAdjust = useCallback((shiftKey) => {
    if (!autoPreview) return
    snapshotBeforeMutation('Auto-schedule (adjust)')
    setScheduleHistory((prev) => ({
      ...prev,
      [currentWeek]: autoPreview.proposedSchedule,
    }))
    setAutoPreview(null)

    const idx = shiftKey.lastIndexOf('-')
    const gymName = shiftKey.slice(0, idx)
    const day = shiftKey.slice(idx + 1)
    setSelectedShift({ gymName, day })

    showToast('Schedule applied. Adjust this shift as needed.', 'info')
  }, [autoPreview, currentWeek, showToast])

  // Toast colors
  const toastBg = toast?.type === 'error'
    ? `rgba(${_rgb(theme.error)},0.95)`
    : toast?.type === 'info'
      ? `rgba(${_rgb(theme.primary)},0.95)`
      : `rgba(${_rgb(theme.success)},0.95)`

  return (
    <div style={{
      ...styles.app,
      background: `linear-gradient(135deg, ${theme.bgGradient1} 0%, ${theme.bgGradient2} 50%, ${theme.bgGradient3} 100%)`,
      color: theme.textPrimary,
    }}>
      {/* Theme CSS variables + Global keyframes */}
      <style>{`
        ${generateCSSVariables(theme)}
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalSlideIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes violationPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes toastSlideIn { from { opacity: 0; transform: translateY(16px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes toastSlideOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(8px); } }
        @keyframes checkmarkPop { 0% { transform: scale(0); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: calc(200px + 100%) 0; }
        }
        @keyframes dropzonePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(96,165,250,0.3); }
          50% { box-shadow: 0 0 0 6px rgba(96,165,250,0); }
        }
      `}</style>

      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <Mountain size={28} color={theme.primary} />
          <h1 style={{
            ...styles.title,
            backgroundImage: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
          }}>Climbing Gym Scheduler</h1>
          <div style={styles.viewToggle}>
            <button
              style={{
                ...styles.viewToggleBtn,
                background: viewMode === 'weekly' ? `rgba(${_rgb(theme.primary)},0.2)` : 'transparent',
                color: viewMode === 'weekly' ? theme.primary : theme.textDim,
                borderColor: viewMode === 'weekly' ? `rgba(${_rgb(theme.primary)},0.4)` : 'transparent',
              }}
              onClick={() => setViewMode('weekly')}
              title="Weekly View"
            >
              <LayoutGrid size={14} />
              Weekly
            </button>
            <button
              style={{
                ...styles.viewToggleBtn,
                background: viewMode === 'monthly' ? `rgba(${_rgb(theme.secondary)},0.2)` : 'transparent',
                color: viewMode === 'monthly' ? theme.secondary : theme.textDim,
                borderColor: viewMode === 'monthly' ? `rgba(${_rgb(theme.secondary)},0.4)` : 'transparent',
              }}
              onClick={() => setViewMode('monthly')}
              title="Monthly View"
            >
              <CalendarDays size={14} />
              Monthly
            </button>
            {viewMode === 'weekly' && (
              <button
                style={{
                  ...styles.viewToggleBtn,
                  marginLeft: '8px',
                  background: dragDropMode ? `rgba(${_rgb(theme.primary)},0.2)` : 'transparent',
                  color: dragDropMode ? theme.primary : theme.textDim,
                  borderColor: dragDropMode ? `rgba(${_rgb(theme.primary)},0.4)` : 'transparent',
                }}
                onClick={() => setDragDropMode((prev) => !prev)}
                title={dragDropMode ? 'Switch to click-to-edit mode' : 'Switch to drag & drop mode'}
              >
                <GripVertical size={14} />
                Drag & Drop
              </button>
            )}
          </div>
          {/* Undo / Redo */}
          <div style={{ display: 'flex', gap: '2px', marginLeft: '8px' }}>
            <button
              style={{
                ...styles.undoBtn,
                opacity: canUndo(undoMgr) ? 1 : 0.3,
                cursor: canUndo(undoMgr) ? 'pointer' : 'default',
              }}
              onClick={canUndo(undoMgr) ? handleUndo : undefined}
              disabled={!canUndo(undoMgr)}
              title={canUndo(undoMgr) ? `Undo: ${getUndoLabel(undoMgr)} (Ctrl+Z)` : 'Nothing to undo (Ctrl+Z)'}
            >
              <Undo2 size={15} />
            </button>
            <button
              style={{
                ...styles.undoBtn,
                opacity: canRedo(undoMgr) ? 1 : 0.3,
                cursor: canRedo(undoMgr) ? 'pointer' : 'default',
              }}
              onClick={canRedo(undoMgr) ? handleRedo : undefined}
              disabled={!canRedo(undoMgr)}
              title={canRedo(undoMgr) ? `Redo: ${getRedoLabel(undoMgr)} (Ctrl+Y)` : 'Nothing to redo (Ctrl+Y)'}
            >
              <Redo2 size={15} />
            </button>
          </div>
        </div>
        <div style={styles.headerRight}>
          <AutoScheduleOptions
            options={autoScheduleOptions}
            onChange={handleOptionsChange}
          />
          <QuickActions
            weekSchedule={currentSchedule}
            currentWeek={currentWeek}
            onBatchUpdate={handleBatchUpdate}
            scheduleHistory={scheduleHistory}
            onScheduleHistoryUpdate={handleScheduleHistoryUpdate}
            showToast={showToast}
            onShowMissedShifts={() => setShowMissedShifts(true)}
          />
          <button
            style={{
              ...styles.analyticsBtn,
              background: showThemeCustomizer ? `rgba(${_rgb(theme.secondary)},0.2)` : 'rgba(255,255,255,0.06)',
              borderColor: showThemeCustomizer ? theme.secondary : 'rgba(255,255,255,0.15)',
              color: showThemeCustomizer ? theme.secondary : theme.textMuted,
            }}
            onClick={() => setShowThemeCustomizer(true)}
            title="Customize color theme"
          >
            <Palette size={16} />
            Theme
          </button>
          <button
            style={styles.analyticsBtn}
            onClick={() => setShowSettings(true)}
            title="Configure setters, sections, gyms, and constraint rules"
          >
            <Settings size={16} />
            Settings
          </button>
          <button
            style={styles.analyticsBtn}
            onClick={() => setShowSetterSettings(true)}
            title="Manage setter roster, availability, and preferences"
          >
            <Users size={16} />
            Setter Settings
          </button>
          <button
            style={{
              ...styles.analyticsBtn,
              ...(openMissedCount > 0 ? {
                borderColor: 'rgba(245,158,11,0.4)',
                background: 'rgba(245,158,11,0.08)',
              } : {}),
            }}
            onClick={() => setShowMissedShifts(true)}
            title="Track missed shifts and incomplete work"
          >
            <AlertTriangle size={16} color={openMissedCount > 0 ? '#f59e0b' : undefined} />
            Missed
            {openMissedCount > 0 && (
              <span style={{
                fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '8px',
                background: 'rgba(239,68,68,0.9)', color: '#fff', marginLeft: '2px',
              }}>
                {openMissedCount}
              </span>
            )}
          </button>
          <button
            style={styles.analyticsBtn}
            onClick={() => setShowHistorical(true)}
            title="View historical trends and multi-week analytics"
          >
            <TrendingUp size={16} />
            Historical
          </button>
          <button
            style={{
              ...styles.analyticsBtn,
              ...((() => {
                const overdue = getOverdueInspections(inspectionRecords)
                return overdue.length > 0 ? { borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' } : {}
              })()),
            }}
            onClick={() => setShowInspections(true)}
            title="Manage gym inspections"
          >
            <ClipboardCheck size={16} color={getOverdueInspections(inspectionRecords).length > 0 ? '#ef4444' : undefined} />
            Inspections
            {getOverdueInspections(inspectionRecords).length > 0 && (
              <span style={{
                fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '8px',
                background: 'rgba(239,68,68,0.9)', color: '#fff', marginLeft: '2px',
              }}>
                {getOverdueInspections(inspectionRecords).length}
              </span>
            )}
          </button>
          <NotificationSystem
            violations={violations}
            weekSchedule={currentSchedule}
            currentWeek={currentWeek}
            scheduleHistory={scheduleHistory}
            onCellClick={handleCellClick}
          />
          <button
            style={{
              ...styles.analyticsBtn,
              background: showAnalytics
                ? `rgba(${_rgb(theme.secondary)},0.2)`
                : 'rgba(255,255,255,0.06)',
              borderColor: showAnalytics
                ? theme.secondary
                : 'rgba(255,255,255,0.15)',
              color: showAnalytics ? theme.secondary : theme.textMuted,
            }}
            onClick={() => setShowAnalytics((prev) => !prev)}
          >
            <BarChart3 size={16} />
            Analytics
          </button>
        </div>
      </header>

      <div style={styles.body}>
        <main style={{
          ...styles.content,
          maxWidth: showAnalytics ? 'none' : '1400px',
          flex: 1,
          minWidth: 0,
        }}>
          <WeekNavigation
            currentWeek={currentWeek}
            onWeekChange={handleWeekChange}
            onSave={handleSave}
            saveState={saveState}
            onAutoSchedule={handleAutoSchedule}
            onScheduleGym={handleScheduleGym}
            onScheduleDay={handleScheduleDay}
            onFillGaps={handleFillGaps}
            onExtended={handleExtendedOpen}
            autoScheduleLoading={autoLoading}
          />

          {viewMode === 'weekly' ? (
            <>
              <ViolationAlert violations={violations} onFixAll={handleAutoSchedule} />
              <UnassignedSetterAlert
                weekSchedule={currentSchedule}
                weekNumber={currentWeek}
                onAutoSchedule={handleAutoSchedule}
                onCellClick={handleCellClick}
              />
              {dragDropMode ? (
                <DragDropScheduler
                  schedule={scheduleHistory}
                  currentWeek={currentWeek}
                  onScheduleUpdate={handleScheduleKeyUpdate}
                  onCellClick={handleCellClick}
                  violationMap={violationMap}
                  violations={violations}
                />
              ) : (
                <ScheduleGrid
                  schedule={scheduleHistory}
                  currentWeek={currentWeek}
                  onCellClick={handleCellClick}
                  violationMap={violationMap}
                  violations={violations}
                />
              )}
            </>
          ) : (
            <MonthlyView
              scheduleHistory={scheduleHistory}
              currentWeek={currentWeek}
              onWeekSelect={handleMonthlyWeekSelect}
              onMonthNavigate={handleMonthNavigate}
            />
          )}
        </main>

        {showAnalytics && (
          <div style={{
            transition: 'opacity 0.25s, transform 0.25s',
            opacity: analyticsVisible ? 1 : 0,
            transform: analyticsVisible ? 'translateX(0)' : 'translateX(20px)',
          }}>
            <AnalyticsPanel
              scheduleHistory={scheduleHistory}
              currentWeek={currentWeek}
            />
          </div>
        )}
      </div>

      {/* Shift Assignment Modal */}
      {selectedShift && (
        <ShiftModal
          gymName={selectedShift.gymName}
          day={selectedShift.day}
          currentWeek={currentWeek}
          shift={currentSchedule[`${selectedShift.gymName}-${selectedShift.day}`] || null}
          weekSchedule={currentSchedule}
          onSave={handleShiftSave}
          onClose={handleModalClose}
        />
      )}

      {/* Auto-Schedule Preview Modal */}
      {autoPreview && (
        <AutoSchedulePreview
          proposedSchedule={autoPreview.proposedSchedule}
          currentSchedule={currentSchedule}
          weekNumber={currentWeek}
          warnings={autoPreview.warnings}
          capacityAnalysis={autoPreview.capacityAnalysis}
          suggestions={autoPreview.suggestions}
          success={autoPreview.success}
          message={autoPreview.message}
          options={autoScheduleOptions}
          onApply={handleAutoApply}
          onCancel={handleAutoCancel}
          onAdjust={handleAutoAdjust}
        />
      )}

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          settings={appSettings}
          onChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Setter settings panel */}
      {showSetterSettings && (
        <SetterSettingsPanel
          settings={appSettings}
          onChange={handleSettingsChange}
          onClose={() => setShowSetterSettings(false)}
          availability={availabilityData}
          onAvailabilityChange={handleAvailabilityChange}
        />
      )}

      {/* Inspections panel */}
      {showInspections && (
        <InspectionScheduler
          currentWeek={currentWeek}
          onClose={() => { setShowInspections(false); setInspectionRecords(loadInspectionRecords()) }}
          showToast={showToast}
        />
      )}

      {/* Theme customizer */}
      {showThemeCustomizer && (
        <ThemeCustomizer
          theme={theme}
          onChange={handleThemeChange}
          onClose={() => setShowThemeCustomizer(false)}
        />
      )}

      {/* Historical analytics modal */}
      {showHistorical && (
        <HistoricalAnalytics
          scheduleHistory={scheduleHistory}
          currentWeek={currentWeek}
          onClose={() => setShowHistorical(false)}
        />
      )}

      {/* Missed shifts manager */}
      {showMissedShifts && (
        <MissedShiftManager
          currentWeek={currentWeek}
          weekSchedule={currentSchedule}
          scheduleHistory={scheduleHistory}
          onClose={() => { setShowMissedShifts(false); setOpenMissedCount(getOpenRecords().length) }}
          showToast={showToast}
        />
      )}

      {/* Extended auto-schedule modal */}
      {showExtendedSchedule && (
        <ExtendedAutoSchedule
          currentWeek={currentWeek}
          scheduleHistory={scheduleHistory}
          options={autoScheduleOptions}
          onSchedule={handleExtendedSchedule}
          onClose={() => { setShowExtendedSchedule(false); setExtendedLoading(false); setExtendedProgress(null) }}
          loading={extendedLoading}
          progress={extendedProgress}
        />
      )}

      {/* Extended schedule preview */}
      {extendedPreview && (
        <ExtendedSchedulePreview
          results={extendedPreview.results}
          cumulativeStats={extendedPreview.cumulativeStats}
          startWeek={extendedPreview.startWeek}
          endWeek={extendedPreview.endWeek}
          scheduleHistory={scheduleHistory}
          onApplyAll={handleExtendedApplyAll}
          onApplySelected={handleExtendedApplySelected}
          onRejectAll={handleExtendedRejectAll}
          onClose={() => setExtendedPreview(null)}
        />
      )}

      {/* Welcome overlay */}
      {showWelcome && <WelcomeOverlay onDismiss={dismissWelcome} />}

      {/* Toast notification */}
      <div style={{
        ...styles.toast,
        background: toastBg,
        opacity: toast ? 1 : 0,
        transform: toast ? 'translateY(0)' : 'translateY(10px)',
      }}>
        {toast?.message}
      </div>
    </div>
  )
}

const styles = {
  app: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
    color: '#f1f5f9',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    transition: 'background 0.3s ease, color 0.3s ease',
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(15,23,42,0.6)',
    backdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    zIndex: 50,
    flexWrap: 'wrap',
    gap: '12px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexShrink: 0,
  },
  viewToggle: {
    display: 'flex',
    gap: '2px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '10px',
    padding: '3px',
    marginLeft: '4px',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  viewToggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    border: '1px solid transparent',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'all 0.15s',
  },
  title: {
    fontSize: '20px',
    fontWeight: 800,
    backgroundImage: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    margin: 0,
    position: 'relative',
    zIndex: 1,
    letterSpacing: '-0.3px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  undoBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--t-text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  analyticsBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 14px',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'all 0.15s',
    background: 'rgba(255,255,255,0.05)',
    color: 'var(--t-text-muted)',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    padding: '20px 32px 40px',
    margin: '0 auto',
    overflowY: 'auto',
  },
  toast: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    color: '#fff',
    padding: '12px 20px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
    transition: 'opacity 0.3s, transform 0.3s',
    pointerEvents: 'none',
    zIndex: 900,
    animation: 'toastSlideIn 0.25s ease-out',
    backdropFilter: 'blur(8px)',
    letterSpacing: '-0.1px',
  },
}

export default App
