import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Bell, X, AlertCircle, AlertTriangle, CheckCircle, Info,
  Trash2, Filter, ChevronDown, Settings, Volume2, VolumeX,
  ExternalLink, RefreshCw,
} from 'lucide-react'
import { STAFF } from '../data/staff'
import { GYMS } from '../data/gyms'
import { analyzeWeeklyAssignments, computeRotationTracking, getRotationStatus } from '../utils/analytics'
import { loadAvailability, getSetterAbsence } from '../data/availability-overrides'
import { loadInspectionRecords, getUpcomingInspections, getOverdueInspections, todayWeek as inspTodayWeek } from '../data/inspections'
import { getOpenRecords as getMissedOpenRecords, getRecordAge } from '../data/missed-shifts'

// ---- Constants ----

const STORAGE_KEY = 'climbing-notifications'
const SETTINGS_KEY = 'climbing-notification-settings'
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const NOTIF_TYPES = {
  ERROR: 'error',
  WARNING: 'warning',
  SUCCESS: 'success',
  INFO: 'info',
}

const NOTIF_CATEGORIES = {
  VIOLATION: 'violation',
  ROTATION: 'rotation',
  WORKLOAD: 'workload',
  UNASSIGNED: 'unassigned',
  SCHEDULE: 'schedule',
  INSPECTION: 'inspection',
  MISSED_SHIFT: 'missed_shift',
  BACKUP: 'backup',
}

