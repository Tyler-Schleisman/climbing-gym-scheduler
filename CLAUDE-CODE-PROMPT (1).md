# Claude Code Prompt: Climbing Gym Scheduling System

## Project Overview
You are building a comprehensive web-based scheduling system for managing boulder and rope setting schedules across three climbing gyms: Ogden, Soma, and SLC. This is a complex constraint-based scheduling application that tracks historical schedules, enforces safety requirements, and manages rotation cycles.

## Core Requirements

### Technology Stack
- **Frontend**: React (functional components with hooks)
- **Styling**: CSS-in-JS (inline styles or styled-components)
- **Icons**: Lucide React
- **State Management**: React useState/useEffect hooks
- **Future Integration**: Must be compatible with Pebble app API (design with API-ready structure)

### Project Structure
```
climbing-scheduler/
├── src/
│   ├── components/
│   │   ├── ScheduleGrid.jsx
│   │   ├── ShiftModal.jsx
│   │   ├── AnalyticsPanel.jsx
│   │   ├── WeekNavigation.jsx
│   │   ├── ViolationAlert.jsx
│   │   ├── AutoScheduleButton.jsx
│   │   └── AutoSchedulePreview.jsx
│   ├── data/
│   │   ├── staff.js
│   │   ├── gyms.js
│   │   ├── sections.js
│   │   └── constraints.js
│   ├── utils/
│   │   ├── validation.js
│   │   ├── analytics.js
│   │   ├── scheduling.js
│   │   ├── auto-scheduler.js
│   │   ├── conflict-resolution.js
│   │   └── section-selection.js
│   ├── App.jsx
│   └── index.js
├── package.json
└── README.md
```

## Staff Configuration

### Staff Roster (16 total)
```javascript
const STAFF = [
  // Leadership
  { id: 1, name: 'Eddie', role: 'Director', availability: ['Monday'], everyOtherMonday: true },
  
  // Head Setters (Mon-Wed, gym-specific)
  { id: 2, name: 'Tyler', role: 'Head Setter', gym: 'Soma', availability: ['Monday', 'Tuesday', 'Wednesday'] },
  { id: 3, name: 'Luke', role: 'Head Setter', gym: 'Ogden', availability: ['Monday', 'Tuesday', 'Wednesday'] },
  { id: 4, name: 'Merto', role: 'Head Setter', gym: 'SLC', availability: ['Monday', 'Tuesday', 'Wednesday'] },
  
  // Spec Setters (Mon-Tue only, boulder/hold wash only)
  { id: 5, name: 'Aliyah', role: 'Spec Setter', availability: ['Monday', 'Tuesday'] },
  { id: 6, name: 'Brayden', role: 'Spec Setter', availability: ['Monday', 'Tuesday'] },
  
  // Regular Setters (Mon-Tue)
  { id: 7, name: 'Noah', role: 'Setter', availability: ['Monday', 'Tuesday'] },
  { id: 8, name: 'Russ', role: 'Setter', availability: ['Monday', 'Tuesday'] },
  
  // Regular Setters (Mon-Thu)
  { id: 9, name: 'Matt', role: 'Setter', availability: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
  { id: 10, name: 'Seb', role: 'Setter', availability: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
  { id: 11, name: 'Alvin', role: 'Setter', availability: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
  { id: 12, name: 'Cayden', role: 'Setter', availability: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
  { id: 13, name: 'Yishan', role: 'Setter', availability: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
  { id: 14, name: 'Mariano', role: 'Setter', availability: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
  { id: 15, name: 'Gigi', role: 'Setter', availability: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
  { id: 16, name: 'Will', role: 'Setter', availability: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] }
];
```

## Gym Configurations

