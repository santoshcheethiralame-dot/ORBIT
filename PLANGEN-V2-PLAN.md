# Plan-Generation v2 — Design Spec

**Goal:** evolve the planner from a *single-day greedy priority-fill* into a **personalized, week-aware, optimizing** engine — without leaving the unified architecture (one engine in `brain.ts` + analytics in `brain-analytics.ts` + the `brain-ultimate.ts` barrel).

**Guardrails:**
- **Keep the readiness/SR *math* (extend, don't replace).** No FSRS in this pass — that's still a separate future track. We extend `calculateReadiness`, we don't fork it.
- **Stay deterministic.** Same inputs → same plan (no unseeded `Math.random`). The app advertises this.
- **No (or additive-only) Dexie migration.** Everything new is derived from existing tables (`logs`, `blockOutcomes`, `topics`, `assignments`, `projects`, `exams`, `schedule`). Optional new fields default safely.
- **Local-first, fast.** All compute runs in-browser; block counts are tiny (≤ ~8/day, ≤ ~50/week) so even search is cheap.
- **Ship in phases**, each independently verifiable (tsc + build + live import-the-barrel test + 0 console errors), behind a **`settings.study.smartPlanner` toggle** so we can A/B "classic vs smart" and roll back instantly.

---

## Current planner (recap)

`generateDailyPlan(ctx)` runs an ordered pipeline (dropped-block recovery → exam ctx → ISA → ESA → critical-readiness → spaced-rep → assignments → projects → review cadence → fallback), each stage calling **`tryInsertWithDisplacement`** (greedy insert; evict the lowest-`DOMINANCE` block if full). Then `orderBlocksCircadian` (hardcoded time-of-day buckets via subject-name keyword matching) + break injection + `analyzeLoad`. Readiness = `volume × Ebbinghaus-decay` (minutes only, per-subject). Energy = static `localStorage` profile.

Strong heuristics, but: **myopic** (today only), **doesn't learn the user** (keyword circadian, static energy, ignores *how well* sessions went), and **aspirational** (assumes 100% adherence).

---

## Upgrade A — Week horizon (#1)

**What:** plan a rolling 3–7 day window; surface today as a slice.

**Algorithm:**
1. `computeDeadlineDemand(horizon)` (shared with C/#5): for each assignment/project/exam, spread remaining required effort across remaining available days (respecting per-day capacity from `resolveConstraints` + class times) → a **per-day, per-subject demand map**. Flag **infeasible** when Σdemand > Σcapacity.
2. Distribute **review cadence** by SR `nextReview` dates (reviews land on the day they're due, not all today) and **readiness maintenance** touches spread to avoid same-subject clustering across days.
3. For each day in the horizon, run the day allocator (Upgrade C) seeded with that day's demand + that day's `DailyContext`/constraints.
4. **Persist today** as the committed `DailyPlan`; persist days 1..N as **provisional** (regenerated each rollover as reality changes — never show stale future plans as fact).

**Integration:** new `generateWeekPlan()` in `brain.ts`; `generateEnhancedPlan(ctx)` (barrel) consults the week allocation to set *today's per-subject targets*, then returns today's plan as today. Reuse the SAME allocator (do **not** resurrect the old divergent `simulateWeek`).

**Data:** none new — writes provisional `DailyPlan` rows (already keyed by date). **Effort:** L. **Risk:** M (touches persistence/rollover).

---

## Upgrade B — Learn the user (#2 + #3)

**What:** replace hardcoded circadian + static energy with a learned **productivity curve**, and add **skip-risk/adherence** modeling. Lives in `brain-analytics.ts`.

**Productivity curve — `getProductivityProfile()`:**
- From `blockOutcomes`: bucket by hour (or 4–6 periods) → **Laplace-smoothed** avg `completionQuality` × completion-rate = a "performance weight" per window. Per-subject when enough data, else global.
- Cold-start: < N outcomes → fall back to the current difficulty heuristic; **blend** toward learned as data grows (confidence = min(n/20, 1)).

**Skip-risk — `getSkipRisk(block, slot, ctx)`:** P(skip | timeOfDay, subjectType, dayType, recentSkipStreak) from outcome rates (smoothed). Returns 0–1.

**Integration:**
- `orderBlocksCircadian` → order by learned performance weight (hardest/highest-value work into *your* peak windows).
- Energy profile → derived from the curve (or blended with the user's manual override).
- Skip-risk feeds the optimizer (C) as a penalty + can front-load risky work.

**Data:** none new (derives from `blockOutcomes`); memoize per plan-gen. **Effort:** M. **Risk:** L (pure scoring; cold-start falls back to today's behavior).

---

## Upgrade C — Real optimizer (#4 + #5)

**What:** replace greedy displacement with **candidate-generate → score → local-search**, plus deadline backward-scheduling.

**Pipeline:**
1. **Candidate pool:** the existing stages become *candidate generators* (SR-due, assignment chunks, project, critical-review, review-cadence, fallback) → a pool, each candidate tagged `{subjectId, type, duration, deadlineUrgency, readinessGain, examWeight, skipRisk, mustDo}`.
2. **Plan score** (maximize): `Σ readinessGain·examWeight + Σ deadlineRiskReduction − overloadPenalty − burnoutPenalty − interleavingPenalty − skipRiskPenalty`, subject to constraints (maxMinutes·slack, maxBlocks, class-time slots, excluded subjects).
3. **Search:** start from the greedy solution (today's algorithm = the initial guess, so we never do *worse*), then **deterministic local improvement** — swap/add/remove moves, beam width ~5 or a fixed-schedule simulated-annealing (~200 iters, deterministic, no RNG). n is tiny → sub-millisecond.
4. **Output:** chosen blocks + per-block **contribution breakdown** (feeds explainability in D).

**#5 backward-scheduling:** `computeDeadlineDemand` (shared with A) → today's **must-do** set + early **infeasibility warning**.

**Integration:** new internal `optimizeDay(candidates, constraints, signals)` in `brain.ts`; `generateDailyPlan` switches from "insert-with-displacement loop" to "generate candidates → `optimizeDay`". Keep `tryInsertWithDisplacement` as the greedy seed.

**Data:** none new. **Effort:** L. **Risk:** M (core allocation change — gated by the toggle, seeded by greedy so it's a strict improvement on the score).

---

## Upgrade D — Targeting + trust (#7 + #9 + #10) — **build first**

**What:** smarter *what to study* + buffers + explainability. Produces the **scoring signals** C/A consume, so it's the foundation.

**#7 Readiness upgrade (extend `calculateReadiness`, keep it ONE model):**
- **Quality-weighted volume:** weight studied minutes by session quality (`blockOutcomes.completionQuality` / `logs.comprehensionRating`) — 20 focused min > 45 min zoned-out. (Currently minutes only.)
- **Topic-level rollup:** aggregate per-`topic` retrievability (from `topics`: `easeFactor`, `reviewCount`, days-to-`nextReview`, `comprehensionHistory`) into the subject score, so the plan targets weak *topics*.
- **Exam-weighting:** weight topics/units by `subject.syllabus` unit weight / exam coverage (optional field; default equal).

**#9 Explainability:** plan-level "**why this plan**" summary from the optimizer's contribution breakdown ("OS-heavy: exam in 4 days · readiness 32% · 2 topics overdue"). Per-block `reason` already exists; add the day-level narrative for DailyContextModal/Dashboard.

**#10 Buffers + triage:** add a **slack factor** to constraints (target ~85% of maxMinutes); tag blocks **must-do** (deadline-critical / exam-imminent / SR-overdue) vs **nice-to-have** (maintenance/fallback). Overloaded → keep must-do, render nice-to-have as an optional "stretch" section.

**Data:** optional additive `SyllabusUnit.weight` + `ExamEntry` coverage (default equal — no migration required). **Effort:** M. **Risk:** L.

---

## Cross-cutting

**Module layout (stays unified):**
- `brain-analytics.ts` ← productivity profile + skip-risk (B) — they're analytics over outcomes.
- `brain.ts` ← deadline-demand, `optimizeDay`, `generateWeekPlan`, extended `calculateReadiness` (C/A/D engine work).
- `brain-ultimate.ts` ← unchanged public surface (`generateEnhancedPlan`, `getAllReadinessScores`) now powered by the upgrades; add `getPlanExplanation()` if the UI wants it separately.

**Feature flag:** `settings.study.smartPlanner` (default off → on after each phase verifies). Lets us ship incrementally and roll back without a revert.

**Determinism:** all search deterministic; profile/demand are pure functions of stored data.

---

## Phasing (dependency-ordered: D → B → C → A)

Each later phase consumes earlier signals; each is independently shippable & verifiable.

| Phase | Upgrade | Why this order | Effort |
|---|---|---|---|
| **1** | **D — Targeting + trust** | Cheap, high-impact, and produces the scoring signals (readinessGain, examWeight, must-do) the optimizer needs. | M |
| **2** | **B — Learn the user** | Produces timing + skip-risk signals; independent, falls back gracefully on cold-start. | M |
| **3** | **C — Real optimizer** | Consumes D's gains + B's skip-risk; backward-scheduling + infeasibility. | L |
| **4** | **A — Week horizon** | Lifts the optimizer to a multi-day allocator built on C's demand model. | L |

---

## Out of scope (future tracks)
FSRS memory model (separate pass), calendar-grid placement against real free slots beyond class-time avoidance, multiple selectable plan *shapes* (Crunch/Balanced/Light — easy follow-on once the optimizer + slack exist), persisted mastery/closed feedback loop, 2 AM vs 4 AM day-start, QuickCapture analytics pollution.

## Risk & rollback
- Behavior changes are real (plans will look different) → **`smartPlanner` toggle** + greedy-seeded optimizer (never scores worse than today) bound the risk.
- No DB migration; provisional future-day plans are regenerated, never authoritative.
- Per phase: `tsc` 0 · `vite build` clean · live import-the-barrel test (`generateEnhancedPlan` + `getAllReadinessScores` on seeded data) · 0 console errors · spot-check a few realistic scenarios (exam in 3 days, overloaded week, brand-new user cold-start).

## Verification scenarios (run each phase)
- New user (0–2 outcomes) → graceful fallback, sensible plan.
- Exam in 3 days + low readiness → plan goes exam-heavy, "why" explains it.
- Overloaded (3 deadlines this week) → infeasibility warning + must-do vs stretch split.
- Heavy skipper at 9 pm → optimizer stops scheduling 9 pm blocks for that subject.
