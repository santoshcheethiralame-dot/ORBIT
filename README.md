# 🛰️ Orbit v2: Mission-Control for Students

**Orbit** is a high-performance, local-first study orchestration system. Built for students who operate on a "late-night" cycle, Orbit replaces traditional calendars with a dynamic, mission-based planning interface.

![Orbit Header](https://via.placeholder.com/1200x300/050505/FFFFFF?text=ORBIT_SYSTEM_STATUS_ACTIVE)

## 🌌 The "Night Owl" Logic (IST v2.1)
Most planners reset at midnight, breaking your flow during late-night study sessions. Orbit is hardcoded for **Indian Standard Time (IST)** with a **02:00 AM Rollover**.
* **Mission Continuity:** Sessions at 1:30 AM count as "Today," not "Tomorrow."
* **Automatic Archival:** At exactly 02:00 IST, the system triggers a rollover protocol to archive your previous missions and calibrate for the new cycle.

## 🚀 Core Systems

### 1. Command Center (Dashboard)
A real-time overview of your daily objectives.
* **Dynamic Planning:** Blocks are generated based on your current energy levels (Mood), workload, and exam proximity.
* **Live IST Mission Clock:** A high-precision digital clock in the header synced to Asia/Kolkata.
* **Estimated Completion (ETC):** Tells you exactly when your mission will end based on remaining study blocks.

### 2. Focus Session Protocol
A distraction-free "Flight Deck" for deep work.
* **Integrated Timer:** Pomodoro-style focus sessions.
* **Space-Notes:** A built-in scratchpad to capture thoughts without leaving the focus environment.
* **Visual Progress:** A circular telemetry bar showing your session completion.

### 3. Subject Array & Syllabus Tracker
* **Granular Control:** Track units/topics for every subject.
* **Assignment Radar:** Urgent deadlines are automatically pulled into your daily missions.
* **Progressive Data:** Real-time completion percentages for every course.

### 4. Mission Data (Analytics)
* **Activity Heatmaps:** Visual logs of your study consistency over the last 30 days.
* **Subject Distribution:** Analysis of where your time is being invested.
* **Local Persistence:** All data is stored in **IndexedDB** using Dexie.js. Your data never leaves your device.

## 🛠️ Technical Specifications

| System | Technology |
| :--- | :--- |
| **Engine** | React 18 + TypeScript |
| **Storage** | Dexie.js (IndexedDB) |
| **Styling** | Tailwind CSS (Glassmorphism UI) |
| **Icons** | Lucide React |
| **Timezone** | Asia/Kolkata (IST) |

## 🕹️ Deployment & Installation

1.  **Clone the Repository:**
    ```bash
    git clone [https://github.com/your-username/orbit-v2.git](https://github.com/your-username/orbit-v2.git)
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Launch Command Center:**
    ```bash
    npm run dev
    ```

## 📜 Mission Briefing
Orbit was designed to solve the friction of academic planning. It doesn't just track time; it manages your **mental energy**. By using a "Daily Context" model, it adapts to your life, whether you're in a high-stress exam season or a recovery period.

---
<<<<<<< HEAD
**Orbit v2.0.1** | *Designed for the scholars of the digital age.*
=======
>>>>>>> af54891 (temp)