### Ogden
```javascript
{
  name: 'Ogden',
  boulderDays: ['Monday'],
  ropeDays: ['Tuesday'],
  holdWashDays: ['Tuesday'],
  ropeRotationWeeks: 8,
  boulderRotationWeeks: 5,
  schoolRoomWeeks: 12,
  maxRopeSetters: 4,
  
  boulderSections: [
    { name: 'Vert', settersRequired: 4, difficulty: 'easy' },
    { name: 'Scoop', settersRequired: 4, difficulty: 'easy' },
    { name: 'Wave', settersRequired: 5, difficulty: 'hard' },
    { name: 'Shield & Roof', settersRequired: 6, difficulty: 'medium' },
    { name: 'Changing Corners & Steps', settersRequired: 6, difficulty: 'medium' }
  ],
  
  ropeSections: [
    { name: 'Belly', anchors: [1,2,3,4], difficulty: 'medium' },
    { name: 'East Vert Left', anchors: [5,6,7,8], difficulty: 'easy' },
    { name: 'East Vert Right', anchors: [9,10,11], difficulty: 'easy' },
    { name: 'Steep', anchors: [12,13,14], difficulty: 'medium' },
    { name: 'Barrel', anchors: [15,16,17], difficulty: 'hard' },
    { name: 'TR Tower South', anchors: [18,19,20], difficulty: 'easy' },
    { name: 'TR Tower East', anchors: [21,22], difficulty: 'easy' },
    { name: 'TR Tower North', anchors: [23,24,25], difficulty: 'easy' }
  ]
}
```

### SLC
```javascript
{
  name: 'SLC',
  boulderDays: ['Monday'],
  flexDays: ['Tuesday', 'Wednesday', 'Thursday', 'Friday'], // Can choose rope or boulder
  holdWashDays: ['Tuesday', 'Thursday'],
  ropeRotationWeeks: 10,
  boulderRotationWeeks: 5,
  schoolRoomWeeks: 12,
  maxRopeSetters: 6,
  
  boulderSections: [
    { name: 'Dihedral & Roof', settersRequired: 7, difficulty: 'hard' },
    { name: 'The 20', settersRequired: 3, difficulty: 'easy' },
    { name: 'A Gate', settersRequired: 4, difficulty: 'medium' },
    { name: 'B Gate', settersRequired: 5, difficulty: 'medium' },
    { name: 'Vert & Slab', settersRequired: 6, difficulty: 'easy' },
    { name: 'Caves', settersRequired: 5, difficulty: 'hard' },
    { name: 'Bulge', settersRequired: 4, difficulty: 'medium' }
  ],
  
  ropeSections: [
    { name: 'West Wing', anchors: [1,2,3,4,5], difficulty: 'medium' },
    { name: 'Steep', anchors: [6,7,8,9,10], difficulty: 'medium' },
    { name: 'Center Arete', anchors: [11,12,13,14,15], difficulty: 'hard' },
    { name: 'Gentle Overhang', anchors: [16,17,18,19,20,21], difficulty: 'easy' },
    { name: 'Gateway', anchors: [22,23,24], difficulty: 'hard' },
    { name: 'Tower', anchors: [25,26,27], difficulty: 'hard', 
      specialRules: 'Two consecutive days, 2 setters per day' },
    { name: 'Sunny Side', anchors: [28,29,30,31], difficulty: 'medium' },
    { name: 'Eye of Stack', anchors: [32,33,34,35,36,37,38], difficulty: 'easy' },
    { name: 'TR Wall', anchors: [39,40,41], difficulty: 'easy' },
    { name: 'Scoop', anchors: [42,43,44,45,46], difficulty: 'easy' },
    { name: 'Vert TR', anchors: [47,48,49], difficulty: 'easy' },
    { name: 'Vert Autobelay', anchors: [50,51,52], difficulty: 'easy', autobelay: true },
    { name: 'Gateway Dihedral', anchors: [53], difficulty: 'easy' },
    { name: 'Tower South', anchors: [54,55,56], difficulty: 'easy' },
    { name: 'Tower East', anchors: [57,58], difficulty: 'easy' },
    { name: 'Tower Autobelay', anchors: [59,60,61], difficulty: 'easy', autobelay: true }
  ]
}
```

