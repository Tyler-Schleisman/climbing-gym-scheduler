import { useState, useRef, useMemo } from 'react'
import {
  X, Settings, Download, Upload, RotateCcw, Plus, Trash2,
  Mountain, Layers, ShieldCheck, AlertTriangle,
  GripVertical, ChevronDown, ChevronUp, Clock, Calendar,
  RefreshCw, Edit3, Check, Search, ArrowUpDown, Filter,
  ClipboardCheck, HardDrive, CheckCircle, AlertCircle,
} from 'lucide-react'
import { buildDefaults, exportSettingsJSON, importSettingsJSON } from '../data/settings'
import {
  loadSectionAges, saveSectionAges, getSectionAge, setSectionAge,
  removeSectionAge, clearAllManualOverrides, setAllToDate, markAsJustReset,
  getAgeStatus, formatDateShort, dateToWeek, toISODate, todayWeek, weekToDate,
  exportAgesToCSV, importAgesFromCSV,
} from '../data/section-ages'
import {
  loadInspectionSettings, saveInspectionSettings,
  loadInspectionRecords, saveInspectionRecords,
  generateInspectionSchedule, getUpcomingInspections,
  formatDate as fmtInspDate, todayWeek as inspTodayWeek,
  toISODate as inspToISODate,
} from '../data/inspections'

const TABS = [
  { id: 'sections',     label: 'Wall Sections',      icon: Layers },
  { id: 'gyms',         label: 'Gym Schedules',      icon: Mountain },
  { id: 'constraints',  label: 'Constraint Rules',    icon: ShieldCheck },
  { id: 'inspections',  label: 'Inspections',         icon: ClipboardCheck },
  { id: 'backup',       label: 'Data Backup',         icon: HardDrive },
]

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DIFFICULTIES = ['easy', 'medium', 'hard']
const GYM_NAMES = ['Ogden', 'SLC', 'Soma']

const CONSTRAINT_META = [
  { key: 'headSetterRequired', label: 'Head Setter Must Be Present', desc: 'Head setter must be at their assigned gym Mon-Wed', hasValue: false },
  { key: 'ropeMinSetters',     label: 'Rope Minimum Setters',       desc: 'Minimum setters for rope shifts (not counting hold washer)', hasValue: true, min: 1, max: 10 },
  { key: 'ropeMaxSetters',     label: 'Rope Maximum Setters',       desc: 'Per-gym max rope setters (configured per gym in Gym Schedules tab)', hasValue: false },
  { key: 'boulderExactSetters',label: 'Boulder Exact Setter Count', desc: 'Boulder sections require exact number of setters', hasValue: false },
  { key: 'specSetterDays',     label: 'Spec Setter Day Restriction', desc: 'Spec setters can only work Monday-Tuesday', hasValue: false },
  { key: 'specSetterNoRope',   label: 'Spec Setter No Rope',        desc: 'Spec setters cannot do rope setting', hasValue: false },
  { key: 'directorHoldWash',   label: 'Director/Head No Hold Wash', desc: 'Directors and Head Setters cannot be hold washers', hasValue: false },
  { key: 'staffAvailability',  label: 'Staff Availability Check',   desc: 'Staff must be available on assigned day', hasValue: false },
  { key: 'directorSchedule',   label: 'Director Schedule',          desc: 'Director only sets on even-week Mondays', hasValue: false },
  { key: 'hardSectionLimit',   label: 'Hard Section Limit / Week',  desc: 'Max hard sections per setter per week', hasValue: true, min: 1, max: 10 },
  { key: 'washShiftLimit',     label: 'Wash Shift Limit / Week',    desc: 'Max hold wash shifts per setter per week', hasValue: true, min: 1, max: 5 },
  { key: 'boulderMinimum',     label: 'Boulder Minimum / Week',     desc: 'Minimum boulder shifts per setter per week', hasValue: true, min: 0, max: 5 },
  { key: 'ogdenFrequency',     label: 'Ogden Frequency Limit',      desc: 'Max Ogden days per setter per week (head setters exempt)', hasValue: true, min: 1, max: 5 },
  { key: 'workloadBalance',    label: 'Workload Balance Warning',   desc: 'Warn when setter workload exceeds average + 2', hasValue: false },
]

// ============================================================================
// Sub-components for each tab
// ============================================================================

