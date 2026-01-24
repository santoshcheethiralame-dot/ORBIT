🛰️ Orbit v3 — Mission Control for Students
Orbit is a local-first, context-aware study planner built for students who don't live by rigid calendars.
Instead of static schedules, Orbit generates daily missions based on your energy, workload, and academic reality.
This is not a to-do app.
This is an execution system.

🌌 The Night-Owl Principle (Configurable Day Start)
Most planners reset at midnight — Orbit does not.
Orbit features a configurable day-start threshold (default: 4:00 AM IST), designed for students who study late into the night.
What this means:

Studying at 3:30 AM still counts as today
Your focus streak is never broken by artificial midnight boundaries
A new study cycle begins only after your configured start hour
Fully customizable from Settings (0:00 - 6:00 AM range)

This single rule eliminates one of the biggest sources of planner friction.

🧠 Core Philosophy
Orbit optimizes for:

Cognitive energy, not just available time
Short, achievable study blocks, not unrealistic schedules
Daily execution, not long-term calendar micromanagement
Adaptive intelligence that learns from your patterns

Every day starts with context, not assumptions.

🚀 Core Systems
1. Daily Context Engine
Each day begins with a short calibration instead of a rigid plan.
You tell Orbit:

Your energy level (low / normal / high)
The day type (normal / ISA / ESA)
Special conditions (holiday, sick, bunked)
Assignments or upcoming exams
Focus subject for exam days

Orbit uses this to generate a plan that fits today, not an idealized version of it.
Smart Presets:

Regular Day, Peak Sprint, Recovery Mode
ISA Crunch, ESA Sprint, Chill Day
Each preset auto-configures mood, day type, and expectations


2. Mission Planner (Plan Generator v3)
Orbit's displacement engine converts your context into variable study blocks by:
Prioritization System:

ESA/ISA focus (dominance priority 0-1)
Urgent assignments (≤ 2 days due)
Project decay detection (idle time tracking)
Timetable-based daily review
Recovery/prep scheduling

Smart Features:

Load analysis with 4 levels (light/normal/heavy/extreme)
Workload warnings for overload detection
Block ordering optimized for cognitive flow
Explainability system - every block shows why it was scheduled
Displacement tracking - see what got bumped and why

What gets prioritized:

ESA days → 70% time for focus subject (≤2 days until exam)
ISA days → Focused prep sessions
Urgent assignments → Due within 2 days
Project decay → Neglected for 3+ days (escalating priority)
Timetable review → Same-day class retention
Fallback → General revision if nothing urgent


3. Command Center (Dashboard)
Your operational view for the day.
Features:

"Next Mission" focus card - Large, prominent current task
Click-to-focus block selection - Execute any block in any order
Daily completion progress with circular indicator
Estimated completion time based on remaining blocks
Study streak tracking with fire animation
Backlog migration for unfinished blocks
Context-aware greeting and day-type indicators
Week preview - 7-day load forecast with warnings
Load warnings - Visual alerts for heavy/extreme days
Block explanations - "Why?" button shows scheduling logic

Week Preview Intelligence:

Detects overload clusters (3+ heavy days)
Warns about assignment pile-ups
Identifies neglected projects
Shows peak workload day
Collision detection (ESA + assignments same day)


4. Focus Session Protocol
A distraction-free execution environment with tactile microinteractions.
Includes:

Large central countdown timer with ring progress
Pause / resume with state preservation
5-minute break mode with auto-end
Finish-early confirmation (double-tap to prevent accidents)
Session notes - Capture thoughts without breaking flow
Automatic logging on completion
Seamless return to dashboard
Notes persistence - Session reflections saved to logs

Glass-morphism notes modal:

Full-screen frosted glass overlay
Escape key to close
Auto-saves to session log

Once a session starts, Orbit stays out of your way.

5. Subject Array (Courses Hub)
The authoritative academic database with resource management.
Per subject, Orbit tracks:

Credits, difficulty, code - Core metadata
Study time and session history - Automatic logging
Syllabus progress - Interactive checklist with completion tracking
Grades tracking - ISA/ESA/internals with automatic GPA calculation
Resource library:

PDF uploads (inline preview)
Images, videos, slides
Web links (one-click external)
File size tracking
Drag-and-drop upload


Progress visualization - Completion percentage
Weekly timetable - Integration with schedule

Enhanced Features:

Click to expand subject detail view
Inline resource viewer for PDFs/images
Office document download handler
Resource type badges (link/pdf/video)
Grade average calculation
Syllabus unit completion toggle