### Soma
```javascript
{
  name: 'Soma',
  boulderDays: ['Wednesday'],
  ropeDays: ['Thursday', 'Friday'],
  holdWashDays: ['Wednesday', 'Friday'],
  ropeRotationWeeks: 10,
  boulderRotationWeeks: 5,
  schoolRoomWeeks: 12,
  maxRopeSetters: 5,
  
  boulderSections: [
    { name: '4th Floor South', settersRequired: 5, difficulty: 'easy' },
    { name: '4th Floor North', settersRequired: 5, difficulty: 'easy' },
    { name: 'Muscle Beach', settersRequired: 8, difficulty: 'hard' },
    { name: 'Swoopy Slab', settersRequired: 6, difficulty: 'easy' },
    { name: 'Alcove', settersRequired: 7, difficulty: 'hard' }
  ],
  
  ropeSections: [
    { name: 'Flatiron', anchors: [1,2,3], difficulty: 'easy' },
    { name: 'Steep Left', anchors: [4,5,6,7,8,9], difficulty: 'medium' },
    { name: 'Steep Right', anchors: [10,11,12,13,14,15], difficulty: 'medium' },
    { name: 'Beast Jr', anchors: [16,17,18,19], difficulty: 'hard',
      specialRules: 'Two days: 4 setters day 1, 3 setters day 2' },
    { name: 'White Stripes', anchors: [20], difficulty: 'easy' },
    { name: 'North Autobelay', anchors: [21,22,23,24], difficulty: 'easy', autobelay: true,
      specialRules: 'Two days: 2 setters per day' },
    { name: 'South Autobelay', anchors: [25,26,27,28,29,30], difficulty: 'easy', autobelay: true,
      specialRules: 'Two days: 3 setters per day' },
    { name: 'Bottleneck', anchors: [31,32,33,34], difficulty: 'easy' },
    { name: 'Beauty Wall', anchors: [35,36,37,38], difficulty: 'easy' },
    { name: 'Speed Wall', anchors: [39,40,41,42,43,44], difficulty: 'easy',
      specialRules: 'Not reset regularly - manual only' },
    { name: 'Programming Nook', anchors: [45,46], difficulty: 'easy' },
    { name: 'Beast', anchors: [47,48,49,50,51,52,53,54,55], difficulty: 'hard',
      specialRules: 'Two days: 6 setters day 1, 3 setters day 2' },
    { name: 'Leaf Wall', anchors: [56,57,58,59,60,61], difficulty: 'easy' },
    { name: 'Concave', anchors: [62,63,64,65,66], difficulty: 'easy' }
  ]
}
```

## Constraint Rules

### Critical Constraints (Must Enforce - Errors)
1. **Head Setter Assignment**: Head setters MUST be assigned to their designated gym on Monday, Tuesday, and Wednesday when setting occurs
2. **Rope Safety Minimum**: Rope setting requires minimum 2 setters (not counting hold washer)
3. **Rope Maximum**: Cannot exceed gym max setters (Ogden: 4, SLC: 6, Soma: 5)
4. **Boulder Exactness**: Boulder sections must have EXACTLY the required number of setters
5. **Spec Setter Days**: Spec setters (Aliyah, Brayden) can ONLY work Monday-Tuesday
6. **Spec Setter Activities**: Spec setters can ONLY do boulder setting or hold washing (NOT rope setting)
7. **Director/Head Setter Roles**: Directors and head setters can ONLY be assigned to setting shifts (NOT hold washing)
8. **Staff Availability**: Staff can only be assigned on their available days
9. **Director Schedule**: Eddie (Director) should set every other Monday (weeks 0, 2, 4, 6, etc.)

### Recommended Constraints (Should Enforce - Warnings)
1. **Hard Section Limit**: Setters should not be assigned more than 2 hard sections per week
2. **Wash Shift Limit**: Each setter should have maximum 1 hold wash shift per week
3. **Boulder Minimum**: Each setter should have at least 1 boulder shift per week
4. **Ogden Frequency**: Setters should not work at Ogden more than 1 day per week
5. **Workload Balance**: Try to distribute difficulty evenly across team

### Autobelay Special Rule
- Sections marked as `autobelay: true` have a 5-week rotation instead of 10-week

## Key Features to Implement

### 1. Weekly Schedule Grid
- Display all 3 gyms × 5 days in a calendar grid
- Show shift type, assigned staff count, section name
- Color-code by difficulty (green=easy, yellow=medium, red=hard)
- Highlight violations in red
- Click to open assignment modal

### 2. Staff Assignment Modal
- Show available staff based on day and constraints
- Display section selector with requirements
- Show special rules for multi-day sections
- Allow hold washer assignment from assigned staff
- Show staff role badges (HEAD, DIR, SPEC)
- Gray out unavailable staff with reason

### 3. Validation System
- Real-time constraint checking
- Display violation count and list at top
- Categorize by severity (error vs warning)
- Show which shift has the violation
- Suggest fixes where possible

### 4. Week Navigation
- Previous/Next week buttons
- Display week number and actual date range
- Auto-save when navigating
- Manual save button
- Track current week vs historical weeks