function SectionAgeEditor({ gym, type, sectionName, rotationGoal, ages, onAgesChange }) {
  const entry = getSectionAge(ages, gym, type, sectionName)
  const [mode, setMode] = useState('weeks') // 'date' | 'weeks'
  const [editing, setEditing] = useState(false)
  const [dateVal, setDateVal] = useState(entry?.lastResetDate || '')
  const [weeksVal, setWeeksVal] = useState('')

  const currentWk = todayWeek()
  const weeksOld = entry ? Math.max(0, currentWk - entry.lastResetWeek) : null
  const status = getAgeStatus(weeksOld, rotationGoal)

  const handleSaveDate = () => {
    if (!dateVal) return
    const week = dateToWeek(dateVal)
    if (currentWk - week > 52) {
      if (!confirm(`This sets the age to ${currentWk - week} weeks. Are you sure?`)) return
    }
    onAgesChange(setSectionAge(ages, gym, type, sectionName, {
      lastResetDate: dateVal,
      lastResetWeek: week,
      manualOverride: true,
    }))
    setEditing(false)
  }

  const handleSaveWeeks = () => {
    const w = parseInt(weeksVal, 10)
    if (isNaN(w) || w < 0) return
    if (w > 52) {
      if (!confirm(`Setting age to ${w} weeks seems unusually old. Are you sure?`)) return
    }
    const resetWeek = currentWk - w
    const resetDate = toISODate(weekToDate(resetWeek))
    onAgesChange(setSectionAge(ages, gym, type, sectionName, {
      lastResetDate: resetDate,
      lastResetWeek: resetWeek,
      manualOverride: true,
    }))
    setEditing(false)
    setWeeksVal('')
  }

  const handleMarkJustReset = () => {
    onAgesChange(markAsJustReset(ages, gym, type, sectionName))
  }

  const handleClearOverride = () => {
    onAgesChange(removeSectionAge(ages, gym, type, sectionName))
    setEditing(false)
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
        {weeksOld != null ? (
          <span
            style={{
              fontSize: '11px', fontWeight: 700, padding: '2px 8px',
              borderRadius: '6px', background: status.bg, color: status.color,
              whiteSpace: 'nowrap',
            }}
            title={entry?.lastResetDate ? `Last reset: ${formatDateShort(entry.lastResetDate)}` : `${weeksOld} weeks since last reset`}
          >
            {weeksOld}w
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>—</span>
        )}
        {entry?.manualOverride && (
          <span style={{ fontSize: '9px', color: '#f59e0b' }} title="Manually set age">M</span>
        )}
        <button
          style={ageStyles.tinyBtn}
          onClick={() => { setEditing(true); setDateVal(entry?.lastResetDate || toISODate(new Date())); setWeeksVal(weeksOld != null ? String(weeksOld) : '') }}
          title="Edit age"
        >
          <Edit3 size={10} />
        </button>
        <button
          style={{ ...ageStyles.tinyBtn, color: '#10b981' }}
          onClick={handleMarkJustReset}
          title="Mark as just reset (0 weeks old)"
        >
          <RefreshCw size={10} />
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' }}>
      <div style={{ display: 'flex', gap: '2px' }}>
        <button
          style={{ ...ageStyles.modeBtn, ...(mode === 'date' ? ageStyles.modeBtnActive : {}) }}
          onClick={() => setMode('date')}
        >
          <Calendar size={10} /> Date
        </button>
        <button
          style={{ ...ageStyles.modeBtn, ...(mode === 'weeks' ? ageStyles.modeBtnActive : {}) }}
          onClick={() => setMode('weeks')}
        >
          <Clock size={10} /> Weeks
        </button>
      </div>
      {mode === 'date' ? (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            type="date"
            style={ageStyles.dateInput}
            value={dateVal}
            onChange={(e) => setDateVal(e.target.value)}
            max={toISODate(new Date())}
          />
          <button style={ageStyles.saveBtn} onClick={handleSaveDate}><Check size={11} /></button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            type="number"
            min="0"
            max="99"
            style={{ ...ageStyles.dateInput, width: '52px', textAlign: 'center' }}
            value={weeksVal}
            onChange={(e) => setWeeksVal(e.target.value)}
            placeholder="0"
          />
          <span style={{ fontSize: '11px', color: '#64748b' }}>wks ago</span>
          <button style={ageStyles.saveBtn} onClick={handleSaveWeeks}><Check size={11} /></button>
        </div>
      )}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button style={{ ...ageStyles.tinyBtn, fontSize: '10px', padding: '2px 6px' }} onClick={() => setEditing(false)}>Cancel</button>
        {entry?.manualOverride && (
          <button
            style={{ ...ageStyles.tinyBtn, fontSize: '10px', padding: '2px 6px', color: '#f87171' }}
            onClick={handleClearOverride}
            title="Remove manual override, revert to auto-tracking"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

const ageStyles = {
  tinyBtn: {
    background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
    padding: '2px', display: 'flex', alignItems: 'center', transition: 'color 0.15s',
    minWidth: '18px', minHeight: '18px', justifyContent: 'center',
  },
  modeBtn: {
    display: 'flex', alignItems: 'center', gap: '3px',
    padding: '3px 8px', fontSize: '10px', fontWeight: 600,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '5px', color: '#64748b', cursor: 'pointer', transition: 'all 0.1s',
  },
  modeBtnActive: {
    background: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.3)', color: '#60a5fa',
  },
  dateInput: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px', color: '#e2e8f0', padding: '4px 8px',
    fontSize: '11px', fontFamily: 'inherit', colorScheme: 'dark',
  },
  saveBtn: {
    background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: '5px', color: '#10b981', padding: '3px 6px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', minWidth: '22px', minHeight: '22px', justifyContent: 'center',
  },
}

function WallSectionsTab({ settings, onChange }) {
  const [gymTab, setGymTab] = useState('Ogden')
  const [sectionType, setSectionType] = useState('boulder')
  const [ages, setAges] = useState(() => loadSectionAges())
  const [sortBy, setSortBy] = useState('default') // 'default' | 'age' | 'name' | 'difficulty'
  const [filterMode, setFilterMode] = useState('all') // 'all' | 'overdue' | 'manual'
  const [searchQuery, setSearchQuery] = useState('')
  const [showBulkOps, setShowBulkOps] = useState(false)
  const [bulkDate, setBulkDate] = useState(toISODate(new Date()))
  const [confirmResetAll, setConfirmResetAll] = useState(false)
  const csvRef = useRef(null)

  const gymConfig = settings.gyms?.find((g) => g.name === gymTab)
  const rotationGoal = sectionType === 'boulder'
    ? (gymConfig?.boulderRotationWeeks || 5)
    : (gymConfig?.ropeRotationWeeks || 10)

  const rawSections = sectionType === 'boulder'
    ? (settings.boulderSections[gymTab] || [])
    : (settings.ropeSections[gymTab] || [])

  const currentWk = todayWeek()

  // Enrich sections with age data for sorting/filtering
  const enriched = useMemo(() => rawSections.map((sec, idx) => {
    const entry = getSectionAge(ages, gymTab, sectionType, sec.name)
    const weeksOld = entry ? Math.max(0, currentWk - entry.lastResetWeek) : null
    const goal = sec.autobelay ? 5 : rotationGoal
    return { ...sec, _idx: idx, _weeksOld: weeksOld, _isManual: !!entry?.manualOverride, _rotGoal: goal }
  }), [rawSections, ages, gymTab, sectionType, currentWk, rotationGoal])

  // Filter
  const filtered = useMemo(() => {
    let list = enriched
    if (filterMode === 'overdue') {
      list = list.filter((s) => s._weeksOld != null && s._weeksOld >= s._rotGoal)
    } else if (filterMode === 'manual') {
      list = list.filter((s) => s._isManual)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter((s) => s.name.toLowerCase().includes(q))
    }
    return list
  }, [enriched, filterMode, searchQuery])

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered]
    if (sortBy === 'age') {
      arr.sort((a, b) => (b._weeksOld ?? 999) - (a._weeksOld ?? 999))
    } else if (sortBy === 'name') {
      arr.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === 'difficulty') {
      const order = { hard: 0, medium: 1, easy: 2 }
      arr.sort((a, b) => (order[a.difficulty] ?? 1) - (order[b.difficulty] ?? 1))
    }
    return arr
  }, [filtered, sortBy])

  const updateSection = (idx, field, value) => {
    const key = sectionType === 'boulder' ? 'boulderSections' : 'ropeSections'
    const pool = { ...settings[key] }
    pool[gymTab] = pool[gymTab].map((sec, i) =>
      i === idx ? { ...sec, [field]: value } : sec
    )
    onChange({ ...settings, [key]: pool })
  }

  const addSection = () => {
    const key = sectionType === 'boulder' ? 'boulderSections' : 'ropeSections'
    const pool = { ...settings[key] }
    const newSec = sectionType === 'boulder'
      ? { name: 'New Section', settersRequired: 4, difficulty: 'medium' }
      : { name: 'New Section', anchors: [1], difficulty: 'medium' }
    pool[gymTab] = [...(pool[gymTab] || []), newSec]
    onChange({ ...settings, [key]: pool })
  }

  const removeSection = (idx) => {
    const key = sectionType === 'boulder' ? 'boulderSections' : 'ropeSections'
    const pool = { ...settings[key] }
    const sec = pool[gymTab][idx]
    if (sec) removeSectionAge(ages, gymTab, sectionType, sec.name)
    pool[gymTab] = pool[gymTab].filter((_, i) => i !== idx)
    onChange({ ...settings, [key]: pool })
  }

  const moveSection = (idx, dir) => {
    const newIdx = idx + dir
    const key = sectionType === 'boulder' ? 'boulderSections' : 'ropeSections'
    const pool = { ...settings[key] }
    const arr = [...pool[gymTab]]
    if (newIdx < 0 || newIdx >= arr.length) return
    ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
    pool[gymTab] = arr
    onChange({ ...settings, [key]: pool })
  }

  // Bulk operations
  const handleSetAllToDate = () => {
    if (!bulkDate) return
    const allSecs = rawSections.map((sec) => ({ gym: gymTab, type: sectionType, name: sec.name }))
    setAges(setAllToDate(ages, allSecs, bulkDate))
  }

  const handleResetAllAges = () => {
    if (!confirmResetAll) {
      setConfirmResetAll(true)
      setTimeout(() => setConfirmResetAll(false), 3000)
      return
    }
    setAges(clearAllManualOverrides(ages))
    setConfirmResetAll(false)
  }

  const handleExportCSV = () => {
    const allGyms = GYM_NAMES
    const allSections = []
    allGyms.forEach((g) => {
      ;(settings.boulderSections[g] || []).forEach((sec) => allSections.push({ gym: g, type: 'boulder', name: sec.name }))
      ;(settings.ropeSections[g] || []).forEach((sec) => allSections.push({ gym: g, type: 'rope', name: sec.name }))
    })
    const csv = exportAgesToCSV(ages, allSections)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'section-ages.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const imported = importAgesFromCSV(reader.result)
      if (imported) {
        const merged = { ...ages, ...imported }
        saveSectionAges(merged)
        setAges(merged)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Count overdue for badge
  const overdueCount = enriched.filter((s) => s._weeksOld != null && s._weeksOld >= s._rotGoal).length
  const manualCount = enriched.filter((s) => s._isManual).length

  return (
    <div style={s.tabBody}>
      <div style={s.tabDesc}>
        Edit wall sections and track reset ages. Manually set when a section was last reset to help the auto-scheduler prioritize overdue walls.
      </div>

      {/* Gym + type selector */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={s.subTabs}>
          {GYM_NAMES.map((g) => (
            <button key={g} style={{ ...s.subTab, ...(gymTab === g ? s.subTabActive : {}) }} onClick={() => setGymTab(g)}>{g}</button>
          ))}
          <div style={s.subTabSpacer} />
          <button style={{ ...s.subTab, ...(sectionType === 'boulder' ? s.subTabActive : {}) }} onClick={() => setSectionType('boulder')}>Boulder</button>
          <button style={{ ...s.subTab, ...(sectionType === 'rope' ? s.subTabActive : {}) }} onClick={() => setSectionType('rope')}>Rope</button>
        </div>
        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>
          Rotation goal: <strong style={{ color: '#e2e8f0' }}>{rotationGoal}w</strong>
        </span>
      </div>

      {/* Search + Sort + Filter bar */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 140px', minWidth: '120px', maxWidth: '220px' }}>
          <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input
            style={{ ...s.cellInput, paddingLeft: '26px', fontSize: '12px' }}
            placeholder="Search sections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          style={{ ...s.cellSelect, fontSize: '11px', padding: '5px 8px' }}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="default">Default Order</option>
          <option value="age">Sort by Age</option>
          <option value="name">Sort by Name</option>
          <option value="difficulty">Sort by Difficulty</option>
        </select>
        <select
          style={{ ...s.cellSelect, fontSize: '11px', padding: '5px 8px' }}
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value)}
        >
          <option value="all">All ({enriched.length})</option>
          <option value="overdue">Overdue ({overdueCount})</option>
          <option value="manual">Manual ({manualCount})</option>
        </select>
        <button
          style={{ ...s.subTab, fontSize: '11px', padding: '5px 10px', minHeight: '28px' }}
          onClick={() => setShowBulkOps(!showBulkOps)}
        >
          {showBulkOps ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          Bulk
        </button>
      </div>

      {/* Bulk operations panel */}
      {showBulkOps && (
        <div style={{
          padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '10px',
          flexWrap: 'wrap', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Set all to date:</span>
            <input
              type="date"
              style={ageStyles.dateInput}
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              max={toISODate(new Date())}
            />
            <button style={{ ...s.subTab, fontSize: '11px', padding: '4px 10px', minHeight: '26px' }} onClick={handleSetAllToDate}>
              Apply
            </button>
          </div>
          <div style={s.subTabSpacer} />
          <button
            style={{
              ...s.subTab, fontSize: '11px', padding: '4px 10px', minHeight: '26px',
              ...(confirmResetAll ? { background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' } : {}),
            }}
            onClick={handleResetAllAges}
          >
            {confirmResetAll ? 'Confirm Clear' : 'Clear All Overrides'}
          </button>
          <div style={s.subTabSpacer} />
          <button style={{ ...s.subTab, fontSize: '11px', padding: '4px 10px', minHeight: '26px' }} onClick={handleExportCSV}>
            <Download size={11} /> Export CSV
          </button>
          <button style={{ ...s.subTab, fontSize: '11px', padding: '4px 10px', minHeight: '26px' }} onClick={() => csvRef.current?.click()}>
            <Upload size={11} /> Import CSV
          </button>
          <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCSV} />
        </div>
      )}

      {/* Section table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: '36px' }} />
              <th style={{ ...s.th, minWidth: '130px' }}>Name</th>
              {sectionType === 'boulder' ? (
                <th style={{ ...s.th, width: '70px' }}>Setters</th>
              ) : (
                <th style={{ ...s.th, minWidth: '100px' }}>Anchors</th>
              )}
              <th style={{ ...s.th, width: '80px' }}>Difficulty</th>
              {sectionType === 'rope' && <th style={{ ...s.th, width: '36px' }}>AB</th>}
              {sectionType === 'rope' && <th style={{ ...s.th, minWidth: '120px' }}>Special Rules</th>}
              <th style={{ ...s.th, minWidth: '180px' }}>
                Last Reset
                <span style={{ fontSize: '9px', color: '#475569', marginLeft: '4px', fontWeight: 400, textTransform: 'none' }}
                  title="Manually set when a section was last reset. Overrides auto-tracking until the section is actually reset in the schedule."
                >?</span>
              </th>
              <th style={{ ...s.th, width: '36px' }} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={sectionType === 'rope' ? 8 : 6} style={{ ...s.td, textAlign: 'center', color: '#475569', padding: '20px' }}>
                {searchQuery || filterMode !== 'all' ? 'No sections match filters' : 'No sections configured'}
              </td></tr>
            )}
            {sorted.map((sec) => {
              const idx = sec._idx
              const status = getAgeStatus(sec._weeksOld, sec._rotGoal)
              return (
                <tr key={idx} style={{
                  ...s.tr,
                  borderLeft: sec._weeksOld != null ? `3px solid ${status.color}` : '3px solid transparent',
                }}>
                  <td style={s.td}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <button style={s.moveBtn} onClick={() => moveSection(idx, -1)} disabled={idx === 0} title="Move up">&#9650;</button>
                      <button style={s.moveBtn} onClick={() => moveSection(idx, 1)} disabled={idx === rawSections.length - 1} title="Move down">&#9660;</button>
                    </div>
                  </td>
                  <td style={s.td}>
                    <input style={s.cellInput} value={sec.name} onChange={(e) => updateSection(idx, 'name', e.target.value)} />
                  </td>
                  {sectionType === 'boulder' ? (
                    <td style={s.td}>
                      <input
                        type="number" min="1" max="20"
                        style={{ ...s.cellInput, width: '54px', textAlign: 'center' }}
                        value={sec.settersRequired}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10)
                          if (v >= 1) updateSection(idx, 'settersRequired', v)
                        }}
                      />
                    </td>
                  ) : (
                    <td style={s.td}>
                      <input
                        style={s.cellInput}
                        value={(sec.anchors || []).join(', ')}
                        onChange={(e) => {
                          const anchors = e.target.value
                            .split(/[,\s]+/)
                            .map(Number)
                            .filter((n) => !isNaN(n) && n > 0)
                          updateSection(idx, 'anchors', anchors.length > 0 ? anchors : [1])
                        }}
                        title="Comma-separated anchor numbers"
                      />
                    </td>
                  )}
                  <td style={s.td}>
                    <select style={s.cellSelect} value={sec.difficulty} onChange={(e) => updateSection(idx, 'difficulty', e.target.value)}>
                      {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                  {sectionType === 'rope' && (
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!sec.autobelay}
                        onChange={(e) => updateSection(idx, 'autobelay', e.target.checked || undefined)}
                        style={s.checkbox}
                      />
                    </td>
                  )}
                  {sectionType === 'rope' && (
                    <td style={s.td}>
                      <input
                        style={s.cellInput}
                        value={sec.specialRules || ''}
                        onChange={(e) => updateSection(idx, 'specialRules', e.target.value || undefined)}
                        placeholder="e.g. Two days: 4 setters day 1"
                      />
                    </td>
                  )}
                  <td style={s.td}>
                    <SectionAgeEditor
                      gym={gymTab}
                      type={sectionType}
                      sectionName={sec.name}
                      rotationGoal={sec._rotGoal}
                      ages={ages}
                      onAgesChange={setAges}
                    />
                  </td>
                  <td style={s.td}>
                    <button style={s.rowDeleteBtn} onClick={() => removeSection(idx)} title="Remove section">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button style={s.addRowBtn} onClick={addSection}>
        <Plus size={13} /> Add {sectionType === 'boulder' ? 'Boulder' : 'Rope'} Section
      </button>
    </div>
  )
}

function GymSchedulesTab({ settings, onChange }) {
  const { gyms } = settings

  const updateGym = (idx, field, value) => {
    const next = gyms.map((g, i) => i === idx ? { ...g, [field]: value } : g)
    onChange({ ...settings, gyms: next })
  }

  const toggleGymDay = (idx, field, day) => {
    const g = gyms[idx]
    const arr = g[field] || []
    const next = arr.includes(day) ? arr.filter((d) => d !== day) : [...arr, day]
    updateGym(idx, field, next)
  }

  return (
    <div style={s.tabBody}>
      <div style={s.tabDesc}>
        Configure each gym's schedule: which days have boulder/rope/flex/hold-wash shifts, setter limits, and rotation cycle lengths.
      </div>

      {gyms.map((gym, gIdx) => (
        <div key={gym.name} style={s.gymCard}>
          <div style={s.gymCardHeader}>
            <Mountain size={16} color="#3b82f6" />
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>{gym.name}</span>
          </div>

          <div style={s.gymGrid}>
            {/* Day type grids */}
            {[
              { field: 'boulderDays', label: 'Boulder Days', color: '#3b82f6' },
              { field: 'ropeDays',    label: 'Rope Days',    color: '#8b5cf6' },
              { field: 'flexDays',    label: 'Flex Days',    color: '#10b981' },
              { field: 'holdWashDays',    label: 'Hold Wash Days',     color: '#06b6d4' },
              { field: 'flexHoldWashDays',label: 'Flex Wash Days',     color: '#fbbf24' },
            ].map(({ field, label, color }) => (
              <div key={field} style={s.gymDayGroup}>
                <span style={{ ...s.gymDayLabel, color }}>{label}</span>
                <div style={s.gymDayRow}>
                  {DAYS.map((day) => {
                    const active = (gym[field] || []).includes(day)
                    return (
                      <button
                        key={day}
                        style={{
                          ...s.gymDayBtn,
                          background: active ? color + '25' : 'rgba(255,255,255,0.03)',
                          borderColor: active ? color + '60' : 'rgba(255,255,255,0.08)',
                          color: active ? color : '#475569',
                        }}
                        onClick={() => toggleGymDay(gIdx, field, day)}
                      >
                        {day.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Numeric fields */}
            <div style={s.gymNumRow}>
              {[
                { field: 'maxRopeSetters',      label: 'Max Rope Setters',   min: 1, max: 20 },
                { field: 'maxHoldWashers',      label: 'Max Hold Washers',   min: 1, max: 4 },
                { field: 'ropeRotationWeeks',    label: 'Rope Rotation (wks)', min: 1, max: 52 },
                { field: 'boulderRotationWeeks', label: 'Boulder Rotation',    min: 1, max: 52 },
                { field: 'schoolRoomWeeks',      label: 'School Room (wks)',    min: 1, max: 52 },
              ].map(({ field, label, min, max }) => (
                <div key={field} style={s.gymNumField}>
                  <label style={s.gymNumLabel}>{label}</label>
                  <input
                    type="number" min={min} max={max}
                    style={s.numInput}
                    value={gym[field] ?? ''}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!isNaN(v) && v >= min) updateGym(gIdx, field, v)
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ConstraintRulesTab({ settings, onChange }) {
  const { constraints } = settings

  const updateConstraint = (key, field, value) => {
    onChange({
      ...settings,
      constraints: {
        ...constraints,
        [key]: { ...constraints[key], [field]: value },
      },
    })
  }

  return (
    <div style={s.tabBody}>
      <div style={s.tabDesc}>
        Toggle constraint rules on/off and adjust their severity. Changes affect real-time validation and auto-scheduling.
      </div>

      <div style={s.constraintList}>
        {CONSTRAINT_META.map((meta) => {
          const rule = constraints[meta.key] || { enabled: true, severity: 'warning' }
          return (
            <div key={meta.key} style={{
              ...s.constraintRow,
              opacity: rule.enabled ? 1 : 0.5,
            }}>
              {/* Toggle */}
              <button
                style={{
                  ...s.toggle,
                  background: rule.enabled ? '#10b981' : 'rgba(255,255,255,0.1)',
                }}
                onClick={() => updateConstraint(meta.key, 'enabled', !rule.enabled)}
                title={rule.enabled ? 'Disable' : 'Enable'}
              >
                <div style={{
                  ...s.toggleKnob,
                  transform: rule.enabled ? 'translateX(16px)' : 'translateX(0)',
                }} />
              </button>

              {/* Label + desc */}
              <div style={s.constraintInfo}>
                <span style={s.constraintLabel}>{meta.label}</span>
                <span style={s.constraintDesc}>{meta.desc}</span>
              </div>

              {/* Severity selector */}
              <select
                style={{
                  ...s.severitySelect,
                  color: rule.severity === 'error' ? '#f87171' : '#fbbf24',
                  borderColor: rule.severity === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)',
                }}
                value={rule.severity}
                onChange={(e) => updateConstraint(meta.key, 'severity', e.target.value)}
                disabled={!rule.enabled}
              >
                <option value="error">Error</option>
                <option value="warning">Warning</option>
              </select>

              {/* Value input */}
              {meta.hasValue && (
                <input
                  type="number"
                  min={meta.min} max={meta.max}
                  style={s.constraintNumInput}
                  value={rule.value ?? ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!isNaN(v) && v >= meta.min) updateConstraint(meta.key, 'value', v)
                  }}
                  disabled={!rule.enabled}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InspectionsTab() {
  const [settings, setSettings] = useState(() => loadInspectionSettings())
  const [records, setRecords] = useState(() => loadInspectionRecords())
  const [confirmClear, setConfirmClear] = useState(false)

  const update = (field, value) => {
    const next = { ...settings, [field]: value }
    setSettings(next)
    saveInspectionSettings(next)
  }

  const toggleGym = (gymName) => {
    const gyms = settings.gymsToInspect.includes(gymName)
      ? settings.gymsToInspect.filter((g) => g !== gymName)
      : [...settings.gymsToInspect, gymName]
    update('gymsToInspect', gyms)
  }

  const handleGenerate = () => {
    const newRecs = generateInspectionSchedule(settings)
    if (newRecs.length === 0) return
    const kept = records.filter((r) => r.status === 'completed' || r.status === 'missed')
    const merged = [...kept, ...newRecs]
    saveInspectionRecords(merged)
    setRecords(merged)
    update('generatedThrough', newRecs[newRecs.length - 1]?.weekNumber)
  }

  const handleReset = () => {
    saveInspectionRecords([])
    setRecords([])
    const newRecs = generateInspectionSchedule(settings)
    saveInspectionRecords(newRecs)
    setRecords(newRecs)
  }

  const handleClearAll = () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return }
    saveInspectionRecords([])
    setRecords([])
    setConfirmClear(false)
  }

  const upcoming = getUpcomingInspections(records, 5)

  return (
    <div style={s.tabBody}>
      <div style={s.tabDesc}>
        Configure automatic inspection scheduling. Inspections appear as indicators in the schedule views and can be tracked in the Inspections panel.
      </div>

      {/* Enable toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 14px', borderRadius: '10px',
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button
          style={{ ...s.toggle, background: settings.enabled ? '#10b981' : 'rgba(255,255,255,0.1)' }}
          onClick={() => update('enabled', !settings.enabled)}
        >
          <div style={{ ...s.toggleKnob, transform: settings.enabled ? 'translateX(16px)' : 'translateX(0)' }} />
        </button>
        <div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>Enable Automatic Inspection Scheduling</span>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>Generate inspection dates based on frequency and gym settings</p>
        </div>
      </div>

      {/* Schedule Configuration */}
      <div style={inspStyles.section}>
        <h4 style={inspStyles.sectionTitle}>Inspection Schedule Configuration</h4>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={inspStyles.label}>Frequency (weeks)</label>
            <input
              type="number" min="1" max="52"
              style={{ ...s.numInput, width: '80px' }}
              value={settings.frequencyWeeks}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 1) update('frequencyWeeks', v) }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={inspStyles.label}>Inspection Day</label>
            <select style={s.cellSelect} value={settings.inspectionDay} onChange={(e) => update('inspectionDay', e.target.value)}>
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* Gyms to inspect */}
        <div style={{ marginTop: '12px' }}>
          <label style={inspStyles.label}>Gyms to Inspect</label>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            {GYM_NAMES.map((g) => {
              const active = settings.gymsToInspect.includes(g)
              return (
                <button key={g} style={{
                  ...s.subTab,
                  ...(active ? { background: 'rgba(6,182,212,0.15)', borderColor: 'rgba(6,182,212,0.3)', color: '#06b6d4' } : {}),
                }} onClick={() => toggleGym(g)}>
                  {active && <Check size={12} />} {g}
                </button>
              )
            })}
          </div>
        </div>

        {/* Inspection mode */}
        <div style={{ marginTop: '12px' }}>
          <label style={inspStyles.label}>Inspection Mode</label>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            {[
              { id: 'same', label: 'Same Day', desc: 'All gyms on same day' },
              { id: 'alternating', label: 'Alternating', desc: 'Rotate between gyms' },
              { id: 'custom', label: 'Custom', desc: 'Per-gym schedules' },
            ].map((m) => (
              <button key={m.id} style={{
                ...s.subTab,
                flexDirection: 'column', alignItems: 'flex-start', gap: '2px', padding: '8px 12px',
                ...(settings.mode === m.id ? { background: 'rgba(6,182,212,0.15)', borderColor: 'rgba(6,182,212,0.3)', color: '#06b6d4' } : {}),
              }} onClick={() => update('mode', m.id)}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{m.label}</span>
                <span style={{ fontSize: '10px', color: '#475569' }}>{m.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Starting Point */}
      <div style={inspStyles.section}>
        <h4 style={inspStyles.sectionTitle}>Starting Point</h4>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={inspStyles.label}>Last Inspection Date</label>
            <input
              type="date"
              style={{ ...s.cellInput, width: '170px', colorScheme: 'dark' }}
              value={settings.lastInspectionDate || ''}
              onChange={(e) => update('lastInspectionDate', e.target.value || null)}
            />
          </div>
          <button style={{ ...s.addRowBtn, padding: '7px 16px', minHeight: '34px' }} onClick={handleGenerate}>
            <RefreshCw size={13} /> Generate Schedule
          </button>
        </div>
      </div>

      {/* Next 5 inspections preview */}
      {upcoming.length > 0 && (
        <div style={inspStyles.section}>
          <h4 style={inspStyles.sectionTitle}>Next {upcoming.length} Scheduled Inspections</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {upcoming.map((rec, i) => {
              const weeksAway = rec.weekNumber - inspTodayWeek()
              return (
                <div key={rec.id || i} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 12px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <ClipboardCheck size={14} color="#06b6d4" />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', minWidth: '100px' }}>
                    {rec.gyms.join(' & ')}
                  </span>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {fmtInspDate(rec.date)} (Week {rec.weekNumber}, {rec.day})
                  </span>
                  <span style={{
                    fontSize: '10px', fontWeight: 600, marginLeft: 'auto',
                    padding: '2px 6px', borderRadius: '4px',
                    background: weeksAway <= 2 ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)',
                    color: weeksAway <= 2 ? '#f59e0b' : '#60a5fa',
                  }}>
                    In {weeksAway}w
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button style={s.subTab} onClick={handleReset}>
          <RotateCcw size={12} /> Reset & Regenerate
        </button>
        <button
          style={{
            ...s.subTab,
            ...(confirmClear ? { background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' } : {}),
          }}
          onClick={handleClearAll}
        >
          <Trash2 size={12} /> {confirmClear ? 'Confirm Clear' : 'Clear All'}
        </button>
      </div>
    </div>
  )
}

const inspStyles = {
  section: {
    padding: '14px', borderRadius: '10px',
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column', gap: '8px',
  },
  sectionTitle: { margin: 0, fontSize: '14px', fontWeight: 700, color: '#e2e8f0' },
  label: { fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px' },
}

// ============================================================================
// Data Backup Tab
// ============================================================================

const BACKUP_STORAGE_KEY = 'climbing-last-backup'
const ALL_STORAGE_KEYS = [
  { key: 'climbing-schedule', label: 'Schedules', desc: 'All week schedules and assignments' },
  { key: 'climbing-scheduler-settings', label: 'Settings', desc: 'Constraints, gym config, sections' },
  { key: 'climbing-section-ages', label: 'Section Ages', desc: 'Manual wall section age overrides' },
  { key: 'climbing-setter-preferences', label: 'Setter Preferences', desc: 'Setter scheduling preferences' },
  { key: 'climbing-inspection-settings', label: 'Inspection Settings', desc: 'Inspection frequency and config' },
  { key: 'climbing-inspection-records', label: 'Inspection Records', desc: 'Scheduled and completed inspections' },
  { key: 'climbing-missed-shifts', label: 'Missed Shifts', desc: 'Incomplete anchors and makeup work' },
  { key: 'climbing-availability-overrides', label: 'Availability', desc: 'Sick days, vacations, absences' },
  { key: 'climbing-notifications', label: 'Notifications', desc: 'Notification history' },
  { key: 'climbing-notification-settings', label: 'Notification Settings', desc: 'Notification preferences' },
  { key: 'climbing-schedule-options', label: 'Auto-Schedule Options', desc: 'Algorithm preferences' },
  { key: 'climbing-scheduler-theme', label: 'Theme', desc: 'Color and style settings' },
]

function getLastBackupDate() {
  try {
    const raw = localStorage.getItem(BACKUP_STORAGE_KEY)
    return raw || null
  } catch { return null }
}

function setLastBackupDate() {
  localStorage.setItem(BACKUP_STORAGE_KEY, new Date().toISOString())
}

function DataBackupTab() {
  const fileRef = useRef(null)
  const [importStatus, setImportStatus] = useState(null) // null | 'success' | 'error' | 'merge-success'
  const [importMessage, setImportMessage] = useState('')
  const [lastBackup, setLastBackup] = useState(() => getLastBackupDate())

  // Calculate data sizes
  const dataStats = useMemo(() => {
    let totalSize = 0
    const items = ALL_STORAGE_KEYS.map(({ key, label }) => {
      const raw = localStorage.getItem(key)
      const size = raw ? new Blob([raw]).size : 0
      totalSize += size
      return { key, label, size, hasData: !!raw }
    })
    return { items, totalSize, itemsWithData: items.filter((i) => i.hasData).length }
  }, [importStatus]) // recalculate after import

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleExportAll = () => {
    const backup = { _meta: { version: 1, exportedAt: new Date().toISOString(), app: 'climbing-scheduler' } }
    ALL_STORAGE_KEYS.forEach(({ key }) => {
      const raw = localStorage.getItem(key)
      if (raw) {
        try { backup[key] = JSON.parse(raw) }
        catch { backup[key] = raw }
      }
    })

    const json = JSON.stringify(backup, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const date = new Date().toISOString().slice(0, 10)
    a.download = `climbing-scheduler-backup-${date}.json`
    a.click()
    URL.revokeObjectURL(url)

    setLastBackupDate()
    setLastBackup(new Date().toISOString())
    setImportStatus('success')
    setImportMessage('Backup exported successfully')
    setTimeout(() => setImportStatus(null), 3000)
  }

  const handleImport = (mode) => (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        if (!data || typeof data !== 'object') {
          setImportStatus('error')
          setImportMessage('Invalid backup file format')
          return
        }

        let restored = 0
        ALL_STORAGE_KEYS.forEach(({ key }) => {
          if (data[key] !== undefined) {
            if (mode === 'replace') {
              localStorage.setItem(key, typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]))
              restored++
            } else {
              // Merge mode: only restore keys that don't already have data
              const existing = localStorage.getItem(key)
              if (!existing) {
                localStorage.setItem(key, typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]))
                restored++
              }
            }
          }
        })

        setImportStatus(mode === 'replace' ? 'success' : 'merge-success')
        setImportMessage(`${mode === 'replace' ? 'Restored' : 'Merged'} ${restored} data categories. Reload the page to see changes.`)
      } catch {
        setImportStatus('error')
        setImportMessage('Failed to parse backup file. Make sure it\'s a valid JSON export.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const lastBackupAge = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / (24 * 60 * 60 * 1000)) : null

  return (
    <div style={s.tabBody}>
      <div style={s.tabDesc}>
        Export all your schedule data as a backup file, or import a previously exported backup.
        Your data is stored locally in this browser — exporting regularly protects against data loss.
      </div>

      {/* Status message */}
      {importStatus && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 14px', borderRadius: '10px',
          background: importStatus === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
          border: `1px solid ${importStatus === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`,
        }}>
          {importStatus === 'error'
            ? <AlertCircle size={14} color="#ef4444" />
            : <CheckCircle size={14} color="#10b981" />}
          <span style={{ fontSize: '12px', color: importStatus === 'error' ? '#f87171' : '#34d399', fontWeight: 600 }}>
            {importMessage}
          </span>
        </div>
      )}

      {/* Last backup info */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderRadius: '10px',
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '4px' }}>
            Last Backup
          </div>
          {lastBackup ? (
            <div style={{ fontSize: '14px', color: '#e2e8f0', fontWeight: 600 }}>
              {new Date(lastBackup).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              <span style={{
                marginLeft: '8px', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                background: lastBackupAge > 14 ? 'rgba(239,68,68,0.15)' : lastBackupAge > 7 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                color: lastBackupAge > 14 ? '#f87171' : lastBackupAge > 7 ? '#fbbf24' : '#34d399',
              }}>
                {lastBackupAge === 0 ? 'Today' : lastBackupAge === 1 ? '1 day ago' : `${lastBackupAge} days ago`}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: '13px', color: '#f87171', fontWeight: 600 }}>
              Never backed up
            </div>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          {dataStats.itemsWithData} / {dataStats.items.length} categories · {formatSize(dataStats.totalSize)}
        </div>
      </div>

      {/* Export button */}
      <button
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          width: '100%', padding: '14px 20px', borderRadius: '10px', border: 'none',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
          fontSize: '14px', fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(59,130,246,0.3)', minHeight: '48px',
        }}
        onClick={handleExportAll}
      >
        <Download size={18} /> Export All Data
      </button>

      {/* Import buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '12px 16px', borderRadius: '10px',
            border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)',
            color: '#10b981', fontSize: '13px', fontWeight: 600, cursor: 'pointer', minHeight: '44px',
          }}
          onClick={() => {
            fileRef.current.onchange = handleImport('replace')
            fileRef.current?.click()
          }}
        >
          <Upload size={14} /> Import & Replace All
        </button>
        <button
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '12px 16px', borderRadius: '10px',
            border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)',
            color: '#60a5fa', fontSize: '13px', fontWeight: 600, cursor: 'pointer', minHeight: '44px',
          }}
          onClick={() => {
            fileRef.current.onchange = handleImport('merge')
            fileRef.current?.click()
          }}
        >
          <Upload size={14} /> Import & Merge (Fill Gaps)
        </button>
      </div>
      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} />

      <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.5 }}>
        <strong>Replace</strong> overwrites all existing data with the backup. <strong>Merge</strong> only fills in categories that don't already have data.
      </div>

      {/* Data categories breakdown */}
      <div style={{ marginTop: '4px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '8px' }}>
          Stored Data
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {dataStats.items.map(({ key, label, size, hasData }) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 10px', borderRadius: '6px',
              background: hasData ? 'rgba(255,255,255,0.02)' : 'transparent',
              opacity: hasData ? 1 : 0.4,
            }}>
              <div style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: hasData ? '#10b981' : '#475569', flexShrink: 0,
              }} />
              <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 500, flex: 1 }}>
                {label}
              </span>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
                {hasData ? formatSize(size) : 'Empty'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main SettingsPanel
// ============================================================================

export default function SettingsPanel({ settings, onChange, onClose }) {
  const [activeTab, setActiveTab] = useState('sections')
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef(null)

  const handleExport = () => {
    const json = exportSettingsJSON(settings)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'scheduler-settings.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const imported = importSettingsJSON(reader.result)
      if (imported) onChange(imported)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 3000)
      return
    }
    onChange(buildDefaults())
    setConfirmReset(false)
  }

  // Detect whether settings differ from defaults for the warning banner
  const defaults = buildDefaults()
  const hasChanges =
    JSON.stringify(settings.staff) !== JSON.stringify(defaults.staff) ||
    JSON.stringify(settings.gyms) !== JSON.stringify(defaults.gyms) ||
    JSON.stringify(settings.boulderSections) !== JSON.stringify(defaults.boulderSections) ||
    JSON.stringify(settings.ropeSections) !== JSON.stringify(defaults.ropeSections) ||
    JSON.stringify(settings.constraints) !== JSON.stringify(defaults.constraints)

  const TabContent = {
    sections: WallSectionsTab,
    gyms: GymSchedulesTab,
    constraints: ConstraintRulesTab,
    inspections: InspectionsTab,
    backup: DataBackupTab,
  }[activeTab]

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={20} color="#8b5cf6" />
            <h2 style={s.title}>Settings</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button style={s.headerBtn} onClick={handleExport} title="Export all settings as JSON">
              <Download size={13} /> Export
            </button>
            <button style={s.headerBtn} onClick={() => fileRef.current?.click()} title="Import settings from JSON">
              <Upload size={13} /> Import
            </button>
            <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            <button
              style={{
                ...s.headerBtn,
                background: confirmReset ? 'rgba(239,68,68,0.2)' : undefined,
                borderColor: confirmReset ? 'rgba(239,68,68,0.4)' : undefined,
                color: confirmReset ? '#f87171' : undefined,
              }}
              onClick={handleReset}
              title="Reset all settings to defaults"
            >
              <RotateCcw size={13} />
              {confirmReset ? 'Confirm Reset' : 'Reset'}
            </button>
            <button style={s.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Changes warning */}
        {hasChanges && (
          <div style={s.warningBanner}>
            <AlertTriangle size={14} color="#f59e0b" />
            <span>Settings differ from defaults. Changes affect validation and auto-scheduling for all weeks.</span>
          </div>
        )}

        {/* Tabs */}
        <div style={s.tabBar}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              style={{
                ...s.tabBtn,
                background: activeTab === id ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: activeTab === id ? '#a78bfa' : '#64748b',
                borderColor: activeTab === id ? 'rgba(139,92,246,0.4)' : 'transparent',
              }}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={s.tabContent}>
          <TabContent settings={settings} onChange={onChange} />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100, padding: '16px',
    animation: 'modalFadeIn 0.2s ease-out',
  },
  modal: {
    background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
    borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
    width: '100%', maxWidth: '1060px', maxHeight: '92vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)',
    animation: 'modalSlideIn 0.25s ease-out', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
  },
  title: { margin: 0, fontSize: '18px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.2px' },
  closeBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px', color: '#94a3b8', padding: '8px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', transition: 'all 0.15s',
    minWidth: '36px', minHeight: '36px', justifyContent: 'center',
  },
  headerBtn: {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '7px 12px', fontSize: '12px', fontWeight: 600,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#94a3b8', cursor: 'pointer', transition: 'all 0.15s',
    minHeight: '34px',
  },
  warningBanner: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 24px', fontSize: '13px', fontWeight: 500, color: '#fbbf24',
    background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.15)',
    flexShrink: 0, lineHeight: 1.5,
  },
  tabBar: {
    display: 'flex', gap: '2px', padding: '12px 24px 0', flexShrink: 0,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    overflowX: 'auto',
  },
  tabBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '10px 16px', border: '1px solid transparent',
    borderBottom: 'none', borderRadius: '10px 10px 0 0',
    cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all 0.15s',
    whiteSpace: 'nowrap', minHeight: '40px',
  },
  tabContent: {
    flex: 1, overflowY: 'auto', minHeight: 0,
  },
  tabBody: {
    padding: '20px 24px',
    display: 'flex', flexDirection: 'column', gap: '16px',
  },
  tabDesc: {
    fontSize: '13px', color: '#94a3b8', lineHeight: 1.6,
    padding: '10px 14px', background: 'rgba(255,255,255,0.02)',
    borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)',
  },

  // ---- table styles ----
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    padding: '8px 10px', textAlign: 'left',
    fontSize: '11px', fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.04)' },
  td: { padding: '7px 10px', verticalAlign: 'middle' },
  cellInput: {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
    color: '#e2e8f0', padding: '7px 10px', fontSize: '13px',
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  cellSelect: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#e2e8f0', padding: '7px 8px',
    fontSize: '13px', fontFamily: 'inherit', colorScheme: 'dark',
    minHeight: '34px',
  },
  checkbox: { accentColor: '#3b82f6', cursor: 'pointer', width: '16px', height: '16px' },
  rowDeleteBtn: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: '6px', color: '#f87171', padding: '6px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', transition: 'all 0.15s',
    minWidth: '28px', minHeight: '28px', justifyContent: 'center',
  },
  moveBtn: {
    background: 'none', border: 'none', color: '#64748b',
    cursor: 'pointer', fontSize: '10px', padding: '2px 4px', lineHeight: 1,
    minHeight: '20px',
  },
  addRowBtn: {
    display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start',
    padding: '9px 16px', background: 'rgba(59,130,246,0.1)',
    border: '1px dashed rgba(59,130,246,0.3)', borderRadius: '10px',
    color: '#60a5fa', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    transition: 'all 0.15s', minHeight: '38px',
  },

  // ---- sub-tabs (wall sections gym toggle) ----
  subTabs: {
    display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap',
  },
  subTab: {
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '7px 14px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)', color: '#94a3b8',
    cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'all 0.15s',
    minHeight: '34px',
  },
  subTabActive: {
    background: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.4)', color: '#60a5fa',
  },
  subTabSpacer: {
    width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 6px',
  },

  // ---- gym schedules ----
  gymCard: {
    background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.06)', padding: '20px',
  },
  gymCardHeader: {
    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
    paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  gymGrid: { display: 'flex', flexDirection: 'column', gap: '14px' },
  gymDayGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  gymDayLabel: { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' },
  gymDayRow: { display: 'flex', gap: '6px' },
  gymDayBtn: {
    padding: '7px 12px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'all 0.15s',
    minWidth: '48px', textAlign: 'center', minHeight: '34px',
  },
  gymNumRow: {
    display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '6px',
    paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  gymNumField: { display: 'flex', flexDirection: 'column', gap: '4px' },
  gymNumLabel: { fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' },
  numInput: {
    width: '76px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
    color: '#e2e8f0', padding: '7px 10px', fontSize: '14px',
    fontFamily: 'inherit', textAlign: 'center', colorScheme: 'dark',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },

  // ---- constraints ----
  constraintList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  constraintRow: {
    display: 'flex', alignItems: 'center', gap: '14px',
    padding: '12px 14px', borderRadius: '10px',
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
    transition: 'opacity 0.15s',
  },
  toggle: {
    width: '40px', height: '22px', borderRadius: '11px',
    border: 'none', cursor: 'pointer', position: 'relative',
    flexShrink: 0, transition: 'background 0.2s',
  },
  toggleKnob: {
    position: 'absolute', top: '2px', left: '2px',
    width: '18px', height: '18px', borderRadius: '50%',
    background: '#fff', transition: 'transform 0.2s ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
  constraintInfo: {
    display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0,
  },
  constraintLabel: { fontSize: '14px', fontWeight: 600, color: '#e2e8f0', lineHeight: 1.4 },
  constraintDesc: { fontSize: '12px', color: '#64748b', lineHeight: 1.4 },
  severitySelect: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px', padding: '6px 10px', fontSize: '12px',
    fontWeight: 600, colorScheme: 'dark', cursor: 'pointer',
    minHeight: '34px',
  },
  constraintNumInput: {
    width: '56px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
    color: '#e2e8f0', padding: '6px 8px', fontSize: '14px',
    fontFamily: 'inherit', textAlign: 'center', colorScheme: 'dark',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
}
