import { useState, useMemo, useCallback, useRef, Fragment } from 'react'
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  closestCenter,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  Users, Droplets, AlertTriangle, XCircle, AlertCircle,
  GripVertical, Mountain, Filter, ChevronDown, ChevronRight,
  ArrowRight, Trash2, Undo2, X,
} from 'lucide-react'
import { GYMS } from '../data/gyms'
import { STAFF } from '../data/staff'
import { BOULDER_SECTIONS, ROPE_SECTIONS } from '../data/sections'
import { loadAvailability, getSetterAbsence } from '../data/availability-overrides'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const SHIFT_TYPES = {
  BOULDER: 'Boulder Setting',
  ROPE: 'Rope Setting',
  HOLD_WASH: 'Hold Washing',
  FLEX: 'Flex',
}

// ---- Helpers ----

function getShiftTypesForGymDay(gym, day) {
  const types = []
  if (gym.boulderDays?.includes(day)) types.push(SHIFT_TYPES.BOULDER)
  if (gym.ropeDays?.includes(day)) types.push(SHIFT_TYPES.ROPE)
  if (gym.flexDays?.includes(day)) types.push(SHIFT_TYPES.FLEX)
  return types
}

function isActiveDay(gym, day) {
  return getShiftTypesForGymDay(gym, day).length > 0
}

function getStaffName(id) {
  return STAFF.find((s) => s.id === id)?.name || `#${id}`
}

function getRoleBadge(role) {
  switch (role) {
    case 'Director': return { label: 'DIR', bg: 'rgba(139,92,246,0.3)', color: '#a78bfa' }
    case 'Head Setter': return { label: 'HEAD', bg: 'rgba(59,130,246,0.3)', color: '#60a5fa' }
    case 'Spec Setter': return { label: 'SPEC', bg: 'rgba(245,158,11,0.3)', color: '#fbbf24' }
    default: return null
  }
}

function getDifficultyColor(difficulty) {
  switch (difficulty) {
    case 'easy': return '#10b981'
    case 'medium': return '#f59e0b'
    case 'hard': return '#ef4444'
    default: return '#64748b'
  }
}

/**
 * Determine why a setter can't be dropped on a specific cell.
 * sourceKey: the cell the setter is being dragged FROM (null if from sidebar).
 * Returns null if valid, or a reason string.
 */
function getDropInvalidReason(setter, gymName, day, shiftType, weekNumber, weekSchedule, sourceKey) {
  if (!setter.availability.includes(day)) {
    return `${setter.name} is not available on ${day}`
  }
  if (setter.role === 'Director') {
    if (day !== 'Monday') return `${setter.name} (Director) only sets on Monday`
    if (weekNumber % 2 !== 0) return `${setter.name} (Director) sets every other Monday (even weeks)`
  }
  if (setter.role === 'Head Setter' && setter.gym !== gymName) {
    const homeGym = GYMS.find((g) => g.name === setter.gym)
    const homeHasSetting = homeGym && (
      homeGym.boulderDays?.includes(day) ||
      homeGym.ropeDays?.includes(day) ||
      homeGym.flexDays?.includes(day)
    )
    if (homeHasSetting) return `${setter.name} is Head Setter for ${setter.gym} (setting on ${day})`
  }
  if (setter.role === 'Spec Setter') {
    if (!setter.availability.includes(day)) return `${setter.name} (Spec Setter) not available on ${day}`
    if (shiftType === SHIFT_TYPES.ROPE) return `${setter.name} (Spec Setter) cannot do rope`
  }
  // Check if assigned to another gym this day — skip the source cell (we're moving from it)
  if (weekSchedule) {
    for (const gym of GYMS) {
      if (gym.name === gymName) continue
      const key = `${gym.name}-${day}`
      if (key === sourceKey) continue // skip source — we're removing them from there
      const shift = weekSchedule[key]
      if (shift?.assignedStaff?.includes(setter.id)) {
        return `${setter.name} already at ${gym.name} on ${day}`
      }
    }
  }
  return null
}


// ---- Draggable Components ----