### 5. Analytics Dashboard
- Staff workload (total shifts, boulder count, hard sections)
- Rotation status (weeks since last reset)
- Hold wash distribution
- Ogden frequency per setter
- Difficulty distribution

### 6. Rotation Tracking
- Track last reset week for each section type
- Calculate weeks since reset
- Show visual alerts (⚠️) when at/past rotation goal
- Different cycles: boulder (5wk), rope (8-10wk), autobelay (5wk), school room (12wk)

## Auto-Scheduling Algorithm

### Overview
The system should include an intelligent auto-scheduling feature that can automatically assign setters to shifts while respecting all constraints and optimizing for workload balance.

### Auto-Schedule Button
Add a prominent "Auto-Schedule Week" button that:
1. Analyzes the current week's requirements
2. Assigns all setters optimally
3. Shows a preview before applying
4. Allows manual adjustments after auto-scheduling
5. Can auto-schedule individual days or entire weeks

### Scheduling Algorithm Strategy

#### Priority Order (Execute in this sequence):

**1. Mandatory Assignments (Must Do First)**
```javascript
// These MUST be assigned first, no flexibility
- Head setters to their gyms (Mon-Wed when setting occurs)
- Director to a Monday shift (if even week: 0, 2, 4, 6...)
```

**2. Section Selection (Before Staff Assignment)**
```javascript
// Determine which sections to set based on rotation needs
- Check rotation status for each gym
- Prioritize sections that are overdue (>= rotation weeks)
- For boulder days: select ONE section that's most overdue
- For rope days: can select multiple sections
- Mark sections for reset in rotation tracking
```

**3. Boulder Day Assignment (High Priority)**
```javascript
// Boulder must be completed in one day
For each boulder day:
  1. Get selected section's setter requirement
  2. Assign head setter first (already done in step 1)
  3. Fill remaining slots with available setters
  4. Prioritize setters who:
     - Need boulder shifts this week
     - Haven't worked at this gym much this week (especially Ogden)
     - Have fewer hard sections assigned this week
  5. If section is hard difficulty, spread among experienced setters
```

**4. Rope Day Assignment (Medium Priority)**
```javascript
// Rope can span multiple days
For each rope day:
  1. Assign head setter first (already done in step 1)
  2. Ensure minimum 2 setters (safety requirement)
  3. Don't exceed gym maximum (Ogden: 4, SLC: 6, Soma: 5)
  4. Optimize for 3-4 setters typically
  5. Prioritize setters who:
     - Are available that day
     - Have balanced workload
     - Complement the difficulty level
```

**5. Hold Washer Assignment (Low Priority)**
```javascript
// Optional but good to have
For each hold wash day:
  1. Check if gym needs hold wash that day
  2. Select from already-assigned setters
  3. Prioritize setters who:
     - Haven't had a wash shift this week
     - Are spec setters (Aliyah/Brayden) if available
     - Are regular setters (not head setters or director)
  4. Never assign head setters or director as hold washer
```

### Scheduling Heuristics

#### Staff Selection Algorithm
```javascript
function selectBestSetters(requirements, constraints, weekContext) {
  // Get available staff for this day
  const available = staff.filter(s => s.availability.includes(day));
  
  // Remove staff who violate hard constraints
  const eligible = available.filter(s => {
    return !violatesHardConstraints(s, shift, weekContext);
  });
  
  // Score each eligible setter
  const scored = eligible.map(s => ({
    setter: s,
    score: calculateSetterScore(s, shift, weekContext)
  }));
  
  // Sort by score (higher is better)
  scored.sort((a, b) => b.score - a.score);
  
  // Select top N setters
  return scored.slice(0, requirements.count).map(s => s.setter);
}

function calculateSetterScore(setter, shift, weekContext) {
  let score = 100; // Start at baseline
  
  // Bonus points for needed assignments
  if (needsBoulderShift(setter, weekContext)) score += 30;
  if (shift.gym !== 'Ogden' && hasWorkedOgden(setter, weekContext)) score += 20;
  if (!hasWashShift(setter, weekContext) && shift.isHoldWashDay) score += 15;
  
  // Penalty points for concerning patterns
  if (getHardSectionCount(setter, weekContext) >= 2) score -= 40;
  if (getWashShiftCount(setter, weekContext) >= 1) score -= 30;
  if (getTotalShifts(setter, weekContext) >= 4) score -= 20;
  if (shift.gym === 'Ogden' && getOgdenDays(setter, weekContext) >= 1) score -= 50;
  
  // Difficulty balancing
  if (shift.difficulty === 'hard') {
    score -= getHardSectionCount(setter, weekContext) * 15;
  }
  
  // Spec setter preferences
  if (setter.role === 'Spec Setter' && shift.type === 'Boulder') {
    score += 25; // They prefer boulders
  }
  
  return score;
}
```