const TYPE_CONFIG = {
  [NOTIF_TYPES.ERROR]: { icon: AlertCircle, color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' },
  [NOTIF_TYPES.WARNING]: { icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
  [NOTIF_TYPES.SUCCESS]: { icon: CheckCircle, color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)' },
  [NOTIF_TYPES.INFO]: { icon: Info, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)' },
}

// ---- localStorage helpers ----

function loadNotifications() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveNotifications(notifs) {
  try {
    // Keep only last 100
    const trimmed = notifs.slice(0, 100)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch { /* ignore */ }
}

function loadNotifSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveNotifSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}

const DEFAULT_SETTINGS = {
  enabled: true,
  violations: true,
  rotation: true,
  workload: true,
  unassigned: true,
  schedule: true,
  inspection: true,
  missedShift: true,
  backup: true,
  sound: false,
  toastDuration: 5000,
}


// ---- Notification Generation ----

function generateNotifications(violations, weekSchedule, currentWeek, scheduleHistory, prevNotifKeys) {
  const notifs = []
  const now = Date.now()

  // 1. Violation alerts
  const errorCount = violations.filter((v) => v.severity === 'error').length
  const warningCount = violations.filter((v) => v.severity === 'warning').length

  if (errorCount > 0) {
    // Group by message pattern — don't create one per violation
    const grouped = {}
    violations.filter((v) => v.severity === 'error').forEach((v) => {
      const key = v.message.slice(0, 50)
      if (!grouped[key]) grouped[key] = { ...v, count: 0 }
      grouped[key].count++
    })

    Object.values(grouped).forEach((v) => {
      const key = `violation-${currentWeek}-${v.message.slice(0, 40)}`
      if (prevNotifKeys.has(key)) return
      notifs.push({
        id: `${key}-${now}`,
        key,
        type: NOTIF_TYPES.ERROR,
        category: NOTIF_CATEGORIES.VIOLATION,
        title: v.count > 1 ? `${v.count} constraint errors` : 'Constraint Error',
        message: v.message,
        shiftKey: v.shiftKey,
        staffIds: v.staffIds,
        timestamp: now,
        read: false,
        week: currentWeek,
      })
    })
  }

  // 2. Rotation alerts
  try {
    const rotTracking = computeRotationTracking(scheduleHistory, currentWeek)
    const rotStatus = getRotationStatus(rotTracking, currentWeek)
    const overdue = rotStatus.filter((r) => r.overdue)

    if (overdue.length > 0) {
      // Group by gym
      const byGym = {}
      overdue.forEach((r) => {
        if (!byGym[r.gymName]) byGym[r.gymName] = []
        byGym[r.gymName].push(r)
      })

      Object.entries(byGym).forEach(([gymName, sections]) => {
        const key = `rotation-${currentWeek}-${gymName}-${sections.length}`
        if (prevNotifKeys.has(key)) return
        const worst = sections.reduce((a, b) => (b.weeksSinceReset > a.weeksSinceReset ? b : a), sections[0])
        notifs.push({
          id: `${key}-${now}`,
          key,
          type: NOTIF_TYPES.WARNING,
          category: NOTIF_CATEGORIES.ROTATION,
          title: `${gymName}: ${sections.length} section${sections.length > 1 ? 's' : ''} overdue`,
          message: sections.length === 1
            ? `${worst.sectionName} is ${worst.weeksSinceReset} weeks since last reset (goal: ${worst.rotationGoal})`
            : `${worst.sectionName} worst at ${worst.weeksSinceReset}wk (goal: ${worst.rotationGoal}). ${sections.map((s) => s.sectionName).join(', ')}`,
          timestamp: now,
          read: false,
          week: currentWeek,
        })
      })
    }
  } catch { /* rotation calc may fail on empty data */ }

  // 3. Workload alerts
  if (weekSchedule && Object.keys(weekSchedule).length > 0) {
    const weekStats = analyzeWeeklyAssignments(weekSchedule)
    const activeSetters = STAFF.filter((s) => weekStats[s.id]?.totalShifts > 0)

    if (activeSetters.length > 0) {
      const avg = activeSetters.reduce((sum, s) => sum + weekStats[s.id].totalShifts, 0) / activeSetters.length

      activeSetters.forEach((s) => {
        const st = weekStats[s.id]
        if (st.totalShifts >= avg + 2 && st.totalShifts >= 5) {
          const key = `workload-high-${currentWeek}-${s.id}`
          if (prevNotifKeys.has(key)) return
          notifs.push({
            id: `${key}-${now}`,
            key,
            type: NOTIF_TYPES.WARNING,
            category: NOTIF_CATEGORIES.WORKLOAD,
            title: `High workload: ${s.name}`,
            message: `${s.name} has ${st.totalShifts} shifts this week (avg ${avg.toFixed(1)})`,
            staffIds: [s.id],
            timestamp: now,
            read: false,
            week: currentWeek,
          })
        }
      })
    }

    // 4. Unassigned setter alerts
    const availData = loadAvailability()
    const unassignedByDay = {}

    DAYS.slice(0, 4).forEach((day) => {
      const unassigned = []
      STAFF.forEach((s) => {
        if (!s.availability?.includes(day)) return
        if (s.role === 'Director' && (day !== 'Monday' || currentWeek % 2 !== 0)) return
        const absence = getSetterAbsence(availData, s.id, currentWeek, day)
        if (absence) return

        let isAssigned = false
        GYMS.forEach((gym) => {
          const shift = weekSchedule[`${gym.name}-${day}`]
          if (!shift) return
          if (shift.assignedStaff?.includes(s.id)) isAssigned = true
          if (shift.holdWasher === s.id) isAssigned = true
          if (shift.flexHoldWashers?.includes(s.id)) isAssigned = true
          if (shift.additionalSections?.some((es) => es.assignedStaff?.includes(s.id))) isAssigned = true
        })
        if (!isAssigned) unassigned.push(s)
      })
      if (unassigned.length >= 3) {
        unassignedByDay[day] = unassigned
      }
    })

    Object.entries(unassignedByDay).forEach(([day, setters]) => {
      const key = `unassigned-${currentWeek}-${day}-${setters.length}`
      if (prevNotifKeys.has(key)) return
      notifs.push({
        id: `${key}-${now}`,
        key,
        type: setters.length >= 4 ? NOTIF_TYPES.ERROR : NOTIF_TYPES.WARNING,
        category: NOTIF_CATEGORIES.UNASSIGNED,
        title: `${day}: ${setters.length} setters unassigned`,
        message: setters.map((s) => s.name).join(', '),
        day,
        timestamp: now,
        read: false,
        week: currentWeek,
      })
    })
  }

  // 5. Schedule completion check
  if (weekSchedule && Object.keys(weekSchedule).length > 0 && errorCount === 0 && warningCount === 0) {
    const shiftCount = Object.values(weekSchedule).filter((s) => s?.assignedStaff?.length > 0).length
    if (shiftCount >= 6) { // meaningful number of shifts
      const key = `clean-week-${currentWeek}`
      if (!prevNotifKeys.has(key)) {
        notifs.push({
          id: `${key}-${now}`,
          key,
          type: NOTIF_TYPES.SUCCESS,
          category: NOTIF_CATEGORIES.SCHEDULE,
          title: 'Clean schedule!',
          message: `Week ${currentWeek} has ${shiftCount} shifts with zero violations.`,
          timestamp: now,
          read: false,
          week: currentWeek,
        })
      }
    }
  }

  // 6. Inspection alerts
  try {
    const inspRecords = loadInspectionRecords()
    const curWeek = inspTodayWeek()

    // Overdue inspections
    const overdueInsps = getOverdueInspections(inspRecords)
    overdueInsps.forEach((insp) => {
      const key = `inspection-overdue-${insp.id}`
      if (prevNotifKeys.has(key)) return
      notifs.push({
        id: `${key}-${now}`,
        key,
        type: NOTIF_TYPES.ERROR,
        category: NOTIF_CATEGORIES.INSPECTION,
        title: `Inspection overdue: ${insp.gyms.join(' & ')}`,
        message: `Inspection was scheduled for Week ${insp.weekNumber} (${insp.day}) and has not been completed.`,
        timestamp: now,
        read: false,
        week: insp.weekNumber,
      })
    })

    // Upcoming inspection alerts (1 week and 2 weeks out)
    const upcoming = getUpcomingInspections(inspRecords, 10)
    upcoming.forEach((insp) => {
      const weeksAway = insp.weekNumber - curWeek
      if (weeksAway === 1) {
        const key = `inspection-1wk-${insp.id}`
        if (prevNotifKeys.has(key)) return
        notifs.push({
          id: `${key}-${now}`,
          key,
          type: NOTIF_TYPES.WARNING,
          category: NOTIF_CATEGORIES.INSPECTION,
          title: `Inspection next week: ${insp.gyms.join(' & ')}`,
          message: `${insp.gyms.join(' & ')} inspection scheduled for ${insp.day}, Week ${insp.weekNumber}.`,
          timestamp: now,
          read: false,
          week: insp.weekNumber,
        })
      } else if (weeksAway === 2) {
        const key = `inspection-2wk-${insp.id}`
        if (prevNotifKeys.has(key)) return
        notifs.push({
          id: `${key}-${now}`,
          key,
          type: NOTIF_TYPES.INFO,
          category: NOTIF_CATEGORIES.INSPECTION,
          title: `Inspection in 2 weeks: ${insp.gyms.join(' & ')}`,
          message: `${insp.gyms.join(' & ')} inspection scheduled for ${insp.day}, Week ${insp.weekNumber}.`,
          timestamp: now,
          read: false,
          week: insp.weekNumber,
        })
      } else if (weeksAway === 0) {
        const key = `inspection-thisweek-${insp.id}`
        if (prevNotifKeys.has(key)) return
        notifs.push({
          id: `${key}-${now}`,
          key,
          type: NOTIF_TYPES.WARNING,
          category: NOTIF_CATEGORIES.INSPECTION,
          title: `Inspection this week: ${insp.gyms.join(' & ')}`,
          message: `${insp.gyms.join(' & ')} inspection is this ${insp.day}!`,
          timestamp: now,
          read: false,
          week: insp.weekNumber,
        })
      }
    })
  } catch { /* inspection data may not exist yet */ }

  // 7. Missed shift reminders
  try {
    const openMissed = getMissedOpenRecords()
    openMissed.forEach((rec) => {
      const daysOld = getRecordAge(rec)
      if (daysOld >= 7 && rec.status === 'open') {
        const key = `missed-unscheduled-${rec.id}-${Math.floor(daysOld / 7)}`
        if (prevNotifKeys.has(key)) return
        notifs.push({
          id: `${key}-${now}`,
          key,
          type: daysOld >= 14 ? NOTIF_TYPES.ERROR : NOTIF_TYPES.WARNING,
          category: NOTIF_CATEGORIES.MISSED_SHIFT,
          title: `Makeup not scheduled: ${rec.gymName} ${rec.section}`,
          message: rec.incompleteAnchors.length > 0
            ? `${rec.section} anchors ${rec.incompleteAnchors.join(', ')} still not scheduled (${daysOld} days ago)`
            : `${rec.section} incomplete work still not scheduled (${daysOld} days ago)`,
          timestamp: now,
          read: false,
          week: rec.weekNumber,
        })
      }
    })
  } catch { /* missed shift data may not exist yet */ }

  // 8. Backup reminder (every 2 weeks)
  try {
    const lastBackup = localStorage.getItem('climbing-last-backup')
    const daysSinceBackup = lastBackup
      ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24))
      : null
    const needsReminder = lastBackup === null || daysSinceBackup >= 14

    if (needsReminder) {
      const reminderKey = lastBackup
        ? `backup-reminder-${Math.floor(daysSinceBackup / 14)}`
        : 'backup-reminder-never'
      if (!prevNotifKeys.has(reminderKey)) {
        notifs.push({
          id: `${reminderKey}-${now}`,
          key: reminderKey,
          type: NOTIF_TYPES.INFO,
          category: NOTIF_CATEGORIES.BACKUP,
          title: 'Reminder: Export your data as backup',
          message: lastBackup
            ? `Last backup was ${daysSinceBackup} days ago. Open Settings → Data Backup to export.`
            : 'You haven\'t backed up your data yet. Open Settings → Data Backup to export.',
          timestamp: now,
          read: false,
        })
      }
    }
  } catch { /* ignore */ }

  return notifs
}


