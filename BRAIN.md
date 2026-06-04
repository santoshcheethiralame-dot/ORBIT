# 🧠 The BRAIN (v4 — unified)

> **Technical Architecture & Cognitive Model of Orbit**

This document details how Orbit "thinks." It explains the algorithms, data structures, and decision-making heuristics used to generate schedules, predict burnouts, manage energy, and deliver personalized AI coaching.

---

## 🏗️ System Architecture

Orbit runs on **one engine** behind a single public barrel. The UI imports only from `brain-ultimate.ts`; the barrel delegates to the engine (`brain.ts`) and the analytics module (`brain-analytics.ts`).

**Modules**
- **`brain.ts` — engine:** one readiness model (`calculateReadiness` = volume × Ebbinghaus decay), daily-plan generation (displacement, circadian ordering, SM-2 spaced repetition), load analysis, assignment progress.
- **`brain-analytics.ts`:** block-outcome recording, per-subject performance, burnout detection, interleaving, energy budget, quality + dashboard helpers.
- **`brain-ultimate.ts` — public barrel:** `generateEnhancedPlan` (core plan + one persisted-performance duration pass) and `getAllReadinessScores` (always returns `SubjectReadiness`), plus re-exports of the engine/analytics public API.

### Unification (2026-06-04, v4)
- **Deleted `brain-research-grade.ts`** — single consumer, non-persistent (in-memory state reset every reload), cargo-culted (greedy labelled "ILP", a non-Bayesian "BKT", fabricated confidence intervals); its planner was already off the happy path.
- **One readiness model.** Removed the `getUnifiedReadiness` 14-day switch that changed both the score *and* the returned object shape — Stats/Dashboard/Courses now agree.
- **One planner path:** `index.tsx → generateEnhancedPlan → core generateDailyPlan → one duration pass`. Deleted the duplicate `generateEnhancedPlan` and the research planner.
- **Renamed** `brain-enhanced-integration.ts → brain-analytics.ts`; pruned dead exports (`runBrain`, `simulateWeek`, `runWhatIfScenario`, `applyInterleaving`, `getStudyStreak`, `getQualityDistribution`, …). ~1,700 LOC removed across the brain.
- The **"single import rule" is now real**: consumers import only from `brain-ultimate.ts`.

> ⚠️ **Historical note:** the sections below that reference a three-layer "Triple-Brain", strategy routing (`research`/`enhanced`/`hybrid`), or "Layer 3 — Research Grade" describe the **pre-v4** design and are kept for history only. The engine is unified as described above.


---

## Table of Contents