#### Constraint Violation Check
```javascript
function violatesHardConstraints(setter, shift, weekContext) {
  // Check availability
  if (!setter.availability.includes(shift.day)) return true;
  
  // Check spec setter constraints
  if (setter.role === 'Spec Setter') {
    if (!['Monday', 'Tuesday'].includes(shift.day)) return true;
    if (shift.type === 'Rope' && !shift.isHoldWasher) return true;
  }
  
  // Check director constraints
  if (setter.role === 'Director') {
    if (shift.day !== 'Monday') return true;
    if (weekContext.weekNumber % 2 !== 0) return true; // Only even weeks
  }
  
  // Check head setter gym matching
  if (setter.role === 'Head Setter') {
    if (setter.gym !== shift.gym) return true;
    if (!['Monday', 'Tuesday', 'Wednesday'].includes(shift.day)) return true;
  }
  
  return false;
}
```

### Section Selection Algorithm

```javascript
function selectSectionsForWeek(gym, weekNumber, rotationTracking) {
  const config = GYM_CONFIGS[gym];
  const tracking = rotationTracking[gym];
  const selections = {};
  
  // Boulder section selection
  if (config.boulderDays.length > 0) {
    const boulderSections = BOULDER_SECTIONS[gym];
    const weeksSinceReset = weekNumber - tracking.lastBoulderReset;
    
    // Find most overdue section
    let selectedSection = null;
    let oldestReset = -Infinity;
    
    boulderSections.forEach(section => {
      const lastReset = tracking.sectionResets[section.name] || -config.boulderRotationWeeks;
      const weeksSince = weekNumber - lastReset;
      
      if (weeksSince > oldestReset) {
        oldestReset = weeksSince;
        selectedSection = section;
      }
    });
    
    selections.boulder = selectedSection;
  }
  
  // Rope section selection
  if (config.ropeDays?.length > 0 || config.flexDays?.length > 0) {
    const ropeSections = ROPE_SECTIONS[gym];
    const selectedRopeSections = [];
    
    ropeSections.forEach(section => {
      const rotationWeeks = section.autobelay ? 5 : config.ropeRotationWeeks;
      const lastReset = tracking.sectionResets[section.name] || -rotationWeeks;
      const weeksSince = weekNumber - lastReset;
      
      // Skip Speed Wall unless manually requested
      if (section.specialRules?.includes('manual only')) return;
      
      // Select if overdue or nearly due
      if (weeksSince >= rotationWeeks - 1) {
        selectedRopeSections.push({
          section,
          priority: weeksSince - rotationWeeks, // Higher = more overdue
          weeksSince
        });
      }
    });
    
    // Sort by priority and select top sections
    selectedRopeSections.sort((a, b) => b.priority - a.priority);
    selections.rope = selectedRopeSections.slice(0, 3).map(s => s.section);
  }
  
  return selections;
}
```

### Multi-Day Section Handling

