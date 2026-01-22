# 🛰️ Orbit v2 — Mission Control for Students

**Orbit** is a local-first, context-aware study planner built for students who don’t live by rigid calendars.  
Instead of static schedules, Orbit generates **daily missions** based on your energy, workload, and academic reality.

This is not a to-do app.  
This is an execution system.

---

## 🌌 The Night-Owl Principle (IST v2)

Most planners reset at midnight — Orbit does not.

Orbit is hard-coded for **Indian Standard Time (IST)** with a **02:00 AM effective-day rollover**, designed for students who study late into the night.

**What this means:**
- Studying at **1:30 AM** still counts as *today*
- Your focus streak is never broken by artificial midnight boundaries
- A new study cycle begins **only after 02:00 AM IST**

This single rule eliminates one of the biggest sources of planner friction.

---

## 🧠 Core Philosophy

Orbit optimizes for:
- **Cognitive energy**, not just available time
- **Short, achievable study blocks**, not unrealistic schedules
- **Daily execution**, not long-term calendar micromanagement

Every day starts with *context*, not assumptions.

---

## 🚀 Core Systems

### 1. Daily Context Engine
Each day begins with a short calibration instead of a rigid plan.

You tell Orbit:
- Your **energy level** (low / normal / high)
- The **day type** (normal / ISA / ESA)
- Special conditions (holiday, sick, bunked)
- Assignments or upcoming exams

Orbit uses this to generate a plan that fits *today*, not an idealized version of it.

---

### 2. Mission Planner (Plan Generator)
Orbit converts your context into **variable study blocks** by accounting for:
- Mood × workload × exam proximity
- ISA vs ESA prep strategies
- Assignment prioritization
- Mandatory daily project time
- Unfinished blocks from previous days

Plans are regenerated **daily**, not frozen weeks in advance.

---

### 3. Command Center (Dashboard)
Your operational view for the day.

Features:
- “Next Mission” focus card
- Click-to-focus block selection
- Daily completion progress
- Estimated completion time
- Study streak tracking
- Backlog migration for unfinished blocks
- Context-aware greeting and indicators

This is where decisions turn into action.

---

### 4. Focus Session Protocol
A distraction-free execution environment.

Includes:
- Large central countdown timer
- Pause / resume
- 5-minute break mode
- Finish-early confirmation
- Session notes
- Automatic logging on completion
- Seamless return to dashboard

Once a session starts, Orbit stays out of your way.

---

### 5. Subject Array (Courses Hub)
The authoritative academic database.

Per subject, Orbit tracks:
- Credits, difficulty, and timetable placement
- Study time and session history
- Syllabus progress
- Grades (ISA / ESA / internals)
- Resources (PDFs, files, links)
- Session notes archive

This is **not duplicated** anywhere else in the app.

---

### 6. Mission Analytics (Stats)
Local, private, and visual.

Includes:
- Total focus hours
- Session counts
- Subject-wise time distribution
- 30-day activity heatmap
- Notes export

All data stays **on your device**.

---

## 🔒 Local-First by Design

Orbit does **not** use:
- Accounts
- Cloud sync
- Telemetry
- External databases

All data is stored locally using **IndexedDB (Dexie.js)**.  
You own your study data — permanently.

---

## 🛠️ Technical Stack

| Layer | Technology |
|-----|-----------|
| Frontend | React + TypeScript |
| Storage | Dexie.js (IndexedDB) |
| Styling | Tailwind CSS (Glassmorphism UI) |
| Icons | Lucide React |
| Time Logic | Asia/Kolkata (IST, 02:00 rollover) |

---

## 🧪 Current Status

**Orbit v2 is functional and stable**, with core flows complete:
- Onboarding
- Daily context → plan generation
- Focus sessions
- Backlog handling
- Courses & analytics

Ongoing work focuses on:
- Improving plan-generation intelligence
- Deeper analytics views
- Assignment lifecycle refinement
- Settings and export tools

---

## 🧭 What Orbit Is (and Isn’t)

**Orbit is:**
- A daily execution system
- Energy-aware
- Designed for real student behavior

**Orbit is not:**
- A calendar replacement
- A generic to-do list
- A productivity “gamification” app

---

## 🧑‍🚀 Philosophy

> *“The best plan is the one you actually follow.”*

Orbit exists to reduce friction, preserve momentum, and help you study **consistently**, even on imperfect days.

---

**Orbit v2**  
*Local-first. Context-aware. Built for students who study after midnight.*