// ---- Toast Component ----

function Toast({ notification, onDismiss, onClick }) {
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.info
  const Icon = config.icon

  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        padding: '12px 14px', borderRadius: '10px',
        background: 'rgba(15,23,42,0.95)', border: `1px solid ${config.border}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
        maxWidth: '360px', cursor: onClick ? 'pointer' : 'default',
        animation: 'modalSlideIn 0.25s ease',
      }}
      onClick={onClick}
    >
      <Icon size={16} color={config.color} style={{ flexShrink: 0, marginTop: '1px' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: config.color, marginBottom: '2px' }}>
          {notification.title}
        </div>
        <div style={{
          fontSize: '11px', color: '#94a3b8', lineHeight: '1.4',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {notification.message}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '18px', height: '18px', borderRadius: '4px',
          border: 'none', background: 'rgba(255,255,255,0.06)',
          color: '#475569', cursor: 'pointer', flexShrink: 0, padding: 0,
        }}
      >
        <X size={10} />
      </button>
    </div>
  )
}


// ---- Notification Panel ----

function NotificationPanel({ notifications, onMarkRead, onMarkAllRead, onClear, onClearAll, onClose, settings, onSettingsChange }) {
  const [filter, setFilter] = useState('all')
  const [showSettings, setShowSettings] = useState(false)

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications
    if (filter === 'unread') return notifications.filter((n) => !n.read)
    return notifications.filter((n) => n.type === filter)
  }, [notifications, filter])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div style={s.panel} onClick={(e) => e.stopPropagation()}>
      <div style={s.panelHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} color="#8b5cf6" />
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>Notifications</span>
          {unreadCount > 0 && (
            <span style={s.headerBadge}>{unreadCount}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => setShowSettings((p) => !p)} style={s.panelIconBtn}
            title="Notification settings">
            <Settings size={14} />
          </button>
          {unreadCount > 0 && (
            <button onClick={onMarkAllRead} style={s.panelIconBtn} title="Mark all read">
              <CheckCircle size={14} />
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={onClearAll} style={s.panelIconBtn} title="Clear all">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={onClose} style={s.panelIconBtn}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={s.settingsSection}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>
            Notification Settings
          </div>
          <SettingToggle label="Violation alerts" value={settings.violations}
            onChange={(v) => onSettingsChange({ ...settings, violations: v })} />
          <SettingToggle label="Rotation alerts" value={settings.rotation}
            onChange={(v) => onSettingsChange({ ...settings, rotation: v })} />
          <SettingToggle label="Workload warnings" value={settings.workload}
            onChange={(v) => onSettingsChange({ ...settings, workload: v })} />
          <SettingToggle label="Unassigned alerts" value={settings.unassigned}
            onChange={(v) => onSettingsChange({ ...settings, unassigned: v })} />
          <SettingToggle label="Success messages" value={settings.schedule}
            onChange={(v) => onSettingsChange({ ...settings, schedule: v })} />
          <SettingToggle label="Inspection alerts" value={settings.inspection}
            onChange={(v) => onSettingsChange({ ...settings, inspection: v })} />
          <SettingToggle label="Missed shift reminders" value={settings.missedShift}
            onChange={(v) => onSettingsChange({ ...settings, missedShift: v })} />
          <SettingToggle label="Backup reminders" value={settings.backup}
            onChange={(v) => onSettingsChange({ ...settings, backup: v })} />
          <SettingToggle label="Sound effects" value={settings.sound}
            onChange={(v) => onSettingsChange({ ...settings, sound: v })}
            icon={settings.sound ? Volume2 : VolumeX} />
        </div>
      )}

      {/* Filter tabs */}
      <div style={s.filterRow}>
        {[
          { key: 'all', label: 'All' },
          { key: 'unread', label: 'Unread' },
          { key: 'error', label: 'Errors' },
          { key: 'warning', label: 'Warnings' },
          { key: 'success', label: 'Success' },
        ].map((f) => (
          <button
            key={f.key}
            style={{
              ...s.filterBtn,
              background: filter === f.key ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: filter === f.key ? '#a78bfa' : '#64748b',
            }}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div style={s.notifList}>
        {filtered.length === 0 ? (
          <div style={s.emptyState}>
            <Bell size={24} color="#334155" />
            <span style={{ fontSize: '12px', color: '#475569' }}>
              {filter === 'all' ? 'No notifications' : `No ${filter} notifications`}
            </span>
          </div>
        ) : (
          filtered.map((n) => {
            const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.info
            const Icon = config.icon
            const timeAgo = formatTimeAgo(n.timestamp)
            return (
              <div
                key={n.id}
                style={{
                  ...s.notifItem,
                  background: n.read ? 'transparent' : 'rgba(139,92,246,0.03)',
                  borderLeftColor: n.read ? 'transparent' : config.color,
                }}
                onClick={() => onMarkRead(n.id)}
              >
                <Icon size={14} color={config.color} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '12px', fontWeight: n.read ? 500 : 700,
                    color: n.read ? '#94a3b8' : '#e2e8f0',
                    marginBottom: '2px',
                  }}>
                    {n.title}
                  </div>
                  <div style={{
                    fontSize: '11px', color: '#64748b', lineHeight: '1.4',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>
                    Wk{n.week} &middot; {timeAgo}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onClear(n.id) }}
                  style={s.notifDismiss}
                >
                  <X size={10} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function SettingToggle({ label, value, onChange, icon: IconOverride }) {
  return (
    <label style={s.settingRow}>
      <span style={{ fontSize: '12px', color: '#cbd5e1', flex: 1 }}>{label}</span>
      {IconOverride && <IconOverride size={12} color={value ? '#10b981' : '#475569'} />}
      <button
        style={{
          ...s.toggle,
          background: value ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)',
        }}
        onClick={() => onChange(!value)}
      >
        <div style={{
          ...s.toggleKnob,
          transform: value ? 'translateX(14px)' : 'translateX(0)',
          background: value ? '#10b981' : '#475569',
        }} />
      </button>
    </label>
  )
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}


// ---- Main exported component ----

export default function NotificationSystem({
  violations,
  weekSchedule,
  currentWeek,
  scheduleHistory,
  onCellClick,
}) {
  const [notifications, setNotifications] = useState(() => loadNotifications())
  const [settings, setSettings] = useState(() => loadNotifSettings() || DEFAULT_SETTINGS)
  const [panelOpen, setPanelOpen] = useState(false)
  const [toasts, setToasts] = useState([]) // active toasts
  const prevKeysRef = useRef(new Set())
  const prevWeekRef = useRef(currentWeek)

  // Persist settings
  const handleSettingsChange = useCallback((newSettings) => {
    setSettings(newSettings)
    saveNotifSettings(newSettings)
  }, [])

  // Generate notifications when data changes
  useEffect(() => {
    if (!settings.enabled) return

    // Build set of existing notification keys to avoid duplicates
    const existingKeys = new Set(notifications.map((n) => n.key))
    prevKeysRef.current.forEach((k) => existingKeys.add(k))

    const newNotifs = generateNotifications(
      settings.violations ? violations : [],
      weekSchedule,
      currentWeek,
      scheduleHistory,
      existingKeys
    )

    // Filter by settings
    const filtered = newNotifs.filter((n) => {
      if (n.category === NOTIF_CATEGORIES.VIOLATION && !settings.violations) return false
      if (n.category === NOTIF_CATEGORIES.ROTATION && !settings.rotation) return false
      if (n.category === NOTIF_CATEGORIES.WORKLOAD && !settings.workload) return false
      if (n.category === NOTIF_CATEGORIES.UNASSIGNED && !settings.unassigned) return false
      if (n.category === NOTIF_CATEGORIES.SCHEDULE && !settings.schedule) return false
      if (n.category === NOTIF_CATEGORIES.INSPECTION && !settings.inspection) return false
      if (n.category === NOTIF_CATEGORIES.MISSED_SHIFT && !settings.missedShift) return false
      if (n.category === NOTIF_CATEGORIES.BACKUP && !settings.backup) return false
      return true
    })

    if (filtered.length > 0) {
      // Add to notifications
      setNotifications((prev) => {
        const updated = [...filtered, ...prev].slice(0, 100)
        saveNotifications(updated)
        return updated
      })

      // Show toasts for new notifications (max 3 at a time)
      const toastNotifs = filtered.slice(0, 3)
      setToasts((prev) => [...toastNotifs, ...prev].slice(0, 3))

      // Track keys so we don't re-create
      filtered.forEach((n) => prevKeysRef.current.add(n.key))
    }

    // Reset tracking when week changes
    if (prevWeekRef.current !== currentWeek) {
      prevKeysRef.current.clear()
      // Re-add current notifications keys for the new week
      notifications.forEach((n) => {
        if (n.week === currentWeek) prevKeysRef.current.add(n.key)
      })
      prevWeekRef.current = currentWeek
    }
  }, [violations, weekSchedule, currentWeek]) // intentionally sparse deps - only re-run on data changes

  // Click outside panel to close
  useEffect(() => {
    if (!panelOpen) return
    function handle(e) {
      const panel = document.getElementById('notification-panel')
      const bell = document.getElementById('notification-bell')
      if (panel && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [panelOpen])

  const unreadCount = notifications.filter((n) => !n.read).length

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const markRead = useCallback((id) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => n.id === id ? { ...n, read: true } : n)
      saveNotifications(updated)
      return updated
    })
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }))
      saveNotifications(updated)
      return updated
    })
  }, [])

  const clearNotif = useCallback((id) => {
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.id !== id)
      saveNotifications(updated)
      return updated
    })
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
    saveNotifications([])
    prevKeysRef.current.clear()
  }, [])

  const handleToastClick = useCallback((notif) => {
    dismissToast(notif.id)
    markRead(notif.id)
    if (notif.shiftKey && onCellClick) {
      const idx = notif.shiftKey.lastIndexOf('-')
      onCellClick(notif.shiftKey.slice(0, idx), notif.shiftKey.slice(idx + 1))
    }
  }, [dismissToast, markRead, onCellClick])

  return (
    <>
      {/* Bell button */}
      <button
        id="notification-bell"
        style={{
          ...s.bellBtn,
          background: panelOpen ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
          borderColor: panelOpen ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.15)',
          color: panelOpen ? '#a78bfa' : 'var(--t-text-muted)',
        }}
        onClick={() => setPanelOpen((p) => !p)}
        title="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={s.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* Toast stack */}
      {toasts.length > 0 && (
        <div style={s.toastStack}>
          {toasts.map((t) => (
            <Toast
              key={t.id}
              notification={t}
              onDismiss={() => dismissToast(t.id)}
              onClick={() => handleToastClick(t)}
            />
          ))}
        </div>
      )}

      {/* Panel */}
      {panelOpen && (
        <div id="notification-panel" style={s.panelWrapper}>
          <NotificationPanel
            notifications={notifications}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            onClear={clearNotif}
            onClearAll={clearAll}
            onClose={() => setPanelOpen(false)}
            settings={settings}
            onSettingsChange={handleSettingsChange}
          />
        </div>
      )}
    </>
  )
}


// ---- Add external notification function for App.jsx to call ----

export function createNotification(type, category, title, message, extra = {}) {
  return {
    id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    key: `ext-${title.slice(0, 20)}-${Date.now()}`,
    type,
    category,
    title,
    message,
    timestamp: Date.now(),
    read: false,
    week: extra.week ?? 0,
    ...extra,
  }
}


// ---- Styles ----

const s = {
  bellBtn: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    minWidth: '18px',
    height: '18px',
    borderRadius: '9px',
    background: '#ef4444',
    color: '#fff',
    fontSize: '10px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
  },
  toastStack: {
    position: 'fixed',
    top: '80px',
    right: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    zIndex: 500,
    pointerEvents: 'auto',
  },
  panelWrapper: {
    position: 'fixed',
    top: '70px',
    right: '16px',
    zIndex: 150,
    animation: 'modalSlideIn 0.2s ease',
  },
  panel: {
    width: '380px',
    maxHeight: 'calc(100vh - 100px)',
    background: 'rgba(15,23,42,0.98)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '14px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(12px)',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  headerBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: '10px',
    background: 'rgba(139,92,246,0.2)',
    color: '#a78bfa',
  },
  panelIconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    background: 'rgba(255,255,255,0.06)',
    color: '#64748b',
    cursor: 'pointer',
  },
  settingsSection: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  },
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
    cursor: 'pointer',
  },
  toggle: {
    width: '32px',
    height: '18px',
    borderRadius: '9px',
    border: 'none',
    padding: '2px',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.15s',
    flexShrink: 0,
  },
  toggleKnob: {
    width: '14px',
    height: '14px',
    borderRadius: '7px',
    transition: 'transform 0.15s, background 0.15s',
  },
  filterRow: {
    display: 'flex',
    gap: '2px',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    flexShrink: 0,
  },
  filterBtn: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  notifList: {
    overflowY: 'auto',
    flex: 1,
  },
  notifItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  notifDismiss: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    borderRadius: '4px',
    border: 'none',
    background: 'transparent',
    color: '#475569',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
    opacity: 0.5,
    transition: 'opacity 0.1s',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '40px 20px',
  },
}