```javascript
function scheduleMultiDaySection(section, startDay, gym, schedule) {
  // Parse special rules
  const rules = parseMultiDayRules(section.specialRules);
  
  if (!rules.multiDay) {
    // Single day section, schedule normally
    return scheduleSingleDay(section, startDay, gym, schedule);
  }
  
  // Multi-day section (e.g., Tower: 2 days, 2 setters each)
  const days = getConsecutiveDays(startDay, rules.numDays);
  
  days.forEach((day, index) => {
    const setterCount = rules.settersPerDay[index] || rules.settersPerDay[0];
    const key = `${gym}-${day}`;
    
    schedule[key] = {
      ...schedule[key],
      section: section.name,
      multiDayProgress: { day: index + 1, total: rules.numDays },
      notes: `${section.name} - Day ${index + 1} of ${rules.numDays}`
    };
    
    // Assign setters for this day
    const setters = selectBestSetters({
      count: setterCount,
      gym,
      day,
      difficulty: section.difficulty
    }, {}, getWeekContext(schedule));
    
    schedule[key].assignedStaff = setters.map(s => s.id);
  });
  
  return schedule;
}

function parseMultiDayRules(specialRules) {
  if (!specialRules) return { multiDay: false };
  
  // "Two consecutive days, 2 setters per day"
  const consecutiveMatch = specialRules.match(/(\w+) consecutive days?, (\d+) setters? per day/i);
  if (consecutiveMatch) {
    return {
      multiDay: true,
      numDays: consecutiveMatch[1] === 'Two' ? 2 : parseInt(consecutiveMatch[1]),
      settersPerDay: [parseInt(consecutiveMatch[2])]
    };
  }
  
  // "Two days: 4 setters day 1, 3 setters day 2"
  const variableMatch = specialRules.match(/(\d+) days?: (\d+) setters? day \d+, (\d+) setters? day \d+/i);
  if (variableMatch) {
    return {
      multiDay: true,
      numDays: parseInt(variableMatch[1]),
      settersPerDay: [parseInt(variableMatch[2]), parseInt(variableMatch[3])]
    };
  }
  
  return { multiDay: false };
}
```

### Auto-Schedule UI Components

#### Auto-Schedule Button
```javascript
// Add to WeekNavigation or main toolbar
<button
  onClick={handleAutoSchedule}
  style={{
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    border: 'none',
    borderRadius: '0.5rem',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontWeight: '600',
    fontSize: '0.9rem'
  }}
>
  <Sparkles size={18} />
  Auto-Schedule Week
</button>
```

#### Preview Modal
Before applying auto-schedule, show preview:
```javascript
<AutoSchedulePreview
  proposedSchedule={autoGeneratedSchedule}
  currentSchedule={currentSchedule}
  violations={violations}
  onApply={() => applyAutoSchedule()}
  onCancel={() => closePreview()}
  onAdjust={(shift) => openShiftModal(shift)}
/>
```

Preview should show:
- Total setters assigned
- Workload distribution graph
- Any remaining violations
- Sections selected for reset
- Comparison with current schedule
- Option to apply, cancel, or manually adjust

### Auto-Schedule Options

Add configuration panel for auto-schedule:
```javascript
<AutoScheduleOptions
  options={{
    prioritizeWorkloadBalance: true,
    respectSetterPreferences: true,
    minimizeOgdenFrequency: true,
    optimizeForRotations: true,
    fillAllDays: false, // If false, only schedules required days
    allowOverrides: true // Allow manual overrides after auto-schedule
  }}
  onChange={setAutoScheduleOptions}
/>
```

### Partial Auto-Schedule

Allow scheduling individual days or gyms:
```javascript
// Schedule just one gym for the week
autoScheduleGym(gym, weekNumber);

// Schedule just one day across all gyms
autoScheduleDay(day, weekNumber);

// Schedule remaining empty shifts
autoScheduleFillGaps(weekNumber);
```

### Conflict Resolution

When auto-schedule can't find perfect solution:
```javascript
function resolveConflicts(schedule, violations) {
  // Try different strategies in order
  const strategies = [
    relaxHoldWasherRequirements,
    reduceRopeSetterCount,
    swapSettersBetweenDays,
    requestAdditionalStaff,
    suggestManualIntervention
  ];
  
  for (const strategy of strategies) {
    const result = strategy(schedule, violations);
    if (result.success) return result.schedule;
  }
  
  // If all strategies fail, return partial schedule with explanation
  return {
    schedule,
    success: false,
    message: "Unable to create conflict-free schedule. Manual adjustment required.",
    suggestions: generateSuggestions(violations)
  };
}
```

### Learning from History

Use historical schedules to improve auto-scheduling:
```javascript
function learnFromHistory(scheduleHistory) {
  const patterns = {
    preferredPairings: {}, // Which setters work well together
    setterStrengths: {}, // Which setters excel at hard sections
    successfulLayouts: [], // Layouts that had zero violations
    commonConflicts: [] // Frequent issues to avoid
  };
  
  // Analyze past weeks
  Object.values(scheduleHistory).forEach(week => {
    analyzeSetterPairings(week, patterns.preferredPairings);
    analyzeSetterPerformance(week, patterns.setterStrengths);
    if (hasNoViolations(week)) {
      patterns.successfulLayouts.push(week);
    }
  });
  
  return patterns;
}
```

