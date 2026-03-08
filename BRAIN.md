# 🧠 The BRAIN (v3.2)

> **Technical Architecture & Cognitive Model of Orbit**

This document details how Orbit "thinks." It explains the algorithms, data structures, and decision-making heuristics used to generate schedules, predict burnouts, manage energy, and deliver personalized AI coaching.

## 🏗️ System Architecture

Orbit v3.2 is built on a **Triple-Brain Architecture** with a live AI coaching layer:

1. **Macro Brain (Strategist)**: Looks at weeks/semesters. Handles long-term deadlines and project balancing.
2. **Micro Brain (Tactician)**: Looks at *today*. Handles hourly scheduling, breaks, and immediate energy management.
3. **Fluid Core (Renderer)**: Handles the sub-millisecond visual feedback loop (Flip Clock, Animations) to maintain flow state.
4. **AI Insight Layer (Coach)**: OpenRouter-powered daily coaching that reads readiness scores and session history to surface personalized warnings, tips, and motivation.

---

## Table of Contents

1. [Architecture Philosophy](#architecture-philosophy)
2. [The Triple-Brain System (v3.0)](#the-triple-brain-system-v30)
3. [AI Insight Banner (v3.2)](#ai-insight-banner-v32)
4. [Data Flow & Processing Pipeline](#data-flow--processing-pipeline)
5. [The Displacement Algorithm](#the-displacement-algorithm)
6. [Heuristic Scoring System](#heuristic-scoring-system)
7. [Performance Tracking & Adaptation](#performance-tracking--adaptation)
8. [Spaced Repetition Implementation](#spaced-repetition-implementation)
9. [Database Schema](#database-schema)
10. [API Reference](#api-reference)

---

## Architecture Philosophy

### Local-First, Deterministic Execution

The Orbit Brain is a **pure function** of your inputs. Given the same:
- Subject database state
- Historical performance data
- Daily context inputs (energy, mood, conditions)

...it will **always** generate the same plan. This determinism enables:
- Reproducible debugging
- Predictable testing
- Zero server dependency
- Instant rollback/replay

### The Input-Process-Output Model

```mermaid
graph TD
    Input[Daily Context] -->|JSON| Validator[Input Validator]
    Validator -->|Sanitized| Resolver[Constraint Resolver]
    
    DB[(IndexedDB)] -->|Subjects| Resolver
    DB -->|Performance| Resolver
    DB -->|History| Resolver
    
    Resolver -->|Context| Brain[Triple Brain System]
    Brain -->|Raw Plan| Sorter[Priority Sorter]
    Sorter -->|Sorted| Displacement[Displacement Engine]
    Displacement -->|Final| Output[Daily Plan]
    
    Output --> UI[User Interface]
    Output --> DB

    DB -->|Readiness + Logs| Insight[AI Insight Banner]
    Insight -->|OpenRouter API| Coach[Daily Coaching Card]
    Coach --> UI
```

**Key Design Decisions:**
- **No async in core algorithm**: All DB reads happen upfront
- **Immutable data structures**: Plans are never mutated, only replaced
- **Staged refinement**: Each layer adds intelligence without breaking previous stages
- **Session-cached insights**: OpenRouter responses are cached in `sessionStorage` to avoid redundant API calls

---

## The Triple-Brain System (v3.0)

### Overview

Orbit v3.0 introduces a **three-layer brain architecture** that adapts to user data maturity:

```
┌─────────────────────────────────────────────────────┐
│           BRAIN-ULTIMATE (Orchestrator)             │
│  Selects strategy based on user data availability   │
└────────┬────────────────────────────────────┬───────┘
         │                                    │
    ┌────▼────────┐    ┌──────────────┐    ┌▼─────────────┐
    │  Core Brain │    │  Enhanced    │    │  Research    │
    │  (Base)     │───►│  Integration │◄───│  Grade       │
    │             │    │  (Tracking)  │    │  (Advanced)  │
    └─────────────┘    └──────────────┘    └──────────────┘
```

### Layer 1: Core Brain (`brain.ts`)

**Purpose**: Foundation readiness calculations and basic planning

**Features:**
- Subject readiness scoring
- Priority-based block generation
- Basic load analysis
- Displacement logic

**When Used**: Always (base layer for all plans)

### Layer 2: Enhanced Integration (`brain-enhanced-integration.ts`)

**Purpose**: Performance tracking and adaptive adjustments

**Features:**
- Session quality ratings (1-5 scale)
- Burnout detection
- Energy budget management
- Interleaving enforcement
- Performance-based duration tuning

**When Used**: After 5+ days of data

### Layer 3: Research-Grade (`brain-research-grade.ts`)

**Purpose**: Probabilistic models and formal optimization

**Features:**
- Bayesian readiness estimation
- Confidence intervals
- Mastery probability calculations
- Formal gain function optimization
- Variance tracking

**When Used**: After 14+ days of data for full power

### Strategy Selection Logic

```typescript
function selectStrategy(dataSpan: number) {
  if (dataSpan < 5 days) {
    return {
      strategy: 'research',
      confidence: 0.7,
      reason: 'New user - using research-grade with smart defaults'
    };
  } else if (dataSpan < 30 days) {
    return {
      strategy: 'enhanced',
      confidence: 0.8,
      reason: 'Active user - core brain + performance adjustments'
    };
  } else {
    return {
      strategy: 'hybrid',
      confidence: 0.95,
      reason: 'Power user - full research optimization + feedback'
    };
  }
}
```

### Hybrid Mode (30+ Days)

When you have sufficient data, all three layers work together:

1. **Research-Grade** generates initial plan with probabilistic models
2. **Enhanced** applies performance-based adjustments
3. **Core** handles displacement and final constraints

**Result**: Maximum intelligence with 95% confidence

---

## AI Insight Banner (v3.2)

The `AIInsightBanner` component adds a **live coaching layer** on top of the planning engine. It runs after the plan is rendered and provides one personalized sentence of guidance each session.

### How It Works

```
db.subjects + db.logs
        │
        ▼
getAllReadinessScores()
        │
        ▼
generateInsight() → OpenRouter API (max 100 tokens)
        │
        ▼
{ type: 'warning' | 'tip' | 'motivation', text, subject }
        │
        ▼
Typewriter reveal → sessionStorage cache
```

### Insight Classification

| Type | Trigger | Color |
|------|---------|-------|
| `warning` | Any subject readiness < 40% | Amber |
| `tip` | Readiness 40–55%, actionable suggestion | Violet |
| `motivation` | Strong readiness + 60+ min studied today | Emerald |

### Prompt Engineering

The OpenRouter prompt is deterministic given the same inputs and enforces strict constraints:

```
- Max 20 words
- Name the weakest subject explicitly when warning
- Suggest a concrete action when tipping
- Never be generic
- Return only valid JSON: { type, text, subject }
```

### Caching Strategy

Insights are stored in `sessionStorage` under the key `orbit-ai-insight`. A new insight is only fetched when:
- The page is first loaded (no cache hit)
- The user manually taps the refresh button

This avoids unnecessary API calls while keeping the insight relevant for the current study session.

---

## Data Flow & Processing Pipeline

### Stage 1: Context Parsing

**Input Shape:**
```typescript
interface DailyContext {
  mood: 'low' | 'normal' | 'high';
  dayType: 'normal' | 'isa' | 'esa';
  focusSubjectId?: number;
  isHoliday: boolean;
  isSick: boolean;
  bunkedSubjectId?: number;
  daysToExam?: number;
}
```

**Constraint Resolution:**
```typescript
const resolveConstraints = (context: DailyContext) => {
  const baseMinutes = {
    low: 180,      // 3 hours
    normal: 300,   // 5 hours
    high: 420      // 7 hours
  }[context.mood];
  
  const energyLevel = {
    low: 60,
    normal: 80,
    high: 90
  }[context.mood];
  
  return { 
    timeAvailableMinutes: baseMinutes,
    energyLevel 
  };
};
```

### Stage 2: Subject Enrichment

Before generation, each subject is scored on multiple dimensions:

```typescript
interface EnrichedSubject {
  id: string;
  name: string;
  priority: number;          // 1-10 (user-set)
  difficulty: number;        // 1-10 (user-set)
  
  // Computed scores
  decayScore: number;        // Days since last study
  performanceScore: number;  // Recent session quality avg
  
  // Meta
  lastStudied: Date | null;
  totalMinutesLogged: number;
  avgQualityRating: number;  // 1-5 stars
}
```

**Decay Scoring Algorithm:**
```typescript
const calculateDecayScore = (lastStudied: Date | null): number => {
  if (!lastStudied) return 100; // Never studied = max urgency
  
  const daysSince = Math.floor(
    (Date.now() - lastStudied.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSince >= 7) return 100;
  if (daysSince >= 5) return 80;
  if (daysSince >= 3) return 60;
  if (daysSince >= 2) return 40;
  return 0;
};
```

### Stage 3: Plan Generation (Brain-Ultimate)

The ultimate orchestrator decides which brain system to use:

```typescript
const generateUltimatePlan = async (context: DailyContext) => {
  // 1. Assess data maturity
  const dataSpan = calculateDataSpan();
  
  // 2. Select strategy
  let blocks: StudyBlock[];
  let confidence: number;
  
  if (dataSpan < 5) {
    const plan = await generateResearchGradePlan(context);
    blocks = plan.blocks;
    confidence = 0.7;
  } else if (dataSpan < 30) {
    const corePlan = await generateDailyPlan(context);
    blocks = await applyPerformanceAdjustments(corePlan.blocks);
    confidence = 0.8;
  } else {
    const researchPlan = await generateResearchGradePlan(context);
    blocks = await applyAggressiveAdjustments(researchPlan.blocks);
    confidence = 0.95;
  }
  
  // 3. Compute comprehensive analytics
  const loadAnalysis = {
    burnoutRisk: await detectBurnout(),
    interleaving: analyzeInterleaving(blocks),
    energyBudget: validateEnergyBudget(blocks),
    ...coreMetrics
  };
```

---

## Performance Tracking & Adaptation

### Dynamic Duration Adjustment

**Goal:** Auto-tune block sizes based on completion patterns

```typescript
const adjustDuration = (
  baselineDuration: number,
  subject: EnrichedSubject,
  recentSessions: Session[]
): number => {
  const last30Days = recentSessions.filter(s => 
    s.subjectId === subject.id &&
    s.timestamp > Date.now() - 30 * 24 * 60 * 60 * 1000
  );
  
  if (last30Days.length < 3) return baselineDuration;
  
  const avgQuality = last30Days.reduce(
    (sum, s) => sum + s.qualityRating, 0
  ) / last30Days.length;
  
  const completionRate = last30Days.filter(
    s => s.completed
  ).length / last30Days.length;
  
  // Too easy: high quality + high completion
  if (avgQuality >= 4.5 && completionRate >= 0.9) {
    return Math.floor(baselineDuration * 1.15); // +15%
  }
  
  // Too hard: low completion or quality
  if (completionRate < 0.6 || avgQuality < 2.5) {
    return Math.floor(baselineDuration * 0.8); // -20%
  }
  
  return baselineDuration; // Just right
};
```

### Burnout Detection

```typescript
interface BurnoutMetrics {
  skipRate: number;          // % of planned sessions skipped
  avgCompletionRate: number; // % of sessions finished
  lowMoodStreak: number;     // Consecutive days mood < 3
}

const detectBurnout = async (): Promise<{
  score: number;
  atRisk: boolean;
  recommendation: string;
}> => {
  const metrics = await calculateBurnoutMetrics();
  
  const redFlags = [
    metrics.skipRate > 0.3,              // 30%+ skip rate
    metrics.avgCompletionRate < 0.6,     // Quitting early often
    metrics.lowMoodStreak > 4            // 4+ days low mood
  ];
  
  const atRisk = redFlags.filter(Boolean).length >= 2;
  
  return {
    score: metrics.skipRate * 100,
    atRisk,
    recommendation: atRisk 
      ? "Consider a rest day or lighter schedule"
      : "Healthy study patterns detected"
  };
};
```

### Interleaving Enforcement

**Goal:** Prevent mental fatigue by mixing subjects and task types

```typescript
const enforceInterleaving = (blocks: StudyBlock[]): StudyBlock[] => {
  const result: StudyBlock[] = [];
  let lastSubjectId: number | null = null;
  let sameSubjectCount = 0;
  
  for (const block of blocks) {
    // Rule: Max 2 consecutive blocks of same subject
    if (block.subjectId === lastSubjectId) {
      sameSubjectCount++;
      if (sameSubjectCount >= 2) {
        const different = blocks.find(b => 
          b.subjectId !== lastSubjectId && 
          !result.includes(b)
        );
        if (different) {
          result.push(different);
          lastSubjectId = different.subjectId;
          sameSubjectCount = 1;
          continue;
        }
      }
    } else {
      sameSubjectCount = 1;
    }
    
    result.push(block);
    lastSubjectId = block.subjectId;
  }
  
  return result;
};
```

---

## Spaced Repetition Implementation

### Modified SM-2 Algorithm

Orbit uses a modified **SuperMemo 2** algorithm for review scheduling:

```typescript
interface SRSData {
  easeFactor: number;    // 1.3 - 2.5 (default 2.5)
  interval: number;      // Days until next review
  repetitions: number;   // Total review count
  nextReview: Date;      // Scheduled review date
}

const updateSRS = (
  current: SRSData,
  comprehensionRating: 1 | 2 | 3 // 1=Hard, 2=Good, 3=Easy
): SRSData => {
  let { easeFactor, interval, repetitions } = current;
  
  if (comprehensionRating === 1) {
    // Reset: too hard
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    repetitions = 0;
    interval = 1; // Review tomorrow
  } else {
    easeFactor = Math.min(2.5, 
      easeFactor + (0.1 * (comprehensionRating - 2))
    );
    repetitions++;
    
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  }
  
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);
  
  return { easeFactor, interval, repetitions, nextReview };
};
```

---

## Database Schema

### Dexie.js Configuration — v11

```typescript
class OrbitDB extends Dexie {
  semesters!:     Table<Semester, number>;
  subjects!:      Table<Subject, number>;
  projects!:      Table<Project, number>;
  schedule!:      Table<ScheduleSlot, number>;
  assignments!:   Table<Assignment, string>;
  plans!:         Table<DailyPlan, string>;
  logs!:          Table<StudyLog, number>;       // study session logs
  topics!:        Table<StudyTopic, number>;
  blockOutcomes!: Table<BlockOutcome, string>;
  studyBlocks!:   Table<StudyBlock, string>;
  exams!:         Table<ExamEntry, number>;      // v10: ISA/ESA exam schedule
  settings!:      Table<UserSettings, string>;   // v11: user preferences

  constructor() {
    super('OrbitDB');

    // v11 (current) — full schema
    this.version(11).stores({
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
      settings:      'key',   // single-row, key = "user"
    });
  }
}
```

### UserSettings Schema

```typescript
interface UserSettings {
  key: string;                              // always "user"
  weeklyTargetHours: number;               // default 7
  activeSemesterId?: number;
  subjectColors?: Record<number, string>;  // user-chosen hex per subject
}
```

### Migration Safety

Every version upgrade:
1. Backs up affected tables before modifying them
2. Applies schema changes inside a transaction
3. Reverts to the backup and rethrows if any step fails

---

## 🛡️ Data Persistence

To ensure **zero data loss**, Orbit implements a multi-layer safety net:

1. **IndexedDB (Dexie v11)**: Primary transactional storage across all 12 tables.
2. **LocalSnapshot**: Every 2 seconds of inactivity, the entire DB state is serialized to `localStorage` as a catastrophic recovery point.
3. **BroadcastChannel**: Real-time state synchronization across multiple open tabs prevents race conditions.
4. **Migration Safety**: DB upgrades automatically backup data before applying schema changes, reverting if any error occurs.

---

## API Reference

### Core Functions

#### `generateUltimatePlan(context: DailyContext): Promise<UltimatePlanResult>`

Generates a complete daily study plan using the triple-brain system.

**Returns:**
```typescript
{
  blocks: StudyBlock[];
  loadAnalysis: {
    loadScore: number;
    loadLevel: 'light' | 'normal' | 'heavy' | 'extreme';
    burnoutRisk: BurnoutMetrics;
    interleaving: InterleavingAnalysis;
    energyBudget: EnergyBudget;
  };
  planningStrategy: 'core' | 'enhanced' | 'research' | 'hybrid';
  confidence: number; // 0.7 - 0.95
}
```

#### `getAllReadinessScores(): Promise<Record<number, SubjectReadiness>>`

Returns readiness scores for all subjects using the best available system.

#### `recordBlockOutcome(outcome: BlockOutcome): Promise<void>`

Records session completion and quality data for learning.

#### `getUserSettings(): Promise<UserSettings>`

Reads the single user-preferences row from the `settings` table, falling back to defaults.

#### `updateUserSettings(partial): Promise<void>`

Partially updates user preferences with deep-merge safety.

---

## Performance Benchmarks

| Operation | Time (avg) | Notes |
|-----------|-----------|-------|
| Full plan generation | 45-300ms | Varies by strategy |
| Research-grade plan | 50ms | New users |
| Enhanced plan | 150ms | Active users |
| Hybrid plan | 300ms | Power users |
| Database batch load | 120ms | Cold start |
| AI insight (OpenRouter) | 800-2000ms | Session-cached after first load |

**Target:** All plans under 500ms on mid-range devices. Insights non-blocking (rendered after 1.2s delay).

---

## Future Enhancements

1. **Neural Network Duration Prediction**: Replace heuristics with learned models
2. **Multi-Day Optimization**: Optimize across a week, not just one day
3. **Reinforcement Learning**: Let the system learn optimal strategies
4. **Collaborative Filtering**: Learn from aggregate patterns
5. **Insight Personalization**: Fine-tune OpenRouter prompts based on what coaching styles improve your completion rates

---

## Questions?

This document is a living spec. If something is unclear:
1. Check the [main README](./README.md) for user-facing docs
2. Read the source: `brain-ultimate.ts`, `brain.ts`, `brain-enhanced-integration.ts`, `brain-research-grade.ts`, `AIInsightBanner.tsx`
3. Open a [Discussion](https://github.com/santoshcheethirala/orbit/discussions)

**Built with ❤️ by developers who actually study.**