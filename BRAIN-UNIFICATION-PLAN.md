# Brain Unification Plan

**Scope (approved):** *Unify + fix bugs.* Collapse the 4 brain modules into **2 modules + 1 thin barrel**, delete dead code, converge on **one readiness model** and **one planner path**, and fold in the few still-live consistency fixes. **Keep the current math** — no FSRS / DP-knapsack rewrite in this pass (deferred; see §10).

**Process:** This doc is the build spec. Nothing is edited until it's approved.

---

## 1. Current state (verified against the live `fix/audit-remediation` branch — NOT the stale 2026-06-03 audit)

The branch already remediated essentially every **data-integrity** bug the audit flagged. Verified fixed in current code:

| Audit finding | Status | Evidence |
|---|---|---|
| Review session double-logs StudyLog | ✅ fixed | `brain.ts:582` `void duration`; `recordTopicReview` no longer logs; single log at `index.tsx:505` |
| Plan regen wipes completed progress | ✅ fixed | `index.tsx:417-431` merges `completedPrior` + dedupes |
| Global streak uses UTC host clock | ✅ fixed | `index.tsx:474-489` uses `effectiveDatePlus(-i)` (IST) |
| Dashboard checkbox writes no StudyLog | ✅ fixed | `Dashboard.tsx:438-449` logs + UNDO deletes it |
| Quality-dismiss fabricates a 3/5 | ✅ fixed | rebuilt `FocusSession` `handleQualityDismiss` records nothing |
| Core engine bypassed for new/veteran users | ✅ fixed | research routing de-fanged in `brain-ultimate.ts` (core runs for all) |
| BlockOutcome stamped UTC | ✅ fixed | `brain-analytics` (enhanced-integration) `:197-198` use IST |

**So this pass is mostly architecture, not bug-firefighting.** What genuinely remains (confirmed present in current code):

- **3 readiness algorithms** with a **14-day switch** that changes both the number *and* the returned object shape (`brain-ultimate.getUnifiedReadiness`).
- **`Stats.tsx` reads readiness from `./brain` (core)** while everything else reads the unified barrel → same subject can show **different readiness on different pages**.
- **`brain-research-grade.ts`** (931 LOC) — single consumer (`brain-ultimate`), its planner already off the happy path, in-memory state resets every reload, "ILP"/"BKT"/CI/calibration are cosmetic. Net negative.
- **Duplicate `generateEnhancedPlan`** (dead copy in `brain-enhanced-integration.ts:590`) + **two divergent duration-adjust loops**.
- **Dead exports** across all four files (~hundreds of LOC).
- **Timezone stragglers** inside `brain.ts` (a few `toISOString()` "days-since" calcs, host-clock circadian ordering) — low impact, off-by-one near midnight IST.

---

## 2. Target architecture — 2 modules + 1 thin barrel

```
                 ┌─────────────────────────────────────────────┐
   UI (all)  ───▶│  brain-ultimate.ts   = THE PUBLIC BARREL     │  ← single import path
                 │   • generateEnhancedPlan (core + 1 adjust)   │
                 │   • getAllReadinessScores  (→ core, 1 shape) │
                 │   • re-exports engine + analytics public API │
                 └───────────────┬───────────────┬─────────────┘
                                 │               │
                 ┌───────────────▼───┐   ┌───────▼────────────────┐
                 │  brain.ts         │   │  brain-analytics.ts     │
                 │  THE ENGINE       │   │  (renamed from          │
                 │  • generateDailyPlan   │  brain-enhanced-       │
                 │  • analyzeLoad    │   │   integration.ts)       │
                 │  • SR (recordTopicReview, calculateNextReview) │
                 │  • readiness (calculateReadiness,              │
                 │      getAllReadinessScores, predictReadiness)  │
                 │  • updateAssignmentProgress, resolveConstraints│
                 └───────────────────┘   │  • recordBlockOutcome   │
                                         │  • getSubjectPerformance │
        DELETE ❌ brain-research-grade.ts │  • detectBurnout         │
                                         │  • analyzeInterleaving   │
                                         │  • validateEnergyBudget  │
                                         │  • getDashboardInsights  │
                                         │  • getQualityRatingOptions/Emoji │
                                         │  • getEnergyProfile      │
                                         └─────────────────────────┘
```