### Performance Optimization

For large scheduling problems:
```javascript
// Use memoization for repeated calculations
const memoizedScores = new Map();

// Use backtracking with pruning for constraint satisfaction
function backtrackSchedule(partial, remaining, constraints) {
  if (remaining.length === 0) {
    return partial; // Solution found
  }
  
  const nextShift = remaining[0];
  const candidates = getCandidateSetters(nextShift);
  
  for (const setter of candidates) {
    const updated = assignSetter(partial, nextShift, setter);
    
    // Prune if definitely won't lead to solution
    if (isViable(updated, remaining.slice(1), constraints)) {
      const result = backtrackSchedule(updated, remaining.slice(1), constraints);
      if (result) return result;
    }
  }
  
  return null; // No solution found
}
```

### Testing Auto-Schedule

Test cases to verify:
1. **Full week auto-schedule** - Should assign all required positions
2. **Constraint compliance** - Should have zero critical violations
3. **Workload balance** - No setter should have 5+ shifts
4. **Hard section distribution** - Spread evenly
5. **Ogden limitation** - No setter at Ogden 2+ days
6. **Hold washer distribution** - Max 1 per setter
7. **Boulder requirement** - Each setter gets at least 1
8. **Multi-day sections** - Properly handled
9. **Director schedule** - Only even Mondays
10. **Head setters** - Always at their gyms Mon-Wed

### User Experience Flow

1. User clicks "Auto-Schedule Week"
2. System analyzes requirements (2-3 seconds)
3. Preview modal shows proposed schedule
4. User reviews:
   - Staff assignments
   - Workload distribution
   - Any warnings
5. User can:
   - Accept all
   - Manually adjust specific shifts
   - Reject and start over
6. Upon acceptance, schedule is applied
7. User can still manually adjust afterward

### Future Enhancements

- **AI-powered preferences** - Learn which setters prefer which sections
- **What-if scenarios** - "What if Setter X is unavailable?"
- **Optimization goals** - User can choose to optimize for different objectives
- **Template scheduling** - Save and reuse successful schedules
- **Drag-and-drop refinement** - Easy manual adjustments post auto-schedule

---

## Data Structures

### Schedule Object
```javascript
{
  [weekNumber]: {
    "Ogden-Monday": {
      shiftType: "Boulder Setting" | "Rope Setting" | "Hold Washing",
      assignedStaff: [staffId1, staffId2, ...],
      holdWasher: staffId | null,
      section: "section name" | null,
      completedAnchors: [anchorNumber, ...],
      notes: "string",
      multiDayProgress: { day: 1, total: 2 } | null
    },
    // ... more gym-day combinations
  }
}
```

### Rotation Tracking Object
```javascript
{
  [gymName]: {
    lastBoulderReset: weekNumber,
    lastRopeReset: weekNumber,
    lastSchoolRoom: weekNumber,
    sectionResets: {
      [sectionName]: weekNumber
    }
  }
}
```

## UI/UX Guidelines

### Design Aesthetic
- Modern, clean interface with dark theme
- Gradient accents (blue to purple spectrum)
- Clear typography with good contrast
- Smooth transitions and hover states
- Professional but not corporate