6. Mission Analytics (Stats)
Local, private, and visual with intelligence metrics.
Includes:

Total focus hours (time-range filtered)
Session counts and averages
Subject-wise focus scores (0-100 intelligence metric)
Trend analysis with percentage change
30-day activity heatmap with intensity levels
Activity type breakdown (review/assignment/project/prep)
CSV export for detailed analysis
Weekly/10-day/monthly time range filters

Focus Score Algorithm:

40% Consistency (study days / total days)
30% Session quality (avg duration vs ideal 45min)
30% Volume (total time vs 300min benchmark)
Color-coded (Excellent/Good/Fair/Needs Focus)

Expandable Subject Cards:

Click to see consistency, avg session, last study date
Trend arrows (up/down) with percentage
Hour totals and session counts

All data stays on your device.

🎨 Design System
Glass-morphism Interface:

Frosted glass panels with backdrop blur
Subtle gradients and specular highlights
Soft shadows and border glows
Micro-animations on hover/click
Depth through layering

Sound Design:

"Zen Garden" audio profile (soft, organic)
Click: Wood block tap (300Hz → 50Hz)
Tab switch: Glass chime (600Hz)
Success: A Major 7th chord (4-note cascade)
Error: Low thud (non-aggressive)
User-controllable in Settings

Space Theme:

Animated star field background
Shooting stars (6s interval)
Hanging alien scholar mascot

Reading a book
Periodic "idea bubble" animation
Gentle swaying motion
Desktop + mobile responsive




🔧 Settings & Customization
Protocols:

Day Start Hour (0-6 AM range, default 4 AM)
Interface Sounds (toggle with immediate preview)

Notifications:

Session reminders
Daily plan ready alerts
Streak milestones
Assignment due warnings
Permission request flow
Default: All disabled (user must opt-in)

Data Governance:

Database size monitoring
Export backup (JSON with metadata)
Import restore (with validation)
Factory reset (double-confirm)

Theme:

Dark mode (default)
Light mode (comprehensive override)


🔒 Local-First by Design
Orbit does not use:

Accounts
Cloud sync (planned for future)
Telemetry
External databases

All data is stored locally using IndexedDB (Dexie.js v4).
You own your study data — permanently.
Storage Features:

Automatic schema migrations
Transaction safety
Compound indexes for fast queries
Graceful degradation


🛠️ Technical Stack
LayerTechnologyVersionFrontendReact19.2.3LanguageTypeScript5.8.2StorageDexie.js (IndexedDB)4.2.1StylingTailwind CSS (JIT)via CDNIconsLucide React0.562.0BuildVite6.4.1Time LogicCustom IST utilities-NotificationsWeb Notifications API-AudioWeb Audio API-
Browser Support:

Modern browsers with ES2022
IndexedDB support required
Optional: Web Audio, Notifications


🧪 Current Status
Orbit v3.1.1 is feature-complete and production-ready:
✅ Completed Systems:

Multi-step onboarding with timetable builder
Daily context presets (6 smart profiles)
Advanced plan generation with displacement engine
Load analysis and overload warnings
Week simulation with conflict detection
Focus sessions with notes
Backlog handling and migration
Courses with resource management
Stats with focus scores and trends
Settings with notifications and sounds
Configurable day-start threshold
Glass-morphism UI with animations
Space theme with animated mascot

🔄 Ongoing Refinements:

Plan generation intelligence tuning
Focus score algorithm optimization
Notification timing strategy
Performance profiling for large datasets


🗺️ Roadmap
Phase 1: Stability & Polish (v2.2) — Q1 2026

 Enhanced error boundaries with recovery
 Offline-first PWA support
 Performance optimization (code splitting)
 Accessibility audit (ARIA, keyboard nav)
 Mobile gesture support (swipe actions)
 Haptic feedback for mobile
 Advanced timezone handling
 Onboarding tutorial tooltips

Phase 2: Intelligence Upgrade (v2.3) — Q2 2026

 Smart Study Recommendations

Analyze best study times per subject
Detect personal productivity patterns
Suggest optimal block durations


 Spaced Repetition Planner

Ebbinghaus curve integration
Automatic review scheduling
Retention tracking


 Project Milestone Tracking

Sub-task breakdown
Progress visualization
Deadline forecasting


 AI Study Tips

Context-aware advice (local LLM)
Study technique suggestions



Phase 3: Collaboration & Sync (v2.4) — Q3 2026

 Encrypted Cloud Sync