- **`brain.ts`** stays the engine. One readiness model lives here.
- **`brain-analytics.ts`** = `brain-enhanced-integration.ts` renamed + trimmed to the genuinely-used helpers.
- **`brain-ultimate.ts`** = slim barrel: the enforced single import path (`BRAIN.md`'s "Single Import Rule", finally true). Keeps its current name to avoid churning 8 consumer imports.
- **`brain-research-grade.ts`** = deleted.
- **`tracking.ts`** = kept (SR re-export shim used by FocusSession/SpacedRepetition).

LOC impact: ~5,300 → ~2,600–2,900 (roughly **−45%**), with 1 readiness model, 1 planner path, 1 duration-adjust pass.

---

## 3. Readiness unification — the ONE behavioral change

**Decision:** keep **core `calculateReadiness`** (`brain.ts:326`) as the single model. It's the sounder choice: deterministic, stateless (recomputed from Dexie logs), rational Ebbinghaus decay scaled by study volume. **Delete** the research probabilistic model and the 14-day switch.

- `getAllReadinessScores` always returns `Record<number, SubjectReadiness>` (one stable shape).
- `predictReadiness` (`brain.ts:390`) stays — it's the orthogonal *forecast* ("what if I study N days"), used by Courses' PredictionModal. Not a competitor.
- `Courses.tsx:144` and `DailyContextModal.tsx:204` change their state type `Record<number, SubjectReadiness | ProbabilisticReadiness>` → `Record<number, SubjectReadiness>` and drop the `ProbabilisticReadiness` import. **Verified safe:** no `.tsx` reads `masteryProbability/confidence/variance` — only `.score`/`.status` are used.

**Behaviour delta (the one user-visible change):** users with **≥14 distinct study days** currently get the 70/30 research blend; after this they get the pure core score. Their readiness % will shift once (and Stats/Dashboard/Courses will finally agree). This is a deliberate, one-time correction toward consistency. *(If we want to preserve a "confidence" signal later, that's the FSRS pass — §10.)*

---

## 4. Planner unification

- **One path:** `index.tsx → generateEnhancedPlan (barrel) → coreGeneratePlan (brain.generateDailyPlan) → ONE duration-adjust pass (using analytics.getSubjectPerformance) → load/burnout/interleave/energy enrichment`.
- Keep the single duration-adjust loop in the barrel's `generateEnhancedPlan` (the version currently in `brain-ultimate.ts:122-153`). **Delete** the dead duplicate in `brain-analytics` and the research metrics sidecar.
- **Delete** `generateResearchGradePlan` + the whole optimizer/BKT/gain machinery (research-grade file goes away).
- No change to what the planner *produces* for the common path (core already runs for everyone) — we're only removing the dead alternate path + the duplicate loop.

---

## 5. Dead code to delete (explicit)

**`brain.ts`:** `runBrain` + interfaces `BrainInput/BrainOutput/BrainDailyFacts/BrainWeeklyFacts/RawBrainAlert`; `runWhatIfScenario`; `simulateWeek` (Week-Ahead removed); unused private `getOptimalDuration`. *(Keep `getTopicsDueForReview` — see §9 SR note.)*

**`brain-analytics.ts` (ex enhanced-integration):** `generateEnhancedPlan` (dead duplicate), `applyInterleaving`, `getQualityColor`, `getRecentOutcomes`, `getQualityDistribution`, `deleteOldOutcomes`, `getAllTimeStats`, `getStudyStreak` (per-subject, no live caller — global streak lives in `index.tsx`). Trim the default-export barrel accordingly.

**`brain-research-grade.ts`:** delete the entire file (`BayesianMasteryTracker`, `LearnedGainPredictor`, `OptimizationSolver`, `generateResearchGradePlan`, `calculateProbabilisticReadiness`, `runAblationStudy`, `exportResearchData`, research `getAllReadinessScores`/`generateEnhancedDailyPlan`, `RESEARCH_CONFIG`, `ProbabilisticReadiness`).

**`brain-ultimate.ts`:** delete `getUnifiedReadiness` (14-day switch), `researchMetrics`/`optimizationScore` block, dead union members `'research'|'hybrid'`, all research-grade imports.

---

## 6. Module-by-module migration map

**`brain.ts`** → trim dead exports (§5). Fix timezone stragglers (§9). Otherwise unchanged.

**`brain-enhanced-integration.ts` → `brain-analytics.ts`** (via two-step `git mv` to be case-safe per prior Linux-casing lesson) → trim to: `recordBlockOutcome`, `getSubjectPerformance`, `calculateQualityTrend`, `detectBurnout`, `analyzeInterleaving`, `validateEnergyBudget`, `getDashboardInsights`, `getQualityRatingOptions`, `getQualityRatingByValue`, `getQualityEmoji`, `getEnergyProfile`, `saveEnergyProfile`. Drop the dead planner + dead analytics (§5).

**`brain-ultimate.ts`** → becomes the slim barrel:
- `generateEnhancedPlan(context)` = core plan + the single duration-adjust pass + load/burnout/interleave/energy enrichment (no research).
- `getAllReadinessScores()` = `brain.getAllReadinessScores` (core), returns `Record<number, SubjectReadiness>`.
- Re-export: `SubjectReadiness`, `PlanResult`, `resolveConstraints`, `predictReadiness`, `recordBlockOutcome`, `getSubjectPerformance`, `detectBurnout`, `getDashboardInsights`, `getQualityRatingOptions`, `getQualityEmoji`, `getEnergyProfile`, `updateAssignmentProgress`.

**`brain-research-grade.ts`** → delete.

**`tracking.ts`** → unchanged.

---

## 7. Consumer import updates (enforce the single import path)

| File | Change |
|---|---|
| `Stats.tsx:26-27` | import `getAllReadinessScores` (+ helpers) from `./brain-ultimate` (was `./brain`) — fixes the cross-page readiness mismatch |
| `Courses.tsx:13` | drop `ProbabilisticReadiness`; `:144` union → `Record<number, SubjectReadiness>` |
| `Courses.tsx:24` | `predictReadiness` import from `./brain-ultimate` (re-exported) instead of `./brain` |
| `DailyContextModal.tsx:14,204` | same `ProbabilisticReadiness` removal as Courses |
| `FocusSession.tsx:16` | `recordBlockOutcome` from `./brain-ultimate` (was `./brain-enhanced-integration`) |
| `QualityRatingModal.tsx:3` | `getQualityRatingOptions` from `./brain-ultimate` |
| `brain-ultimate.ts` | import analytics helpers from `./brain-analytics` (renamed) |

All other `getAllReadinessScores` consumers (Dashboard, AIStudyAssistant, ScheduleOptimizer, StressTestView, AIInsightBanner, AboutView, `utils/subjectIntelligence`) already import from `./brain-ultimate` — **no change**.

---

## 8. Still-live consistency fixes to fold in (small, in scope)

1. **Stats readiness source** → barrel (above). 
2. **Remove the 14-day cliff** (delete `getUnifiedReadiness`). 
3. **Timezone stragglers in `brain.ts`**: replace `toISOString().split('T')[0]` "days-since" calcs (`calculateReadiness` last-study, project-idle, regular-cadence last-study) with `getISTEffectiveDate()`/`formatLocalDate`; circadian ordering should read IST hour, not `new Date().getHours()`.
4. **Console noise**: drop the unconditional `console.log`s in planner hot paths.

---

## 9. Notes / edge cases

- **SR `getTopicsDueForReview`**: keep (re-exported via `tracking.ts`); the Review queue uses the due count. The known `topicId` slug-vs-numeric-id inconsistency is **left as-is** this pass (it's an FSRS-era fix).
- **No Dexie schema change, no data migration.** We only delete *in-memory* research state. `subjects/logs/topics/blockOutcomes/plans` untouched → existing user data is safe; the localStorage snapshot/backup format is unchanged.
- **`db.studyBlocks` write-only shadow** — noted, **out of scope** (bigger change; defer).

---

## 10. Explicitly OUT of scope (future "perfection" pass)

FSRS memory model, calibrated readiness probabilities + confidence UI, DP-knapsack scheduler, persisting mastery state + closing the feedback loop, data-driven subject categories (replace English keyword matching), 4-button Again/Hard/Good/Easy, 2 AM vs 4 AM day-start spec reconciliation, QuickCapture-pollutes-analytics, `studyBlocks` shadow removal. These are tracked for a follow-up.

---

## 11. Risk & rollback

- **Low–medium.** Mostly deletion + import rewiring; the live planner/readiness *logic* (core) is unchanged. Single behavioral delta = readiness numbers for ≥14-day users (§3).
- Each step is its own commit; rollback = revert the commit. No DB migration to undo.

## 12. Verification checklist

- [ ] `npx tsc --noEmit` = 0 and `npm run build` clean after each commit.
- [ ] Grep: no remaining imports of `./brain-research-grade`; no `getUnifiedReadiness`.
- [ ] Live (seed subject + today plan): generate plan, open Dashboard/Courses/Stats → **readiness identical across all three** for the same subject.
- [ ] Complete a focus block → exactly one StudyLog; streak/today-minutes advance once.
- [ ] Dashboard checkbox complete → one StudyLog + UNDO removes it.
- [ ] Regenerate plan after completing a block → completed block preserved.
- [ ] 0 console errors across the flows.

## 13. Commit sequence

1. **Delete dead code** (brain.ts + analytics dead exports) — no behavior change.
2. **Rename** `brain-enhanced-integration.ts` → `brain-analytics.ts` (+ update 3 importers).
3. **Delete `brain-research-grade.ts`**, collapse `brain-ultimate.ts` to the slim barrel + single readiness (the behavioral delta lands here).
4. **Rewire consumers** (Stats/Courses/DailyContextModal/FocusSession/QualityRatingModal) to the barrel; drop `ProbabilisticReadiness`.
5. **Timezone + console cleanup** in `brain.ts`.
6. Update `BRAIN.md` to match reality; verify; commit; push (FF `origin/main`).
