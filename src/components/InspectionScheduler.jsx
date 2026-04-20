import { useState, useMemo } from 'react'
import {
  X, Search as SearchIcon, Calendar, CheckCircle, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Edit3, Trash2, RefreshCw, Plus,
} from 'lucide-react'
import {
  loadInspectionRecords, saveInspectionRecords,
  loadInspectionSettings, saveInspectionSettings,
  generateInspectionSchedule, markInspectionComplete,
  rescheduleInspection, removeInspectionRecord, updateInspectionRecord,
  getUpcomingInspections, getPastInspections, getOverdueInspections,
  getInspectionStats, formatDate, todayWeek, toISODate, weekToDate,
} from '../data/inspections'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

// ---- Complete Inspection Modal ----

function CompleteModal({ inspection, onComplete, onClose }) {
  const [completedDate, setCompletedDate] = useState(toISODate(new Date()))
  const [inspectorName, setInspectorName] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <div style={ms.overlay} onClick={onClose}>
      <div style={ms.modal} onClick={(e) => e.stopPropagation()}>
        <div style={ms.header}>
          <CheckCircle size={18} color="#10b981" />
          <h3 style={ms.title}>Mark Inspection Complete</h3>
          <button style={ms.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={ms.body}>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 12px' }}>
            {inspection.gyms.join(' & ')} — Week {inspection.weekNumber} ({inspection.day})
          </p>
          <label style={ms.label}>Date Completed</label>
          <input type="date" style={ms.input} value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} />
          <label style={ms.label}>Inspector Name</label>
          <input style={ms.input} value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} placeholder="Who performed the inspection?" />
          <label style={ms.label}>Notes</label>
          <textarea style={{ ...ms.input, minHeight: '60px', resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any findings or observations..." />
        </div>
        <div style={ms.footer}>
          <button style={ms.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={ms.saveBtn} onClick={() => onComplete({ completedDate, inspectorName, completionNotes: notes })}>
            <CheckCircle size={14} /> Mark Complete
          </button>
        </div>
      </div>
    </div>
  )
}

const ms = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 },
  modal: { background: 'linear-gradient(145deg, #1e293b, #0f172a)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: '420px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', animation: 'modalSlideIn 0.2s ease-out' },
  header: { display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  title: { margin: 0, fontSize: '15px', fontWeight: 700, color: '#f1f5f9', flex: 1 },
  closeBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex' },
  body: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px' },
  input: { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#e2e8f0', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' },
  footer: { display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' },
  cancelBtn: { padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
  saveBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
}

// ---- Main Panel ----

export default function InspectionScheduler({ currentWeek, onClose, showToast }) {
  const [records, setRecords] = useState(() => loadInspectionRecords())
  const [settings, setSettings] = useState(() => loadInspectionSettings())
  const [view, setView] = useState('upcoming') // 'upcoming' | 'past' | 'all'
  const [completeTarget, setCompleteTarget] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const stats = useMemo(() => getInspectionStats(records), [records])
  const overdue = useMemo(() => getOverdueInspections(records), [records])
  const upcoming = useMemo(() => getUpcomingInspections(records, 20), [records])
  const past = useMemo(() => getPastInspections(records, 20), [records])

  const currentWk = todayWeek()

  const handleGenerate = () => {
    const newRecords = generateInspectionSchedule(settings)
    if (newRecords.length === 0) {
      showToast?.('No inspections generated — check settings', 'info')
      return
    }
    // Keep completed/missed, replace scheduled
    const kept = records.filter((r) => r.status === 'completed' || r.status === 'missed')
    const merged = [...kept, ...newRecords]
    saveInspectionRecords(merged)
    setRecords(merged)
    const updSettings = { ...settings, generatedThrough: newRecords[newRecords.length - 1]?.weekNumber }
    saveInspectionSettings(updSettings)
    setSettings(updSettings)
    showToast?.(`Generated ${newRecords.length} inspections`)
  }

  const handleClearAll = () => {
    if (!confirm('Clear all inspection records? Completed records will also be removed.')) return
    saveInspectionRecords([])
    setRecords([])
    showToast?.('All inspections cleared', 'info')
  }

  const handleComplete = (data) => {
    if (!completeTarget) return
    const updated = markInspectionComplete(records, completeTarget.id, data)
    setRecords(updated)
    setCompleteTarget(null)
    showToast?.('Inspection marked as complete')
  }

  const handleDelete = (id) => {
    const updated = removeInspectionRecord(records, id)
    setRecords(updated)
  }

  const handleMarkOverdue = () => {
    let updated = [...records]
    overdue.forEach((r) => {
      updated = updated.map((rec) => rec.id === r.id ? { ...rec, status: 'missed' } : rec)
    })
    saveInspectionRecords(updated)
    setRecords(updated)
    showToast?.(`${overdue.length} overdue inspection(s) marked as missed`, 'info')
  }

  const displayList = view === 'upcoming' ? upcoming : view === 'past' ? past : records.sort((a, b) => a.weekNumber - b.weekNumber)

  const statusColor = (status) => {
    switch (status) {
      case 'completed': return '#10b981'
      case 'missed': return '#ef4444'
      case 'cancelled': return '#64748b'
      default: return '#3b82f6'
    }
  }

  const statusBg = (status) => {
    switch (status) {
      case 'completed': return 'rgba(16,185,129,0.1)'
      case 'missed': return 'rgba(239,68,68,0.1)'
      case 'cancelled': return 'rgba(100,116,139,0.1)'
      default: return 'rgba(59,130,246,0.1)'
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SearchIcon size={18} color="#06b6d4" />
            <h2 style={s.title}>Inspections</h2>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button style={s.actionBtn} onClick={handleGenerate} title="Generate inspection schedule from settings">
              <RefreshCw size={12} /> Generate
            </button>
            {overdue.length > 0 && (
              <button style={{ ...s.actionBtn, borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }} onClick={handleMarkOverdue}>
                <AlertTriangle size={12} /> Mark {overdue.length} Overdue
              </button>
            )}
            <button style={{ ...s.actionBtn, color: '#64748b' }} onClick={handleClearAll}>
              <Trash2 size={12} /> Clear
            </button>
            <button style={s.closeBtn} onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* Stats bar */}
        <div style={s.statsBar}>
          {[
            { label: 'Scheduled', value: stats.scheduled, color: '#3b82f6' },
            { label: 'Completed', value: stats.completed, color: '#10b981' },
            { label: 'Overdue', value: stats.overdue, color: '#ef4444' },
            { label: 'Missed', value: stats.missed, color: '#f59e0b' },
          ].map((st) => (
            <div key={st.label} style={s.statItem}>
              <span style={{ fontSize: '18px', fontWeight: 800, color: st.color }}>{st.value}</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{st.label}</span>
            </div>
          ))}
        </div>

        {/* View tabs */}
        <div style={s.viewTabs}>
          {[
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'past', label: 'Past' },
            { id: 'all', label: 'All' },
          ].map((tab) => (
            <button
              key={tab.id}
              style={{
                ...s.viewTab,
                background: view === tab.id ? 'rgba(6,182,212,0.15)' : 'transparent',
                color: view === tab.id ? '#06b6d4' : '#64748b',
                borderColor: view === tab.id ? 'rgba(6,182,212,0.3)' : 'transparent',
              }}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Records list */}
        <div style={s.listContainer}>
          {displayList.length === 0 && (
            <div style={s.emptyMsg}>
              {records.length === 0
                ? 'No inspections scheduled. Go to Settings > Inspections to configure, then click Generate.'
                : 'No inspections in this view.'}
            </div>
          )}
          {displayList.map((rec) => {
            const isExpanded = expandedId === rec.id
            const weeksAway = rec.weekNumber - currentWk
            const isPast = rec.weekNumber < currentWk
            const isOverdue = rec.status === 'scheduled' && isPast

            return (
              <div key={rec.id} style={{
                ...s.recordCard,
                borderColor: isOverdue ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
                background: isOverdue ? 'rgba(239,68,68,0.03)' : 'rgba(255,255,255,0.02)',
              }}>
                <div style={s.recordHeader} onClick={() => setExpandedId(isExpanded ? null : rec.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                      background: statusBg(rec.status), color: statusColor(rec.status),
                      textTransform: 'uppercase',
                    }}>
                      {rec.status}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                      {rec.gyms.join(' & ')}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      Week {rec.weekNumber} · {rec.day}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {formatDate(rec.date)}
                    </span>
                    {!isPast && rec.status === 'scheduled' && (
                      <span style={{
                        fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                        background: weeksAway <= 2 ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)',
                        color: weeksAway <= 2 ? '#f59e0b' : '#60a5fa',
                      }}>
                        In {weeksAway}w
                      </span>
                    )}
                    {isOverdue && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444' }}>OVERDUE</span>
                    )}
                    {isExpanded ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
                  </div>
                </div>

                {isExpanded && (
                  <div style={s.recordDetails}>
                    {rec.status === 'completed' && (
                      <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {rec.completedDate && <span>Completed: {formatDate(rec.completedDate)}</span>}
                        {rec.inspectorName && <span>Inspector: {rec.inspectorName}</span>}
                        {rec.completionNotes && <span>Notes: {rec.completionNotes}</span>}
                      </div>
                    )}
                    {rec.notes && <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>{rec.notes}</p>}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      {rec.status === 'scheduled' && (
                        <button style={{ ...s.actionBtn, fontSize: '11px', padding: '4px 10px' }} onClick={() => setCompleteTarget(rec)}>
                          <CheckCircle size={11} /> Complete
                        </button>
                      )}
                      <button style={{ ...s.actionBtn, fontSize: '11px', padding: '4px 10px', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => handleDelete(rec.id)}>
                        <Trash2 size={11} /> Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Complete modal */}
        {completeTarget && (
          <CompleteModal
            inspection={completeTarget}
            onComplete={handleComplete}
            onClose={() => setCompleteTarget(null)}
          />
        )}
      </div>
    </div>
  )
}

// ---- Styles ----

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '16px', animation: 'modalFadeIn 0.2s ease-out' },
  panel: { background: 'linear-gradient(145deg, #1e293b, #0f172a)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: '720px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', animation: 'modalSlideIn 0.25s ease-out', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 },
  title: { margin: 0, fontSize: '17px', fontWeight: 800, color: '#f1f5f9' },
  closeBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#94a3b8', padding: '7px', cursor: 'pointer', display: 'flex', alignItems: 'center', minWidth: '34px', minHeight: '34px', justifyContent: 'center' },
  actionBtn: { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: '#94a3b8', cursor: 'pointer', transition: 'all 0.15s', minHeight: '30px' },
  statsBar: { display: 'flex', gap: '16px', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, justifyContent: 'center' },
  statItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
  viewTabs: { display: 'flex', gap: '2px', padding: '10px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 },
  viewTab: { padding: '8px 16px', border: '1px solid transparent', borderBottom: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'all 0.15s' },
  listContainer: { flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '6px' },
  emptyMsg: { textAlign: 'center', padding: '40px 20px', fontSize: '13px', color: '#475569', lineHeight: 1.6 },
  recordCard: { borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' },
  recordHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', gap: '8px' },
  recordDetails: { padding: '0 14px 12px', borderTop: '1px solid rgba(255,255,255,0.04)' },
}