End-to-end encryption
Multi-device support
Conflict resolution
Optional feature (local-first by default)


 Study Groups (Shared Plans)

Group session scheduling
Shared resource library
Group progress tracking


 Calendar Integration

Google Calendar 2-way sync
iCal export
External event import



Phase 4: Advanced Features (v2.5) — Q4 2026

 Flashcard System

Spaced repetition algorithm
Markdown support
Image/code support
Progress tracking


 Mind Map Tool

Visual concept mapping
Export as image/PDF
Integration with notes


 Voice Journaling

Audio reflections after sessions
Speech-to-text transcription
Searchable archive


 Pomodoro Variations

Customizable timer presets
Focus music integration
Break activity suggestions



Phase 5: Advanced Analytics (v2.6) — 2027

 Habit Tracker Integration

Sleep, exercise, mood correlation
Health metrics impact on focus
Lifestyle optimization tips


 Advanced Visualizations

Sankey diagrams (time flow)
Network graphs (subject connections)
Predictive charts (exam readiness)


 Study Buddy Matching

Find peers with similar schedules
Anonymous skill-based pairing
Study session coordination



Experimental / Research Ideas

 Biometric Integration (wearable focus tracking)
 VR Study Environment (WebXR immersive mode)
 AI Tutor Chatbot (local fine-tuned model)
 Video Lecture Time-stamping (smart bookmarks)
 Automated Resource Curation (web scraping + ML)


🧭 What Orbit Is (and Isn't)
Orbit is:

A daily execution system
Energy-aware and adaptive
Designed for real student behavior
Privacy-respecting (local-first)
Built for night owls and irregular schedules

Orbit is not:

A calendar replacement
A generic to-do list
A productivity "gamification" app
A note-taking tool (though it captures notes)
Cloud-dependent


🧑‍🚀 Philosophy

"The best plan is the one you actually follow."

Orbit exists to reduce friction, preserve momentum, and help you study consistently, even on imperfect days.
Design Principles:

Context over Calendar - Daily reality matters more than long-term plans
Execution over Planning - Focus on doing, not organizing
Adaptation over Rigidity - Plans that bend don't break
Privacy over Convenience - Your data stays yours
Clarity over Cleverness - Show why, not just what


📦 Getting Started
Prerequisites

Node.js 18+ or 20+
Modern browser (Chrome/Firefox/Safari/Edge)

Installation
bash# Clone the repository
git clone https://github.com/yourusername/orbit.git
cd orbit

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
First Run

Open http://localhost:3000
Complete onboarding (4 steps)
Set daily context
Start your first focus session


🤝 Contributing
Orbit is not yet open-source but contributions are planned for v2.2.
Planned contribution areas:

Algorithm improvements (plan generation, focus scores)
UI/UX refinements
Accessibility enhancements
Localization (i18n)
Testing (unit, integration, E2E)


📄 License
Proprietary (for now)
© 2026 Santosh Cheethirala. All rights reserved.
Open-source release planned for Q2 2026 under MIT License.

🙏 Acknowledgments
Inspiration:

Students who shared their study struggles
Night owls everywhere
The PESU academic system (ISA/ESA structure)

Technology:

React team (incredible DX)
Dexie.js (IndexedDB made sane)
Tailwind CSS (rapid prototyping)
Lucide Icons (clean, minimal)


📞 Contact
Developer: Santosh Cheethirala
GitHub: @santoshcheethirala
LinkedIn: Santosh Cheethirala
Support: Open an issue

Orbit v3.1.1
Local-first. Context-aware. Built for students who study after midnight.
🛰️ Mission Status: OPERATIONAL

🚧 Known Issues & Limitations
Current Limitations:

Single-device only (no sync yet)
No mobile app (PWA planned)
English only (i18n coming)
IST timezone hard-coded (configurability planned)
Max 5MB per resource file
No undo for plan regeneration

Browser Compatibility:

✅ Chrome 90+
✅ Firefox 88+
✅ Safari 14+
✅ Edge 90+
❌ IE 11 (not supported)

Performance Notes:

Recommended max: 50 subjects, 1000 logs
Large PDFs (>10MB) may cause slowdowns
Heatmap rendering intensive for 365+ days


🎯 Success Metrics (Internal)
User Engagement:

Daily active rate: Target 70%+
Average session length: 35-45 min
Plan completion rate: 60%+
Streak retention: 7+ days for 40% of users

Technical:

Load time: <2s on 3G
IndexedDB query time: <100ms
UI interaction: <50ms response
Battery impact: <5% per hour (mobile)

