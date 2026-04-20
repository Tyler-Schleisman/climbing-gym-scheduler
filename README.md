# Climbing Gym Scheduling System

A comprehensive web-based scheduling application for managing route-setting operations across multiple climbing gym locations.

## 🎯 Features

### Core Scheduling
- **Multi-location support**: Manage 3 gyms (Ogden, SLC, Soma) with unique schedules
- **16 staff members** with roles, availability, and preferences
- **37+ wall sections** with rotation tracking
- **14 constraint rules** enforced automatically
- **Auto-scheduling** with AI optimization
- **Extended scheduling**: Plan multiple weeks at once

### Advanced Features
- ✅ **Partial completion tracking**: Track which specific anchors have been set
- ✅ **Multiple concurrent rope sections**: Schedule multiple sections per day
- ✅ **Drag & drop interface**: Easily reassign setters
- ✅ **Undo/Redo system**: Fix mistakes instantly
- ✅ **Historical analytics**: Track trends over months
- ✅ **Quick actions**: Batch operations for faster scheduling
- ✅ **Notifications**: Real-time alerts for violations and events
- ✅ **Missed shift tracking**: Automatically reschedule incomplete work
- ✅ **Inspection scheduling**: 12-week inspection cycles
- ✅ **Theme customization**: Multiple color themes
- ✅ **Setter preferences**: Low-priority scheduling hints

### Data Management
- **Monthly & weekly views**: Multiple perspectives on your schedule
- **Export/Import**: Backup your data
- **Vacation tracking**: Calendar for sick days and time off
- **Wall section age tracking**: Manual and automatic rotation tracking

## 🛠️ Tech Stack

- **React** - UI framework
- **Vite** - Build tool
- **Lucide React** - Icons
- **localStorage** - Data persistence

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Tyler-Schleisman/climbing-gym-scheduler.git
cd climbing-gym-scheduler
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to http://localhost:5173

## 📖 Usage

### Getting Started
1. Configure your setters in **Setter Settings**
2. Set up wall sections in **Settings > Wall Sections**
3. Use **Auto-Schedule** to generate optimized schedules
4. Fine-tune with drag & drop or manual assignment

### Key Concepts
- **Head Setters**: Must be present at their gym when setting occurs
- **Spec Setters**: Only work Mon-Wed, boulder/wash only
- **Rope Minimums**: Minimum 2 setters per rope shift
- **Gym Maximums**: 4 (Ogden), 6 (SLC), 5 (Soma) rope setters max
- **Rotation Cycles**: 5 weeks (boulder), 10 weeks (rope)

## 📊 Constraints

The system enforces 14 scheduling constraints:
- Head setters at their gym when setting occurs
- Rope minimum 2 setters
- Rope maximum per gym
- Boulder exact setter counts
- Spec setters Mon-Wed only
- Hold washer rules
- And more...

## 🤝 Contributing

This is a custom business application. If you have suggestions or find bugs, please open an issue.

## 📄 License

Private business use.

## 🙏 Acknowledgments

Built with Claude Code for efficient route-setting management.