// Sidebar setter card
function DraggableSetterCard({ setter, day, weekNumber, weekSchedule, isAssigned, isDragging: parentDragging }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-setter-${setter.id}`,
    data: { type: 'setter', setter, sourceKey: null },
  })

  const badge = getRoleBadge(setter.role)
  const isAvailable = day ? setter.availability.includes(day) : true
  const muted = !isAvailable || parentDragging

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        ...st.setterCard,
        opacity: isDragging ? 0.3 : muted ? 0.4 : 1,
        borderColor: isAssigned ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)',
        background: isAssigned ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <GripVertical size={12} color="#475569" style={{ flexShrink: 0 }} />
      {badge && (
        <span style={{
          fontSize: '8px', fontWeight: 700, padding: '1px 4px',
          borderRadius: '3px', background: badge.bg, color: badge.color,
        }}>{badge.label}</span>
      )}
      <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 600 }}>{setter.name}</span>
      {isAssigned && (
        <span style={{ fontSize: '9px', color: '#10b981', marginLeft: 'auto' }}>assigned</span>
      )}
    </div>
  )
}

// In-cell assigned setter (draggable + removable)
function DraggableAssignedSetter({ setter, sourceKey, isDragSource, onRemove }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `assigned-${sourceKey}-${setter.id}`,
    data: { type: 'setter', setter, sourceKey },
  })

  const badge = getRoleBadge(setter.role)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px',
        color: '#94a3b8',
        opacity: isDragging ? 0.25 : isDragSource ? 0.4 : 1,
        padding: '2px 4px', borderRadius: '4px',
        background: isDragging ? 'rgba(239,68,68,0.1)' : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        transition: 'opacity 0.15s, background 0.15s',
        userSelect: 'none',
        position: 'relative',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px', flex: 1,
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        <GripVertical size={10} color="#475569" style={{ flexShrink: 0 }} />
        {badge && (
          <span style={{
            fontSize: '9px', fontWeight: 700, padding: '1px 4px',
            borderRadius: '3px', background: badge.bg, color: badge.color,
          }}>{badge.label}</span>
        )}
        {setter.name}
      </div>
      {hovered && onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(setter.id, sourceKey) }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '16px', height: '16px', borderRadius: '3px',
            border: 'none', background: 'rgba(239,68,68,0.2)', color: '#f87171',
            cursor: 'pointer', flexShrink: 0, padding: 0,
            transition: 'background 0.1s',
          }}
          title="Remove from shift"
        >
          <X size={10} />
        </button>
      )}
    </div>
  )
}

function DraggableSectionCard({ section, gymName, type }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `section-${gymName}-${type}-${section.name}`,
    data: { type: 'section', section, gymName, shiftType: type === 'boulder' ? SHIFT_TYPES.BOULDER : SHIFT_TYPES.ROPE },
  })

  const diffColor = getDifficultyColor(section.difficulty)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        ...st.sectionCard,
        opacity: isDragging ? 0.3 : 1,
        borderLeftColor: diffColor,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <GripVertical size={12} color="#475569" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', lineHeight: 1.3 }}>
          {section.name}
        </div>
        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
          {type === 'boulder' && `${section.settersRequired} setters`}
          {type === 'rope' && `${section.anchors?.length || '?'} anchors`}
          {' '}<span style={{ color: diffColor }}>{section.difficulty}</span>
        </div>
      </div>
    </div>
  )
}


// ---- Unassign Drop Zone ----

function UnassignDropZone({ activeItem }) {
  const isFromCell = activeItem?.type === 'setter' && !!activeItem.sourceKey
  const { setNodeRef, isOver } = useDroppable({
    id: 'unassign-zone',
    data: { zone: 'unassign' },
    disabled: !isFromCell,
  })

  if (!isFromCell) return null

  // Parse source key for preview text
  const sourceKey = activeItem.sourceKey
  const idx = sourceKey.lastIndexOf('-')
  const gymName = sourceKey.slice(0, idx)
  const day = sourceKey.slice(idx + 1)

  return (
    <div
      ref={setNodeRef}
      style={{
        margin: '8px 10px',
        padding: isOver ? '14px 12px' : '12px 12px',
        borderRadius: '8px',
        border: isOver
          ? '2px solid rgba(239,68,68,0.7)'
          : '2px dashed rgba(239,68,68,0.35)',
        background: isOver
          ? 'rgba(239,68,68,0.15)'
          : 'rgba(239,68,68,0.05)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
    >
      <Trash2
        size={isOver ? 20 : 16}
        color={isOver ? '#f87171' : '#ef4444'}
        style={{ transition: 'all 0.15s' }}
      />
      <span style={{
        fontSize: '11px',
        fontWeight: 700,
        color: isOver ? '#f87171' : '#ef4444',
        textAlign: 'center',
      }}>
        {isOver
          ? `Unassign ${activeItem.setter.name} from ${gymName} ${day}`
          : 'Drop here to unassign'}
      </span>
    </div>
  )
}


// ---- Droppable Grid Cell ----

function DroppableShiftCell({
  gymName, gym, day, weekNumber, shift, cellViolations, onCellClick,
  isOverSetter, isOverSection, isOverWash, activeItem, weekSchedule, isSourceCell,
  onUnassign,
}) {
  const cellKey = `${gymName}-${day}`
  const active = isActiveDay(gym, day)
  const shiftTypes = getShiftTypesForGymDay(gym, day)
  const currentShiftType = shift?.shiftType || shiftTypes[0] || null

  // Main cell drop zone
  const { setNodeRef: setMainRef, isOver: isOverMain } = useDroppable({
    id: `cell-${cellKey}`,
    data: { zone: 'cell', gymName, day, shiftType: currentShiftType },
    disabled: !active,
  })

  // Hold washer sub-zone
  const canHoldWash = gym.holdWashDays?.includes(day) || gym.flexHoldWashDays?.includes(day)
  const { setNodeRef: setWashRef, isOver: isOverWashZone } = useDroppable({
    id: `wash-${cellKey}`,
    data: { zone: 'wash', gymName, day },
    disabled: !active || !canHoldWash,
  })

  const isOver = isOverMain || isOverSetter || isOverSection || isOverWash || isOverWashZone

  // Validate drop
  let dropValid = null
  let dropReason = null
  if (active && activeItem) {
    if (activeItem.type === 'setter') {
      const reason = getDropInvalidReason(
        activeItem.setter, gymName, day, currentShiftType, weekNumber, weekSchedule, activeItem.sourceKey
      )
      dropValid = !reason
      dropReason = reason
    } else if (activeItem.type === 'section') {
      if (activeItem.gymName !== gymName) {
        dropValid = false
        dropReason = `This section belongs to ${activeItem.gymName}`
      } else if (activeItem.shiftType === SHIFT_TYPES.BOULDER && !gym.boulderDays?.includes(day) && !gym.flexDays?.includes(day)) {
        dropValid = false
        dropReason = `${gymName} doesn't have boulder on ${day}`
      } else if (activeItem.shiftType === SHIFT_TYPES.ROPE && !gym.ropeDays?.includes(day) && !gym.flexDays?.includes(day)) {
        dropValid = false
        dropReason = `${gymName} doesn't have rope on ${day}`
      } else {
        dropValid = true
      }
    }
  }

  const errors = cellViolations?.filter((v) => v.severity === 'error') || []
  const warnings = cellViolations?.filter((v) => v.severity === 'warning') || []

  if (!active) {
    return (
      <div style={{
        background: 'rgba(0,0,0,0.2)', padding: '12px 10px',
        minHeight: '120px', opacity: 0.4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '12px', color: '#475569', fontStyle: 'italic',
      }}>—</div>
    )
  }

  // Drop zone styling
  let borderColor = 'transparent'
  let bgOverlay = 'transparent'
  if (isSourceCell) {
    borderColor = 'rgba(245,158,11,0.6)'
    bgOverlay = 'rgba(245,158,11,0.06)'
  }
  if (isOver && activeItem) {
    if (dropValid) {
      borderColor = 'rgba(16,185,129,0.6)'
      bgOverlay = 'rgba(16,185,129,0.08)'
    } else if (dropValid === false) {
      borderColor = 'rgba(239,68,68,0.6)'
      bgOverlay = 'rgba(239,68,68,0.08)'
    }
  }

  // Which setter is currently being dragged from this cell
  const draggingSetterId = isSourceCell && activeItem?.type === 'setter' ? activeItem.setter.id : null

  return (
    <div
      ref={setMainRef}
      style={{
        background: bgOverlay !== 'transparent' ? bgOverlay : 'rgba(255,255,255,0.04)',
        padding: '12px 10px',
        minHeight: '120px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        borderLeft: errors.length > 0
          ? '4px solid var(--t-error)'
          : warnings.length > 0
            ? '3px solid var(--t-warning)'
            : `3px solid ${borderColor}`,
        position: 'relative',
        outline: (isOver && activeItem) || isSourceCell ? `2px solid ${borderColor}` : 'none',
        outlineOffset: '-2px',
        borderRadius: (isOver || isSourceCell) ? '4px' : '0',
      }}
      onClick={() => onCellClick(gymName, day)}
    >
      {/* Source cell label */}
      {isSourceCell && !isOver && (
        <div style={st.sourceCellLabel}>Moving from here</div>
      )}

      {/* Error/Warning badges */}
      {errors.length > 0 && (
        <div style={st.errorBadge} title={errors.map((v) => v.message).join('\n')}>
          <XCircle size={10} /> {errors.length}
        </div>
      )}
      {warnings.length > 0 && !errors.length && (
        <div style={st.warningBadge} title={warnings.map((v) => v.message).join('\n')}>
          <AlertCircle size={10} /> {warnings.length}
        </div>
      )}

      {/* Drop validation tooltip */}
      {isOver && dropReason && (
        <div style={st.dropReasonTooltip}>
          <AlertTriangle size={10} /> {dropReason}
        </div>
      )}

      {/* Drop hint */}
      {isOver && dropValid && activeItem?.type === 'setter' && (
        <div style={st.dropHint}>
          + {activeItem.setter.name}
        </div>
      )}

      {shift && shift.assignedStaff?.length > 0 ? (
        <>
          <div style={{
            fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.5px', marginBottom: '6px',
            color: currentShiftType === SHIFT_TYPES.BOULDER ? '#3b82f6' :
              currentShiftType === SHIFT_TYPES.ROPE ? '#8b5cf6' : '#f59e0b',
          }}>
            {currentShiftType}
          </div>

          {shift.section && (
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '8px' }}>
              {shift.section}
              {shift.additionalSections?.length > 0 && (
                <span style={{ color: '#a78bfa', fontSize: '10px', marginLeft: '4px' }}>
                  +{shift.additionalSections.length} section{shift.additionalSections.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {shift.assignedStaff.map((id) => {
              const setter = STAFF.find((s) => s.id === id)
              if (!setter) return null
              return (
                <DraggableAssignedSetter
                  key={id}
                  setter={setter}
                  sourceKey={cellKey}
                  isDragSource={id === draggingSetterId}
                  onRemove={onUnassign}
                />
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
            <Users size={12} />
            {shift.assignedStaff.length} setter{shift.assignedStaff.length !== 1 ? 's' : ''}
          </div>

          {/* Hold washer drop zone */}
          {canHoldWash && (
            <div
              ref={setWashRef}
              style={{
                ...st.washDropZone,
                borderColor: isOverWashZone ? 'rgba(6,182,212,0.6)' : 'rgba(255,255,255,0.08)',
                background: isOverWashZone ? 'rgba(6,182,212,0.08)' : 'transparent',
              }}
            >
              <Droplets size={11} />
              {shift.holdWasher
                ? getStaffName(shift.holdWasher)
                : <span style={{ color: '#475569', fontStyle: 'italic' }}>Drop hold washer</span>}
            </div>
          )}
        </>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', gap: '8px',
        }}>
          <div style={{
            fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
            color: currentShiftType === SHIFT_TYPES.BOULDER ? '#3b82f6' :
              currentShiftType === SHIFT_TYPES.ROPE ? '#8b5cf6' : '#f59e0b',
          }}>
            {shiftTypes.length > 1
              ? shiftTypes.map((t) => t.replace(' Setting', '')).join(' / ')
              : currentShiftType}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {activeItem ? 'Drop here' : 'Click or drag'}
          </div>
          {canHoldWash && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#06b6d4' }}>
              <Droplets size={10} /> Hold wash day
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ---- Drag Overlay (ghost) ----

function DragOverlayContent({ activeItem }) {
  if (!activeItem) return null

  if (activeItem.type === 'setter') {
    const badge = getRoleBadge(activeItem.setter.role)
    const isMove = !!activeItem.sourceKey
    return (
      <div style={st.dragOverlayCard}>
        {badge && (
          <span style={{
            fontSize: '9px', fontWeight: 700, padding: '1px 5px',
            borderRadius: '3px', background: badge.bg, color: badge.color,
          }}>{badge.label}</span>
        )}
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
          {activeItem.setter.name}
        </span>
        {isMove && (
          <span style={{
            fontSize: '9px', fontWeight: 700, color: '#fbbf24',
            background: 'rgba(245,158,11,0.2)', padding: '1px 6px', borderRadius: '3px',
          }}>
            <ArrowRight size={9} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
            MOVE
          </span>
        )}
      </div>
    )
  }

  if (activeItem.type === 'section') {
    const diffColor = getDifficultyColor(activeItem.section.difficulty)
    return (
      <div style={{ ...st.dragOverlayCard, borderLeft: `3px solid ${diffColor}` }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
          {activeItem.section.name}
        </span>
        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
          {activeItem.gymName}
        </span>
      </div>
    )
  }

  return null
}


// ---- Available Items Panel ----

function AvailableItemsPanel({
  weekSchedule, weekNumber, selectedDay, onDayFilter, activeItem,
}) {
  const [gymFilter, setGymFilter] = useState('all')
  const [expandedSections, setExpandedSections] = useState({ boulder: true, rope: false, setters: true })

  const toggleExpand = (key) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Determine which setters are assigned on the selected day
  const assignedOnDay = useMemo(() => {
    if (!selectedDay || !weekSchedule) return new Set()
    const ids = new Set()
    GYMS.forEach((gym) => {
      const key = `${gym.name}-${selectedDay}`
      const shift = weekSchedule[key]
      if (shift?.assignedStaff) shift.assignedStaff.forEach((id) => ids.add(id))
      if (shift?.holdWasher) ids.add(shift.holdWasher)
      if (shift?.flexHoldWashers) shift.flexHoldWashers.forEach((id) => ids.add(id))
      if (shift?.additionalSections) shift.additionalSections.forEach((es) => (es.assignedStaff || []).forEach((id) => ids.add(id)))
    })
    return ids
  }, [weekSchedule, selectedDay])

  const filteredGyms = gymFilter === 'all' ? GYMS : GYMS.filter((g) => g.name === gymFilter)

  return (
    <div style={st.sidebar}>
      <div style={st.sidebarHeader}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>Available Items</span>
      </div>

      {/* Day filter */}
      <div style={st.filterRow}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
          Filter by Day
        </span>
        <div style={st.dayFilterRow}>
          <button
            style={{
              ...st.dayFilterBtn,
              background: !selectedDay ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              color: !selectedDay ? '#60a5fa' : '#64748b',
            }}
            onClick={() => onDayFilter(null)}
          >All</button>
          {DAYS.slice(0, 4).map((d) => (
            <button
              key={d}
              style={{
                ...st.dayFilterBtn,
                background: selectedDay === d ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                color: selectedDay === d ? '#60a5fa' : '#64748b',
              }}
              onClick={() => onDayFilter(d)}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Gym filter */}
      <div style={st.filterRow}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
          <Filter size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
          Gym
        </span>
        <div style={st.dayFilterRow}>
          <button
            style={{
              ...st.dayFilterBtn,
              background: gymFilter === 'all' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              color: gymFilter === 'all' ? '#60a5fa' : '#64748b',
            }}
            onClick={() => setGymFilter('all')}
          >All</button>
          {GYMS.map((g) => (
            <button
              key={g.name}
              style={{
                ...st.dayFilterBtn,
                background: gymFilter === g.name ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                color: gymFilter === g.name ? '#60a5fa' : '#64748b',
              }}
              onClick={() => setGymFilter(g.name)}
            >{g.name}</button>
          ))}
        </div>
      </div>

      <div style={st.sidebarScroll}>
        {/* Setters section */}
        <div style={st.sidebarSection}>
          <button style={st.sectionToggle} onClick={() => toggleExpand('setters')}>
            {expandedSections.setters ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Users size={14} color="#3b82f6" />
            <span>Setters ({STAFF.length})</span>
          </button>
          {expandedSections.setters && (
            <div style={st.cardList}>
              {STAFF.map((setter) => (
                <DraggableSetterCard
                  key={setter.id}
                  setter={setter}
                  day={selectedDay}
                  weekNumber={weekNumber}
                  weekSchedule={weekSchedule}
                  isAssigned={assignedOnDay.has(setter.id)}
                  isDragging={!!activeItem}
                />
              ))}
            </div>
          )}
        </div>

        {/* Boulder sections */}
        <div style={st.sidebarSection}>
          <button style={st.sectionToggle} onClick={() => toggleExpand('boulder')}>
            {expandedSections.boulder ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Mountain size={14} color="#3b82f6" />
            <span>Boulder Sections</span>
          </button>
          {expandedSections.boulder && filteredGyms.map((gym) => {
            const sections = BOULDER_SECTIONS[gym.name]
            if (!sections?.length) return null
            return (
              <div key={gym.name} style={st.gymSectionGroup}>
                <div style={st.gymSectionLabel}>{gym.name}</div>
                <div style={st.cardList}>
                  {sections.map((sec) => (
                    <DraggableSectionCard key={sec.name} section={sec} gymName={gym.name} type="boulder" />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Rope sections */}
        <div style={st.sidebarSection}>
          <button style={st.sectionToggle} onClick={() => toggleExpand('rope')}>
            {expandedSections.rope ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Mountain size={14} color="#8b5cf6" />
            <span>Rope Sections</span>
          </button>
          {expandedSections.rope && filteredGyms.map((gym) => {
            const sections = ROPE_SECTIONS[gym.name]
            if (!sections?.length) return null
            return (
              <div key={gym.name} style={st.gymSectionGroup}>
                <div style={st.gymSectionLabel}>{gym.name}</div>
                <div style={st.cardList}>
                  {sections.map((sec) => (
                    <DraggableSectionCard key={sec.name} section={sec} gymName={gym.name} type="rope" />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Unassign drop zone — appears when dragging from a cell */}
      <UnassignDropZone activeItem={activeItem} />
    </div>
  )
}


// ---- Main Component ----

export default function DragDropScheduler({
  schedule,
  currentWeek,
  onScheduleUpdate,
  onCellClick,
  violationMap,
  violations,
}) {
  const weekSchedule = schedule[currentWeek] || {}
  const [activeItem, setActiveItem] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)

  // Toast/undo state for unassign
  const [toast, setToast] = useState(null) // { message, undoData, timer }
  const undoTimerRef = useRef(null)

  const showToast = useCallback((message, undoData = null) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    const timer = setTimeout(() => setToast(null), 4000)
    undoTimerRef.current = timer
    setToast({ message, undoData })
  }, [])

  const handleUndo = useCallback(() => {
    if (!toast?.undoData) return
    const { key, shift } = toast.undoData
    onScheduleUpdate(key, shift)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setToast(null)
  }, [toast, onScheduleUpdate])

  const dismissToast = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setToast(null)
  }, [])

  // Unassign a setter from a shift (used by both drag-to-unassign and X button)
  const unassignSetter = useCallback((setterId, shiftKey) => {
    const shift = weekSchedule[shiftKey]
    if (!shift) return

    const setter = STAFF.find((s) => s.id === setterId)
    const idx = shiftKey.lastIndexOf('-')
    const gymName = shiftKey.slice(0, idx)
    const day = shiftKey.slice(idx + 1)

    // Save original for undo
    const originalShift = { ...shift }

    const updated = {
      ...shift,
      assignedStaff: (shift.assignedStaff || []).filter((id) => id !== setterId),
      holdWasher: shift.holdWasher === setterId ? null : shift.holdWasher,
      flexHoldWashers: (shift.flexHoldWashers || []).filter((id) => id !== setterId),
    }
    onScheduleUpdate(shiftKey, updated)

    const name = setter?.name || `#${setterId}`
    showToast(
      `${name} unassigned from ${gymName} ${day}`,
      { key: shiftKey, shift: originalShift }
    )
  }, [weekSchedule, onScheduleUpdate, showToast])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const handleDragStart = useCallback((event) => {
    const { active } = event
    setActiveItem(active.data.current || null)
  }, [])

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event
    setActiveItem(null)

    if (!over || !active.data.current) return

    const dragData = active.data.current
    const dropData = over.data.current
    if (!dropData) return

    // ---- Unassign: drop on unassign zone ----
    if (dropData.zone === 'unassign' && dragData.type === 'setter' && dragData.sourceKey) {
      unassignSetter(dragData.setter.id, dragData.sourceKey)
      return
    }

    const { gymName, day, zone } = dropData

    if (dragData.type === 'setter') {
      const setter = dragData.setter
      const sourceKey = dragData.sourceKey // null if from sidebar
      const gym = GYMS.find((g) => g.name === gymName)
      const shiftTypes = getShiftTypesForGymDay(gym, day)
      const targetKey = `${gymName}-${day}`
      const currentShiftType = weekSchedule[targetKey]?.shiftType || shiftTypes[0] || null

      // Don't drop on same cell
      if (sourceKey === targetKey) return

      // Validate
      const reason = getDropInvalidReason(setter, gymName, day, currentShiftType, currentWeek, weekSchedule, sourceKey)
      if (reason) return

      // --- Remove from source cell ---
      if (sourceKey) {
        const sourceShift = weekSchedule[sourceKey]
        if (sourceShift) {
          const updatedSource = {
            ...sourceShift,
            assignedStaff: (sourceShift.assignedStaff || []).filter((id) => id !== setter.id),
            holdWasher: sourceShift.holdWasher === setter.id ? null : sourceShift.holdWasher,
            flexHoldWashers: (sourceShift.flexHoldWashers || []).filter((id) => id !== setter.id),
          }
          onScheduleUpdate(sourceKey, updatedSource)
        }
      }

      // --- Add to target cell ---
      const existingShift = weekSchedule[targetKey]

      if (zone === 'wash') {
        // Assign as hold washer
        if (setter.role === 'Director' || setter.role === 'Head Setter') return
        const updated = {
          ...(existingShift || {
            shiftType: currentShiftType,
            section: null,
            assignedStaff: [],
            notes: '',
            completedAnchors: [],
            multiDayProgress: null,
          }),
          holdWasher: setter.id,
        }
        onScheduleUpdate(targetKey, updated)
      } else {
        // Assign as setter
        const updatedStaff = [...(existingShift?.assignedStaff || [])]
        if (!updatedStaff.includes(setter.id)) {
          updatedStaff.push(setter.id)
        }

        // If from sidebar, also remove from other gyms on same day
        if (!sourceKey) {
          GYMS.forEach((g) => {
            if (g.name === gymName) return
            const otherKey = `${g.name}-${day}`
            const otherShift = weekSchedule[otherKey]
            if (otherShift?.assignedStaff?.includes(setter.id)) {
              const updatedOther = {
                ...otherShift,
                assignedStaff: otherShift.assignedStaff.filter((id) => id !== setter.id),
                holdWasher: otherShift.holdWasher === setter.id ? null : otherShift.holdWasher,
              }
              onScheduleUpdate(otherKey, updatedOther)
            }
          })
        }

        const updated = {
          ...(existingShift || {
            shiftType: currentShiftType,
            section: null,
            notes: '',
            completedAnchors: [],
            multiDayProgress: null,
          }),
          assignedStaff: updatedStaff,
        }
        if (!updated.holdWasher) updated.holdWasher = null
        onScheduleUpdate(targetKey, updated)
      }
    } else if (dragData.type === 'section') {
      // Assign section to shift
      if (dragData.gymName !== gymName) return
      const key = `${gymName}-${day}`
      const existingShift = weekSchedule[key]
      const updated = {
        ...(existingShift || {
          assignedStaff: [],
          holdWasher: null,
          notes: '',
          completedAnchors: [],
          multiDayProgress: null,
        }),
        shiftType: dragData.shiftType,
        section: dragData.section.name,
      }
      onScheduleUpdate(key, updated)
    }
  }, [weekSchedule, currentWeek, onScheduleUpdate, unassignSetter])

  const handleDragCancel = useCallback(() => {
    setActiveItem(null)
  }, [])

  // Count unassigned setters per day
  const unassignedByDay = useMemo(() => {
    const result = {}
    if (violations) {
      violations.forEach((v) => {
        if (v.day && v.severity === 'error') {
          result[v.day] = (result[v.day] || 0) + 1
        }
      })
    }
    return result
  }, [violations])

  // Track source cell key for highlighting
  const sourceKey = activeItem?.sourceKey || null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div style={st.container}>
        <AvailableItemsPanel
          weekSchedule={weekSchedule}
          weekNumber={currentWeek}
          selectedDay={selectedDay}
          onDayFilter={setSelectedDay}
          activeItem={activeItem}
        />

        <div style={st.gridContainer}>
          <div style={st.grid}>
            {/* Corner cell */}
            <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px 8px' }} />

            {/* Day headers */}
            {DAYS.map((day) => {
              const count = unassignedByDay[day] || 0
              return (
                <div key={day} style={{
                  ...st.dayHeader,
                  ...(count > 0 ? { background: 'rgba(239,68,68,0.12)' } : {}),
                }}>
                  <div>{day}</div>
                  {count > 0 && (
                    <div style={st.unassignedBadge}>
                      <XCircle size={10} /> {count} unassigned
                    </div>
                  )}
                </div>
              )
            })}

            {/* Gym rows */}
            {GYMS.map((gym) => (
              <Fragment key={gym.name}>
                <div style={st.gymLabel}>{gym.name}</div>
                {DAYS.map((day) => {
                  const key = `${gym.name}-${day}`
                  return (
                    <DroppableShiftCell
                      key={key}
                      gymName={gym.name}
                      gym={gym}
                      day={day}
                      weekNumber={currentWeek}
                      shift={weekSchedule[key] || null}
                      cellViolations={violationMap?.[key] || null}
                      onCellClick={onCellClick}
                      activeItem={activeItem}
                      weekSchedule={weekSchedule}
                      isSourceCell={sourceKey === key}
                      onUnassign={unassignSetter}
                    />
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={{
        duration: 200,
        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
      }}>
        <DragOverlayContent activeItem={activeItem} />
      </DragOverlay>

      {/* Unassign toast with undo */}
      {toast && (
        <div style={st.toastContainer}>
          <div style={st.toastContent}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
              {toast.message}
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {toast.undoData && (
                <button onClick={handleUndo} style={st.undoBtn}>
                  <Undo2 size={12} />
                  Undo
                </button>
              )}
              <button onClick={dismissToast} style={st.toastDismissBtn}>
                <X size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  )
}


// ---- Styles ----

const st = {
  container: {
    display: 'flex',
    gap: '12px',
    minHeight: 0,
  },
  sidebar: {
    width: '260px',
    flexShrink: 0,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 200px)',
  },
  sidebarHeader: {
    padding: '12px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  filterRow: {
    padding: '8px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flexShrink: 0,
  },
  dayFilterRow: {
    display: 'flex',
    gap: '3px',
    flexWrap: 'wrap',
  },
  dayFilterBtn: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  sidebarScroll: {
    overflowY: 'auto',
    flex: 1,
  },
  sidebarSection: {
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  sectionToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '10px 14px',
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'left',
  },
  gymSectionGroup: {
    paddingLeft: '14px',
    paddingRight: '14px',
    paddingBottom: '8px',
  },
  gymSectionLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '4px 0',
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    padding: '0 14px 8px',
  },
  setterCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    transition: 'all 0.15s',
    userSelect: 'none',
    touchAction: 'none',
    minHeight: '36px',
  },
  sectionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderLeft: '3px solid #64748b',
    background: 'rgba(255,255,255,0.04)',
    transition: 'all 0.15s',
    userSelect: 'none',
    touchAction: 'none',
    minHeight: '36px',
  },
  gridContainer: {
    flex: 1,
    minWidth: 0,
    overflowX: 'auto',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '110px repeat(5, 1fr)',
    gap: '1px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  },
  dayHeader: {
    background: 'rgba(255,255,255,0.06)',
    padding: '14px 8px',
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  gymLabel: {
    background: 'rgba(255,255,255,0.04)',
    padding: '16px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '15px',
    fontWeight: 700,
    color: '#cbd5e1',
    letterSpacing: '-0.2px',
  },
  unassignedBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    marginTop: '4px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#ef4444',
    background: 'rgba(239,68,68,0.15)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  errorBadge: {
    position: 'absolute',
    top: '5px',
    right: '5px',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '10px',
    fontWeight: 800,
    color: '#fff',
    background: '#ef4444',
    padding: '2px 7px',
    borderRadius: '4px',
    boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
    zIndex: 2,
  },
  warningBadge: {
    position: 'absolute',
    top: '5px',
    right: '5px',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#000',
    background: '#f59e0b',
    padding: '2px 7px',
    borderRadius: '4px',
    zIndex: 2,
  },
  washDropZone: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: '#06b6d4',
    marginTop: '6px',
    paddingTop: '6px',
    borderTop: '1px dashed',
    transition: 'all 0.15s',
    borderRadius: '4px',
    padding: '4px 6px',
    minHeight: '24px',
  },
  dropReasonTooltip: {
    position: 'absolute',
    bottom: '4px',
    left: '4px',
    right: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    fontWeight: 600,
    color: '#fbbf24',
    background: 'rgba(245,158,11,0.15)',
    padding: '4px 6px',
    borderRadius: '4px',
    zIndex: 3,
  },
  dropHint: {
    position: 'absolute',
    bottom: '4px',
    left: '4px',
    right: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#10b981',
    background: 'rgba(16,185,129,0.15)',
    padding: '4px 8px',
    borderRadius: '4px',
    zIndex: 3,
  },
  sourceCellLabel: {
    position: 'absolute',
    top: '5px',
    left: '5px',
    fontSize: '9px',
    fontWeight: 700,
    color: '#fbbf24',
    background: 'rgba(245,158,11,0.2)',
    padding: '2px 6px',
    borderRadius: '3px',
    zIndex: 2,
  },
  dragOverlayCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    borderRadius: '10px',
    background: 'rgba(30,41,59,0.98)',
    border: '2px solid rgba(59,130,246,0.5)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.2), 0 0 20px rgba(59,130,246,0.1)',
    backdropFilter: 'blur(12px)',
    cursor: 'grabbing',
    transform: 'scale(1.05)',
    transition: 'transform 0.1s ease',
  },
  toastContainer: {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    animation: 'toastSlideIn 0.25s ease-out',
  },
  toastContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 18px',
    borderRadius: '12px',
    background: 'rgba(30,41,59,0.95)',
    border: '1px solid rgba(239,68,68,0.3)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.25)',
    backdropFilter: 'blur(12px)',
  },
  undoBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(59,130,246,0.4)',
    background: 'rgba(59,130,246,0.15)',
    color: '#60a5fa',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  toastDismissBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    border: 'none',
    background: 'rgba(255,255,255,0.1)',
    color: '#64748b',
    cursor: 'pointer',
    padding: 0,
  },
}
