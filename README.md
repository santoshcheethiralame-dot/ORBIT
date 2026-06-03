<div align="center">

# 🛰️ Orbit v3.4

> **The specialized planning intelligence for high-performance students.**

Orbit is not just a todo list. It is a **focus engine** designed to maximize deep work, enforce rest, and adapt to your energy levels. It uses a triple-brain AI architecture to plan your day, predict burnouts, and guide you through complex subjects.

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![100% Local](https://img.shields.io/badge/100%25-Local--First-00C853?style=flat-square&logo=database)](/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat-square)](/)

[Try Demo](#-quick-start) • [Features](#-what-makes-orbit-different) • [How It Works](./BRAIN.md) • [Install](#-installation)

---

</div>

## 🎨 What's New in v3.4

- **Brutalist redesign**: a complete UI overhaul to a flat, high-contrast **black / orange / yellow / white** system — ultra-bold Archivo display type, solid accent cards, no glassmorphism. Replaces the old indigo "cosmic" glass theme.
- **Dashboard**: giant "Today's Mission" hero, readiness ring + solid stat cards, "The Plan" block list, a smart Coach card, Courses + This-Week chart.
- **Courses**: a "loadout" — PRIORITY hero, subject bento with monograms, fuel-gauge readiness, and exam countdowns.
- **Analytics**: single-scroll cockpit — KPI band, focus-trend chart, a consistency heat-grid, peak-window readout, and records.
- **Focus**: an orbiting-planet ring timer (with a flip-clock toggle).

## 🚀 What's New in v3.3

- **QuickCapture**: Floating note-capture button in the Dashboard header. Log a thought to any subject instantly — no focus timer needed. Accessible via `Alt+N` keyboard shortcut, saves a zero-duration log entry that surfaces in Courses → Session Notes.
- **Assignment double-count fix**: Completing a block via the schedule list no longer double-increments assignment progress (was also counted during session completion).
- **AI Insight Banner cache fix**: Session cache now correctly hits on repeated renders — API call happens once per session, not on every mount.
- **Correct readiness routing**: `subjectIntelligence.ts` and Stats now import `getAllReadinessScores` from `brain-ultimate` (the orchestrator) instead of `brain.ts` directly, so focus sessions get research-grade scores when data is sufficient.

## 🆕 What's New in v3.2

- **AI Insight Banner**: OpenRouter-powered daily coaching card that reads your readiness scores and session logs to deliver one sharp, personalized insight each session — a warning, a quick-win tip, or motivation. Session-cached so it never re-fetches during a single study session.
- **Exam Simulator Tab**: AI-generated MCQ, short-answer, and true/false exam questions inside the Study Assistant. Supports easy/medium/hard difficulty, configurable question count, and AI grading for open-ended answers.
- **Feynman Mode**: Toggle in the Study Assistant chat that rewrites any AI explanation as if teaching a curious 16-year-old — plain English, vivid analogies, concrete examples.
- **Anki Card Export**: Generate flashcard decks (CSV format) directly from AI study notes. One click imports into Anki.
- **Schedule Optimizer**: AI analyses your timetable + readiness to suggest open slots for study. Reads free grid positions and cross-references critical/maintaining subjects.
- **DB v11–v12**: `exams` and `settings` tables added. User preferences (weeklyTargetHours, subjectColors) are now durable, exportable, and survive page refreshes.

## 🆕 What's New in v3.1

- **Mechanical Flip Clock**: A hyper-realistic 3D timer for focus sessions with sub-millisecond precision and satisfying flip animations.
- **AI Study Assistant**: Full-screen modal with Chat, Exam, Notes, and Resources tabs. Cross-subject academic portrait built into the system prompt.
- **Fluid UI Core**: Global smooth scrolling, optimized transitions, enhanced light/dark mode fluidity.
- **Data Hardening**: Robust local persistence with snapshot recovery and multi-tab synchronization via BroadcastChannel.

---

## ✨ What Makes Orbit Different

<table>
<tr>
<td width="50%">

### 🧠 AI That Learns You
- **Adaptive Block Sizing**: Struggling? Get shorter, focused sessions automatically
- **Energy Matching**: Heavy tasks scheduled during your peak hours
- **Burnout Detection**: Proactive recovery suggestions before you crash
- **Quality Tracking**: Rate each session (1–5) to improve future predictions

</td>
<td width="50%">

### 🎯 Smart Prioritization
- **Decay Detection**: Auto-escalates subjects ignored 3+ days
- **Exam Proximity Engine**: Quadratic urgency scaling for ISA/ESA prep
- **Daily Context Calibration**: Energy + Deadlines = Optimal plan
- **Performance Feedback**: Block sizes adjust based on completion rates

</td>
</tr>
<tr>
<td>

### ⚡ Zero Friction Execution
- **QuickCapture**: Log any thought instantly from the Dashboard — `Alt+N`
- **One-Click Focus Mode**: Full-screen, distraction-free flip-clock timer
- **Session Reflections**: Rate quality, capture insights, generate Anki cards
- **Night-Owl Principle**: Day starts at 4 AM (configurable) — 3 AM still counts as today

</td>
<td>

### 🔒 100% Private & Offline
- **Local-First**: Data never leaves your device (IndexedDB / Dexie v12)
- **No Accounts**: No sign-ups, no tracking, no cloud dependency
- **Instant**: 0ms latency, works offline as PWA
- **Export Anytime**: Full JSON backup + iCal exam export

</td>
</tr>
</table>

---

## 🚀 Quick Start

```bash
# Clone & Run (60 seconds)
git clone https://github.com/santoshcheethirala/orbit.git
cd orbit
npm install && npm run dev

# Open http://localhost:5173
```

**First Session:**
1. Add subjects (Courses tab)
2. Set your API key in `.env`: `VITE_OPENROUTER_API_KEY=your_key_here`
3. Calibrate your day (Dashboard → Morning Protocol)
4. Start a focus session → rate quality after
5. Check the AI Insight Banner each day for personalized coaching

---

## 📲 Install & Deploy

Orbit is a **local-first PWA** — install it like a native app on phone & desktop, and it runs fully offline.

### Install the app
- **Desktop (Chrome / Edge):** open the site → click the **install icon** in the address bar (or ⋮ → *Install Orbit*). Also available at **Settings → Data → Install app**.
- **iPhone / iPad (Safari):** **Share** → **Add to Home Screen**.
- **Android (Chrome):** **⋮** → **Install app / Add to Home Screen**.

Once installed it opens in its own window, launches from your home screen/dock, and works with no connection.

### Deploy (Vercel — ~1 minute)
It's a static Vite SPA (no backend), so any static host works. Easiest is **Vercel**:

1. Push the repo to GitHub.
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the **ORBIT** repo.
3. Vercel auto-detects Vite → **Deploy**. Every `git push` then auto-deploys.

`vercel.json` is included (SPA routing + service-worker/manifest cache headers). To build anywhere else: `npm run build` → ship the `dist/` folder to Netlify, Cloudflare Pages, GitHub Pages, etc.

### Move data between devices
Everything lives **on your device** (IndexedDB) — no account, no cloud. To sync phone ↔ desktop: **Settings → Data → Export backup** on one device, then **Import backup** on the other (a full JSON of subjects, sessions, projects & settings).

---

## 🎯 Core Features

| Feature | What It Does | Why It Matters |
|---------|-------------|----------------|
| **Triple-Brain System** | 3 AI layers working together | Plans get smarter as you use Orbit |
| **AI Insight Banner** | Daily coaching card via OpenRouter | Warns decay, suggests quick wins, motivates |
| **QuickCapture** | Floating note input, `Alt+N` shortcut | Capture thoughts instantly without disrupting flow |
| **Daily Context Engine** | Calibrate mood/energy before generating plan | Plans match reality, not fantasy |
| **Adaptive Displacement** | Auto-reschedules based on changing priorities | Exams don't sneak up on you |
| **Mechanical Flip Timer** | 3D flip-clock for focus sessions | Preserves flow state, tracks quality |
| **Performance Tracking** | Quality ratings & completion analytics | AI tunes block sizes to your patterns |
| **Spaced Repetition (SM-2)** | Ebbinghaus curve review scheduling | Actually retain what you learn |
| **Flashcard System** | AI-generated Q&A, review queue, comprehension history | Deep retention tracking per topic |
| **Exam Simulator** | AI-generated MCQ/short-answer exams | Test yourself before the real thing |
| **AI Study Assistant** | OpenRouter-powered subject coaching | Cross-subject academic portrait in every session |
| **Feynman Mode** | Re-explains any concept simply | Unblock understanding instantly |
| **Anki Card Export** | Generate flashcard decks from notes | One click to Anki-ready CSV |
| **Schedule Optimizer** | AI slot recommendations from timetable | Fill gaps with the right subject at the right time |
| **Analytics Dashboard** | Focus scores, streaks, subject heatmaps | See patterns, adjust strategy |
| **Projects Tracker** | Milestones, session log, Gantt timeline | Complex deliverables with deadline intelligence |
| **Import/Export** | Full JSON backup + iCal exam export | Never lose data, sync across devices manually |

---

## 🧠 The Triple-Brain System

### How It Works

```
Your Context → data maturity check →

  < 5 days     →  Research-Grade   (Bayesian mastery, formal optimization)
  5–30 days    →  Enhanced         (performance adjustments, energy profiles)
  30+ days     →  Hybrid           (all layers, 95% confidence)

                        ↓
                  Your Daily Plan
                        ↓
              Study Sessions + Quality Ratings
                        ↓
              Performance Data feeds back in
```

### Confidence Levels
| Data Age | Strategy | Confidence |
|----------|----------|------------|
| < 5 days | Research-grade with smart defaults | 70% |
| 5–30 days | Enhanced with performance tuning | 80% |
| 30+ days | Hybrid — full optimization | 95% |

### Readiness Score Formula

Orbit calculates exam readiness using:

```
score = volume_component × decay_component × 100

volume = 1 - e^(-k × studiedHours/goalHours)       (Ebbinghaus learning curve)
decay  = e^(-λ × daysSinceLastStudy)                (exponential forgetting)

λ = 0.10 for difficult subjects (difficulty ≥ 4)
λ = 0.07 for easier subjects

Status:
  score < 35%  → critical   (auto-recovery blocks injected)
  score ≥ 70%  → mastered
  else         → maintaining
```

**Deep Dive:** [Read BRAIN.md](./BRAIN.md) for full algorithm details, heuristics, and architecture.

---

## 🛠️ Built With

```
Frontend:    React 19 + TypeScript 5.8
Database:    Dexie.js v12 (IndexedDB) — 12-table schema
Styling:     Tailwind CSS (compiled v3.4) — brutalist flat UI (black · orange · yellow · white)
             Archivo (display) + Inter (body) + JetBrains Mono (labels)
Build:       Vite
AI:          OpenRouter API (model routing via gemini.ts)
             • simple tasks  → openrouter/free
             • standard/chat → google/gemini-flash-1.5
             • vision        → google/gemini-2.0-flash-exp:free
State:       React hooks + Dexie useLiveQuery (reactive DB)
PWA:         Service Worker + Web App Manifest
```

---

## 📁 Project Structure

```
src/
├── brain.ts                    Core readiness + planning engine
├── brain-enhanced-integration.ts  Performance tracking, burnout, energy
├── brain-research-grade.ts     Bayesian mastery model, formal optimization
├── brain-ultimate.ts           Orchestrator — single import for all AI planning
├── gemini.ts                   OpenRouter API wrapper (model routing, retry, streaming)
├── db.ts                       Dexie database schema (v12) + snapshot helpers
├── types.ts                    All TypeScript interfaces
│
├── Dashboard.tsx               Mission control — today's plan, stats, QuickCapture
├── QuickCapture.tsx            Floating note-capture widget (Alt+N)
├── AIInsightBanner.tsx         Daily coaching card (OpenRouter, session-cached)
├── AIStudyAssistant.tsx        Study assistant modal (Chat/Exam/Notes/Resources)
├── ExamSimulator.tsx           AI-generated exam questions + grading
├── DashboardInsights.tsx       Weekly performance insights (static + AI)
├── ScheduleOptimizer.tsx       AI slot suggestions from timetable
├── FocusSession.tsx            Full-screen flip-clock timer
├── QualityRatingModal.tsx      Post-session quality rating + AI coaching tip
│
├── Courses.tsx                 Subject management (syllabus, grades, resources)
├── ProjectsView.tsx            Project tracker (milestones, Gantt, session log)
├── SpacedRepetition.tsx        Flashcard review queue + AddFlashcardForm
├── TopicReadinessView.tsx      SM-2 topic enrichment utility
├── Stats.tsx                   Analytics dashboard (heatmap, time-of-day, burnout)
│
├── Onboarding.tsx              Multi-step setup wizard
├── DailyContextModal.tsx       Morning Protocol (mood, exams, day type)
├── ScheduleView.tsx            Weekly timetable CRUD
├── SettingsView.tsx            All settings + bug report + stress test
├── SettingsContext.tsx         Global settings state (theme, audio, study prefs)
│
├── components.tsx              Shared UI: FrostedTile, FrostedMini, PageHeader, etc.
├── SpaceBackground.tsx         Animated star field + hanging alien mascot
├── Toast.tsx                   Toast notification system
│
└── utils/
    ├── time.ts                 IST date helpers (getISTEffectiveDate)
    ├── sounds.ts               SoundManager (Web Audio API)
    ├── notifications.ts        NotificationManager (Web Notifications API)
    ├── subjectIntelligence.ts  Per-subject context for AI coaching
    └── dbErrorHandler.ts       Safe DB operation wrappers
```

---

## 🗺️ Roadmap

**v3.3 (Current)**
- [x] QuickCapture — instant note logging from Dashboard (`Alt+N`)
- [x] Assignment double-count bug fix
- [x] AI Insight Banner cache shape fix
- [x] `brain-ultimate` import routing for Stats + subjectIntelligence

**v3.2 (Released)**
- [x] AI Insight Banner (OpenRouter daily coaching)
- [x] Exam Simulator (MCQ + short-answer + true/false + AI grading)
- [x] Feynman Mode in Study Assistant
- [x] Anki Card Export (CSV)
- [x] Schedule Optimizer AI slot recommendations
- [x] DB v11–v12: `exams` + `settings` tables
- [x] User preferences persistence (weeklyTargetHours, subjectColors)

**v3.1 (Released)**
- [x] Triple-brain AI system (core + enhanced + research-grade)
- [x] Performance-based adaptive planning
- [x] Quality rating & feedback loop
- [x] Import/export backup system
- [x] Confidence scoring on generated plans
- [x] Mechanical flip clock timer
- [x] AI Study Assistant (4 tabs: Chat, Exam, Notes, Resources)

**v4.0 (Planned)**
- [ ] Mobile PWA (Q2 2026) — optimized touch UI
- [ ] Encrypted cloud sync (Q3 2026) — optional, E2E
- [ ] Natural language plan input ("I'm tired, 2 hours of easy stuff")
- [ ] Study group collaboration mode
- [ ] ML-based duration prediction (replace heuristics)

---

## 🔒 Privacy

```
✅ No accounts, no sign-ups
✅ Data never leaves your device
✅ Zero telemetry without consent
✅ No third-party scripts (except Google Fonts)
✅ 100% open source & auditable
✅ Full export anytime (JSON + iCal)
```

Your study patterns are yours. Period.

---

## 🤝 Contributing

PRs welcome. Priority areas:

- Mobile responsiveness improvements
- Accessibility (WCAG 2.1 compliance)
- i18n (internationalization)
- Additional brain algorithm improvements
- Bug fixes and test coverage

```bash
# Standard flow
1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR with a clear description
```

---

## 📄 License

MIT © 2026 [Santosh Cheethirala](https://github.com/santoshcheethirala)

---

## 💬 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/santoshcheethirala/orbit/issues) or Settings → Bug Report
- 💡 **Feature Requests**: [GitHub Discussions](https://github.com/santoshcheethirala/orbit/discussions)
- 📧 **Contact**: [GitHub Profile](https://github.com/santoshcheethirala)

---

<div align="center">

### **Built for students who don't fit the mold.**

**Stop planning. Start executing.**

⭐ **Star this repo if Orbit helps you ace your exams**

[⬆ Back to Top](#-orbit-v33)

</div>