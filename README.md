<div align="center">

# 🛰️ Orbit 4.0

> **The specialized planning intelligence for high-performance students.**

Orbit isn't a todo list. It's a **focus engine** that plans your day around your energy, deadlines and exam readiness, runs distraction-free deep-work sessions, and coaches you through hard subjects — all local-first, with an optional AI layer that runs on **free models**.

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Local First](https://img.shields.io/badge/100%25-Local--First-FF5A1F?style=flat-square&logo=database)](/)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-FFD60A?style=flat-square)](/)

[Quick Start](#-quick-start) • [Features](#-what-makes-orbit-different) • [How It Works](#-the-planning-brain) • [Install](#-install--deploy)

---

</div>

## 🎨 What's New in 4.0

- **Brutalist redesign** — a complete UI overhaul to a flat, high-contrast **black / orange / yellow / white** system: ultra-bold Archivo display type, solid accent cards, no glassmorphism. Every screen rebuilt, mobile and desktop.
- **100% free AI** — bring your own **free** OpenRouter key (Settings → AI Coach) and the whole assistant runs on free models — chat, deep notes, cheat-sheets, exam generation, grading and flashcards. No credits, no `.env`, no key ever bundled.
- **Smarter planning** — one unified planning brain: quality- and topic-aware readiness, a learned productivity curve that schedules hard work into your best hours, deadline back-scheduling with infeasibility warnings, must-do vs. stretch triage, a "why this plan" explanation, and a 7-day week-ahead forecast.
- **Coach upgrades** — Coach / Feynman / Quiz modes, one-tap message → flashcards or → subject notes, and a cheat-sheet generator that turns any chat or resource into a dense exam reference.
- **In-app resource viewer** — open PDFs, links and Office/`.docx` files inside Orbit; exam results can push your weak topics straight into the review plan.
- **Installable PWA** — works fully offline, installs like a native app on phone and desktop.

---

## ⚡ Latest — Retention, Accountability & Sync

- **FSRS-6 spaced repetition** — the hand-rolled SM-2 scheduler is replaced by **FSRS-6** (the algorithm Anki adopted). Reviews are scheduled from your *personal* forgetting curve — stability × difficulty × retrievability at a 90 % retention target — with a real **Again / Hard / Good / Easy** rating and proper lapse handling. Existing cards migrate without losing their schedule.
- **Confidence calibration** — before each card you predict *"will I recall it?"*; Orbit tracks predicted vs. actual and reports a **Brier score**, an over/under-confidence index, and a reliability diagram. A daily metacognition instrument, not just a review log.
- **Interleaving enforcement** — the planner now actively breaks up any run of 3+ same-subject blocks (the spacing effect), instead of only flagging it.
- **The daily loop** — a **"Now"** card surfaces your single next block; overrunning a block offers a one-tap **reflow** of the rest of the day; a focus-session **parking lot** captures intrusive thoughts without breaking flow; block durations self-size to your **measured** pace after a week of history.
- **Hardcore reminders (opt-in)** — server-sent Web Push that reaches your installed phone **even when Orbit is closed**. Escalating, quiet-hours-aware, and stakes-injected (your exam countdowns, deadlines, streak), with a Gentle / Firm / Drill dial. *(Requires the Supabase backend — see [`docs/HARDCORE-REMINDERS.md`](docs/HARDCORE-REMINDERS.md).)*
- **Optional cloud sync + one-tap sign-in** — back up and sync across devices with **GitHub** or an email magic link. Entirely optional; Orbit still runs 100 % offline with no account.

---

## ✨ What Makes Orbit Different

<table>
<tr>
<td width="50%">

### 🧠 Planning That Learns You
- **Adaptive block sizing** — struggling? sessions get shorter and more focused automatically
- **Energy matching** — heavy tasks land in your measured peak hours
- **Burnout detection** — proactive recovery before you crash
- **Quality tracking** — rate each session (1–5) to sharpen future plans

</td>
<td width="50%">

### 🎯 Smart Prioritization
- **Decay detection** — auto-escalates subjects ignored 3+ days
- **Exam-proximity engine** — quadratic urgency scaling toward exam dates
- **Deadline back-scheduling** — warns when a workload is infeasible
- **Week-ahead forecast** — see heavy days before they arrive

</td>
</tr>
<tr>
<td>

### ⚡ Zero-Friction Execution
- **QuickCapture** — log any thought instantly from the Dashboard (`Alt+N`)
- **One-tap focus** — full-screen orbit-ring (or flip-clock) timer with a living background
- **Session reflections** — rate quality, capture insight, generate flashcards
- **Night-owl day** — the day starts at 4 AM (configurable), so 3 AM still counts as today

</td>
<td>

### 🔒 Private & Offline
- **Local-first** — data lives on your device (IndexedDB / Dexie)
- **Accounts optional** — no tracking; sign in only if you want cross-device sync or reminders
- **Instant** — 0 ms latency, works offline as a PWA
- **Export anytime** — full JSON backup + iCal exam export, or cloud sync

</td>
</tr>
</table>

---

## 🚀 Quick Start

```bash
git clone https://github.com/santoshcheethirala/orbit.git
cd orbit
npm install && npm run dev
# open http://localhost:5173
```

**First run:**
1. Complete the onboarding (add your subjects + optional class times).
2. *(Optional, for AI features)* paste a **free** OpenRouter key in **Settings → AI Coach** — get one at [openrouter.ai/keys](https://openrouter.ai/keys). It's stored only on your device, never bundled or uploaded.
3. Calibrate your day (Dashboard → Morning Protocol) to generate a plan.
4. Start a focus session → rate the quality when you finish.

> Orbit works fully without a key — the planner, timer, courses, stats and spaced repetition are all local. The key only powers the AI coach, notes, cheat-sheets and exam generator.

---

## 📲 Install & Deploy

Orbit is a **local-first PWA** — install it like a native app on phone & desktop, and it runs fully offline.

### Install the app
- **Desktop (Chrome / Edge):** open the site → click the **install icon** in the address bar (or ⋮ → *Install Orbit*). Also at **Settings → Data → Install app**.
- **iPhone / iPad (Safari):** **Share** → **Add to Home Screen**.
- **Android (Chrome):** **⋮** → **Install app / Add to Home Screen**.

### Deploy (Vercel — ~1 minute)
It's a static Vite SPA (no backend), so any static host works:

1. Push the repo to GitHub.
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Vercel auto-detects Vite → **Deploy**. Every `git push` then auto-deploys.

`vercel.json` is included (SPA routing + service-worker/manifest cache headers). To build anywhere else: `npm run build` → ship the `dist/` folder to Netlify, Cloudflare Pages, GitHub Pages, etc.

### Move data between devices
Two ways: **manual** or **cloud**.
- **Manual (no account):** **Settings → Data → Export backup** on one device, then **Import backup** on the other (a full JSON of subjects, sessions, projects & settings).
- **Cloud sync (optional):** **Settings → Account → sign in** with GitHub or an email link. Orbit then backs up a snapshot to your own Supabase row and keeps devices in sync automatically — readable only by you (row-level security). Enabling **hardcore reminders** also requires sign-in.

---

## 🎯 Core Features

| Feature | What It Does | Why It Matters |
|---------|-------------|----------------|
| **Unified planning brain** | One engine: readiness, productivity curve, deadlines, triage | Plans get sharper the more you use Orbit |
| **Week-ahead forecast** | Projects load across the next 7 days | Heavy days never sneak up on you |
| **Daily context engine** | Calibrate mood / energy before generating a plan | Plans match reality, not fantasy |
| **Focus timer** | Orbit-ring or flip-clock, living background, soundscapes | Preserves flow, tracks quality |
| **AI coach (free)** | Coach / Feynman / Quiz chat on free models | Subject coaching with your real data in context |
| **Cheat-sheet generator** | Turn any chat or resource into a dense exam sheet | Walk into exams with one-screen references |
| **Exam simulator** | AI-generated MCQ / short / true-false + grading | Test yourself, then push weak topics into your plan |
| **Spaced repetition (FSRS-6)** | Personal forgetting-curve scheduling + flashcards, Again/Hard/Good/Easy | Actually retain what you learn |
| **Confidence calibration** | Predict recall before each card; Brier score + reliability diagram | Learn how well you *know what you know* |
| **Hardcore reminders** | Opt-in server push that chases a skipped day, escalating & stakes-aware | Accountability that reaches your closed phone |
| **Cloud sync + sign-in** | Optional GitHub / email login, back up & sync across devices | Your data on every device — or none |
| **In-app resources** | Open PDFs, links & `.docx` inside Orbit | Study material never leaves the app |
| **Parking lot** | Dump an intrusive thought mid-session without leaving focus | Protect flow, deal with it later |
| **Analytics** | Focus trend, consistency heat-grid, peak window | See patterns, adjust strategy |
| **Projects tracker** | Milestones, session log, timeline | Complex deliverables with deadline intelligence |
| **Import / export** | Full JSON backup + iCal exam export | Never lose data; sync devices manually or via cloud |

---

## 🧠 The Planning Brain

Orbit's planner is a single engine (`brain.ts`) with an analytics layer (`brain-analytics.ts`), exposed through one orchestrator (`brain-ultimate.ts`). It scores each subject's exam readiness, then builds a day that targets what moves the needle most.

### Readiness score

```
score = volume_component × decay_component × 100

volume = 1 − e^(−k × studiedHours / goalHours)     (Ebbinghaus learning curve)
decay  = e^(−λ × daysSinceLastStudy)               (exponential forgetting)

λ = 0.10 for difficult subjects (difficulty ≥ 4)
λ = 0.07 for easier subjects

score < 35%  → critical    (recovery blocks injected)
score ≥ 70%  → mastered
else         → maintaining
```

Readiness is then nudged by your **recent session quality** and **topic-level retrievability** from the **FSRS-6** spaced-repetition data, so the number reflects how you're actually doing — not just hours logged.

### Retention & pacing

- **FSRS-6 scheduling** (`utils/fsrs.ts`) — memory is modelled as stability × difficulty × retrievability at a 90 % retention target; each review advances the card and sets the next due date from your real history. Legacy SM-2 cards are seeded, not reset.
- **Confidence calibration** — the predicted-vs-actual recall data (stored on each review) yields a Brier score, over/under-confidence, and a per-tier reliability diagram.
- **Velocity calibration** — after ~a week of history, block durations are sized to your **measured** pace per subject instead of heuristics.
- **Interleaving** — a reorder pass guarantees no 3 consecutive same-subject blocks before a plan is finalised.

### Smart planning (Settings → Study → Smart planner)

- **Productivity curve** — learns your best hours from completion + quality history and schedules harder work there.
- **Deadline back-scheduling** — spreads assignment effort across the days remaining, and warns when the workload can't fit.
- **Must-do vs. stretch** — guarantees the critical blocks, then fills the slack with the highest-value extras.
- **Week-ahead forecast** — a read-only 7-day projection of load (assignments + reviews + exams) vs. capacity.

---

## 🛠️ Built With

```
Frontend:   React 19 + TypeScript 5.8
Database:   Dexie.js (IndexedDB) — local-first, reactive via useLiveQuery
Styling:    Tailwind CSS (compiled) — brutalist flat UI (black · orange · yellow · white)
            Archivo (display) + Inter (body) + JetBrains Mono (labels)
Build:      Vite 6  ·  vite-plugin-pwa injectManifest (custom SW, offline + Web Push)
Reviews:    ts-fsrs (FSRS-6) — personal forgetting-curve scheduling + calibration
Cloud:      Supabase (optional) — auth, snapshot sync, reminder-cron Edge Function
AI:         OpenRouter (free models, model routing in gemini.ts)
            • chat / notes / cheat-sheets → moonshotai/kimi-k2.6:free
            • short JSON / insights        → google/gemma-4-26b-a4b-it:free
            • vision                       → google/gemma-4-31b-it:free
            Bring-your-own key, stored in localStorage — never bundled.
```

---

## 📁 Project Structure

```
brain.ts              Core readiness + planning engine (FSRS-backed reviews, scheduling, forecast)
brain-analytics.ts    Productivity curve, skip-risk, interleaving, performance history
brain-ultimate.ts     Orchestrator — single import for all planning
gemini.ts             OpenRouter wrapper (free-model routing, retry, streaming, tuning)
db.ts                 Dexie schema + snapshot helpers (v13: FSRS card state)
types.ts              Shared TypeScript interfaces

index.tsx             App shell + navigation
CloudSync.tsx         Sign-in (GitHub / email), consent banner, conflict resolver
HardcoreReminders.tsx Opt-in push reminder settings (Gentle / Firm / Drill)
sw.ts                 Custom service worker — offline precache + Web Push handlers
Dashboard.tsx         Mission control — today's plan, stats, week-ahead, QuickCapture
FocusSession.tsx      Full-screen orbit/flip timer with living background + soundscapes
Courses.tsx           Subjects — syllabus, grades, resources, in-app viewer
AIStudyAssistant.tsx  Coach modal — Chat / Exam / Notes (cheat-sheets, flashcards)
ExamSimulator.tsx     AI exam generation + grading + weak-areas → plan
SpacedRepetition.tsx  Flashcard review queue + comprehension history
Stats.tsx             Analytics cockpit (trend, heat-grid, peak window)
ProjectsView.tsx      Project tracker (milestones, timeline, session log)
ScheduleView.tsx      Weekly timetable
Onboarding.tsx        First-run setup
DailyContextModal.tsx Morning Protocol (mood, exams, day type)
SettingsView.tsx      Settings, backup/restore, AI key, bug report
components.tsx        Shared UI primitives

utils/                fsrs (FSRS-6 + calibration), reminders (push + daily status),
                      cloudSync / cloudSnapshot (Supabase sync), supabaseClient,
                      time, sounds, soundscapes, notifications, settings, db helpers
supabase/             reminder-cron Edge Function, SQL schema + cron (push backend)
```

---

## 🗺️ Roadmap

**Shipped in 4.0**
- [x] Full brutalist redesign (mobile + desktop)
- [x] 100% free AI (bring-your-own free key, free-model routing)
- [x] Unified planning brain + smart planner (productivity curve, deadlines, week forecast)
- [x] Cheat-sheet generator + flashcards from chat/resources
- [x] In-app resource viewer (PDF / link / `.docx`)
- [x] Installable offline PWA
- [x] **FSRS-6 spaced repetition + confidence calibration**
- [x] **Interleaving enforcement + velocity-calibrated block sizing**
- [x] **The daily loop** — Now surface, reality reflow, focus parking lot
- [x] **Hardcore server-push reminders** (opt-in, Gentle / Firm / Drill)
- [x] **Optional cloud sync + GitHub / email sign-in**

**Exploring next**
- [ ] Natural-language plan input ("I'm tired — 2 hours of easy stuff")
- [ ] FSRS parameter optimization on your own review history
- [ ] Calibration trend over time (metacognition longitudinally)
- [ ] Study-group collaboration mode

---

## 🔒 Privacy

```
✅ Local-first — data lives on your device by default
✅ Accounts optional — sign in only for cross-device sync or reminders
✅ No telemetry
✅ No third-party scripts (except Google Fonts)
✅ Bring-your-own AI key, stored only on your device
✅ Cloud sync is your own Supabase row, readable only by you (RLS)
✅ Full export anytime (JSON + iCal)
```

Your study patterns are yours. Period.

---

## 📄 License

MIT © 2026 Santosh Cheethirala

---

<div align="center">

### **Built for students who don't fit the mold.**

**Stop planning. Start executing.**

[⬆ Back to Top](#-orbit-40)

</div>