### Color Scheme
- Background: Dark blue-gray gradients (#0f172a to #334155)
- Primary accent: Blue (#3b82f6)
- Secondary accent: Purple (#8b5cf6)
- Success: Green (#10b981)
- Warning: Orange (#f59e0b)
- Error: Red (#ef4444)
- Text: Light gray (#f1f5f9)

### Interaction Patterns
- Click to edit (shift cells)
- Hover effects on interactive elements
- Visual feedback on save
- Tooltips for complex features
- Confirmation for destructive actions

## Development Workflow

### Phase 1: Core Structure
1. Set up React project with required dependencies
2. Create data files (staff, gyms, sections)
3. Build basic schedule grid component
4. Implement week navigation

### Phase 2: Staff Assignment
1. Create assignment modal
2. Implement staff filtering logic
3. Add section selection
4. Build hold washer assignment

### Phase 3: Validation
1. Implement all constraint rules
2. Create validation engine
3. Build violation display
4. Add real-time checking

### Phase 4: Analytics
1. Create analytics calculation functions
2. Build analytics panel UI
3. Add rotation tracking
4. Implement workload analysis

### Phase 5: Polish
1. Add animations and transitions
2. Improve error messaging
3. Add keyboard shortcuts
4. Optimize performance

### Phase 6: Auto-Scheduling Engine
1. Implement auto-scheduling algorithm
2. Create scheduling strategies and heuristics
3. Build conflict resolution logic
4. Add manual override capabilities
5. Implement schedule optimization

### Phase 7: Persistence (Future)
1. Design API structure for Pebble integration
2. Add backend endpoints
3. Implement authentication
4. Add multi-user features

## Testing Requirements

### Unit Tests
- Constraint validation logic
- Analytics calculations
- Date/week calculations
- Staff availability checks

### Integration Tests
- Full schedule creation workflow
- Week navigation with save
- Violation detection across constraints
- Multi-day section handling

### Manual Testing Scenarios
1. Create full week schedule for all gyms
2. Test all constraint violations
3. Navigate through multiple weeks
4. Assign multi-day sections
5. Test SLC flexible days
6. Verify rotation alerts
7. Test analytics accuracy

## Common Pitfalls to Avoid

1. **Don't forget hold washers don't count toward setter minimums**
2. **Spec setters have TWO constraints**: day limitation AND activity limitation
3. **SLC flex days need shift type selection first**
4. **Multi-day sections need special handling** (Tower, Beast, Beast Jr, autoblays)
5. **Director works every OTHER Monday** (even week numbers)
6. **Head setters can't be hold washers**
7. **Autobelay sections have 5-week rotation, not 10-week**
8. **Boulder sections need EXACT setter count, not minimum**

## File Organization Best Practices

### Separate Concerns
- Data files should be pure data (no logic)
- Utils should be pure functions (no side effects)
- Components should be focused (single responsibility)
- Validation logic separate from UI

### Naming Conventions
- Components: PascalCase (ScheduleGrid.jsx)
- Files: kebab-case (staff-data.js)
- Functions: camelCase (validateSchedule)
- Constants: UPPER_SNAKE_CASE (SHIFT_TYPES)

### Code Organization
- Group related functions
- Comment complex logic
- Use TypeScript or JSDoc for type hints
- Keep files under 500 lines

## Future API Design (Pebble Integration)

### Endpoint Structure
```
GET    /api/schedule/:weekNumber
POST   /api/schedule/:weekNumber
PUT    /api/schedule/:weekNumber/:gymDay
DELETE /api/schedule/:weekNumber/:gymDay

GET    /api/staff
GET    /api/gyms
GET    /api/rotations

POST   /api/validate/:weekNumber
GET    /api/analytics/:weekNumber
```

### Response Format
```json
{
  "success": true,
  "data": { ... },
  "violations": [ ... ],
  "metadata": {
    "weekNumber": 0,
    "lastModified": "timestamp",
    "modifiedBy": "userId"
  }
}
```

## Questions to Ask When Modifying

Before making changes, ask:
1. Does this affect any constraints?
2. Will this work for all three gyms?
3. How does this handle multi-day sections?
4. What happens to historical data?
5. Is this change API-compatible for Pebble?
6. Does this maintain data integrity?

## Success Criteria

The system is successful when:
- ✅ All 16 staff members can be assigned correctly
- ✅ All constraints are enforced automatically
- ✅ **Auto-schedule can generate valid weekly schedules**
- ✅ **Auto-schedule respects all critical constraints**
- ✅ **Auto-schedule balances workload fairly**
- ✅ Users can navigate weeks smoothly
- ✅ Violations are clearly displayed
- ✅ Analytics provide useful insights
- ✅ Rotation tracking works accurately
- ✅ Schedule can be saved and loaded
- ✅ UI is intuitive and responsive
- ✅ Multi-day sections are handled properly
- ✅ **Preview modal shows proposed schedule before applying**
- ✅ **Manual adjustments can override auto-schedule**
- ✅ System is ready for Pebble integration

## Additional Context

This system manages real climbing gym operations where:
- Safety is critical (minimum setters for rope)
- Staff have varying expertise and availability
- Sections have different difficulty levels
- Rotations ensure variety for climbers
- Workload must be balanced fairly
- Historical tracking enables planning

The scheduler must be reliable, accurate, and easy to use for gym managers who are creating schedules weekly.

---

**When in doubt, prioritize safety constraints over convenience features.**