1. [Architecture Philosophy](#architecture-philosophy)
2. [Triple-Brain Strategy Selection](#triple-brain-strategy-selection)
3. [Layer 1 — Core Brain](#layer-1--core-brain-brainsts)
4. [Layer 2 — Enhanced Integration](#layer-2--enhanced-integration)
5. [Layer 3 — Research Grade](#layer-3--research-grade)
6. [AI Coaching Layer](#ai-coaching-layer)
7. [QuickCapture](#quickcapture)
8. [Data Flow & Processing Pipeline](#data-flow--processing-pipeline)
9. [Readiness Engine](#readiness-engine)
10. [Spaced Repetition (SM-2)](#spaced-repetition-sm-2)
11. [Displacement Engine](#displacement-engine)
12. [Burnout Detection](#burnout-detection)
13. [Database Schema (v12)](#database-schema-v12)
14. [gemini.ts — AI Gateway](#geminits--ai-gateway)
15. [Performance Benchmarks](#performance-benchmarks)
16. [API Reference](#api-reference)

---

## Architecture Philosophy

### Local-First, Deterministic Execution

The Orbit Brain is a **pure function** of your inputs. Given the same:

- Subject database state
- Historical performance data
- Daily context inputs (energy, mood, conditions)

...it will **always** produce the same plan. This enables reproducible debugging, predictable testing, and zero server dependency.

### Single Import Rule

All consumers import from `brain-ultimate.ts` only:

```typescript
// ✅ Correct — routes to best available strategy
import { getAllReadinessScores, generateUltimatePlan } from './brain-ultimate';

// ❌ Wrong — bypasses strategy selection, gets core-only scores
import { getAllReadinessScores } from './brain';
```

`brain-ultimate.ts` is the orchestrator. It knows which brain layer to activate based on data maturity and handles all fallback logic.

---

## Triple-Brain Strategy Selection

```typescript
function selectStrategy(uniqueStudyDays: number) {
  if (uniqueStudyDays < 5) {
    return {
      strategy: 'research',
      confidence: 0.70,
      reason: 'New user — research-grade with smart defaults'
    };
  } else if (uniqueStudyDays < 30) {
    return {
      strategy: 'enhanced',
      confidence: 0.80,
      reason: 'Active user — core + performance adjustments'
    };
  } else {
    return {
      strategy: 'hybrid',
      confidence: 0.95,
      reason: 'Power user — full research optimization + feedback loop'
    };
  }
}
```

The orchestrator counts unique calendar days that have any `StudyLog` entry. This is more reliable than total session count because it captures daily consistency, not binge-studying.

---

## Layer 1 — Core Brain (`brain.ts`)

The foundation layer. Always runs as the base.

### Readiness Score

```
score = round(volume × decay × 100)

volume = min(totalStudiedHours / goalHours, 1.0)
       using a capped exponential: 1 - e^(-k × hourRatio)
       where k = 0.30, hourRatio = min(studiedHours/goalHours, 3)

goalHours = credits × 10  (10 hours per credit benchmark)

decay = e^(-daysSince / retentionScale) × difficultyMultiplier
retentionScale = clamp(totalStudiedHours × 2, 1, 20)
difficultyMultiplier = 0.85 if difficulty ≥ 4, else 1.0

lastStudiedDays = 999 → decay = 0 (never studied)
```

**Status thresholds:**
- `score < 35` → `critical` — injects emergency recovery blocks
- `score ≥ 70` → `mastered`
- else → `maintaining`

### Plan Generation Priority Order

```
Priority  Type
────────────────────────────────────────────
0         ESA exam-day focus blocks
0.5       Pre-class prep
1         ASSIGNMENT_URGENT (due ≤ 1 day)
2         ASSIGNMENT (due ≤ 14 days, on schedule)
2.5       ASSIGNMENT_BACKLOG (from previous days)
3         CRITICAL_REVIEW (readiness critical)
4         PROJECT_DECAY (abandoned 7+ days)
5         PROJECT (active)
5.5       RECOVERY (burnout flags)
6         REVIEW (regular cadence)
90        FALLBACK (readiness-ranked fill)
```

Lower number = higher priority. The displacement engine uses this ordering to decide what gets dropped when the day is full.

### Circadian Ordering

After plan generation, blocks are reordered by time-of-day preference:

```
Hour < 12 (Morning):    Analytical → Memory → Creative
Hour 13–18 (Afternoon): Creative → Analytical → Memory
Hour ≥ 18 (Evening):    Memory → Creative → Analytical
```

Subject type classification is heuristic (name-based keyword matching).

### Break Injection

Breaks are inserted automatically when:
- Continuous study minutes ≥ 90, OR
- 2+ consecutive high-difficulty blocks (difficulty ≥ 3)

Breaks are never injected after the final block.

### Dropped Block Recovery

Blocks snoozed via "Move to tomorrow" are stored in `DailyPlan.droppedBlocks[]`. On the next plan generation, they are recovered with a slight priority boost and injected back into the schedule. The source plan's `droppedBlocks` array is cleared after recovery to prevent ghost re-injection.

---

## Layer 2 — Enhanced Integration

**File:** `brain-enhanced-integration.ts`

Activates after 5+ days of data.

### BlockOutcome Tracking

Every completed session can record a `BlockOutcome`:

```typescript
interface BlockOutcome {
  blockId: string;
  subjectId: number;
  type: StudyBlock['type'];
  plannedDuration: number;
  actualDuration: number;        // what actually happened
  completionQuality: 1 | 2 | 3 | 4 | 5;
  timeOfDay: number;             // hour (0-23)
  mood: string;
  completed: boolean;
  skipped: boolean;
  date: string;                  // YYYY-MM-DD
  timestamp: number;
}
```

### Adaptive Duration Adjustment

Based on rolling 30-day `BlockOutcome` history:

```
avgQuality ≥ 4.5 AND skipRate < 0.2  →  duration × 1.15  (push harder)
avgQuality ≤ 2.5 OR  skipRate > 0.3  →  duration × 0.80  (reduce friction)
else                                  →  no change
```

Requires ≥ 3 sessions before adjustments apply.

### Burnout Detection

```typescript
interface BurnoutMetrics {
  skipRate: number;           // % sessions skipped in last 7 days
  avgCompletionRate: number;  // % sessions finished
  lowMoodStreak: number;      // consecutive days rating ≤ 2
  score: number;              // 0-100
  atRisk: boolean;            // score ≥ 50
}
```

Red flags (score contributions):
- `skipRate > 0.3` → +50 points
- `lowQualityRate > 0.5` → +30 points
- `maxConsecutiveSkipDays ≥ 1` → +10 × days

### Energy Profile

Users can set per-period energy levels (default: morning 100, afternoon 80, evening 60, night 40). The energy budget validator checks whether a block set is feasible given declared energy levels. Stored in `localStorage` as `orbit-energy-profile`.

### Interleaving Analysis

```typescript
interface InterleavingAnalysis {
  varietyScore: number;              // 0-100
  consecutiveSameSubject: number;    // max consecutive same-subject blocks
  consecutiveSameType: number;       // max consecutive same-type blocks
  needsInterleaving: boolean;        // true if consecutiveSameSubject ≥ 3
  suggestions: string[];
}
```

---

## Layer 3 — Research Grade

**File:** `brain-research-grade.ts`

Active for new users (< 5 days) and as part of the hybrid strategy for power users.

### Probabilistic Readiness (BKT-inspired)

Extends the core readiness formula with a Bayesian knowledge component:

```
score = 0.7 × classicalScore + 0.3 × bayesianScore

bayesianScore = masteryProbability × 100

masteryProbability is tracked per subject using a simplified BKT model:
  posterior = prior + (1 - prior) × learningProbability × qualityEvidence × durationFactor

  where learningProbability = 0.15 (configurable via RESEARCH_CONFIG)
  qualityEvidence = (sessionQuality - 1) / 4
  durationFactor  = min(duration / 60, 1.0)

Decay applied daily:
  decayed = current × e^(-λ × daysSinceLastStudy)
  λ = DECAY_LAMBDA_HARD (0.10) if difficulty ≥ 4
    = DECAY_LAMBDA_EASY (0.07) otherwise
```

### Learned Gain Predictor

A parametric model that estimates the readiness gain from a prospective study block:

```
expectedGain = (
    GAIN_READINESS_WEIGHT × readinessGap        +  (0.50)
    GAIN_PRIORITY_WEIGHT  × urgencyFactor × 100 +  (0.30)
    GAIN_RECENCY_WEIGHT   × recencyFactor  × 50    (0.20)
  ) × (duration / OPTIMAL_BLOCK_DURATION)
    × difficultyModifier
    × energyModifier
    × interleavingBonus
    × qualityFactor

interleavingBonus = 1.1 if block is a different subject from previous
```

### Formal Optimization (Greedy ILP)

Candidate blocks are scored and ranked by `score = utility × confidence × (1 - uncertaintyPenalty)`. A greedy solver then selects the highest-scoring blocks subject to time, energy, and block-count constraints.

The optimizer logs every decision to an in-memory `DecisionLog[]` for offline analysis and online learning. Gain prediction errors are tracked; the model learns from outcome observations via `recordBlockOutcome`.

> ⚠️ **Note:** The research-grade mastery tracker is in-memory only. It resets on page refresh. Persistence to localStorage is planned for v4.0.

---

## AI Coaching Layer

### AI Insight Banner (`AIInsightBanner.tsx`)

A daily coaching card powered by OpenRouter. Runs after plan render, reads real readiness scores, generates a single high-signal sentence.

```
db.subjects + db.logs
        │
        ▼
getAllReadinessScores()          ← from brain-ultimate (routes to research-grade)
        │
        ▼
generateInsight()  →  OpenRouter prompt (max 200 tokens, 'simple' model tier)
        │
        ▼
RichInsight { type, headline, detail, action, subject, urgencyScore }
        │
        ▼
Typewriter reveal  →  sessionStorage cache

Cache key:  'orbit-ai-insight-v2'
Cache shape: { date: 'YYYY-MM-DD', insight: RichInsight }
Cache hit:   parsed.date === getISTEffectiveDate() && parsed.insight exists
```

**Insight classification:**

| Type | Trigger | UI Color |
|------|---------|----------|
| `warning` | Any subject < 35% OR week < 90min total | Amber |
| `tip` | Readiness 35–60% OR imbalanced study | Violet |
| `motivation` | All subjects > 60% AND today > 45min studied | Emerald |

### AI Study Assistant (`AIStudyAssistant.tsx`)

Four-tab modal opened during or before a focus session:

- **Chat**: Streaming conversation with a personalized Orbit AI coach. System prompt includes: subject readiness, grades, syllabus progress, topic mastery, recent sessions, assignments, cross-subject academic portrait, weekly streak, today's total study time.
- **Exam**: `ExamSimulator.tsx` — AI-generated MCQ / short-answer / true-false questions with AI grading for open-ended answers.
- **Notes**: Deep Notes generator — reads PDFs, URLs, syllabus units, or chat history to produce dense exam-ready notes. Exports as Anki CSV.
- **Resources**: Lists subject resources with external link/download actions.

**Feynman Mode**: When toggled, AI responses use `feynmanify()` wrapper — restructures any explanation into plain English + real-world analogy + worked example + key insight. Designed for concepts where understanding is blocking, not memory.

### Dashboard Insights (`DashboardInsights.tsx`)

Weekly performance analysis. Runs a static fallback calculation first, then attempts an OpenRouter call for richer insights. Result keys:

```typescript
interface InsightCard {
  type: 'burnout' | 'strong' | 'struggling' | 'tip';
  title: string;
  body: string;
  metric?: string;
}
```

Re-fetches when `outcomes.length` changes (new session logged). Previously fetched count is tracked to avoid redundant calls.

### Schedule Optimizer (`ScheduleOptimizer.tsx`)

Reads `db.schedule` (existing timetable) and `getAllReadinessScores()`, finds open slots in the grid, and asks OpenRouter to suggest 3 optimal study slots considering:
- Critical/maintaining subject status
- Time-of-day preferences (morning for difficulty ≥ 4)
- Spacing same-subject sessions across days

---

## QuickCapture

**File:** `QuickCapture.tsx`

A floating note-capture widget that attaches to the Dashboard `PageHeader` actions area. Lets users log a thought to any subject without starting a focus timer.

### Behavior

- Opens/closes via `Alt+N` global keyboard shortcut
- Saves via `⌘↵` / `Ctrl+↵`
- Pre-selects the active block's subject via `defaultSubjectId` prop
- Saves a `StudyLog` with `duration: 0, type: 'review'` and the user's note text
- Auto-closes after 900ms with "Saved!" confirmation
- Character limit: 500 chars with warning at 50 remaining
- Notes surface in Courses → Session Notes (same panel as timer-based notes)

### Data Shape

```typescript
// Entry written to db.logs:
{
  subjectId: selectedSubjectId,
  duration: 0,
  date: getISTEffectiveDate(),
  timestamp: Date.now(),
  type: 'review',
  notes: noteText.trim(),
}
```

---

## Data Flow & Processing Pipeline

```
DailyContextModal (user sets mood/dayType/focus)
        │
        ▼
generateUltimatePlan(context)   ←  brain-ultimate.ts
        │
        ├── strategy === 'research'  →  generateResearchGradePlan()
        ├── strategy === 'enhanced'  →  generateDailyPlan() + adjustments
        └── strategy === 'hybrid'    →  generateResearchGradePlan() + aggressive adjustments
        │
        ▼
blocks[]  +  loadAnalysis  +  confidence  +  performanceAdjustments[]
        │
        ▼
db.plans.put({ date, blocks, context, loadAnalysis, ... })
        │
        ▼
Dashboard renders blocks
        │
        ▼
FocusSession completes
        │
        ├── db.logs.add(StudyLog)
        ├── recordBlockOutcome(outcome)   ← brain-enhanced + research mastery tracker
        └── QualityRatingModal → coaching tip via OpenRouter
```

---

## Readiness Engine

### `calculateReadiness(subject, logs, effectiveDate)` — `brain.ts`

Core readiness calculation. Uses the Ebbinghaus forgetting curve.

```typescript
export interface SubjectReadiness {
  score: number;           // 0-100
  decay: number;           // 0-1 (current retention factor)
  status: 'critical' | 'maintaining' | 'mastered';
  lastStudiedDays: number; // days since last session (999 = never)
}
```

### `calculateProbabilisticReadiness(subject, logs, date, tracker)` — `brain-research-grade.ts`

Extended version with Bayesian mastery probability, confidence intervals, and variance quantification. Returns `ProbabilisticReadiness` which is a superset of `SubjectReadiness`.

### `getAllReadinessScores(db?)` — `brain-ultimate.ts` ← **always import from here**

Routes to research-grade if data is sufficient (≥ 14 days), falls back to core. Returns `Record<number, SubjectReadiness | ProbabilisticReadiness>`.

### `predictReadiness(current, subject, daysFromNow, hoursPerDay)` — `brain.ts`

What-if forecasting. Simulates day-by-day study accumulation with compounding decay to project a future readiness score. Used in the Courses → Readiness Predictor modal.

---

## Spaced Repetition (SM-2)

Modified SuperMemo 2 algorithm with capped exponent to prevent astronomical intervals.

```typescript
// Interval calculation (simplified)
if (reviewNumber === 0) interval = 1 | 3 | 7   (by comprehension: hard/good/easy)
if (reviewNumber === 1) interval = 1 | 6 | 8
else {
  const cappedEF  = min(newEaseFactor, 2.3)
  const cappedExp = min(reviewNumber - 1, 5)     // hard ceiling prevents 2^30 bugs
  interval = round(min(6 × cappedEF^cappedExp, 30 / newEaseFactor) × newEaseFactor)
}
interval = min(interval, 30)   // max 30 days between reviews

// Ease factor updates
comprehension === 3 (easy) → easeFactor = min(2.5, ef + 0.15)
comprehension === 1 (hard) → easeFactor = max(1.3, ef - 0.15)
comprehension === 2 (good) → no change
```

**Topic enrichment** (`TopicReadinessView.ts`) adds a `readinessScore` and `tier` to each topic for use in the AI assistant context:

```
tier = 'critical'  if readinessScore < 35 OR overdue > 7 days
tier = 'due'       if nextReview ≤ today
tier = 'mastered'  if easeFactor ≥ 2.2 AND reviewCount ≥ 4 AND avgComprehension ≥ 2.5
tier = 'upcoming'  otherwise
```

---

## Displacement Engine

When the day is full and a higher-priority block needs to be inserted:

1. Find the lowest-priority block currently in the plan that can be displaced
2. Verify the swap fits within time budget
3. Score each candidate victim: `(victim.priority - candidate.priority) × 100 - durationDiff`
4. Pick the best victim (highest score = max priority relief, minimal wasted time)
5. Attach `displaced: { type, subjectName }` to the new block for UI "Why?" explanation

If no victim is found, the block is silently dropped (it may appear in tomorrow's plan via dropped block recovery).

---

## Burnout Detection

```typescript
// Scored 0-100; atRisk if score ≥ 50
let score = 0;
score += skipRate × 50;              // skipping is the primary signal
score += lowQualityRate × 30;        // low session quality
score += maxConsecutiveSkipDays × 10; // extended abandonment
score = min(100, round(score));
```

Called from `DashboardInsights`, `StatsView`, and `generateEnhancedPlan`. Results cached in component state; not persisted to DB.

---

## Database Schema (v12)

```typescript
class OrbitDB extends Dexie {
  semesters!:     Table<Semester,     number>;  // Academic semester info
  subjects!:      Table<Subject,      number>;  // Courses + resources + grades + syllabus
  projects!:      Table<Project,      number>;  // Long-form deliverables
  schedule!:      Table<ScheduleSlot, number>;  // Weekly class timetable
  assignments!:   Table<Assignment,   string>;  // Deadlines + backward planning
  plans!:         Table<DailyPlan,    string>;  // Keyed by date (YYYY-MM-DD)
  logs!:          Table<StudyLog,     number>;  // Every session including QuickCapture notes
  topics!:        Table<StudyTopic,   number>;  // SM-2 flashcard topics
  blockOutcomes!: Table<BlockOutcome, string>;  // Post-session quality ratings
  studyBlocks!:   Table<StudyBlock,   string>;  // Individual blocks (direct access)
  exams!:         Table<ExamEntry,    number>;  // ISA/ESA exam schedule
  settings!:      Table<UserSettings, string>;  // Single row (key = "user")
}

// v12 schema (current)
this.version(12).stores({
  semesters:     '++id',
  subjects:      '++id, name, code',
  projects:      '++id, subjectId',
  schedule:      '++id, day, slot',
  assignments:   'id, subjectId, dueDate, estimatedEffort, progressMinutes, completed',
  plans:         'date',
  logs:          '++id, timestamp, date, subjectId, type, topicId',
  topics:        '++id, subjectId, name, nextReview',
  blockOutcomes: '++id, blockId, subjectId, timestamp, date, completed, skipped, timeOfDay',
  studyBlocks:   'id, date, completed, subjectId, type',
  exams:         '++id, subjectId, examDate, examType, completed',
  settings:      'key',
});
```

### Key Data Relationships

```
Semester
  └── Subject (1:many)
        ├── SyllabusUnit[]    (embedded in Subject)
        ├── Resource[]        (embedded in Subject)
        ├── Grade[]           (embedded in Subject)
        ├── StudyLog (1:many) → topics → nextReview scheduling
        ├── StudyTopic (1:many)
        ├── Assignment (1:many)
        └── Project (1:many)

DailyPlan (keyed by date)
  └── StudyBlock[]            (includes type, priority, displacement metadata)
        └── BlockOutcome      (post-session quality data)

ExamEntry → Subject
UserSettings (single row, key="user")
  └── weeklyTargetHours, activeSemesterId, subjectColors
```

### Persistence Safety Net

Three layers protect against data loss:

1. **IndexedDB (Dexie v12)**: Primary transactional storage.
2. **localStorage Snapshot**: `saveDbSnapshot()` debounces 2s after any write, serializes key tables (last 30 days of plans, last 500 logs, last 200 outcomes) to `localStorage` under `'orbit-db-snapshot'`. Maximum 3.5 MB to stay under quota.
3. **BroadcastChannel**: `notifyDataChange()` / `onDataChange()` keep multiple open tabs in sync.

Restoration path: `restoreDbFromSnapshot()` → bulk-adds all tables from the snapshot in a single transaction.

---

## `gemini.ts` — AI Gateway

Central wrapper for all OpenRouter API calls. **All AI calls in the app must go through here.**

### Model Routing

```typescript
export const MODELS: Record<TaskComplexity, string> = {
  simple:   'openrouter/free',                   // Insights, labels, short JSON (≤200 tokens)
  standard: 'google/gemini-flash-1.5',           // Chat, grading, summaries
  complex:  'google/gemini-flash-1.5',           // Exam gen, deep notes
  vision:   'google/gemini-2.0-flash-exp:free',  // Diagram/image analysis
};
```

### Key Exports

| Function | Usage | Complexity |
|----------|-------|------------|
| `geminiChat()` | Single-shot JSON generation | configurable |
| `geminiStream()` | Streaming chat responses | configurable |
| `geminiChatMultimodal()` | Vision tasks (diagram analysis) | vision |
| `fetchUrlText()` | Fetch + extract web page text | n/a |
| `extractPdfText()` | Extract text from base64 PDF | n/a |
| `extractPdfImages()` | Extract PDF pages as images | n/a |
| `feynmanify()` | Rewrite explanation simply | standard |
| `generateAnkiCards()` | Generate flashcard CSV | standard |

### Retry Logic

```
withRetry(fn, retries=2):
  - Retries on rate limit (429) and server errors (5xx)
  - Does NOT retry on auth errors (401, 403) or bad requests (400)
  - Backoff: 800ms × (attempt + 1)
```

---

## Performance Benchmarks

| Operation | Typical Time | Notes |
|-----------|-------------|-------|
| Core plan generation | 45–80ms | Single DB read batch + pure compute |
| Research-grade plan | 50–100ms | New users; uses defaults |
| Enhanced plan | 150–250ms | Active users; includes outcome queries |
| Hybrid plan | 200–400ms | Power users; full optimization pass |
| Database cold start | 80–150ms | All 12 tables loaded once |
| `getAllReadinessScores` | 30–60ms | Subjects × logs calculation |
| AI Insight (OpenRouter) | 800–2500ms | Session-cached after first load |
| Notes generation stream | 3–8s | First token ≈ 400ms |
| Exam question generation | 5–15s | Complex prompt, 5–10 questions |
| PDF text extraction | 500ms–3s | Per 20 pages, runs in browser |

**Target:** All plan operations under 500ms on mid-range mobile devices.

---

## API Reference

### Core Functions

#### `generateUltimatePlan(context, db?) → Promise<UltimatePlanResult>`
Generates a daily plan using the appropriate brain layer. Returns blocks, load analysis, confidence score, planning strategy, and any performance adjustments made.

#### `getAllReadinessScores(db?) → Promise<Record<number, SubjectReadiness>>`
Returns readiness for all subjects. Routes to research-grade (Bayesian) if ≥ 14 days of data, core otherwise.

#### `recordBlockOutcome(block, outcome, db?) → Promise<void>`
Dual-write: persists to `db.blockOutcomes` (analytics) AND updates in-memory mastery tracker (feedback loop).

#### `calculateReadiness(subject, logs, effectiveDate) → SubjectReadiness`
Pure function. No DB access. Takes pre-fetched data.

#### `predictReadiness(current, subject, daysFromNow, hoursPerDay) → { projectedScore, breakdown }`
Simulates future readiness given a study plan.

#### `getTopicsDueForReview(dateStr, db?) → Promise<StudyTopic[]>`
Returns topics with `nextReview ≤ dateStr`, sorted by overdue-ness then ease factor.

#### `recordTopicReview(subjectId, topicName, comprehension, duration, date, db?) → Promise<void>`
Updates SM-2 parameters and logs the review session.

#### `getUserSettings() → Promise<UserSettings>`
Reads the single `settings` row (key = `"user"`), merges with defaults.

#### `updateUserSettings(partial) → Promise<void>`
Deep-merges partial updates into the existing `settings` row.

#### `simulateWeek() → Promise<WeekPreview>`
Fast 7-day lookahead simulation. Uses pre-fetched data; does not call plan generation for each day.

---

## Future Enhancements

1. **Persist mastery tracker**: Serialize research-grade `BayesianMasteryTracker` state to `db.settings` so it survives page refreshes.
2. **Neural Duration Prediction**: Replace linear heuristics with a lightweight learned model trained on `BlockOutcome` history.
3. **Multi-Day Optimization**: Optimize the week as a whole rather than one day at a time (ILP or DP).
4. **Reinforcement Learning**: Let the system learn which coaching styles improve completion rates from `recordBlockOutcome` feedback.
5. **Insight Personalization**: Fine-tune OpenRouter prompts based on which insight types correlate with better weekly outcomes.
6. **Collaborative Filtering**: Learn from aggregate patterns across users (opt-in, anonymized).

---

## Questions?

1. Check [README.md](./README.md) for user-facing documentation
2. Source files: `brain-ultimate.ts` → `brain.ts` → `brain-enhanced-integration.ts` → `brain-research-grade.ts`
3. AI layer: `AIInsightBanner.tsx` · `AIStudyAssistant.tsx` · `gemini.ts`
4. Capture: `QuickCapture.tsx`
5. Open a [Discussion](https://github.com/santoshcheethirala/orbit/discussions)

**Built with ❤️ by one developer, for students who refuse to let chaos win.**