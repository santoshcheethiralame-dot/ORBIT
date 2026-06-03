# Orbit v2 — Critical Production-Readiness Audit

> Generated 2026-06-03 · React 19 + TypeScript + Vite + Dexie/IndexedDB · ~26k LOC / ~38 files
> Method: 21 specialist agents across 16 lanes → adversarial verification of every Critical/High finding → synthesis. Findings tagged ✅ verified / ⚖︎ severity-adjusted / ⟂ unverified.

## Scorecard

| Dimension | Score |
|---|---|
| Product Design | **5/10** |
| UX | **5/10** |
| UI | **6/10** |
| Code Quality | **4/10** |
| Architecture | **4/10** |
| Performance | **5/10** |
| Accessibility | **3/10** |
| Production Readiness | **3/10** |
| **Overall (mean)** | **4.4/10** |

**Finding counts:** 183 total — 🔴 10 Critical · 🟠 61 High · 🟡 81 Medium · ⚪ 31 Low

## Executive Summary

Orbit v2 is an ambitious, visually striking local-first study planner that is **not production-ready**. The surface — floating glass navbar, animated nebula background, staged plan-generation overlays — is genuinely impressive and would screenshot well next to Linear or Arc. But underneath, the audit (183 findings — 10 Critical and 61 High after independent re-verification, in which 3 claimed Criticals were honestly down-graded) exposes a product whose core promises are quietly broken. Two of the app's central loops corrupt their own data: regenerating a daily plan **silently wipes the day's completed progress**, and the snooze action **deletes a block from the only array the recovery engine reads**, so 'the planner will recover it tomorrow' is false. The analytics that the whole experience is built around are untrustworthy: the Dashboard checkbox marks a block done while logging **zero** study minutes (so streaks/stats never move), closing the quality-rating modal **fabricates a 3/5 score** into the adaptive engine, and a thicket of UTC-vs-IST date bugs misattributes study to the wrong day for the target (India) user. A 2,000-line Stats component has a Rules-of-Hooks violation that **crashes the tab** the moment the first session is logged, and a live OpenRouter API key is **inlined into the shipped client bundle**, exposing it to billing abuse by anyone who opens the site.

The root cause is architectural incoherence masked by visual polish. There are three planning engines and a `uniqueDays` counter silently routes most users to a primitive one that ignores almost the entire Daily Context — so the sophisticated `brain.ts` you actually wrote is dead weight for new users and veterans alike. There are two sources of truth for plan blocks, two settings backends, two navigation-state atoms, four `brain*.ts` files (~5k LOC) with dead duplicate exports, a 467-line validation module imported by nothing, ~500 lines of dead light-mode CSS, and three SR components that no screen renders. CoursesView — documented as the authoritative source of subjects — **cannot add, edit, or delete a subject at all**, and two fully-built views (Schedule, Review queue) have no navigation path and are unreachable. Accessibility is near-absent on core journeys: no visible focus ring in the default theme, modals with no focus trap or Escape, and toasts (the documented Undo mechanism) never announced to screen readers. None of this is unrecoverable — the bones are good (the IST time module, the displacement scheduler, the gemini wrapper, NaN-safe project math, atomic import transaction, and comprehensive empty states are all genuinely well done). But shipping this as-is risks data loss, a leaked key, and a crash on day one. The work below is sequenced to stop the bleeding first, then make the data model honest, then earn back the polish the UI is already promising.

---

## Contents
- [Parts 1–8 — Detailed Findings](#detailed-findings) (183)
  - [Part 1 — Product Audit](#part-1) — 11
  - [Part 2 — UX Audit](#part-2) — 59
  - [Part 3 — Design System Audit](#part-3) — 11
  - [Part 4 — Study Planner Logic Audit](#part-4) — 35
  - [Part 5 — Code Quality Audit](#part-5) — 36
  - [Part 6 — Performance Audit](#part-6) — 11
  - [Part 7 — Accessibility Audit](#part-7) — 10
  - [Part 8 — Security & Data Safety](#part-8) — 10
- [Part 9 — Missing Features](#part-9--missing-features)
- [Part 10 — Final Report](#part-10--final-report)

---

<a id="detailed-findings"></a>
## Detailed Findings (Parts 1–8)

<a id="part-1"></a>
### Part 1 — Product Audit
_11 findings — 1 Critical, 4 High, 5 Medium, 1 Low_

#### 1. Two 'complete a block' paths write different data — dashboard checkbox logs zero study time
`🔴 Critical` · Competing workflows / Correctness · impact: Correctness, Data safety, Learning outcomes · ✅ verified

- **File:** `Dashboard.tsx:1092-1127`
- **Current Problem:** Completing a block via a focus session calls handleFocusComplete (index.tsx:443-524), which creates a StudyLog (db.logs.add at index.tsx:452) AND marks the block completed. Completing the same block via the Dashboard's green check button calls markComplete (Dashboard.tsx:1092-1127), which only flips `completed: true` on the plan block and adds NO StudyLog. Both buttons sit side-by-side on every block (Dashboard.tsx:1613-1628).
- **Why It Matters:** Streaks, the Analytics view, readiness/decay scores, and time-of-day stats are all derived from StudyLogs (e.g. streak logic in Dashboard.tsx:407-423 and index.tsx:425-441 iterate `logs`). A user who marks blocks done with the checkbox sees the daily progress ring fill to 100% but records zero study minutes — their streak doesn't advance, stats stay empty, and readiness never improves. Two visually identical 'done' actions silently produce contradictory state. This corrupts the core analytics loop.
- **Recommended Fix:** Make markComplete also write a StudyLog (using the block's planned duration) so manual completion counts identically, or relabel the checkbox to clearly mean 'mark done without logging time' and warn the user. Prefer the former for consistency.
- **Verifier note:** Dashboard.tsx:1092-1127 markComplete only does db.plans.put with completed:true (no db.logs.add), while index.tsx:452-460 handleFocusComplete adds a StudyLog; calculateStreak (index.tsx:425-441) reads only db.logs, so the checkbox path records 0 minutes and never advances streak/stats.

#### 2. Exam Simulator and AI Study Assistant are only reachable mid-focus-session
`🟠 High` · Discoverability · impact: Engagement, Learning outcomes, User retention · ⟂ unverified

- **File:** `FocusSession.tsx:1080`
- **Current Problem:** AIStudyAssistant is mounted only inside FocusSession (FocusSession.tsx:1080) and ExamSimulator is embedded only as a tab inside AIStudyAssistant (AIStudyAssistant.tsx:1290-1291). There is no top-level entry point for either. The README markets both as primary features ('Exam Simulator Tab', 'AI Study Assistant') and the Core Features table lists them as standalone capabilities.
- **Why It Matters:** To self-test before an exam or ask the AI assistant a question, a user must first generate a daily plan, then start a focus timer on some block, then open the assistant overlay, then switch to the Exam tab. A student who just wants to drill MCQs cannot do so without committing to a timed study block. Heavily-promoted features that require a 4-step ritual to reach will go unused.
- **Recommended Fix:** Expose the Study Assistant / Exam Simulator from the Courses view (per-subject) or as a global action, independent of an active focus block.

#### 3. No way to edit, reorder, reschedule, or regenerate today's plan once created
`🟠 High` · Missing core workflow · impact: Productivity, User retention, Engagement · ⟂ unverified

- **File:** `Dashboard.tsx:1556-1655`
- **Current Problem:** The only operations on a today-block are: Start focus (onStartFocus), mark complete (markComplete), and snooze/drop (snoozeBlock) — see the action buttons at Dashboard.tsx:1599-1638. There are no drag handlers, no moveBlock/reorder, no duration edit, no 'add block to today' except via the backlog. A repo-wide search for reorder/reschedule/editBlock/onDragStart/moveBlock yields nothing. Separately, the DailyContextModal only renders when `needsContext` is true (index.tsx:618), and needsContext is set true only on rollover or when no plan exists (index.tsx:246-356); once today's plan is generated there is no button anywhere to re-open it or regenerate.
- **Why It Matters:** Plans are AI-generated guesses about block order, duration, and subject mix. If the order is wrong, a block is too long, or the user's day changed, they are stuck: they can only complete/drop blocks, not adjust them, and cannot ask the planner to re-plan. The Daily Context modal's 'Skip for Now' path (DailyContextModal.tsx:702-714) generates a default plan that the user then cannot redo. This forces users to either grind a plan that no longer fits or wipe data.
- **Recommended Fix:** Add a 'Regenerate plan' / 'Edit day' control on the Dashboard header that re-opens DailyContextModal (set needsContext=true), and support reordering and inline duration edits on blocks.

#### 4. ScheduleView and ReviewQueue are rendered but have no navigation path — both are unreachable
`🟠 High` · Information Architecture / Dead-ends · impact: Productivity, Engagement, Maintainability · ⚖︎ adjusted

- **File:** `index.tsx:793-798`
- **Current Problem:** index.tsx renders `activeTab === 'schedule'` → <ScheduleView/> (line 793-795) and `activeTab === 'review'` → <ReviewQueueView/> (line 796-798). But the only navigation primitive, switchTab(), is wired exclusively to DESKTOP_TABS/MOBILE_TABS (ids: dashboard, courses, projects, stats, settings, about) plus the About/Settings icon buttons. A repo-wide search for switchTab('schedule'), switchTab('review'), or a CustomEvent with detail.tab='schedule'/'review' returns nothing (only the type-union declarations at index.tsx:78-86 and the render conditions). The handleNavigate CustomEvent listener (index.tsx:543-545) could route there, but no component ever dispatches 'schedule' or 'review'.
- **Why It Matters:** Two fully-implemented features — the weekly class timetable (ScheduleView, a complete CRUD screen) and the spaced-repetition review queue (ReviewQueueView) — cannot be opened by any user action. The timetable is the documented data source the Dashboard's ScheduleOptimizer reads from (ScheduleOptimizer.tsx:175 `db.schedule.toArray()`), so the optimizer is permanently starved of data after onboarding. The SM-2 review queue, a headline feature in the README, is invisible. This is wasted engineering and a broken core journey.
- **Recommended Fix:** Add Schedule and Review entries to DESKTOP_TABS/MOBILE_TABS (or to a secondary nav/menu), or have the Dashboard's 'Reviews Due' tile and ScheduleOptimizer dispatch `orbit:navigate` with detail.tab='review'/'schedule'. At minimum, surface a link from the Dashboard sidebar review tile into ReviewQueueView.
- **Verifier note:** index.tsx:793-798 renders ScheduleView/ReviewQueueView but DESKTOP_TABS/MOBILE_TABS (57-70) lack schedule/review and the only orbit:navigate dispatch is Stats.tsx:874 (tab:'settings'); reachability bug is real but it is a dead-feature/UX gap, not data corruption -> High.

#### 5. Two incompatible systems for unfinished work: manual backlog vs auto-recovered 'dropped' blocks
`🟠 High` · Competing workflows / Mental model · impact: Correctness, Productivity, User retention · ⟂ unverified

- **File:** `Dashboard.tsx:1129-1174`
- **Current Problem:** The product states backlog migration is MANUAL. Two divergent mechanisms exist. (1) The Backlog modal lists incomplete past blocks (Dashboard.tsx:1014-1034, filtering `!b.completed && !b.migrated`) and requires a manual swipe/click to add to today. (2) The per-block 'Move to tomorrow' arrow calls snoozeBlock (Dashboard.tsx:1129-1174), which pushes the id into plan.droppedBlocks and toasts 'Block dropped — planner will recover it tomorrow' (line 1147). brain.ts:946-976 then AUTOMATICALLY re-injects droppedBlocks during the next plan generation. So snoozed blocks auto-return, but ordinary unfinished blocks must be migrated by hand.
- **Why It Matters:** Identical-looking unfinished blocks behave oppositely depending on whether the user pressed 'Move to tomorrow' vs simply left it incomplete, and the auto-recovery only fires if the user happens to open the Daily Context modal and regenerate (which itself is hard to trigger — see prod-no-plan-regeneration). A block 'dropped' on a day where no new plan is generated is silently lost from both the droppedBlocks path (cleared at brain.ts:974) and arguably never reaches the manual backlog. The contradictory promise ('planner will recover it') vs the manual-migration reality will erode trust.
- **Recommended Fix:** Pick one model. Either route snoozed blocks into the same manual backlog (drop the droppedBlocks auto-recovery), or make all unfinished blocks auto-carry and remove the manual backlog. Align the toast copy with whichever survives.

#### 6. Backlog is discoverable only through one small Dashboard tile
`🟡 Medium` · Discoverability · impact: Productivity, Engagement · ⟂ unverified

- **File:** `Dashboard.tsx:943-971`
- **Current Problem:** The only way to open the backlog modal is the 'Backlog' sidebar tile (Dashboard.tsx:943-971), and it is interactive only when backlog.length>0 (onClick guarded: `backlog.length > 0 && setShowBacklog(...)`, cursor switches to default otherwise). The tile is one of several rotating/stacked sidebar tiles sorted by priority (Dashboard.tsx:973), so it can be pushed down. There is no menu item, no count badge in the nav, and the backlog is unreachable from any other view.
- **Why It Matters:** Unfinished work from prior days is core to a study planner, but it lives behind a tile that is easy to miss and only clickable when non-empty. Users on Courses/Projects/Stats have no indication that a backlog exists or is growing, so missed blocks silently pile up.
- **Recommended Fix:** Add a persistent backlog indicator (count badge) in the nav, and/or a Backlog entry in the main navigation reachable from any view.

#### 7. Daily Context modal front-loads heavy decision-making before any plan can be seen
`🟡 Medium` · Decision fatigue / Cognitive load · impact: User retention, Engagement, Productivity · ⟂ unverified

- **File:** `DailyContextModal.tsx:418-698`
- **Current Problem:** Before generating a plan the modal presents: a critical-subjects alert, a 6-tile preset grid (lines 418-439), a 4-option day-type selector (441-444), conditional exam-focus subject + days-to-exam (446-482), an ESA exam-schedule sub-form with add/remove (484-557), and an Advanced accordion containing energy override, three life-event toggles, a bunked-subject selector, and a full inline assignment-creation form (559-697). This modal is BLOCKING — it renders whenever needsContext is true (index.tsx:618-623) and must be dispatched every new day/rollover.
- **Why It Matters:** A daily planner should reduce friction to starting. Requiring this many choices every single day (or hitting the easy-to-overlook 'Skip for Now' text link at line 702) is classic decision fatigue and a daily drop-off point. The presets help, but the day-type + exam + advanced layers re-confront the user each rollover.
- **Recommended Fix:** Make presets a true one-tap path that generates immediately, collapse everything else behind 'Customize', and remember the previous day's context as the default so most days are a single confirm.

#### 8. Day-start rollover hour disagrees across product spec (2 AM), README (4 AM), and code (4 AM default)
`🟡 Medium` · Correctness / Documentation mismatch · impact: Correctness, User retention · ⟂ unverified

- **File:** `utils/time.ts:41`
- **Current Problem:** The product owner states day rollover happens at 2:00 AM. README.md:75 states 'Day starts at 4 AM (configurable) — 3 AM still counts as today'. The code default is 4 AM: getDayStartHour() returns 4 (time.ts:41) and getISTEffectiveDate (time.ts:83-92) rolls the date back only when the IST hour is < dayStartHour. So a user studying at 3 AM is treated as the previous day under the code/README, but the product spec implies 3 AM is a new day.
- **Why It Matters:** The effective study date drives plan currency (isPlanCurrent), streak calculation, log dates, and the rollover modal. A 2-hour discrepancy between the documented behavior and the spec means late-night sessions land on a date the user may not expect, mislabeling streaks and which day a log belongs to. At minimum the README and product spec contradict each other.
- **Recommended Fix:** Confirm the intended default with the product owner and make README, spec, and the time.ts default agree. Surface the configured day-start hour in the rollover modal copy (currently it vaguely says 'Your day start threshold was crossed', index.tsx:594).

#### 9. Two different PageHeader components exist; the standalone PageHeader.tsx is dead and would crash if used
`🟡 Medium` · Maintainability / Dead code · impact: Maintainability, Correctness · ⟂ unverified

- **File:** `PageHeader.tsx:33-42`
- **Current Problem:** PageHeader.tsx exports a PageHeader whose props REQUIRE `designation: string` and `icon: LucideIcon` and take `title: string` (PageHeader.tsx:5-22, 33-42). components.tsx exports a completely different PageHeader taking `title: ReactNode`, optional `meta`, `actions` (components.tsx:509-537). Every real consumer imports from './components' (e.g. Dashboard.tsx:8 `import { ... PageHeader ... } from './components'`, ScheduleView.tsx:7). The standalone PageHeader.tsx is imported nowhere and, because it requires designation/icon that no caller passes, would throw/render broken if anyone used it.
- **Why It Matters:** Duplicated, divergent components with the same name are a maintenance trap: a contributor importing the wrong PageHeader gets a different API and a runtime break. Dead files inflate the ~38-file flat repo and obscure the real component surface.
- **Recommended Fix:** Delete PageHeader.tsx (and PageHeader.tsx's default export) or reconcile the two into one component. Keep the components.tsx version that is actually used.

#### 10. QuickCapture notes are stored as type 'review' study logs, polluting analytics
`🟡 Medium` · Correctness / Data model · impact: Correctness, Learning outcomes · ⟂ unverified

- **File:** `QuickCapture.tsx:75-82`
- **Current Problem:** QuickCapture saves a note as a StudyLog with `duration: 0` and `type: 'review'` (QuickCapture.tsx:75-82). The header comment (lines 2-3) says entries 'appear in the Session Notes tab of each course', but they are written into db.logs as review-type sessions, the same table/type that real spaced-repetition review sessions and stats consume.
- **Why It Matters:** Every quick note becomes a phantom zero-minute 'review' session. Any analytic that counts review sessions or session frequency (e.g. session-count tiles, type breakdowns) will be inflated by notes that involved no studying. It also conflates a note-taking action with a learning activity in the data model.
- **Recommended Fix:** Store quick notes under a dedicated type (e.g. 'note') or a separate table, and exclude zero-duration notes from session/stat aggregations.

#### 11. Dashboard injects a recurring 'make manual backups' chore tile, undercutting the local-first recovery promise
`⚪ Low` · Cognitive load / Trust · impact: User retention, Data safety · ⟂ unverified

- **File:** `Dashboard.tsx:610-631`
- **Current Problem:** A 'Data Governance' message tile is always pushed into the dashboard carousel (Dashboard.tsx:610-631) telling users to 'Make a manual backup every 2–3 days' and 'Visit Settings › Data Governance'. The product describes a localStorage snapshot as an automatic recovery net (saveDbSnapshot is called after loads/completions, e.g. index.tsx:256,405,515), and an optional auto-backup exists (index.tsx:139-192).
- **Why It Matters:** Telling users on the main dashboard, repeatedly, that they must manually back up implies the local-first storage is not trustworthy, increasing anxiety and cognitive load on the highest-traffic screen. It competes for attention with the actual study plan and contradicts the 'instant, automatic recovery net' positioning.
- **Recommended Fix:** Default-enable the auto-backup/snapshot, and replace the nagging tile with a quiet status indicator (e.g. 'Last backup 1d ago') shown in Settings rather than the dashboard carousel.

<a id="part-2"></a>
### Part 2 — UX Audit
_59 findings — 1 Critical, 18 High, 28 Medium, 12 Low_

#### 1. Closing the Quality Rating modal silently records a fake 3/5 rating that pollutes the learning model
`🔴 Critical` · Dismissal behavior / data integrity · impact: Correctness, Learning outcomes, Data safety · ✅ verified

- **File:** `FocusSession.tsx:1228`
- **Current Problem:** The QualityRatingModal is rendered with onClose={() => handleQualityRating(3)} (FocusSession.tsx:1228). The X button in the modal calls onClose (QualityRatingModal.tsx:122-124). So whenever the user clicks X to dismiss the rating prompt, handleQualityRating(3) runs and calls recordBlockOutcome(block, { completionQuality: 3, ... }) (FocusSession.tsx:458-461). recordBlockOutcome persists completionQuality into the outcomes store (brain-enhanced-integration.ts:182-217), and that value feeds avgQuality, performance-trend (firstAvg/secondAvg), and low-quality-rate detection in brain.ts:274-391. A dismissal is therefore indistinguishable from an honest 'Okay (3)' rating.
- **Why It Matters:** The user thinks they are skipping/canceling the rating, but the app silently injects fabricated performance data into the adaptive engine and spaced-repetition schedule. Over many sessions this systematically biases readiness scores, mastery, and review timing toward a phantom 'average' — the opposite of a study planner's purpose, and the user has no idea it happened.
- **Recommended Fix:** Dismissal must NOT write an outcome. Either remove the X (force a real choice) or make onClose a true cancel that records nothing and just closes the modal / returns to the session. If a block must be marked complete without a quality score, store completionQuality as null/undefined and exclude null ratings from all averages and trend math.
- **Verifier note:** FocusSession.tsx:1228 wires onClose={() => handleQualityRating(3)}; QualityRatingModal.tsx:122 X button onClick={onClose}; handleQualityRating (FocusSession.tsx:459-463) calls recordBlockOutcome with completionQuality:rating unconditionally, persisted via blockOutcomes.add at brain-enhanced-integration.ts:204,213. Dismiss path identical to a real 3/5 rating with no guard.

#### 2. All destructive deletes ignore the app's built-in toast-undo pattern
`🟠 High` · Destructive actions · impact: Data safety, User retention · ⟂ unverified

- **File:** `Courses.tsx:284, 733, 795; ProjectsView.tsx:864`
- **Current Problem:** The Toast system fully supports undo: success(message, {label, onClick}) renders an 'Undo' button (Toast.tsx:53, 149-160; the demo at 191 shows the intended UNDO usage). Yet every delete fires a plain toast.success with no action: resource delete (Courses.tsx:284 'Resource deleted'), grade delete (Courses.tsx:733 'Grade removed'), and project delete (ProjectsView.tsx:864 'Deleted'). The mutation is committed to Dexie before/at the toast, so there is no recovery.
- **Why It Matters:** The product owner explicitly says 'Undo actions use toast-based undo patterns.' These flows violate that standard. A single mis-click permanently destroys an uploaded PDF (base64, not recoverable from disk), a recorded grade, or an entire project with its full session history. The undo affordance already exists and is trivial to pass; omitting it is a self-inflicted data-loss risk.
- **Recommended Fix:** Before deleting, snapshot the removed item, perform the delete, then call toast.success('Resource deleted', { label: 'Undo', onClick: () => restore(snapshot) }). Apply uniformly to resource, grade, milestone, and project deletes.

#### 3. CoursesView cannot add, edit, or delete subjects — it is read-only for the subject entity
`🟠 High` · CRUD completeness · impact: Correctness, User retention, Data safety · ⚖︎ adjusted

- **File:** `Courses.tsx:125-1099 (no db.subjects.add/delete anywhere); Onboarding.tsx:605`
- **Current Problem:** Every db.subjects.update call in Courses.tsx (lines 213, 240, 261, 281, 356, 366, 514, 730) only mutates nested arrays (resources/grades/syllabus) or colorIndex. There is no db.subjects.add, no db.subjects.delete, and no UI to edit a subject's name, code, credits, or difficulty. A repo-wide search shows db.subjects.add exists ONLY in Onboarding.tsx:605 and bulk import paths. The list view (line 925+) has a search bar and sort dropdown but no 'Add Subject' button; EmptyCourses is rendered without its optional onAddCourse action (line 988), so the empty state shows no button either.
- **Why It Matters:** The product owner states 'CoursesView is the authoritative source of subjects.' It is not — it is authoritative only for resources/grades. A student who adds a course mid-semester, drops a course, or makes a typo in a subject name/code/credits has NO in-app path to fix it. The only ways to create a subject are to re-run onboarding or import a backup. This breaks the core academic-hub journey and effectively makes the subject roster immutable after day one.
- **Recommended Fix:** Add an 'Add Subject' HeaderChip on the list view and a subject form modal (name, code, credits, difficulty), plus an 'Edit details' affordance and a guarded 'Delete subject' on the detail view. Wire EmptyCourses's onAddCourse so the empty state is actionable. Subject delete must cascade-aware warn about attached projects/logs and offer toast-undo.
- **Verifier note:** Factually accurate: grep for db.subjects.(add|delete|put) in Courses.tsx returns no matches; all 8 db.subjects.update calls (lines 213,240,261,281,356,366,514,730) only touch resources/grades/syllabus/colorIndex; name/code/credits shown read-only (Courses.tsx:526-531); subjects created only at Onboarding.tsx:605 (db.subjects.add). But this is a missing-feature/UX gap, not a crash/data-loss/security defect, so Critical overstates impact -> High.

#### 4. Resource, grade, and milestone deletes have neither confirmation nor undo (one-tap data loss)
`🟠 High` · Destructive actions · impact: Data safety, Productivity · ⟂ unverified

- **File:** `Courses.tsx:790-795, 728-738; ProjectsView.tsx:181-184`
- **Current Problem:** Resource delete (Courses.tsx:790-795) calls removeResource immediately on click. Grade delete (Courses.tsx:728-738) runs db.subjects.update inline on click. Milestone delete (ProjectsView.tsx:181-184) calls del() on click. None show a confirm dialog, and per the previous finding none offer undo. The grade/resource delete buttons are also opacity-0 until hover (Courses.tsx:735, 792) — invisible affordances that, once found, destroy instantly.
- **Why It Matters:** These are irreversible, single-click destructions of user-entered data. Grades and uploaded files represent real effort and are unrecoverable. Inconsistent with the project delete, which at least confirms (ProjectsView.tsx:863). A trackpad mis-tap silently erases a semester's grade entry with zero feedback that anything dangerous happened.
- **Recommended Fix:** At minimum attach toast-undo to all three. For grades and resources (high-value), add a lightweight inline confirm ('Delete? · Confirm') two-step on the same button, matching the app's modal-light aesthetic rather than native confirm().

#### 5. Dashboard checkbox 'complete' writes no StudyLog — silently doesn't count toward streak or stats
`🟠 High` · Feedback / data integrity · impact: Correctness, Learning outcomes, Engagement · ⟂ unverified

- **File:** `Dashboard.tsx:1092-1127`
- **Current Problem:** markComplete() only flips the block's completed flag on the plan (db.plans.put) and shows 'Block marked complete!'. It never adds a db.logs entry, never records a blockOutcome, and never updates assignment progress. The focus-session path (index.tsx handleFocusComplete:452-482) does all of these. The dashboard streak (Dashboard.tsx:407-423) and StatsView are computed from db.logs by date, so a block completed via the green checkbox produces zero study minutes, no streak day, and no quality/outcome data.
- **Why It Matters:** Two visually equivalent 'complete' affordances sit side-by-side on every block row (the checkmark vs Start→focus). A user who marks blocks done via the checkmark (the faster path) gets a cheerful success toast but loses their streak, sees flat stats, and starves the AI/readiness model of data — directly undermining the product's core feedback loops. The success toast actively lies about the outcome.
- **Recommended Fix:** Route checkbox completion through the same write path as focus completion (add a StudyLog with the block's planned duration + a blockOutcome, update assignment progress), or remove the standalone checkmark so completion always flows through a session. At minimum, change the copy to reflect that no time was logged.

#### 6. Focus 'Exit' abandons the session with no confirmation and silently discards elapsed time
`🟠 High` · Affordances / data safety · impact: Data safety, Productivity, User retention · ⟂ unverified

- **File:** `FocusSession.tsx:933`
- **Current Problem:** The Exit button calls onExit directly (→ index.tsx:572 setView(activeTab)). There is no confirmation dialog and no logging of partial time. A user 28 minutes into a 30-minute block who taps Exit loses all 28 minutes — no StudyLog, no blockOutcome, the block stays incomplete. Strict mode adds a beforeunload guard (line 178) but does NOT guard this in-app Exit. Session notes are written to localStorage on unmount (line 216) but are never read back or surfaced anywhere, so they are effectively lost too.
- **Why It Matters:** Accidental or mid-session exits are common (tab switch, phone call, misjudged tap). Discarding real study time with zero warning is both a data-loss event and demoralizing — it punishes the user for interruption and corrupts the very performance signals the planner relies on. The unsurfaced localStorage notes compound the silent loss.
- **Recommended Fix:** On Exit while hasStarted/time elapsed, confirm via an in-app modal offering 'Save partial progress & exit' (log elapsed minutes via the normal completion path) vs 'Discard'. Surface saved session notes somewhere (e.g., reattach on next open of the same block).

#### 7. Closing the quality modal silently logs a fabricated 3-star rating
`🟠 High` · Affordances / data integrity · impact: Correctness, Learning outcomes · ⟂ unverified

- **File:** `FocusSession.tsx:1228`
- **Current Problem:** QualityRatingModal is rendered with onClose={() => handleQualityRating(3)} (FocusSession.tsx:1228). The modal header X button calls onClose (QualityRatingModal.tsx:122). So a user who finished a session and dismisses the rating dialog — a natural 'I don't want to rate this' gesture — has a 3/5 ('Okay') quality silently recorded as if they rated it, feeding recordBlockOutcome and (for reviews) the spaced-repetition schedule.
- **Why It Matters:** Fabricated quality data pollutes the readiness model, SR intervals, and weekly insights. Worse, it is invisible: the user believes they declined to rate, but the system invents a middling score. This degrades every downstream 'smart' feature and makes the AI insights subtly wrong.
- **Recommended Fix:** Treat dismiss as 'no rating' — record the completion/duration but leave completionQuality null (and skip the SR update), or require an explicit rating with a clear 'Skip rating' button that is recorded as skipped rather than 3.

#### 8. Quality Rating modal cannot be escaped or genuinely skipped; the only 'out' is the data-corrupting X
`🟠 High` · Keyboard / dismissal behavior · impact: Productivity, Correctness, Engagement · ⟂ unverified

- **File:** `QualityRatingModal.tsx:107`
- **Current Problem:** QualityRatingModal has no Escape handler and no backdrop-click handler — the outer div (QualityRatingModal.tsx:108) has no onClick and there is no keydown listener in the component. FocusSession's Escape handler (FocusSession.tsx:515-531) deliberately does NOT include showQualityModal, so pressing Escape while the rating prompt is open does nothing. The only dismissal affordance is the X, which (per uxmod-rating-dismiss-fabricates-3) writes a fake 3. There is no honest 'Skip rating' button.
- **Why It Matters:** The rating prompt appears after every completed session. A user who genuinely doesn't want to rate (or fat-fingers Escape expecting it to close) is trapped: the only escape route quietly corrupts their data. This is forced, high-friction, and there is no clean way out.
- **Recommended Fix:** Add an explicit, clearly-labelled 'Skip' button that records no outcome, and wire Escape to that same no-op-skip. Make backdrop click either do nothing or trigger the same honest skip — never a silent rating.

#### 9. Rollover modal copy is vague and 'Start New Cycle' discards the in-progress plan with no warning or preview
`🟠 High` · Copy clarity / data safety · impact: Data safety, Learning outcomes, User retention · ⟂ unverified

- **File:** `index.tsx:593`
- **Current Problem:** The only body copy is 'Your day start threshold was crossed.' (index.tsx:594-595) — jargon that does not tell the user what will happen. The button handler (index.tsx:597-609) calls setTodayPlan(null) + setNeedsContext(true), which immediately replaces today's plan view with the Daily Context modal. Any unfinished blocks from the previous plan are abandoned from the visible flow with no on-screen explanation that incomplete work moves to a manual backlog (the product spec says backlog migration is manual — nothing here tells the user that or links to it).
- **Why It Matters:** A user who left several blocks unfinished sees a cryptic sentence and one button; clicking it makes their in-progress plan vanish. Without copy explaining 'yesterday's unfinished blocks are saved to your backlog — migrate them manually', users reasonably believe they lost their work, eroding trust in a local-first app whose whole pitch is data safety.
- **Recommended Fix:** Rewrite copy in plain language ('A new study day has started. Yesterday's unfinished blocks are saved to your backlog.') and surface a count of carried-over blocks plus a direct link/CTA to the backlog. Confirm before discarding any in-progress plan.

#### 10. Rollover 'New Orbit Cycle' modal is forced full-screen with a single button, no Escape, no backdrop, no opt-out
`🟠 High` · Dismissal behavior / forced choice · impact: User retention, Productivity, Engagement · ⟂ unverified

- **File:** `index.tsx:583`
- **Current Problem:** The rollover modal (index.tsx:583-616) is a fixed full-screen overlay with exactly one action: 'Start New Cycle'. There is no X, no Escape handler, and the backdrop div has no onClick, so the modal cannot be dismissed or deferred. It appears automatically when todayPlan exists but is stale (checkRollover, index.tsx:335-338) — including mid-day if the user changes the day-start hour, or on every app open after the threshold.
- **Why It Matters:** The user is hard-blocked from their entire app until they consent to wiping the current view and regenerating. There is no 'remind me later' or 'keep viewing yesterday'. For a tool people open many times a day, an unconditional, non-dismissable interrupt is hostile and trains users to mash the button without reading.
- **Recommended Fix:** Give the modal a secondary 'Later / Keep current' action and wire Escape + backdrop to it. Only force the flow when there is genuinely no current data to show.

#### 11. Exam Simulator is buried three levels deep behind an unrelated 'AI Help' button
`🟠 High` · Discoverability / IA · impact: Engagement, Productivity · ⟂ unverified

- **File:** `FocusSession.tsx:970, 1076-1080; AIStudyAssistant.tsx:846, 992-997, 1288-1296`
- **Current Problem:** The only entry to ExamSimulator is: start a Focus Session on a study block, click the 'AI Help' button (FocusSession.tsx:970, labelled with a Sparkles icon — no mention of exams), which opens AIStudyAssistant defaulting to the 'chat' tab (AIStudyAssistant.tsx:846), then manually switch to the 'Exam' tab (:994, rendered at :1288). There is no top-level nav, no Dashboard entry, and no prompt; a user must already be mid-focus-session and stumble onto the tab.
- **Why It Matters:** A self-test/exam feature only delivers value if students can find it when they want to test themselves — typically before an exam, not necessarily while a focus timer is running. Hiding it under an 'AI Help' chat panel inside the timer screen means most users will never discover it, wasting a strong feature and the AI cost spent building it.
- **Recommended Fix:** Promote exam practice to a discoverable surface: a Dashboard action ('Test yourself on <subject>') and/or an entry from CoursesView per subject, opening the simulator directly (state defaulting to setup) rather than requiring a focus session and tab hunt.

#### 12. Exam Simulator results are never saved and do not feed the daily loop, SR, or stats
`🟠 High` · Feature integration / data flow · impact: Learning outcomes, Engagement, Data safety · ⟂ unverified

- **File:** `ExamSimulator.tsx:1-705 (no db import); ExamSimulator.tsx:296-376`
- **Current Problem:** ExamSimulator.tsx contains no import of db and no persistence call anywhere (grep for db./logs.add/blockOutcomes/recordExam returns nothing). A completed exam computes score, time taken, and weakTopics in the Results component (ExamSimulator.tsx:308-345), but on closing the AIStudyAssistant overlay the entire ExamSession is discarded. Nothing is written to StudyLogs, topic mastery (db.topics), blockOutcomes, or the SR queue. The 'Review these' weak-topics list (:347-360) has no action to schedule those topics.
- **Why It Matters:** An exam is the single highest-signal source of what a student actually knows, yet that signal is thrown away. Weak topics surfaced by the exam never become review items, scores never count toward analytics or subject readiness, and a student who closes the panel loses the result with no way to revisit it. The feature looks valuable but is a dead-end demo, not part of the study loop.
- **Recommended Fix:** On exam completion, persist the session (a StudyLog and/or a dedicated exam-result record) and pipe each missed question's topic into the SR pipeline via recordTopicReview (rating Hard) so weak topics get scheduled. Surface past exam scores in Stats so completion has lasting value.

#### 13. Spaced-repetition Review queue has no navigation entry and is effectively unreachable
`🟠 High` · Discoverability / orphaned feature · impact: Engagement, Learning outcomes, User retention · ⚖︎ adjusted

- **File:** `index.tsx:57-70, 79, 796-798; Dashboard.tsx:692-715`
- **Current Problem:** ReviewQueueView renders only when activeTab === 'review' (index.tsx:796-798), but neither DESKTOP_TABS (index.tsx:57-62) nor MOBILE_TABS (index.tsx:64-70) contains a 'review' tab, so no button ever sets activeTab to 'review'. A repo-wide search for any dispatch to the review tab (switchTab/setActiveTab/setView('review') or orbit:navigate with tab:'review') returns zero matches. The only Dashboard surface that mentions reviews is the 'Reviews Coming Up' tile, which is explicitly cursor-default (Dashboard.tsx:697) and has no onClick. The flashcard deck and the entire flip/rate review flow are therefore dead-ends for a normal user.
- **Why It Matters:** Spaced repetition is the core learning-science feature of a study planner. If users add flashcards (AddFlashcardForm exists) they can never get to the queue to review them, so the whole feature produces zero learning value and silently rots. This is a broken core journey, not polish.
- **Recommended Fix:** Add a 'review' entry to DESKTOP_TABS and MOBILE_TABS (with a due-count badge), and make the Dashboard 'Reviews Coming Up' tile clickable to dispatch orbit:navigate {tab:'review'}. Verify the tab renders ReviewQueueView and that the badge reflects topics due today.
- **Verifier note:** ReviewQueueView mounts only at activeTab==='review' (index.tsx:796); no tab entry and no orbit:navigate{tab:'review'} exists (Dashboard 'Reviews Due' tile calls onStartFocus at Dashboard.tsx:795, not navigation). True unreachability but a functional gap, not Critical data risk -> High; also overlaps prod-schedule-review-unreachable.

#### 14. Review 'due today' is computed in UTC while the app's logical day is IST — review timing is off by up to a day
`🟠 High` · Correctness / timezone · impact: Correctness, Learning outcomes, Engagement · ⟂ unverified

- **File:** `SpacedRepetition.tsx:300, 502, 70; AIStudyAssistant.tsx:863; utils/time.ts:83-92`
- **Current Problem:** Every spaced-repetition surface derives 'today' from new Date().toISOString().split('T')[0] (UTC): ReviewQueueView (SpacedRepetition.tsx:502), UpcomingReviewsWidget (:300), and AddFlashcardForm's lastStudied/nextReview seed (:70). The rest of the app uses getISTEffectiveDate() (utils/time.ts:83-92), which is IST plus a configurable day-start hour. For an IST user (UTC+5:30), toISOString() returns the previous calendar date until ~05:30 IST, so topics whose nextReview is today by the app's own clock are not yet 'due' in the review screen (t.nextReview <= today fails), and freshly created cards get a nextReview that is a day behind the rest of the app.
- **Why It Matters:** The product spec mandates an IST effective date with a day-start rollover; the review feature ignores it. Due counts on the Dashboard (which use IST) can disagree with what the queue shows, and reviews surface a day late, undermining the spacing schedule the SM-2 logic worked to compute. It is a correctness bug that quietly degrades the only science-backed retention feature.
- **Recommended Fix:** Replace all toISOString()-based 'today' values in SpacedRepetition.tsx (and the duplicated streak/today logic in AIStudyAssistant.tsx:863) with getISTEffectiveDate() from utils/time.ts so SR shares the single canonical effective-date source.

#### 15. Unrecoverable 'Clear All Data' sits in the Quick Actions grid next to Export/Reset with equal weight and weak confirmation
`🟠 High` · Dangerous-action placement · impact: Data safety · ⟂ unverified

- **File:** `SettingsView.tsx:466-491`
- **Current Problem:** The Quick Actions row renders Export, Import, Reset, and Clear as four identical FrostedMini tiles in one grid (lines 466-490). 'Clear' (delete everything) is differentiated only by red tint. Its confirmation modal (1204-1254) is a single click on a button labelled 'Delete Everything' — there is no type-to-confirm, no checkbox, and no enforced 'export a backup first' step. 'Reset' (resetSettings) has NO confirmation at all and fires on a single click (line 469).
- **Why It Matters:** This is the only path to irreversible total data loss in a local-first app with no server backup. Putting it one tile away from the benign Export button, at the same size, invites misclicks; a single accidental tap + one more tap wipes all subjects, logs, plans and settings permanently. Industry norm for destructive, irreversible actions is high friction (type the word DELETE, or hold-to-confirm).
- **Recommended Fix:** Move Clear out of the Quick Actions grid into a visually separated 'Danger Zone' at the bottom of Settings. Require type-to-confirm (e.g. type 'DELETE') and offer a one-click 'Export backup first' button inside the confirm modal. Add at least a lightweight confirm to Reset.

#### 16. clearAllData calls localStorage.clear(), wiping app settings and any other keys, not just user data
`🟠 High` · Dangerous-action scope · impact: Data safety, Correctness · ⟂ unverified

- **File:** `SettingsView.tsx:250`
- **Current Problem:** After clearing the Dexie tables, clearAllData runs a blanket `localStorage.clear()` (line 250). The settings system stores AppSettings under 'orbit-settings-v2' in localStorage (SettingsContext.tsx:101,158), and time.ts/onboarding read other localStorage keys. The modal copy only promises 'All subjects, study logs, and settings will be permanently deleted' (line 1230) — it does not warn that it nukes the entire localStorage namespace, including the recovery snapshot the product treats as a safety net.
- **Why It Matters:** A nuclear localStorage.clear() is broader than the advertised scope and destroys the localStorage recovery snapshot the product owner describes as a safety net — meaning 'Clear Data' eliminates the very mechanism intended to protect against accidental loss. It can also clobber unrelated keys, producing inconsistent post-clear state on reload.
- **Recommended Fix:** Remove keys explicitly (localStorage.removeItem for the known orbit-* keys) instead of localStorage.clear(), and preserve or deliberately reset the recovery snapshot. Update the modal copy to state exactly what is removed.

#### 17. Fallback brain stubs feed fabricated metrics (quality 3.0, 0% skip, burnout score) into the UI as if real
`🟠 High` · Data integrity / vanity metrics · impact: Correctness, Learning outcomes · ⟂ unverified

- **File:** `Stats.tsx:31-56`
- **Current Problem:** getSubjectPerformance, detectBurnout and getEnergyProfile are module-level fallbacks with hardcoded values: avgCompletionRate 1.0, avgQuality 3, skipRate 0, durationRatio 1.0, and a burnout score derived only from unique-active-days/7 (lines 36-40, 49-54, 56). If './brain-enhanced-integration' fails to import, the .catch() branch at lines 614-618 silently swallows the error and calls fetchData() anyway, so these stubs populate state. The values then render as authoritative badges: 'Avg Quality {stat.avgQuality.toFixed(1)}' (1664), 'Skip Rate {(stat.skipRate*100).toFixed(0)}%' (1672), burnout 'Risk Score {burnoutSignals.score}/100' / 'Skip Rate' / 'Low Mood Days' (1916-1935), and the overview 'Health' tile shows 100 - burnout.score as a percentage (1277). Nothing in the UI distinguishes a measured value from a fabricated default.
- **Why It Matters:** A study planner's entire value proposition is trustworthy feedback. Presenting invented numbers (everyone gets quality 3.0/skip 0% if the enhanced module isn't loaded) as measured analytics actively misleads the user about their own performance and erodes trust in every other number on the screen. Because the failure is swallowed, neither the user nor a developer is told the data is fake.
- **Recommended Fix:** Track whether real analytics loaded (brainEnhancedLoaded AND import succeeded vs fell back). When using fallbacks, either hide the dependent badges (Avg Quality, Skip Rate, Burnout panel, Health tile) or render them in an explicit 'estimate / not enough data' state. Surface the import failure as a non-blocking toast rather than swallowing it at lines 614-618.

#### 18. Settings are split across two backends (localStorage AppSettings + Dexie settings), so Reset and Export are incoherent
`🟠 High` · Settings IA / data model · impact: Correctness, Maintainability, Data safety · ⟂ unverified

- **File:** `SettingsContext.tsx:101-122`
- **Current Problem:** User-facing configuration lives in two places. AppSettings (dayStartHour, defaultFocusDuration, breakDuration, audio, theme, etc.) is stored in localStorage under 'orbit-settings-v2' (SettingsContext.tsx:101,158). But weeklyTargetHours — a core study setting edited from Stats (Stats.tsx:562-563, 881, 1310) — lives in the Dexie 'settings' table (db.ts:14,21,268,278) and has no presence in AppSettings. Consequences: (1) 'Reset to defaults' (resetSettings, line 196-199; wired at SettingsView 469) resets only the localStorage object, silently leaving weeklyTargetHours untouched. (2) Export writes both `appSettings: settings` AND `data.settings: userSettings` as two separate blobs (SettingsView 133,137), and import re-applies both via different code paths (199 vs 204-213), creating two competing sources of truth.
- **Why It Matters:** Users reasonably expect one Settings screen, one Reset, one Export. Splitting config across localStorage and IndexedDB means 'Reset' is a half-reset, a backup/restore can desync the two stores, and the weekly study goal — arguably the single most important planner setting — isn't even visible in the Settings screen (it's hidden behind a click-to-edit affordance in Stats). This is a latent data-consistency bug and a discoverability failure.
- **Recommended Fix:** Unify the model: either move weeklyTargetHours into AppSettings, or move all study settings into the Dexie settings table. Make Reset and Export/Import operate over the single unified store. At minimum, surface weeklyTargetHours in Settings -> Study Preferences alongside the other study sliders.

#### 19. Streak and heatmap use UTC date strings while the app's effective date is IST — charts can show the wrong day
`🟠 High` · Data-viz correctness · impact: Correctness, Engagement · ⟂ unverified

- **File:** `Stats.tsx:399-404`
- **Current Problem:** calculateStreak builds its comparison date strings with `checkDate.toISOString().split('T')[0]` and `d.toISOString().split('T')[0]` (lines 399, 404) — i.e. UTC calendar days — yet seeds 'today' from getISTEffectiveDate() (line 392) and compares against todayStr. heatmapData also uses `d.toISOString().split('T')[0]` (line 756/760), while the momentum `series` for the very same screen uses formatLocalDate(d) (line 772). StudyLog.date is written via the IST-effective/local path. utils/time.ts explicitly warns 'Never use toISOString for logical dates' (line 46).
- **Why It Matters:** For an IST user studying late at night (after UTC midnight but before the app's day rollover), the streak counter and the heatmap can attribute a session to the wrong calendar cell or miss it entirely, breaking the streak or under-filling the heatmap. Streaks are the app's primary engagement mechanic; a streak that silently resets because of a timezone bug is a direct retention hit. The screen even renders two adjacent charts (heatmap vs momentum) on two different date bases.
- **Recommended Fix:** Replace every `toISOString().split('T')[0]` in Stats.tsx (lines 399, 404, 569, 756/760, 845, 946, 984) with formatLocalDate()/getISTEffectiveDate() so streak, heatmap and series all use the same IST-effective calendar that StudyLog.date is stored in.

#### 20. File uploads stored as base64 in IndexedDB with no size limit or feedback
`🟡 Medium` · Forms / data density · impact: Data safety, Productivity · ⟂ unverified

- **File:** `Courses.tsx:203-235, 806-809`
- **Current Problem:** processAndSaveFile reads any file via FileReader.readAsDataURL and stores the full base64 string in the subject's resources array (lines 207-229). The file input is multiple (line 806) and loops over all files. There is no size check, no per-file or total quota guard, and no upload progress. base64 inflates size ~33%, and the entire resources array is rewritten on every add/delete (db.subjects.update).
- **Why It Matters:** A student uploading a few lecture PDFs or a video can blow past IndexedDB quota; a failed write throws into a generic catch (line 231) showing only 'Failed to upload file' with no size guidance. Because everything lives in one Dexie row's array, large blobs also slow every subject mutation and the localStorage recovery snapshot. This is a latent data-bloat and reliability hazard surfaced through a CRUD flow with no guardrails.
- **Recommended Fix:** Enforce a per-file size cap with a clear toast, show upload progress, and consider storing blobs in a dedicated Dexie table (or as Blob, not base64) keyed by resource id rather than inline in the subject array.

#### 21. New-user empty state for Courses has no call-to-action (dead end)
`🟡 Medium` · Empty states · impact: User retention, Engagement · ⟂ unverified

- **File:** `Courses.tsx:988; EmptyStates.tsx:116-127`
- **Current Problem:** EmptyCourses accepts an optional onAddCourse that renders an 'Add First Subject' button (EmptyStates.tsx:121-125), but Courses.tsx renders <EmptyCourses /> with no prop (line 988). So a brand-new user with no subjects sees only a static 'No Subjects Yet' card with no button — and, per the no-subject-CRUD finding, no other add path exists on this screen at all.
- **Why It Matters:** The first-run Courses experience is a complete dead end: the user is told to add a subject but given no control to do so anywhere on the page. This contrasts sharply with ProjectsView's empty state, which has a working 'Create first project' button (ProjectsView.tsx:897). It strands new users and undercuts activation.
- **Recommended Fix:** Once subject-add exists, pass onAddCourse to EmptyCourses so the empty state launches the new-subject form.

#### 22. Grade form accepts invalid scores (score > max, negatives) and silently skews averages
`🟡 Medium` · Forms / validation · impact: Correctness, Learning outcomes · ⟂ unverified

- **File:** `Courses.tsx:258-277, 642-686`
- **Current Problem:** addGrade only checks newGrade.type and newGrade.score are truthy (line 259). score and maxScore are parseFloat'd (267-268) with no bound checks: score can exceed maxScore, be negative, or maxScore can be 0 (→ division by zero → Infinity/NaN in calculateGPA line 199 and the per-grade % at line 725). The number inputs (655, 663) have no min/max. There is also no edit for a saved grade — only delete (728).
- **Why It Matters:** Grades feed calculateGPA (line 197), the per-subject Avg Score stat (line 540), and the aggregate weighted-GPA banner (lines 993-1010). A fat-fingered '95/10' or a maxScore of 0 corrupts the GPA that students rely on to gauge standing, with no way to edit the bad entry — they must delete and re-add.
- **Recommended Fix:** Validate score >= 0, maxScore > 0, and warn (or clamp) when score > maxScore. Guard calculateGPA against maxScore<=0. Add an edit affordance for existing grades.

#### 23. Logging more minutes than the estimate silently discards the overage and freezes progress at 100%
`🟡 Medium` · Project tracking UX · impact: Correctness, Engagement · ⟂ unverified

- **File:** `ProjectsView.tsx:284-291`
- **Current Problem:** save() computes newDone = Math.min(total, done + m) (line 290), clamping completed minutes to the original estimate. The sessionLog stores the true minutes (line 290 log array), but completedEffortMinutes can never exceed totalEffortMinutes. getPct (line 87) also Math.min(100,...). So once a project hits its estimate, every further logged session shows '+Xm logged' (toast line 292) yet the bar stays at 100% and getRemaining (line 90) stays 0.
- **Why It Matters:** Real projects routinely overrun estimates. Users who diligently log extra hours see the progress bar and 'X left' frozen, making the tracker feel broken and discouraging continued logging. The displayed 'invested' time on the card (fmtMins(done)) also understates actual effort because done is capped.
- **Recommended Fix:** Do not clamp completedEffortMinutes to total; allow >100% effort (or surface 'over by Xm'). Keep getPct visually capped at 100% but compute remaining/over honestly so logged work is never silently lost.

#### 24. Project delete uses native confirm() — inconsistent, unstyled, and unreliable
`🟡 Medium` · Destructive actions · impact: Data safety, User retention · ⟂ unverified

- **File:** `ProjectsView.tsx:862-865`
- **Current Problem:** handleDelete uses the browser's blocking window.confirm('Delete this project?'). This is the only confirmation pattern in either file and clashes with the app's custom FrostedTile modals (ProjectForm, LogModal, Ceremony). Native confirm() is suppressible by browsers ('prevent this page from creating additional dialogs'), is unstyled, and cannot offer undo.
- **Why It Matters:** A project carries the most data of any deletable entity (milestones + full sessionLog + notes). Relying on a dialog the browser can silently disable means a user who checked that box deletes projects with no guard at all. The jarring OS dialog also breaks the polished visual language and is easy to dismiss reflexively.
- **Recommended Fix:** Replace with a styled confirm modal consistent with ProjectForm, and/or perform an optimistic delete with a toast-undo (re-add the captured Project on undo). Mention 'this also deletes N logged sessions' for clarity.

#### 25. Milestone-based vs effort-based progress conflict: LogModal preview lies when milestones exist
`🟡 Medium` · Project tracking UX · impact: Correctness, Engagement · ⟂ unverified

- **File:** `ProjectsView.tsx:81-88, 285, 332-339`
- **Current Problem:** getPct uses milestone completion when milestones exist, ignoring logged effort entirely (lines 82-83). But LogModal computes its 'After logging' preview purely from effort: prev = (done + m)/total (line 285) and renders it as the resulting % (lines 334, 338). For any project with milestones, this preview is disconnected from the card's actual percentage — logging time will not move the card's number at all.
- **Why It Matters:** The Log modal promises 'After logging → 64%' but the card stays at the milestone percentage. Users see their logged session produce no progress movement, which reads as a bug and erodes trust in the whole tracking model. The two progress definitions are never reconciled in the UI.
- **Recommended Fix:** Make LogModal aware of the progress source: if milestones drive progress, show 'minutes logged' without an effort-% projection, or blend the models explicitly. Surface in the card which metric is authoritative.

#### 26. Logged work sessions cannot be edited or deleted — mistakes are permanent and inflate stats
`🟡 Medium` · CRUD completeness · impact: Correctness, Data safety · ⟂ unverified

- **File:** `ProjectsView.tsx:287-294, 669-687`
- **Current Problem:** LogModal only appends to sessionLog (line 290). The Session History panel (lines 669-687) renders entries read-only with no per-row edit or delete. A mistyped duration (e.g. '300' instead of '30') is permanent and also irreversibly bumps completedEffortMinutes (line 291).
- **Why It Matters:** Session minutes feed completedEffortMinutes, getPct, the per-card week heatmap (weekActivity line 105), the 'This Week' hours stat (line 800), and the neglected sort (line 818). A fat-fingered entry permanently corrupts all of these with no correction path, and there is no undo on the log action itself.
- **Recommended Fix:** Add delete/edit on each Session History row (recompute completedEffortMinutes accordingly) and a toast-undo on logging.

#### 27. Syllabus units cannot be deleted or edited — a typo is permanent
`🟡 Medium` · CRUD completeness · impact: Productivity, Correctness · ⟂ unverified

- **File:** `Courses.tsx:354-378, 577-598`
- **Current Problem:** The syllabus supports addUnit (line 364) and toggleSyllabus complete/incomplete (line 354), but there is no remove or rename. Each unit row (line 584) only toggles completion on click; there is no delete button and no edit. Compare with resources/grades which at least have delete buttons.
- **Why It Matters:** Syllabus completion directly drives computeProgress (Courses.tsx:188-192) and the headline subject percentage shown on every card (line 1048). A mistyped or duplicate unit permanently skews the progress denominator and can never be corrected, polluting the core 'how done am I' metric the whole view is built around.
- **Recommended Fix:** Add a hover delete (with undo) and inline rename to each syllabus row, mirroring the milestone row pattern in ProjectsView (which at least supports delete).

#### 28. Dashboard area renders nothing (no loader/fallback) when today's plan is briefly null
`🟡 Medium` · Loading / empty states · impact: User retention, Correctness · ⟂ unverified

- **File:** `index.tsx:774`
- **Current Problem:** Main content is gated on `activeTab === 'dashboard' && todayPlan` with no else branch. When todayPlan is null but needsContext is false, the <main> dashboard slot is empty. This occurs after rollover (line 601 explicitly setTodayPlan(null) before context regenerates), and if plan generation/load fails (handleContextGenerate only shows an error toast at 419 and leaves todayPlan null). There is no global app loading screen for this state.
- **Why It Matters:** The user lands on the app's home screen and sees a blank void with only the floating nav — no spinner, no message, no retry. On a load failure the only signal is a 5-second toast that may already be gone. It reads as a broken app on the most important screen.
- **Recommended Fix:** Add an explicit dashboard fallback: a loading skeleton while plan is resolving and an error/empty state with a 'Generate today\'s plan' or 'Retry' CTA when todayPlan is null and not in onboarding.

#### 29. Core block actions use native confirm() dialogs inconsistent with the app's modal/toast system
`🟡 Medium` · Affordances / consistency · impact: Productivity, Engagement · ⟂ unverified

- **File:** `Dashboard.tsx:1623`
- **Current Problem:** Mark-complete (Dashboard.tsx:1623 confirm('Mark as complete?')), move-to-tomorrow (1632 confirm('Move to tomorrow?')), and backlog swipe-delete (135 confirm('Remove from backlog?')) all use the browser's blocking native confirm(). The rest of the app uses custom frosted modals and toasts. confirm() blocks the JS thread and looks like a system error dialog.
- **Why It Matters:** Native dialogs break the visual language entirely, can't be styled, are jarring on mobile, and block the event loop. For mark-complete the friction is especially poor since the action is trivially reversible via the undo toast — gating it behind a blocking OS prompt adds a click for no safety benefit.
- **Recommended Fix:** Replace confirm() with the existing toast-undo pattern (complete immediately + UNDO) or a custom in-app confirmation consistent with the app's modals. Reserve confirmation for genuinely destructive, non-undoable actions.

#### 30. The single next action is pushed below three stacked AI/insight surfaces
`🟡 Medium` · Visual hierarchy / density · impact: Productivity, Engagement · ⟂ unverified

- **File:** `Dashboard.tsx:1329-1342`
- **Current Problem:** Render order is: PageHeader → MessageCarousel (1329) → DashboardInsights (1333) → AIInsightBanner (1335) → ScheduleOptimizer (1337) → only then the 'Next Mission' / Start Focus card (1339-1342). The primary action — start the next block — sits beneath an auto-scrolling carousel and two separate AI insight components before it appears, especially punishing on a single-column mobile layout.
- **Why It Matters:** The dashboard is mission control for the daily loop; the one thing a user opens it to do is start the next block. Burying that CTA under decorative/advisory content forces scrolling and dilutes focus. The nav also has a 'Start Focus' CTA (index.tsx:733), so the primary action is duplicated yet still not prominent in the page body.
- **Recommended Fix:** Promote the Next Mission card to the top of the dashboard body (directly under the header). Collapse the three insight surfaces into one, and place advisory content below the fold.

#### 31. User cannot finish logging a session until the AI coaching tip resolves
`🟡 Medium` · Loading states / friction · impact: Productivity, User retention · ⟂ unverified

- **File:** `QualityRatingModal.tsx:218`
- **Current Problem:** After picking a star rating, the Continue button is disabled while loadingTip is true (QualityRatingModal.tsx:218-219, label 'Getting your tip…'). fetchTip calls Gemini (fetchCoachingTip, line 7) on every rating selection. If the network is slow, the user is trapped on the rating screen unable to complete their own session log until the tip request resolves or errors.
- **Why It Matters:** The user has done the work and just wants to log it and move on; making the mandatory 'Continue' wait on an optional, non-essential AI tip is backwards friction on the highest-frequency action in the loop. A flaky connection turns every completion into a forced wait.
- **Recommended Fix:** Never block Continue on the tip — let the user proceed immediately and let the tip stream in if/when it arrives (or skip it). Only disable Continue on the actual save, not the advisory fetch.

#### 32. Three overlapping AI/insight surfaces compete for the same screen real estate
`🟡 Medium` · Density / visual hierarchy · impact: Engagement, Productivity · ⟂ unverified

- **File:** `Dashboard.tsx:1333-1335`
- **Current Problem:** DashboardInsights (weekly Gemini cards), AIInsightBanner (daily Gemini insight), and the MessageCarousel of status tiles all render consecutively, each with its own loading state, refresh button, and Sparkles iconography. AIInsightBanner shows a loading skeleton (AIInsightBanner.tsx:286) while DashboardInsights shows an 'Analysing your week…' spinner (DashboardInsights.tsx:215) — potentially two AI spinners stacked at once on first load.
- **Why It Matters:** Visually they read as duplicates ('AI Insights' vs 'Smart Tip' vs carousel tiles), creating redundancy and cognitive load without a clear hierarchy of which to act on. Two simultaneous AI spinners make the dashboard feel slow and busy before the user can even see their plan.
- **Recommended Fix:** Consolidate into a single insights region with one loading state, or stagger/defer the lower-priority surface until the primary content is visible. Differentiate clearly (daily vs weekly) if both are kept.

#### 33. Undo for destructive actions (drop / complete) auto-dismisses in 5 seconds
`🟡 Medium` · Feedback / affordances · impact: Data safety, Productivity · ⟂ unverified

- **File:** `Toast.tsx:46`
- **Current Problem:** showToast defaults duration to 5000ms (Toast.tsx:46) and success() passes no override (53-55). The 'Block dropped — planner will recover it tomorrow' toast (Dashboard.tsx:1147) and 'Block marked complete' undo (1104) therefore disappear after 5s. Errors get 7s and warnings 6s, but the undo-bearing success toasts get the shortest-tier 5s.
- **Why It Matters:** Undo is the app's stated safety pattern for important/destructive actions, yet the window to actually use it is the shortest. Drop removes a block from today and relies on tomorrow's recovery; if the user looks away for 5s the only quick reversal is gone. Toasts also stack centered at the bottom with no queue management, so rapid actions can bury an undo before it's seen.
- **Recommended Fix:** Give undo-bearing toasts a longer duration (e.g., 8-10s) or pause-on-hover, and ensure they are not pushed off-screen by subsequent toasts.

#### 34. Daily Context modal has aria-modal but no Escape or backdrop dismissal
`🟡 Medium` · Keyboard / dismissal behavior · impact: Productivity, Engagement · ⟂ unverified

- **File:** `DailyContextModal.tsx:368`
- **Current Problem:** The modal declares role="dialog" aria-modal="true" (DailyContextModal.tsx:368) but implements no keydown/Escape listener and the backdrop div (DailyContextModal.tsx:369) has no onClick. The only ways out are 'Skip for Now' (DailyContextModal.tsx:702-714) and 'Initialize Day'. Standard dialog conventions (Escape to close, backdrop to dismiss) are absent, contradicting the aria-modal contract.
- **Why It Matters:** Users expect Escape to dismiss a dialog; here it silently fails, which feels broken. While 'Skip for Now' exists as an out, the missing keyboard affordance is an accessibility and consistency gap — and it is inconsistent with the X-based dismissal patterns used in the other modals.
- **Recommended Fix:** Add an Escape handler that triggers the same path as 'Skip for Now', and optionally a visible close affordance, so the dialog honors its aria-modal contract.

#### 35. 'Skip for Now' ignores critical-subject warnings and the user's own preset/energy choices
`🟡 Medium` · Defaults / friction · impact: Learning outcomes, Correctness · ⟂ unverified

- **File:** `DailyContextModal.tsx:702`
- **Current Problem:** The 'Skip for Now' button always calls onGenerate({ mood: 'normal', dayType: 'normal', isHoliday: false, isSick: false }) (DailyContextModal.tsx:703-710), hardcoding a normal day. It discards any preset the user already tapped, any energy override, and — critically — it does not factor in the Critical Subjects alert shown directly above (DailyContextModal.tsx:395-416). focusSubjectId auto-set to the most-critical subject (267-276) is thrown away.
- **Why It Matters:** The modal prominently warns about subjects in 'critical' decay, then offers a one-tap escape that generates a generic plan ignoring that warning. A rushed user takes the easy out and gets a plan that does not prioritize the very subjects the app just flagged as urgent — undermining the planner's main value.
- **Recommended Fix:** Have 'Skip for Now' respect already-selected state, or relabel it 'Use smart defaults' and feed the detected critical subject / readiness into the generated plan so skipping still produces a sensible, decay-aware plan.

#### 36. Daily Context modal overloads a daily ritual with redundant decisions (presets + day-type + energy + life events + assignments)
`🟡 Medium` · Form friction / decision load · impact: Engagement, Productivity, User retention · ⟂ unverified

- **File:** `DailyContextModal.tsx:381`
- **Current Problem:** Every day the modal presents: a 6-tile preset grid (DailyContextModal.tsx:419-439), a separate 4-way Day Type selector (442-444), conditional exam-subject + days-until-exam fields (447-482), an ESA exam-schedule sub-form (485-557), and an Advanced accordion containing Energy Override, Life Events (Holiday/Sick/Bunked), and an inline Assignment creator (575-697). Presets already set mood+dayType+holiday+sick (handlePresetSelect, 282-292), yet the same dimensions are independently editable below, so the controls overlap and conflict (handleDayTypeChange even silently deselects the chosen preset, 294-301).
- **Why It Matters:** This is a screen the user must clear before reaching their plan, every single study day. Presenting 4-5 overlapping decision surfaces for a routine 'start my day' action is heavy friction that discourages daily use — the core retention loop for a study planner. The preset/day-type conflict also makes the UI feel like it's fighting the user.
- **Recommended Fix:** Make presets the primary one-tap path (tap a preset → Initialize). Collapse day-type/energy/events strictly under Advanced for the minority of days that need them, and resolve the preset-vs-daytype conflict so changing one doesn't silently undo the other.

#### 37. Week Preview shows hardcoded/misleading metrics and a false 'Session Data Encrypted' claim
`🟡 Medium` · Copy clarity / actionability / trust · impact: Correctness, User retention · ⟂ unverified

- **File:** `WeekPreviewModal.tsx:172`
- **Current Problem:** The 'Subject Saturation' metric is binary theatre: it renders '100%' if neglectedProjects.length === 0 else 'Normal' (WeekPreviewModal.tsx:172-175) — not a real percentage. The 'Operational Tip' is a hardcoded template string about working before 14:00 regardless of the user's actual schedule (WeekPreviewModal.tsx:199-201). The footer asserts 'Session Data Encrypted' (WeekPreviewModal.tsx:215) although this is a local-first IndexedDB app with no encryption layer. Meanwhile genuinely useful DayPreview fields the type exposes — subjectBreakdown, reviewsDue, urgentAssignments, projects (types.ts:217-220) — are never displayed in the timeline.
- **Why It Matters:** A 'Weekly Strategy / Operational Intel' screen that presents fake percentages, a canned tip, and an untrue encryption badge is not actionable and actively misleads the user about both their week and their data security. The real per-day breakdown and reviews-due data that would make the screen useful is computed and then dropped.
- **Recommended Fix:** Replace the binary saturation with a real metric, derive the tip from actual peak-day data, remove the false 'Encrypted' claim, and surface subjectBreakdown/reviewsDue/urgentAssignments so the preview is genuinely actionable.

#### 38. Week Preview modal can only be closed via the X — no Escape, no backdrop click
`🟡 Medium` · Keyboard / dismissal behavior · impact: Productivity, Engagement · ⟂ unverified

- **File:** `WeekPreviewModal.tsx:41`
- **Current Problem:** WeekPreviewModal renders a full-screen portal overlay (WeekPreviewModal.tsx:40-48) whose backdrop has no onClick, and the component registers no keydown/Escape handler. The only dismissal is the X button (WeekPreviewModal.tsx:72-77). The parent (Dashboard.tsx:1686-1691) passes only onClose and adds no Escape wiring either.
- **Why It Matters:** This is a read-only informational overlay — exactly the kind of modal users expect to dismiss with Escape or by clicking outside. Forcing a precise click on a small corner X is needless friction and inconsistent with platform conventions.
- **Recommended Fix:** Wire Escape and backdrop click to onClose for this purely informational modal.

#### 39. Three spaced-repetition UI components are exported but never used (dead code)
`🟡 Medium` · Maintainability / dead code · impact: Maintainability, Engagement · ⟂ unverified

- **File:** `SpacedRepetition.tsx:204 (ComprehensionRatingModal), 299 (UpcomingReviewsWidget), 421 (TopicMasteryCard)`
- **Current Problem:** ComprehensionRatingModal (SpacedRepetition.tsx:204), UpcomingReviewsWidget (:299), and TopicMasteryCard (:421) are exported but a repo-wide search (*.tsx and *.ts) finds only their definitions — no import sites anywhere. UpcomingReviewsWidget and TopicMasteryCard are exactly the surfaces that would make reviews visible on the Dashboard/Stats, but they are wired nowhere, which is also why reviews feel orphaned.
- **Why It Matters:** These components represent finished UX that could fix the discoverability gap (uxor-review-queue-unreachable) almost for free, yet they sit unused, adding maintenance weight and confusing future readers about what is actually live. Their existence shows the integration was never completed.
- **Recommended Fix:** Either mount UpcomingReviewsWidget on the Dashboard and TopicMasteryCard in Stats (and decide whether ComprehensionRatingModal is superseded by the inline rating in ReviewQueueView), or delete them. Do not leave shipped-looking but unreferenced UX in the tree.

#### 40. New AI flashcards are scheduled as due immediately with reviewCount 0, conflating 'never reviewed' with 'reviewed once'
`🟡 Medium` · Correctness / SR data model · impact: Correctness, Learning outcomes · ⟂ unverified

- **File:** `SpacedRepetition.tsx:72-82; brain.ts:580-588; SpacedRepetition.tsx:652`
- **Current Problem:** AddFlashcardForm creates a topic with reviewCount: 0 and nextReview = today (SpacedRepetition.tsx:77-82), so a brand-new card is immediately 'due'. In contrast, recordTopicReview creates a topic with reviewCount: 1 after a real review (brain.ts:586). The two creation paths disagree on what reviewCount means. ReviewQueueView then displays 'Review #{current.reviewCount + 1}' (SpacedRepetition.tsx:652), so a never-reviewed manual card shows 'Review #1' identically to a card that has actually been reviewed once, and there is no distinct 'new card' state.
- **Why It Matters:** Inconsistent counters make the SM-2 interval math and the mastery/history UI ambiguous and harder to trust or extend, and users get no signal distinguishing brand-new cards from ones they have already studied. It is a latent correctness/clarity bug in the core SR data model created by having two divergent topic-creation sites.
- **Recommended Fix:** Unify topic creation through a single helper and define reviewCount consistently (e.g. 0 = not yet reviewed). Render a 'New' badge for reviewCount === 0 instead of 'Review #1', and ensure the first-review interval branch keys off the same convention.

#### 41. Onboarding is a long 4-step flow that forces full timetable placement before any value, with no skip
`🟡 Medium` · Onboarding friction · impact: User retention, Productivity · ⟂ unverified

- **File:** `Onboarding.tsx:466-481, 676-681, 446-464, 922-1047`
- **Current Problem:** The flow is four steps (Onboarding.tsx step gates at :676-681): mission params, subjects, the timetable grid, then projects. Step 3 (The Grid, :922-1047) requires the user to place EVERY subject into at least one timetable cell to proceed — validateTimetable (:446-464) blocks Continue until no subject is unplaced (canProceed :679). There is no 'skip for now' or minimal path; only step 4 (projects) is optional. The component is ~1400 lines and the timetable is the heaviest interaction.
- **Why It Matters:** Mandatory, granular timetable entry for all subjects is the highest-friction part of setup and the most likely abandonment point, especially on mobile where each cell tap opens a modal (:1081). For users who just want to try the app, forcing a complete schedule before they can reach the dashboard raises the activation bar substantially.
- **Recommended Fix:** Make timetable placement optional or deferrable (allow Continue with a soft warning and let users fill the grid later from ScheduleView), and consider collapsing to a leaner core (semester + subjects) with schedule/projects as optional post-onboarding steps. Pair with draft persistence (see uxor-onboarding-not-resumable).

#### 42. Onboarding ends without generating a first daily plan — time-to-first-value depends on discovering a separate modal
`🟡 Medium` · Time-to-first-value / activation · impact: User retention, Engagement · ⟂ unverified

- **File:** `Onboarding.tsx:644-646, 1356-1363; index.tsx:560-565`
- **Current Problem:** finishOnboarding writes semester/subjects/schedule/projects and calls onComplete (Onboarding.tsx:644-646); the 'Launch Orbit' button (:1356-1363) drops the user on the dashboard (index.tsx:563). Onboarding never generates a daily plan and never points the user at the Daily Context modal that does. So after a long setup the dashboard has no study blocks until the user independently discovers and runs the plan-generation flow.
- **Why It Matters:** The single most important first-run payoff for a study planner is seeing a plan for today. Collecting subjects and a timetable but stopping short of producing any blocks leaves a freshly-onboarded user staring at an empty dashboard, the classic 'now what?' moment that kills activation. The data needed for a plan has just been collected, so the gap is purely a missing hand-off.
- **Recommended Fix:** At the end of onboarding, either auto-open the Daily Context modal or generate a starter plan and route to the dashboard with blocks visible, so the first thing the user sees is today's plan rather than an empty state.

#### 43. Onboarding progress is volatile React state — a refresh or accidental close restarts from step 1
`🟡 Medium` · First-run resilience · impact: User retention, Productivity · ⟂ unverified

- **File:** `Onboarding.tsx:406-438, 597-651`
- **Current Problem:** All onboarding inputs (step, semester, subjects, projects, the full timetable grid) are plain useState (Onboarding.tsx:406-438) with no localStorage/sessionStorage persistence (grep confirms no persistence of step/form state). Nothing is written to the DB until finishOnboarding runs at the very end (:597-651). A page refresh, tab crash, or accidental navigation during the 4-step flow wipes everything and drops the user back at step 1.
- **Why It Matters:** This is a long, data-entry-heavy flow (adding multiple subjects and hand-placing every class in a timetable). Losing all of it to a stray refresh is a high-friction failure right at the make-or-break first session, a common driver of first-run abandonment. There is also no way to deliberately pause and resume.
- **Recommended Fix:** Persist a draft of the onboarding state (step + form fields) to localStorage on change and rehydrate on mount, clearing it after finishOnboarding succeeds. This makes the flow crash-safe and resumable with minimal effort.

#### 44. Returning users with months of history see the full 'no data' empty state on the default week view
`🟡 Medium` · Empty/low-data states · impact: User retention, Engagement · ⟂ unverified

- **File:** `Stats.tsx:666`
- **Current Problem:** The empty-state gate is `if (filteredLogs.length === 0)` (line 666), where filteredLogs is filtered by the currently selected timeRange (default 'week', line 545; rangeStart computed at 647-656). A user who has lots of historical logs but didn't study in the last 7 days lands on Analytics and gets the full EmptyStats screen ('start studying', dispatching navigate-to-dashboard, lines 666-675) — their entire history is hidden behind the default range, with no hint to widen the range to 'all'.
- **Why It Matters:** Telling an experienced user 'no data, go start studying' when they actually have months of analytics is jarring and makes the app look broken or like it lost their data. It also buries the one action that would help (switch range), because the range selector is only rendered after the empty-state early-return.
- **Recommended Fix:** Gate the full empty state on total logs (logs.length === 0), not the time-filtered subset. When the selected range is empty but history exists, render the normal chrome (range selector) plus a lightweight in-context 'No sessions in this period — try a longer range' message with a button that sets timeRange to 'all'.

#### 45. Analytics presents dozens of metrics with little prioritization; many numbers don't explain themselves
`🟡 Medium` · Metric overload / readability · impact: Productivity, Learning outcomes · ⟂ unverified

- **File:** `Stats.tsx:1188-1292`
- **Current Problem:** Across four view modes the screen stacks focusScore (a weighted composite at lines 687-698: 0.4 consistency + 0.3 quality + 0.3 time, never explained to the user), a 'Health' percentage = 100 - burnout.score (1277), consistency %, optimalDuration, completionRate, avgQuality, readiness decay %, durationRatio, skip rate, streaks, peak hours, etc. The overview tiles use cryptic truncated labels ('Study', 'Rate', 'Health') with secondary lines like '{totalSessions} • {avgSessionMinutes}m' (1202) and '{avgQuality}/5' (1243) and no units/legend. focusScore is shown as a bare 0-100 number on each subject (1602) with only Excellent/Good/Fair labels, no tooltip on how it's derived.
- **Why It Matters:** Composite scores with hidden formulas ('Focus Score', 'Health %') read as vanity metrics — the user can't tell what action changes them, which defeats the stated goal of 'actionable insight.' Dense, abbreviated tiles increase cognitive load and make it hard to find the few numbers that actually drive behavior (hours vs goal, streak, what to study next).
- **Recommended Fix:** Demote composites: add tooltips/info affordances explaining how Focus Score and Health are computed, lead the overview with 1-2 decision-driving metrics (progress to weekly goal, what to study next), and move the long tail (durationRatio, decay, etc.) behind a 'details' disclosure. Give every number a unit/legend.

#### 46. ~1500-line Settings screen has no search and a single-open accordion, hurting discoverability
`🟡 Medium` · Settings IA / discoverability · impact: Productivity, User retention · ⟂ unverified

- **File:** `SettingsView.tsx:28`
- **Current Problem:** Settings is organized as six collapsible SettingSections (Notifications, Study, Audio, Privacy, Display, Developer). expandedSection is a single string (line 28) and toggleSection collapses any other open section (lines 261-263), so only ONE section can be open at a time. There is no search/filter input anywhere in the screen. Finding a given control (e.g. Day Start Time) requires knowing it lives under 'Study Preferences' and expanding that accordion, with everything else hidden.
- **Why It Matters:** For a screen with this many controls, single-open accordions force constant expand/collapse and make scanning impossible; users can't see two related settings side by side, and there's no way to jump to a setting by name. This is high friction for a screen users visit specifically to change one thing.
- **Recommended Fix:** Add a settings search/filter box at the top that highlights or filters matching rows across sections, and allow multiple sections to be open at once (use a Set of expanded ids, as Stats.tsx already does at line 551).

#### 47. Several persisted settings (advanced.*, longBreakInterval, showProgressPercentage, shareUsageData) have no UI
`🟡 Medium` · Settings IA · impact: Maintainability, Correctness · ⟂ unverified

- **File:** `SettingsContext.tsx:40-45`
- **Current Problem:** AppSettings defines and persists an entire `advanced` group (enableExperimentalFeatures, debugMode, autoBackup, backupFrequency — lines 40-45,83-88), plus study.longBreakInterval (18,61), display.showProgressPercentage (33,76) and privacy.shareUsageData (38,81). A content search of SettingsView.tsx for `advanced.`, `longBreakInterval`, `showProgressPercentage`, and `shareUsageData` returns zero matches — none of these are exposed in the Settings UI. Notably 'autoBackup'/'backupFrequency' imply a backup feature that the UI never lets users enable.
- **Why It Matters:** Dead settings are a maintenance and trust hazard: they ship defaults that can never be changed, advertise capabilities (auto-backup) that don't exist for users, and bloat the export payload with meaningless keys. A reader of the type definition reasonably assumes these are configurable; they are not.
- **Recommended Fix:** Either build UI for the settings that should be user-facing (especially autoBackup, which directly supports the local-first data-safety story) or delete the unused fields from AppSettings and DEFAULT_SETTINGS to keep the model honest.

#### 48. Dead imports and an orphaned PredictionModal-vs-stat-bug signal unmaintained CRUD surface
`⚪ Low` · Maintainability · impact: Maintainability · ⟂ unverified

- **File:** `Courses.tsx:15, 13-20`
- **Current Problem:** Courses.tsx imports safeDB and withToast from utils/dbErrorHandler (line 15) but neither is used — every DB call goes through raw db.subjects.update with no error handling (e.g. addGrade at 261, removeResource at 281, addUnit at 366 have no try/catch, unlike processAndSaveFile). So resource/grade/unit add/delete failures are silently swallowed with a premature success toast. The file also carries the broader mojibake/encoding damage noted project-wide.
- **Why It Matters:** The unused safeDB/withToast indicate the safe-write pattern was intended for these CRUD operations but never wired in. addGrade/addUnit/removeResource/toggleSyllabus fire toast.success unconditionally even if the Dexie write rejects, so a user can be told 'Grade added' when nothing persisted — a subtle correctness/data-trust gap in the CRUD layer.
- **Recommended Fix:** Route subject mutations through the existing safeDB/withToast wrapper (or add try/catch) and only toast success after the write resolves. Remove the imports if the wrapper is truly unwanted.

#### 49. 'Mark done' completes a project regardless of open milestones, with no warning
`⚪ Low` · Project tracking UX · impact: Correctness, Productivity · ⟂ unverified

- **File:** `ProjectsView.tsx:867-875, 575-578`
- **Current Problem:** handleToggle sets completed:true immediately (line 869) and triggers the Ceremony, with no check on unfinished milestones or remaining effort. The 'Mark done' menu item (line 577) and the Kanban 'Done' button (line 754) both call it directly.
- **Why It Matters:** A user can mark a project complete with 1/5 milestones done; the celebratory Ceremony fires and the card greys out at the milestone-derived percentage (which getPct does NOT force to 100 on completion). The result is a 'Complete' project showing e.g. 20%, a confusing state with no guard or prompt to auto-complete remaining milestones.
- **Recommended Fix:** When milestones remain, prompt 'Mark all milestones done too?' or at least confirm. On completion, optionally snap displayed progress to 100% for consistency with the Complete column.

#### 50. Milestone/edit controls are sub-10px hover-only targets — poor scannability and accessibility
`⚪ Low` · List/table density · impact: Productivity, User retention · ⟂ unverified

- **File:** `ProjectsView.tsx:178-184, 471-473`
- **Current Problem:** Milestone delete uses X size={9} (line 183) revealed only on group hover (opacity-0 group-hover/ms:opacity-100), and the in-form milestone remove is X size={9} too (line 472). Milestone titles cannot be edited at all (the Milestones component at 146-199 supports only add/toggle/delete). The whole project card runs at 9-13px font (e.g. text-[9.5px] tab labels line 636, [11px] titles line 553).
- **Why It Matters:** 9px hover-only icons are below comfortable touch/click targets and are invisible on touch devices (no hover), making milestone deletion effectively undiscoverable on mobile despite the otherwise mobile-aware layout. The uniformly tiny type maximizes density but hurts scannability for the project's most-used actions. A typo'd milestone can only be deleted+re-added, never edited.
- **Recommended Fix:** Increase delete hit areas to >=24px, make destructive controls visible (not hover-gated) on touch, and add inline rename for milestones.

#### 51. Critical status info lives only in an always-moving auto-scroll carousel
`⚪ Low` · Interaction quality / accessibility · impact: Productivity, Engagement · ⟂ unverified

- **File:** `Dashboard.tsx:222-246`
- **Current Problem:** MessageCarousel continuously translates via requestAnimationFrame (Dashboard.tsx:222-246), faster on mobile (speed 0.17). It only pauses on hover (desktop) or touch (mobile, then resumes after 2s, line 257). High-priority tiles like 'Critical Attention Required' (criticalSubjects) and 'High-Intensity Day' are rendered exclusively here, so the most urgent daily info is perpetually drifting.
- **Why It Matters:** Constant motion impedes reading, is an accessibility concern (no respect for prefers-reduced-motion), and putting critical warnings in a moving strip means a user may never catch them. Auto-advancing carousels are a well-known engagement anti-pattern for actionable content.
- **Recommended Fix:** Show the top 1-3 tiles statically (the SidebarTiles pattern already exists at line 285), or at minimum honor prefers-reduced-motion and don't auto-scroll the highest-priority/critical tile.

#### 52. Completion summary auto-dismisses on a timer with no way to dismiss or hold it
`⚪ Low` · Success states / affordances · impact: Engagement, Productivity · ⟂ unverified

- **File:** `FocusSession.tsx:482-485`
- **Current Problem:** After rating, the success summary (duration/quality/readiness gain/AI tip) shows, then a setTimeout fires onComplete after 3500ms (or 4500ms if an AI tip is present) — FocusSession.tsx:482-485. The summary card has no Done/Continue button and no dismiss control; the user cannot leave early nor keep it open to read the AI tip.
- **Why It Matters:** This is the reward moment of the loop. A fixed timer means impatient users are stuck watching it, while users who glance away miss the readiness gain and tip entirely. No agency over the most positive feedback screen in the app.
- **Recommended Fix:** Add an explicit 'Done' button to dismiss immediately, and a 'Keep open' affordance (or pause the auto-dismiss on hover/focus) so users can read the AI tip at their own pace.

#### 53. Plan-generating overlay fakes a timed progress bar and brand-version churn ('Brain v3' vs footer 'v4.0.1')
`⚪ Low` · Honesty / feedback · impact: Engagement, Maintainability · ⟂ unverified

- **File:** `DailyContextModal.tsx:33`
- **Current Problem:** PlanGeneratingOverlay (DailyContextModal.tsx:33-148) drives a progress bar and five staged messages purely on timers (setInterval at 60ms/2200ms, lines 42-49), unrelated to actual generation progress, and caps at 98% (line 110). It labels itself 'Orbit Brain v3' (line 118) while the Week modal footer says 'Orbit Forecast Engine v4.0.1' (WeekPreviewModal.tsx:219) — inconsistent invented version numbers. If generation is fast the staged narrative ('Running the triple-brain algorithm…') is pure fiction; if slow, the bar stalls near 98% conveying nothing.
- **Why It Matters:** Fake progress and stage text degrade trust when users notice the bar isn't tied to anything, and the conflicting version strings signal an unmaintained, theatrical UI. It's polish-level but contributes to a 'looks impressive, means nothing' impression.
- **Recommended Fix:** Either show a simple honest spinner ('Generating your plan…') or tie the bar to real generation milestones, and centralize the product/version string so it is consistent across modals.

#### 54. Day-start rollover defaults to 4 AM, not the product-specified 2 AM, shifting the daily-modal trigger window
`⚪ Low` · Defaults / correctness · impact: Correctness · ⟂ unverified

- **File:** `utils/time.ts:41`
- **Current Problem:** getDayStartHour() returns a default of 4 (utils/time.ts:41, comment 'Default: 4 AM'), and getISTEffectiveDate() uses it to decide the logical day (utils/time.ts:83-92). The product spec states day rollover should happen at 2:00 AM. This default directly governs when the rollover 'New Orbit Cycle' modal fires (index.tsx:335) and when the Daily Context modal is re-presented.
- **Why It Matters:** Users studying between 2:00 and 4:00 AM are still bucketed into the previous day, so the new-day modal and fresh plan won't appear when the product intends. It's a quiet behavioral mismatch with the documented rollover contract that affects the timing of every daily modal.
- **Recommended Fix:** Change the default to 2 (or confirm the intended hour with the product owner) so the modal-trigger window matches spec; surface the configured hour in the rollover copy.

#### 55. Day-start rollover defaults to 4 AM, not the 2 AM the product specifies — affects review/plan 'today'
`⚪ Low` · Spec conformance · impact: Correctness · ⟂ unverified

- **File:** `utils/time.ts:41, 83-92`
- **Current Problem:** getDayStartHour() returns 4 (4 AM) as its default when no setting is stored (utils/time.ts:41), and getISTEffectiveDate() rolls the logical day at that hour (:87-89). The product spec states day rollover should happen at 2:00 AM. So out of the box the effective study date — which gates plan currency and (once SR is fixed to use it) review due-dates — flips two hours later than intended.
- **Why It Matters:** A late-night studier working between 2 and 4 AM is still counted under the previous day, so their plan and reviews behave a day differently than the spec promises. It is low-severity because it is a single configurable constant, but it is a real deviation from stated behavior and worth aligning.
- **Recommended Fix:** Change the default in getDayStartHour() to 2 to match the spec (or confirm with the product owner and update the spec), keeping the setting override intact.

#### 56. Exam setup advertises 'from your syllabus' but most subjects have none, weakening perceived value
`⚪ Low` · Perceived value / empty state · impact: Engagement, Learning outcomes · ⟂ unverified

- **File:** `ExamSimulator.tsx:566-603, 81-93`
- **Current Problem:** The setup screen copy reads 'AI-generated questions from your {subjectName} syllabus' (ExamSimulator.tsx:579) and shows a 'Units Done' stat only when subject.syllabus exists (:590-603). But generateQuestions falls back to empty syllabus/topics strings when none are present (:81-93), so for a subject with no syllabus the exam is generated from just the subject name — generic questions despite the 'specific to your syllabus' promise. There is no empty-state nudge to add a syllabus first.
- **Why It Matters:** Onboarding does not collect syllabi and CoursesView syllabus entry is optional, so many users will hit the exam with subject-name-only generation and receive generic questions while the UI implies tailored ones, eroding trust in the feature's value.
- **Recommended Fix:** When subject.syllabus and topics are both empty, soften the copy ('general questions for {subject}') and add a one-tap prompt to add syllabus units in Courses for better-targeted exams.

#### 57. Bug Report relies on mailto: (no real submission) and clearAllData carries mojibake-corrupted comments
`⚪ Low` · Inconsistency / encoding damage · impact: Maintainability, Engagement · ⟂ unverified

- **File:** `SettingsView.tsx:99`
- **Current Problem:** The 'Submit & Email' bug-report flow just sets window.location.href to a mailto: link (line 99) and immediately shows a 'success' state (101-106) regardless of whether an email client exists or the user ever sends anything; on machines with no mail handler it silently does nothing while claiming success. Separately, clearAllData contains a mojibake comment 'ÃƒÂ¢Ã¢â‚¬Â¦ Use transaction for atomicity' (line 228) — corrupted-emoji encoding damage also seen elsewhere in the codebase.
- **Why It Matters:** Presenting 'success / Thank you for helping improve Orbit' when nothing was actually transmitted is misleading feedback, and a required email field implies a real intake that doesn't exist. The mojibake is a minor but visible sign of source-encoding damage that should be cleaned up once across the repo.
- **Recommended Fix:** Either label the action accurately ('Open email to report') and handle the no-mail-client case, or wire a real intake. Re-save affected source files as UTF-8 to remove the mojibake comments.

#### 58. Day-start default is 4 AM in code (product spec says 2 AM) and the same value is duplicated in three places
`⚪ Low` · Inconsistency vs spec · impact: Correctness, Maintainability · ⟂ unverified

- **File:** `SettingsContext.tsx:58`
- **Current Problem:** DEFAULT_SETTINGS.study.dayStartHour is 4 (SettingsContext.tsx:58), and the fallback day-start is hardcoded as 4 in two separate getDayStartHour implementations: utils/time.ts:41 ('Default: 4 AM') and SettingsContext.tsx:238/241. The product specification states day rollover happens at 2:00 AM. There are also two independent getDayStartHour functions (time.ts reads orbit-settings-v2 then legacy orbit-prefs; SettingsContext reads only orbit-settings-v2), a duplicated source of truth.
- **Why It Matters:** A rollover-hour mismatch with the spec means the 'effective study date' boundary is two hours later than intended, shifting which calendar day late-night sessions land on — compounding the IST/UTC streak issues. Triplicated defaults make it easy for the three to drift out of sync in future edits.
- **Recommended Fix:** Confirm the intended default (2 vs 4 AM) with the product owner and set it in one place; have time.ts import getDayStartHour from a single source rather than maintaining a parallel copy.

#### 59. Privacy toggles are permanently disabled but rendered as interactive switches
`⚪ Low` · Inconsistent / dead controls · impact: Engagement, Maintainability · ⟂ unverified

- **File:** `SettingsView.tsx:943-955`
- **Current Problem:** The Privacy section renders 'Usage Analytics' and 'Crash Reports' rows wrapped in `opacity-50` with `cursor-not-allowed` (lines 943-944), yet each still mounts a fully styled ToggleSwitch wired to updateSetting (949-953). The switch isn't actually disabled — it just looks dimmed — and one label even reads '(currently disabled)' (940). shareUsageData has no row at all.
- **Why It Matters:** Controls that look like toggles but do nothing (or whose meaning is 'this will never work') are confusing and read as unfinished. Users may toggle them expecting an effect; at minimum it signals low polish on a screen that is otherwise heavily styled.
- **Recommended Fix:** Either truly disable the underlying ToggleSwitch (pass a disabled prop / no-op onChange) and present the rows as informational 'These are off by design — Orbit collects nothing' copy, or remove the toggles entirely. Don't render interactive-looking controls for non-functional settings.

<a id="part-3"></a>
### Part 3 — Design System Audit
_11 findings — 3 High, 7 Medium, 1 Low_

#### 1. Shared Button primitive used by only 2 files; 211 raw <button> elements hand-styled
`🟠 High` · Components · impact: Maintainability, Correctness · ⟂ unverified

- **File:** `components.tsx:35-49`
- **Current Problem:** A `Button` component with primary/secondary/danger/ghost variants exists (components.tsx:35-49) but is imported by only 2 files (DailyContextModal.tsx:12, Onboarding.tsx:4). Meanwhile there are 211 raw `<button>` elements across 23 files, each re-implementing padding, radius, color, hover, and active states inline (e.g. EmptyStates.tsx:70-76, Toast.tsx:150-167, index.tsx:597-613, ProjectsView.tsx:559-561). Hover/active/disabled/focus states are therefore defined ad hoc and inconsistently: some buttons have `active:scale-95`, some `active:scale-[0.98]`, some none; focus-visible rings exist only via the global CSS in index.css:777, not per-button.
- **Why It Matters:** Buttons are the most-used interactive element and have essentially no shared contract. Disabled and focus styling is consequently spotty (the shared Button only handles `disabled:opacity-50`; most raw buttons handle neither focus nor disabled). This is the single largest source of visual drift and a major maintainability tax — any button change can't be made centrally.
- **Recommended Fix:** Expand the shared Button (add sizes, icon slot, loading, explicit focus-visible ring, consistent active scale) and migrate the 211 raw buttons to it. At minimum, standardize hover/active/focus/disabled tokens so the states are uniform.

#### 2. text-zinc-600 body/label text on near-black background fails WCAG contrast
`🟠 High` · Color / contrast · impact: Learning outcomes, Engagement, User retention · ⟂ unverified

- **File:** `EmptyStates.tsx:45-50`
- **Current Problem:** The app background is warm-black (#030307 in SpaceBackground.tsx:276; body #09090b in index.html:24). `text-zinc-600` (#52525b) is used 61 times across 14 files for real text, including the EmptyState 'subtle' variant where it is BOTH the title and description color (EmptyStates.tsx:46,49 titleColor/descColor = text-zinc-600 / text-zinc-400). #52525b on #09090b is a contrast ratio of roughly 2.3:1 — well below the WCAG AA 4.5:1 (and even 3:1) threshold. Fractional-opacity text (`text-zinc-*/40|50|60`, `text-white/50`) adds 30 more low-contrast sites, and PageHeader's designation uses `text-indigo-400/60` (PageHeader.tsx:55).
- **Why It Matters:** Empty states, captions, and metadata are precisely the guidance a new user relies on; rendering them at ~2.3:1 means they are hard or impossible to read, especially on mobile in daylight. For a study tool meant for long sessions, persistent low-contrast text causes eye strain and makes whole UI regions feel disabled/inactive.
- **Recommended Fix:** Establish minimum text-contrast tokens: reserve zinc-600 for non-text decoration only; use zinc-400 (#a1a1aa, ~5.3:1) or lighter for any readable text on the dark bg. Audit the 61 zinc-600 and 30 fractional-opacity text usages against AA.

#### 3. No typographic scale: 230 arbitrary text-[Npx] values, including illegible 7px
`🟠 High` · Typography · impact: Maintainability, Learning outcomes, Engagement · ⟂ unverified

- **File:** `WeekPreviewModal.tsx:69`
- **Current Problem:** Arbitrary pixel font sizes (`text-[Npx]`) appear 230 times across 20 files, at distinct sizes 7, 8, 9, 9.5, 10, 10.5, 11, 13, and 13.5px — alongside Tailwind's own xs/sm/base/lg scale. WeekPreviewModal.tsx:69 sets `text-[7px] xs:text-[8px] sm:text-[9px]` for a label; ProjectsView.tsx:550-560 uses `text-[9.5px]`, `text-[13.5px]`, `text-[10.5px]` (half-pixel sizes that round inconsistently). 7-9px text is below the ~11px practical legibility floor on mobile.
- **Why It Matters:** There is effectively no type system — sizes are chosen per-element by eye. Half-pixel and sub-10px values are unreadable for many users (this is a study app used for hours), break visual rhythm, and make global type adjustments impossible without find-replacing 230 sites. It also undermines the compact-mode feature (see ds-compact-mode-incomplete), which only knows about the named scale.
- **Recommended Fix:** Define a real scale (e.g. caption=11px, body=14px, etc.) as a handful of utility classes or a `Text` component with size variants, and migrate the 230 `text-[Npx]` usages onto it. Set a hard minimum of 11px. Forbid arbitrary `text-[...px]` via lint.

#### 4. No semantic color tokens: status colors re-declared as raw Tailwind maps in many files
`🟡 Medium` · Color / tokens · impact: Maintainability, Correctness · ⟂ unverified

- **File:** `components.tsx:235-306`
- **Current Problem:** Status/semantic colors are expressed as ad-hoc Tailwind class bundles re-declared per component rather than as tokens. components.tsx:235-306 hand-builds a 10-color `colorClasses` map (bg/border/text/icon/badge per color). PageHeader.tsx:24-31 has its own 6-variant `badgeStyles`. Toast.tsx:102-127 has its own success/error/warning/info map. EmptyStates.tsx:26-51 has its own 4-variant map. components.tsx:58-82 has tileVariants AND miniVariants (10 colors each). The same semantic ('success'=emerald, 'danger'=red) is re-encoded with slightly different opacities (e.g. badge bg /20 here vs /30 elsewhere) in every file. There's also a CSS-variable system (--text-primary etc. in index.css:7-13, 801-843) that components almost never consume — components use literal `text-zinc-200`/`text-white` instead.
- **Why It Matters:** There is no single definition of what 'success', 'danger', 'primary', or 'surface' mean, so the same status renders with different shades/opacities across toasts, badges, headers, and block-reason chips. The parallel CSS-variable theme tokens are largely bypassed, meaning the space/midnight themes can't actually retint most component colors (they only override a few bg-zinc/border classes).
- **Recommended Fix:** Define semantic tokens once (success/warning/danger/info/primary/neutral, each with bg/border/text/icon roles) as a shared map or CSS variables, and have Toast, PageHeader badges, EmptyStates, BlockReason, and tile variants consume them. Make components reference the theme CSS variables so space/midnight actually retint.

#### 5. Compact mode only scales 3 named text sizes; ignores all 230 arbitrary sizes
`🟡 Medium` · Spacing / theming · impact: Productivity, Correctness · ⟂ unverified

- **File:** `index.css:875-888`
- **Current Problem:** Compact mode (data-compact='true', toggled in SettingsContext.tsx:173-177) overrides a fixed hardcoded list: only p-4/5/6, space-y-4/6, text-2xl/3xl/4xl, gap-4/6, mb-4/6, rounded-2xl/3xl (index.css:875-888). It does NOT touch any of the 230 `text-[Npx]` sizes, nor p-2/p-3/p-8, gap-2/gap-3, text-xs/sm/base/lg/xl, or px-*/py-*. So in dense data views (Stats, ProjectsView, Dashboard) that lean heavily on arbitrary px text and other paddings, enabling compact mode changes almost nothing.
- **Why It Matters:** A user who turns on 'Compact mode' expecting denser layouts gets an inconsistent half-effect: a heading shrinks but the surrounding card padding, gaps, and the many text-[Npx] labels don't, producing misaligned, oddly-proportioned UI rather than a coherent compact density. The feature appears broken.
- **Recommended Fix:** Implement density via design tokens (CSS variables for spacing/type that compact mode rescales) instead of an allowlist of utility classes, so all spacing and the unified type scale respond. Requires first establishing the type scale (ds-no-type-scale).

#### 6. ~500 lines of light-mode CSS are dead code; no light theme is reachable
`🟡 Medium` · Dark mode / theming · impact: Maintainability, Correctness · ⟂ unverified

- **File:** `index.css:1-756`
- **Current Problem:** index.css opens with 'ORBIT LIGHT MODE ENHANCEMENT v2.0' and devotes lines 16-756 (the bulk of the file) to a `.light-mode` class system overriding text, bg, borders, accents, inputs, shadows, etc. with hundreds of `!important` rules. But a full-codebase search for `light-mode` returns ZERO matches in any .tsx/.ts/.html file. The only theme switch (SettingsContext.tsx:31 `theme: 'dark' | 'space' | 'midnight'`; applied at lines 166-177 via `data-theme`) never adds a `light-mode` class. The entire light theme is unreachable.
- **Why It Matters:** Half of the global stylesheet is inert. Anyone editing index.css must mentally skip 740 lines that do nothing, and the `!important`-heavy block is a trap: if a future dev ever adds `class='light-mode'`, it would aggressively override the real space/midnight themes. It also signals the theming story is unfinished — users see a 'theme' picker (dark/space/midnight) but the documented light mode silently doesn't exist.
- **Recommended Fix:** Either (a) delete the dead `.light-mode` block entirely, or (b) wire a real 'light' option into AppSettings.display.theme and apply `light-mode` in SettingsContext's theme effect. Do not ship 500 lines of unreachable CSS. If keeping, convert the ad-hoc `!important` overrides to the same `[data-theme]`+CSS-variable pattern used for space/midnight (index.css:801-868) for consistency.

#### 7. Animations duplicated across index.css, index.html, and 5 inline <style> blocks
`🟡 Medium` · Tokens / maintainability · impact: Maintainability, Correctness · ⟂ unverified

- **File:** `index.tsx:892-921`
- **Current Problem:** The same keyframes are defined multiple times in different files with DIFFERENT values. `@keyframes float`: index.html:74 (translateY -5px, 6s) AND index.tsx:900 (translateX(-50%) translateY -4px, 3s) AND SpaceBackground.tsx:426 (a totally different particle float) — and both index.html and index.tsx also define `.animate-float`, so which one wins depends on CSS order. `@keyframes shimmer` + `.animate-shimmer` exist in both index.css:600-612 and index.tsx:908-920. `fadeIn`/`fade-in` appear in index.css:513 and 634 and FocusSession.tsx:738. There are 7 inline `<style>` blocks (Onboarding, Dashboard, FocusSession, index.tsx, ProjectsView, SpaceBackground x2) plus index.css.
- **Why It Matters:** Colliding global keyframe/utility names with different definitions cause order-dependent, hard-to-debug animation behavior (the actual `.animate-float` used by the nav depends on stylesheet load order between index.html's inline style and index.tsx's injected style). Design lives scattered across HTML, a CSS file, and component-injected <style> tags, so there is no one place to manage motion.
- **Recommended Fix:** Move all keyframes and `.animate-*` utilities into index.css as the single source, delete the duplicates from index.html and the inline <style> blocks, and ensure each animation name is defined exactly once.

#### 8. Two PageHeader components; the richer PageHeader.tsx is dead code
`🟡 Medium` · Components · impact: Maintainability · ⟂ unverified

- **File:** `PageHeader.tsx:33-108`
- **Current Problem:** There are two different PageHeader implementations with incompatible prop APIs. PageHeader.tsx (lines 33-108) is the more polished one — typed `designation`, `badge` with 6 variants (badgeStyles, lines 24-31), icon tile, showDate. But a search for imports from `./PageHeader` returns ZERO results; every consumer (AboutView, Courses, FocusSession, Dashboard, ScheduleView, SettingsView) imports the OTHER PageHeader from `./components` (components.tsx:509-536), which has a totally different `{title, meta, actions}` API. The entire badge variant system in PageHeader.tsx is unused.
- **Why It Matters:** Duplicated, divergent header components mean two sources of truth for the app's most prominent recurring element. A designer fixing the header in PageHeader.tsx would see no effect in the app. The dead file's badge system also overlaps with PageHeader badge styling in components plus MetaText/HeaderChip — three overlapping header vocabularies.
- **Recommended Fix:** Delete PageHeader.tsx (or merge its badge/designation features into the components.tsx PageHeader that is actually used) so there is exactly one header component and one prop contract.

#### 9. Glassmorphism re-implemented in 4+ ways instead of one surface token
`🟡 Medium` · Components / tokens · impact: Maintainability · ⟂ unverified

- **File:** `components.tsx:84-151`
- **Current Problem:** There are at least four parallel 'frosted glass surface' definitions: (1) `.glass-panel` in index.html:47-53 (rgba .03 bg, blur 16px, border .08); (2) GlassCard wrapping `.glass-panel` + rounded-2xl (components.tsx:8-12); (3) FrostedTile with its own inline `bg-gradient-to-br from-zinc-900 via-zinc-900 to-black ... backdrop-blur-2xl shadow-[0_25px_50px_-12px_...]` (components.tsx:99-104); (4) FrostedMini (components.tsx:128-151); plus FocusSession.tsx defines yet another `.uniform-card` in an inline style block (FocusSession.tsx:731-735). Beyond these, `backdrop-blur-{xl,2xl,3xl}` is hand-applied 40 more times in 12 files.
- **Why It Matters:** The signature 'glass' look has no single source of truth, so blur radius, background opacity, border color, and shadow differ subtly between panels. Tuning the glass aesthetic (a core part of the brand) requires editing 5+ definitions plus 40 inline usages, and they will inevitably drift apart (they already have: glass-panel blur 16px vs FrostedTile blur-2xl ≈ 40px).
- **Recommended Fix:** Consolidate to one surface system (CSS variables for blur/bg/border/shadow, exposed as a couple of utility classes or Card variants) and route GlassCard, FrostedTile, FrostedMini, and uniform-card through it. Remove the inline FocusSession card style.

#### 10. Radius is uncontrolled: arbitrary 2rem/2.5rem/2px mixed with 655 rounded-* utilities
`🟡 Medium` · Radii / tokens · impact: Maintainability, Engagement · ⟂ unverified

- **File:** `index.tsx:585`
- **Current Problem:** Border radius is applied 655 times via rounded-{lg,xl,2xl,3xl,full} across 26 files with no shared surface abstraction, plus arbitrary values: `rounded-[2.5rem]` (index.tsx:585 rollover modal), `rounded-[2rem]` (index.tsx:630,640,819; Stats.tsx:1989; WeekPreviewModal.tsx:54,98), and `rounded-[2px]` (ProjectsView.tsx:128). The same conceptual element gets different radii: the desktop nav pill is rounded-[2rem] but the rollover modal is rounded-[2.5rem] and most cards are rounded-2xl/3xl. GlassCard uses rounded-2xl (components.tsx:9) while FrostedTile uses rounded-3xl (components.tsx:99).
- **Why It Matters:** With no radius scale, corner rounding is decided per element, so cards, modals, and pills don't agree. The two core card primitives (GlassCard, FrostedTile) already disagree (2xl vs 3xl), guaranteeing mismatched corners wherever they're combined. This is low-stakes individually but pervasive, producing a subtly unpolished, inconsistent feel.
- **Recommended Fix:** Define a radius token set (e.g. card=1rem, modal=1.5rem, pill=full) and replace arbitrary rounded-[...] and divergent card radii with it. Pick one radius for GlassCard and FrostedTile.

#### 11. Encoding damage: corrupted emoji (mojibake) in source comments
`⚪ Low` · Maintainability · impact: Maintainability · ⟂ unverified

- **File:** `components.tsx:176`
- **Current Problem:** Source comments contain corrupted emoji from an encoding round-trip (UTF-8 read as Latin-1). Visible in components.tsx:176 ('BlockReason Component' comment prefixed with garbled bytes), :187 and :491. The BlockReason logic itself also relies on matching literal emoji inside data strings (components.tsx:192-225, e.g. reason.includes('🚨')) and then stripping them with a regex at :330 — coupling presentation logic to emoji characters that are exactly the kind of glyphs prone to this corruption.
- **Why It Matters:** Mojibake in comments is a symptom of inconsistent file encoding across the repo, which can silently corrupt any emoji/unicode actually used at runtime. Because BlockReason keys its entire icon/color selection off emoji substring matching, an encoding mishap on the data side would break the visual categorization (wrong icon/color, or none) — turning a cosmetic problem into a functional one.
- **Recommended Fix:** Normalize all source files to UTF-8 (without BOM) and fix the corrupted comment bytes. Decouple BlockReason styling from emoji matching — drive it off an explicit `reason.type` enum instead of `includes('🚨')`.

<a id="part-4"></a>
### Part 4 — Study Planner Logic Audit
_35 findings — 5 Critical, 15 High, 10 Medium, 5 Low_

#### 1. Snoozed block is deleted from plan.blocks but recovery looks for it there — guaranteed data loss
`🔴 Critical` · Backlog / dropped-block recovery · impact: Data safety, Correctness, User retention · ✅ verified

- **File:** `Dashboard.tsx:1138`
- **Current Problem:** snoozeBlock() removes the block from the plan: `updatedTodayBlocks = currentPlan.blocks.filter(b => b.id !== blockId)` and persists only the id into `droppedBlocks[]` (Dashboard.tsx:1138-1145). The recovery engine in brain.ts:963 then does `pastPlan.blocks.find(b => b.id === droppedId)` — but that block was already filtered out of `blocks`, so `find` returns undefined and the block is silently skipped (brain.ts:963-964). The full block object survives only inside the in-memory UNDO closure (`const block`, Dashboard.tsx:1135), which is gone after a refresh.
- **Why It Matters:** The toast literally promises 'Block dropped — planner will recover it tomorrow' (Dashboard.tsx:1147), and brain.ts:974 then clears droppedBlocks. So tomorrow's generation finds the id, can't resolve it to a block, and permanently drops it. A core, advertised journey (snooze to tomorrow) loses the user's planned work with zero warning.
- **Recommended Fix:** Keep snoozed blocks IN plan.blocks (e.g. mark them dropped/incomplete) so recovery can find them, OR store the full block object in droppedBlocks instead of just the id. The recovery loop and the snooze writer must agree on where the block body lives.
- **Verifier note:** Dashboard.tsx:1138 filters the block out of blocks and stores only its id in droppedBlocks (1139); brain.ts:963 recovery does pastPlan.blocks.find(b=>b.id===droppedId) which now returns undefined, then brain.ts:974 clears droppedBlocks — block permanently lost.

#### 2. The sophisticated core planner (brain.ts) is bypassed for new users and veterans alike
`🔴 Critical` · Architecture / algorithm correctness · impact: Learning outcomes, Correctness, Maintainability · ✅ verified

- **File:** `brain-ultimate.ts:104-182`
- **Current Problem:** generateUltimatePlan selects the planning engine purely by uniqueDays = number of distinct log dates. uniqueDays<5 -> 'research' (generateResearchGradePlan only); 5-29 -> 'enhanced' (core generateDailyPlan + a perf tweak); >=30 -> 'hybrid' (generateResearchGradePlan + perf tweak). The 640-line core engine in brain.ts — displacement, circadian ordering, break injection, spaced-repetition reviews, exam context/exclusions, dropped-block recovery, ISA/ESA/PD modes, holiday/sick handling — therefore ONLY runs in the narrow 5-to-29-day window or as an error fallback. New users (the critical first-week impression) and any committed long-term user (>=30 days) instead get generateResearchGradePlan, which is a greedy knapsack over two generic blocks (review 45m, prep 30m) per subject.
- **Why It Matters:** The vast majority of a product's lifetime value comes from days 1-5 (onboarding) and day 30+ (retention). For both cohorts the planner silently degrades to the weakest engine, which ignores the timetable, exam dates, projects, dropped blocks, ISA/ESA focus, breaks and circadian ordering. Two users with identical data get structurally different plans solely because one has logged 4 days and the other 5. This is the single biggest correctness/architecture problem in the lane.
- **Recommended Fix:** Make the core engine (brain.ts generateDailyPlan) the backbone for all maturity levels and layer probabilistic readiness/scoring on top, rather than swapping the whole engine. If a research path must exist, it should reuse the core's block-generation (assignments, projects, schedule, exclusions) instead of regenerating generic review/prep blocks.
- **Verifier note:** brain-ultimate.ts:88 derives uniqueDays from distinct log.date; lines 104-119 (<5) and 140-173 (>=30) call generateResearchGradePlan on the happy path, invoking coreGeneratePlan (=generateDailyPlan from brain.ts, import line 16) only in catch/fallback (115,176). Core engine runs on happy path solely for the 5-29 'enhanced' bucket (122). Live: index.tsx:381 -> generateEnhancedPlan -> generateUltimatePlan (brain-ultimate.ts:302).

#### 3. Regenerating the daily plan wipes out completed-block progress for the same day
`🔴 Critical` · Data integrity / core journey · impact: Data safety, Correctness, User retention · ✅ verified

- **File:** `index.tsx:381-401`
- **Current Problem:** handleContextGenerate calls generateEnhancedPlan(ctx) to build a brand-new plan whose blocks are all completed:false, then does `await db.plans.put(plan)` (index.tsx:395) and overwrites db.studyBlocks via put (398-401). There is no merge against the existing plan for the same date and no guard against an existing plan: loadData (index.tsx:242-252) and the rollover modal (index.tsx:597-608) both set needsContext=true which re-shows the DailyContextModal, and the modal also has a 'Skip for Now' button (DailyContextModal.tsx:702-710) that re-invokes onGenerate. Any study sessions already completed today (blocks marked completed in handleFocusComplete at index.tsx:462-470) are discarded, along with their StudyLogs' link to the plan.
- **Why It Matters:** A user who completes two focus sessions in the morning and then re-opens the context modal (e.g. to switch from Normal to ESA, or after the 60s rollover interval misfires) loses all visible progress for the day — completed blocks reappear as incomplete. This is silent data corruption of the single most important daily artifact and directly breaks the core 'plan → focus → complete' journey.
- **Recommended Fix:** Before put, load the existing plan for dateStr; if present, preserve completed blocks (merge by block id, or refuse to regenerate without an explicit 'discard progress' confirmation). At minimum, carry forward `completed:true` blocks and their outcomes into the regenerated plan.
- **Verifier note:** index.tsx:384-395 builds a fresh plan (result.blocks all completed:false) keyed by same getISTEffectiveDate() and calls db.plans.put(plan) with no merge of prior completed state, overwriting same-day progress.

#### 4. Research-grade plan ignores holiday, sick, dayType, mood, focus subject and exam exclusions
`🔴 Critical` · Algorithm correctness / edge inputs · impact: Correctness, Learning outcomes, Engagement · ✅ verified

- **File:** `brain-research-grade.ts:602-760`
- **Current Problem:** generateResearchGradePlan(context, ...) only uses `context` to populate a decision log (762-771). It never reads context.isHoliday, context.isSick, context.dayType, context.mood, context.focusSubjectId, context.bunkedSubjectId, or daysToExam. It generates a review+prep block for EVERY subject (636-677) plus assignment blocks, then greedily fills timeAvailableMinutes. It also never excludes completed-exam subjects (no getExamContext call). Because this is the engine for <5-day and >=30-day users (see plan-core-engine-bypassed), those users get a full study plan even on a Holiday or Sick day, ESA focus subject is not prioritized, and a finished exam's subject keeps getting scheduled.
- **Why It Matters:** A new user who selects 'Chill Day / Holiday' or toggles 'Sick' still receives a packed multi-block plan — the modal's most prominent presets are simply ignored. An ESA-crunch user in their first week gets no focus weighting at all. This makes the 'Daily Context' modal — the product's central interaction — largely decorative for the two cohorts that matter most.
- **Recommended Fix:** Have the research path honor constraints: short-circuit on isHoliday/isSick, pull constraints from resolveConstraints(context), boost focusSubjectId, and exclude completedExamSubjectIds. Better, route context-sensitive cases through the core engine.
- **Verifier note:** In generateResearchGradePlan (brain-research-grade.ts:602-788) grep for isHoliday/isSick/dayType/focusSubjectId/bunkedSubjectId/context.mood returns no matches in the file; the only context use is line 764 (dailyContext: context) passed to optimizationSolver.logDecision — never read to influence block generation, scoring, or selection.

#### 5. BlockOutcome.date is stamped with UTC host-clock date, not the IST effective date
`🔴 Critical` · Timezone consistency · impact: Correctness, Data safety, Learning outcomes · ✅ verified

- **File:** `brain-enhanced-integration.ts:195`
- **Current Problem:** recordBlockOutcome computes `const date = new Date(now).toISOString().split('T')[0]` (line 195) and `timeOfDay = new Date(now).getHours()` (line 196). toISOString() is UTC and getHours() is host-local — neither is the IST effective date. Meanwhile the StudyLog for the SAME session is written with `getISTEffectiveDate()` (index.tsx:449) and recordTopicReview also uses the IST date. So one click produces a log dated by IST and an outcome dated by UTC.
- **Why It Matters:** Every analytics surface that reads blockOutcomes — getSubjectPerformance, detectBurnout's consecutive-skip-day grouping (brain-enhanced-integration.ts:401-423), getStudyStreak (line 856), getDashboardInsights — is keyed on this UTC date. For IST users, any session before 05:30 IST rolls to the previous UTC day, so the same day's log and outcome land on different dates. Burnout 'consecutive skipped days', per-subject streaks, and weekly trends are computed against a date that doesn't match the plan or the StudyLog, producing wrong insights and phantom gaps. On a non-IST host the timeOfDay (energy/time-of-day analytics) is also wrong.
- **Recommended Fix:** Pass the IST effective date into recordBlockOutcome (the caller in FocusSession already imports getISTEffectiveDate) and use it for `date`; derive timeOfDay from getISTTime().getHours() rather than host getHours(). Backfill or accept that historical outcome dates are UTC.
- **Verifier note:** brain-enhanced-integration.ts:195 date=new Date(now).toISOString().split('T')[0] (UTC) and :196 timeOfDay=getHours() (host-local), while the file imports getISTEffectiveDate (line 17) and StudyLogs stamp date=getISTEffectiveDate() (index.tsx:449,455). The UTC date IS consumed date-sensitively: grouped by o.date at lines 403-406,856 and filtered o.date>=cutoff in DashboardInsights.tsx:23,50,81, so it misgroups outcomes vs IST logs.

#### 6. Manual backlog migration mutates the original plan and can duplicate a block across plans
`🟠 High` · Backlog migration · impact: Correctness, Data safety, Productivity · ⟂ unverified

- **File:** `Dashboard.tsx:1036`
- **Current Problem:** addToToday() flags the source block `migrated:true` in the old plan (Dashboard.tsx:1042-1045) and inserts a COPY into today with a fresh random id (Dashboard.tsx:1049-1055). The dedupe relies entirely on the `migrated` flag, which only fetchBacklog honors (Dashboard.tsx:1023). But the brain's dropped-block recovery (brain.ts:958-975) ignores `migrated` entirely — it only looks at `droppedBlocks`. So a block that was snoozed (in droppedBlocks) AND later manually pulled from backlog can be recreated by the engine while the manual copy also exists. The migration also rewrites a historical plan in place, corrupting the past day's record.
- **Why It Matters:** Manual and automatic carry-over are two parallel systems that don't share dedupe state, so blocks can silently duplicate (double-counted study time, two identical 'missions') or, combined with finding data-snooze-recovery-loss, vanish. Editing historical plans also breaks any retrospective stats that read past plan.blocks.
- **Recommended Fix:** Unify carry-over into one mechanism. If manual migration stays, the brain recovery must also respect `migrated` and a stable original-block id, and migration should record provenance rather than overwriting the past plan's blocks.

#### 7. No per-subject delete exists; CoursesView cannot remove a subject and there is zero cascade infrastructure
`🟠 High` · Cascade deletes / single source of truth · impact: Data safety, Productivity, Correctness · ⟂ unverified

- **File:** `Courses.tsx:279`
- **Current Problem:** CoursesView is described as the authoritative subject hub, yet it has no delete-subject action at all — only resource/grade/syllabus edits (Courses.tsx:279-378). A codebase-wide grep for `subjects.delete`/`bulkDelete` returns nothing; subjects are only ever `.clear()`-ed wholesale (Onboarding.tsx:95, SettingsView.tsx:178/235, db.ts:237). The only removeSubject (Onboarding.tsx:558) mutates local React state pre-commit, not the DB.
- **Why It Matters:** Users who add a wrong subject after onboarding can never remove it without wiping ALL data. And because no cascade helper exists anywhere, if a delete is ever added it will instantly orphan resources, grades, schedule slots (ScheduleSlot.subjectId), projects, assignments, logs, topics, blockOutcomes, studyBlocks and plan blocks — every one keyed by subjectId with no FK enforcement. The 'single source of truth' is read-only for its primary entity.
- **Recommended Fix:** Add a delete-subject flow in CoursesView backed by a transactional cascade that removes/repoints schedule, projects, assignments, topics, logs, blockOutcomes, studyBlocks and plan blocks for that subjectId, with a confirm + undo toast consistent with the rest of the app.

#### 8. Deleting a project orphans its plan blocks, studyBlocks and logs (dangling projectId)
`🟠 High` · Cascade deletes / orphaned records · impact: Data safety, Correctness · ⟂ unverified

- **File:** `ProjectsView.tsx:864`
- **Current Problem:** handleDelete does `await db.projects.delete(id)` with no cascade (ProjectsView.tsx:862-865). StudyBlocks of type 'project' carry `projectId` (types.ts:105) and StudyLog carries `projectId` (types.ts:191). After deletion, any plan block, studyBlock, or log referencing that projectId now points at a non-existent project. Nothing nulls or removes them.
- **Why It Matters:** A 'project' block in today's plan still renders and can be started, but FocusSession's `updateAssignmentProgress`/project linkage and any project-progress rollup will reference a ghost. Stats/ProjectsView session math silently excludes the deleted project while logs still inflate global totals. This is the classic orphan that causes 'phantom work' and inconsistent dashboards.
- **Recommended Fix:** On project delete, run a transaction that also strips/neutralizes project references: remove project-type blocks from current/future plans and studyBlocks, and either delete or null projectId on logs. Prompt the user if logged time would be discarded.

#### 9. db.studyBlocks is a write-only shadow of plan.blocks that diverges and is never read by app logic
`🟠 High` · Dual storage / sources of truth · impact: Data safety, Maintainability, Correctness · ⟂ unverified

- **File:** `index.tsx:398`
- **Current Problem:** On plan generation, every block is duplicated into db.studyBlocks (index.tsx:398-401) and on focus-complete the studyBlock is updated (index.tsx:470). But the OTHER mutation paths never touch studyBlocks: Dashboard.markComplete updates only db.plans (Dashboard.tsx:1098-1102), snoozeBlock (1141), addToToday (1058-1060) and deleteFromBacklog (1080) all mutate plan.blocks only. A codebase-wide grep shows studyBlocks is only ever read in export/snapshot/backup code (db.ts:187, index.tsx:155, Onboarding.tsx:44, SettingsView.tsx:125) — never queried for backlog or any feature.
- **Why It Matters:** The comment calls it 'Persist individual blocks for direct access/backlog' (index.tsx:397) but backlog reads db.plans (Dashboard.tsx:1016), so studyBlocks serves no live purpose while still being written. A block completed via the Dashboard checkmark is `completed:true` in plans but stays `completed:false` in studyBlocks forever. This corrupt copy is what gets exported/snapshotted and could resurface on restore, and it misleads any future feature that trusts the table.
- **Recommended Fix:** Either remove the studyBlocks dual-write entirely (plans is the source of truth), or route ALL block mutations through a single helper that updates both atomically. Do not keep a half-maintained mirror.

#### 10. bunkedSubjectId is collected by the modal but never used by any planner
`🟠 High` · Modal/brain contract mismatch · impact: Correctness, Engagement · ⟂ unverified

- **File:** `DailyContextModal.tsx:330`
- **Current Problem:** The modal exposes a 'Bunked' toggle and a 'Which class did you bunk?' subject selector (DailyContextModal.tsx:613-637) and passes bunkedSubjectId in the context (line 330). It is declared on DailyContext (types.ts:140). A repo-wide grep shows bunkedSubjectId appears ONLY in DailyContextModal.tsx and types.ts — neither brain.ts, brain-ultimate.ts, brain-research-grade.ts, nor brain-enhanced-integration.ts ever read it. Bunking a class therefore has zero effect on the generated plan.
- **Why It Matters:** The product premise is that telling Orbit you bunked a lecture causes it to backfill that subject. The UI promises this; the brain does nothing with it. Users learn the feature is fake, eroding trust in the planner's intelligence.
- **Recommended Fix:** Consume bunkedSubjectId in the core engine to inject a high-priority catch-up review block for that subject (or remove the UI). If kept, also surface a reason string so the user sees it was honored.

#### 11. The 'fixed' dual-track recordBlockOutcome is never called; research mastery tracker is never fed
`🟠 High` · Architecture / dead code · impact: Learning outcomes, Correctness, Maintainability · ⟂ unverified

- **File:** `brain-ultimate.ts:244-268`
- **Current Problem:** brain-ultimate.ts exports a recordBlockOutcome wrapper whose header comment claims it was fixed to update BOTH Dexie and the in-memory research mastery tracker (researchRecordOutcome). But FocusSession.tsx (the only completion path) imports recordBlockOutcome directly from brain-enhanced-integration (FocusSession.tsx:14, called at 459), NOT from brain-ultimate. The brain-ultimate wrapper is unreferenced. Consequently BayesianMasteryTracker.updateAfterStudy in brain-research-grade.ts (829-834) is never triggered by real sessions, and gainPredictor.recordOutcome (826) never receives observations.
- **Why It Matters:** The entire research-grade learning/feedback loop — masteryProbability updates, learned gain calibration, confidence growth — is inert in production. The masteryProbability shown for >=14-day users (brain-ultimate.ts:201-213) is frozen at the decayed prior. The codebase advertises adaptive intelligence ('triple-brain', BKT) that never actually learns from outcomes.
- **Recommended Fix:** Point FocusSession at brain-ultimate's recordBlockOutcome (the intended single entry point) or delete the dead wrapper and the research feedback machinery. Pick one source of truth for outcome recording.

#### 12. Holiday days still get a full fallback study plan (only Sick is honored in fallback)
`🟠 High` · Edge inputs / algorithm correctness · impact: Correctness, User retention · ⟂ unverified

- **File:** `brain.ts:1363`
- **Current Problem:** In the core engine, the scheduled-review and critical-review sections correctly skip when isHoliday (brain.ts:1094, 1306). But the Smart Fallback that pads the plan to MIN_BLOCKS_FALLBACK only checks `!context.isSick` (brain.ts:1363) — it does NOT check isHoliday. The emergency fallback (1422) checks neither. So on a Holiday with no due assignments/projects, the engine still injects up to 3 readiness-boost review blocks. (Separately, the research path ignores holiday entirely — see plan-research-grade-ignores-daily-context.)
- **Why It Matters:** Selecting the 'Chill Day / Holiday' preset — explicitly described as 'Holiday or rest day' — still produces a study plan with review blocks, defeating the purpose and annoying users who wanted a genuine rest day.
- **Recommended Fix:** Add `&& !context.isHoliday` to the fallback guard at brain.ts:1363 (and the emergency fallback at 1422), or return an intentionally empty/rest plan when isHoliday is true.

#### 13. Research/hybrid path computes effectiveDate in UTC, contradicting the IST day model
`🟠 High` · Timezone correctness · impact: Correctness, Data safety · ⟂ unverified

- **File:** `brain-ultimate.ts:107`
- **Current Problem:** Inside generateUltimatePlan the research and hybrid branches build the date with `new Date().toISOString().split('T')[0]` (brain-ultimate.ts:107 and :143), which is the UTC calendar date. Everywhere else the app uses getISTEffectiveDate() (utils/time.ts) which applies IST plus a configurable day-start hour. For IST users between 00:00 and 05:30 IST, the UTC date is the previous calendar day, so the research planner computes daysUntilDeadline (brain-research-grade.ts:687 via daysBetweenDatesUTC) and recency against a date that is off by one versus the plan that index.tsx saves under getISTEffectiveDate() (index.tsx:382).
- **Why It Matters:** Assignment urgency, daysUntilDue filtering (research-grade.ts:689 skips daysUntilDue<0), and readiness recency can all be off by a day for late-night users — the exact audience a study app serves. It also means the plan's internal date assumptions disagree with the date key it is stored under.
- **Recommended Fix:** Pass getISTEffectiveDate() into generateResearchGradePlan instead of new Date().toISOString(); ideally generateUltimatePlan should compute effectiveDate once via getISTEffectiveDate() and thread it everywhere.

#### 14. Two incompatible readiness models produce different scores for the same subject depending on data age
`🟠 High` · Algorithm consistency · impact: Correctness, Engagement, Learning outcomes · ⟂ unverified

- **File:** `brain-ultimate.ts:274-289`
- **Current Problem:** getUnifiedReadiness routes to researchGetReadiness (probabilistic, exponential volume 1-e^-k*ratio with goal=15h/credit, exponential decay, 0.7*classical+0.3*bayesian — brain-research-grade.ts:273-338) when uniqueDays>=14, else to core calculateReadiness (linear volume capped at goal=10h/credit, modified-Ebbinghaus decay — brain.ts:325-381). The two formulas use different goal-hours (15 vs 10), different decay shapes, and different status thresholds (research 'mastered' needs score>75 AND confidence>0.7; core needs score>70). The DailyContextModal displays whichever model is active (DailyContextModal.tsx:269 getAllReadinessScores) and drives the 'Critical Subjects' alert.
- **Why It Matters:** On the day a user crosses 14 unique study days, every subject's readiness % and critical/maintaining/mastered status can jump discontinuously with no new study — purely an engine swap. Readiness is the headline metric the planner and the modal expose; a non-monotonic, model-dependent score undermines user trust and makes the critical-subject focus auto-selection (DailyContextModal.tsx:271-273) unstable.
- **Recommended Fix:** Standardize on one readiness model (or make the probabilistic model continuously converge to the classical one as confidence grows) so scores are stable across the maturity boundary.

#### 15. Day-start hour is 4 AM everywhere, not the spec's 2 AM — and UI/README hard-code 4 AM
`🟠 High` · Spec compliance · impact: Correctness, User retention, Learning outcomes · ⟂ unverified

- **File:** `utils/time.ts:41`
- **Current Problem:** The product spec says day rollover happens at 2:00 AM IST, but every default in the codebase is 4 AM: utils/time.ts:41 (`return 4; // Default: 4 AM`), SettingsContext.tsx:58 (`dayStartHour: 4`), SettingsContext.tsx:238 (`|| 4`), utils/settingsHelper.ts:62 and :141. The user-facing copy then doubles down on 4 AM: AboutView.tsx:389 ('Your study day starts at 4 AM...') and README.md:75 ('Day starts at 4 AM ... 3 AM still counts as today'). There is no 2 AM anywhere.
- **Why It Matters:** Between 02:00 and 04:00 IST the app assigns work to the PREVIOUS calendar day, the opposite of the documented contract. A night-owl studying at 3 AM has their StudyLog/plan attributed to yesterday, which is exactly the broken-streak scenario the feature was built to prevent. Because the help text asserts 4 AM, even a careful user cannot discover the spec intent.
- **Recommended Fix:** Decide the canonical value with the product owner. If 2 AM is correct, change all four defaults (time.ts, SettingsContext x2, settingsHelper x2) to 2 and update AboutView.tsx:389 + README.md:75. If 4 AM is correct, update the spec. Centralize the default as a single exported constant so the four copies cannot drift again.

#### 16. Studying 00:00–04:00 IST attributes log/outcome to dates that disagree with each other and the plan
`🟠 High` · Timezone consistency · impact: Correctness, Learning outcomes, Engagement · ⟂ unverified

- **File:** `index.tsx:449`
- **Current Problem:** Combining the above: between midnight and the 4 AM day-start, getISTEffectiveDate() returns YESTERDAY (time.ts:87), so the StudyLog gets yesterday's date (index.tsx:449) and matches yesterday's plan — correct per the night-owl design. But the BlockOutcome for the same session is dated with UTC (brain-enhanced-integration.ts:195), which at 01:00 IST is still the day-before-yesterday in UTC terms relative to IST, and calculateStreak uses UTC host keys (index.tsx:436). So three artifacts of one session carry up to three different dates.
- **Why It Matters:** The spec explicitly calls out post-midnight studying as the scenario to get right. Today it 'works' only for the StudyLog↔plan pair; the analytics (outcomes) and streak engine diverge, so a 2 AM session can simultaneously count for the plan, be missing from the streak, and be bucketed into the wrong analytics day. This is the concrete user-visible payoff of the three separate date bugs and is worth flagging as its own failure of the stated journey.
- **Recommended Fix:** Unify on getISTEffectiveDate() for ALL session artifacts (log, blockOutcome.date, streak keys, topic lastStudied). Add a test that simulates 'now = 02:30 IST' and asserts log.date === blockOutcome.date === streak key === plan.date.

#### 17. getISTTime() re-parses a locale string back into a Date — fragile, host- and engine-dependent
`🟠 High` · Time correctness · impact: Correctness, Maintainability · ⟂ unverified

- **File:** `utils/time.ts:70`
- **Current Problem:** getISTTime returns `new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))` (lines 70-73). It formats 'now' as an en-US IST string (e.g. '6/3/2026, 2:30:00 AM') and feeds that string back into the Date constructor, which parses it in the HOST timezone. The resulting Date's getHours()/getDate() therefore happen to read as IST wall-clock fields — but only because the constructor's parse of a non-ISO string is engine-defined.
- **Why It Matters:** This is the foundation of getISTEffectiveDate, getTimeUntilRollover, isCurrentWeek, getRelativeDate and the whole rollover system. The header comment claims 'ZERO ambiguous Date parsing', yet this is exactly ambiguous Date parsing: `new Date(localeString)` is not spec-guaranteed (Safari/Firefox historically returned Invalid Date for similar formats), and en-US locale output can include narrow-NBSP or formatting variations across ICU versions that break the round-trip. If parsing ever yields Invalid Date, getHours() is NaN, the rollover comparison fails silently, and the user is stuck re-prompted or on the wrong day. Note IST has no DST, so the residual risk is engine/locale fragility rather than DST.
- **Recommended Fix:** Compute IST fields deterministically with Intl.DateTimeFormat.formatToParts (timeZone: 'Asia/Kolkata', hourCycle 'h23') and read year/month/day/hour from the parts, or apply the fixed +5:30 offset to the UTC epoch. Never reconstruct a Date from a formatted string.

#### 18. Review sessions write TWO StudyLogs for one completion (handleFocusComplete + recordTopicReview)
`🟠 High` · Data integrity · impact: Correctness, Data safety, Learning outcomes · ⟂ unverified

- **File:** `index.tsx:452`
- **Current Problem:** On completion, index.tsx handleFocusComplete unconditionally adds a StudyLog with `type: activeBlock.type` and `duration: durationToLog` (index.tsx:452-460). Separately, for review blocks FocusSession's handleQualityRating calls recordTopicReview (FocusSession.tsx:469-475), which itself adds a second StudyLog with `type: 'review'` and the block duration (brain.ts:608-617). Both run for the same review session.
- **Why It Matters:** A single 45-minute review is logged as ~90 minutes across two log rows. Every total-minutes/streak/weekly-hours computation that reads `db.logs` double-counts review time, inflating study totals and weekly-target progress and corrupting the analytics users rely on to gauge effort. It also means deleting one log still leaves a duplicate. (A code comment at Dashboard.tsx:1090 shows the team already hit and fixed a different double-count, so the duplication pattern is known.)
- **Recommended Fix:** Pick one writer for review logs. Either skip the generic log.add in handleFocusComplete when block.type === 'review' (since recordTopicReview logs it), or have recordTopicReview update only topic SR state and not add a log. Ensure exactly one StudyLog per completed session.

#### 19. Rollover modal discards an in-progress plan with no confirmation or backlog safety net
`🟠 High` · Rollover / data safety · impact: Data safety, Productivity, User retention · ⟂ unverified

- **File:** `index.tsx:597`
- **Current Problem:** When todayPlan is detected stale (index.tsx:335 sets showRolloverModal), the only modal action 'Start New Cycle' (index.tsx:597-613) unconditionally calls setTodayPlan(null) + setNeedsContext(true), then loadData(). There is no path to keep the existing plan, and no prompt about incomplete blocks. The stale-plan check at line 335 fires before the lastCheckedDate branch, so even briefly stale plans pop the modal.
- **Why It Matters:** If the user was mid-day with partially completed blocks and the effective date ticks over (e.g. they cross 4 AM, or the unbounded day-start setting makes 'now' stale — see time-daystart-unbounded), clicking the single button throws away the current plan. The unfinished blocks survive only because backlog migration reads old plans (Dashboard.tsx:1014-1029), but that is MANUAL per spec, so the user loses today's view and must re-run the Daily Context modal and manually re-migrate. There is no 'discard?' confirmation despite this being destructive to the day's working set.
- **Recommended Fix:** Before discarding, confirm when the stale plan has incomplete blocks, and/or auto-snapshot it. Offer 'Keep current plan' vs 'Start new cycle'. Don't null the plan until the new context is generated, so an accidental dismissal doesn't strand the user.

#### 20. calculateStreak() builds day keys from host clock + toISOString() (UTC), not the IST effective date
`🟠 High` · Timezone consistency · impact: Correctness, Engagement, User retention · ⟂ unverified

- **File:** `index.tsx:433`
- **Current Problem:** calculateStreak (index.tsx:425-441) starts from `new Date()` (host local) and generates keys with `d.toISOString().split('T')[0]` (line 436 — UTC), then compares them against `l.date` values stored as IST effective dates (logs are written with getISTEffectiveDate at index.tsx:449). The streak day-key system and the stored log-date system are two different timezones.
- **Why It Matters:** For an IST user (UTC+5:30), `new Date().toISOString()` yields the previous calendar day for the entire window 00:00–05:30 IST. The set membership test `daysSeen.has(key)` then misses today's log (which is stored under the IST date), so the streak reads one short or breaks to 0 every early morning. This is the same off-by-one the IST design was meant to eliminate, and it directly feeds the 7/14/30/60/100-day streak notifications at index.tsx:505, so milestone toasts can fire on the wrong day or never fire.
- **Recommended Fix:** Build the streak keys from getISTEffectiveDate()/getISTTime() and walk backwards using parseLocalDate arithmetic (subtract days in local fields), mirroring how logs are dated. Do not use toISOString() for logical day keys anywhere.

#### 21. Assignment completion is split across two layers with different semantics (progress vs completed)
`🟡 Medium` · Dual write / orphaned state · impact: Correctness, Maintainability · ⟂ unverified

- **File:** `index.tsx:479`
- **Current Problem:** Finishing an assignment block triggers TWO independent writes to db.assignments: FocusSession.handleFocusComplete calls `updateAssignmentProgress(assignmentId, duration)` to bump progressMinutes (FocusSession.tsx:447), and index.tsx handleFocusComplete then sets `{completed:true}` unconditionally (index.tsx:479-481). The Dashboard 'mark complete' path (markComplete) updates neither — it only flips the plan block (Dashboard.tsx:1098-1102), so an assignment finished via the Dashboard checkmark is never marked completed nor credited progress.
- **Why It Matters:** Completion state depends on WHICH button the user presses. Via FocusSession the assignment is force-completed even if only a few minutes were logged (progress < estimatedEffort), so the progress bar and the completed flag disagree. The fragility is already acknowledged at Dashboard.tsx:1090 ('Calling it here caused double-counting'). Assignments are a core entity and their state is inconsistent.
- **Recommended Fix:** Centralize assignment state transitions in one function. Decide completion from progress vs estimatedEffort (or an explicit user action), and apply it identically whether the block is completed from FocusSession or the Dashboard checkmark.

#### 22. Readiness and per-subject stats silently ignore logs whose subject was wiped, while totals still count them
`🟡 Medium` · Orphaned records / stats math · impact: Correctness, Engagement · ⟂ unverified

- **File:** `Stats.tsx:705`
- **Current Problem:** Per-subject aggregates iterate the subjects array and filter logs by subject id (Stats.tsx:705-714), so any log whose subjectId no longer resolves (e.g. after a full re-onboard that clears subjects but a restore re-adds logs, or future per-subject delete) is dropped from per-subject rows. Other totals/streak math iterate logs directly (Dashboard.tsx:407-423, index.tsx:430-438) and still include those orphans. CoursesView.getTotalHours sums all matching logs regardless of subject existence (Courses.tsx:194-195).
- **Why It Matters:** Subject breakdowns won't sum to the headline totals when orphan logs exist, undermining trust in the analytics. readiness (getAllReadinessScores) is computed only for existing subjects, so decayed/critical signals for orphaned history just disappear rather than being surfaced or cleaned.
- **Recommended Fix:** Either guarantee logs are cascade-cleaned with their subject (see data-no-subject-delete-cascade) or add an explicit 'Unknown/Archived subject' bucket so orphan time is visible and totals reconcile.

#### 23. localStorage recovery net stores trimmed data, so a snapshot restore can silently drop older plans/logs
`🟡 Medium` · Recovery net / data safety · impact: Data safety, User retention · ⟂ unverified

- **File:** `db.ts:193`
- **Current Problem:** saveDbSnapshot trims plans to the last 30 days, logs to the last 500, and blockOutcomes to the last 200 before writing (db.ts:193-195). restoreDbFromSnapshot then CLEARS every table and bulkAdds only what the snapshot held (db.ts:236-255). If IndexedDB is lost and recovery falls back to this snapshot, all logs beyond 500 and plans older than 30 days are permanently gone — yet the UI reports '✅ DB restored' (db.ts:258).
- **Why It Matters:** The snapshot is sold as the 'recovery net' (db.ts:154). A user with long history who relies on it will silently lose streak history, older study logs (Stats/streak math reads all logs), and review-quality history, with a success message masking the loss.
- **Recommended Fix:** Either don't present the trimmed snapshot as a full backup (label it 'recent-only recovery'), warn on restore that it is partial, or keep the snapshot complete and only trim when actually over the size ceiling.

#### 24. Review block topicId is a name-slug string, never the numeric topic id — review tracking keys are inconsistent
`🟡 Medium` · Type-level integrity · impact: Correctness, Learning outcomes · ⟂ unverified

- **File:** `Dashboard.tsx:792`
- **Current Problem:** StudyTopic.id is a number (types.ts:175) but StudyBlock.topicId/StudyLog.topicId are strings (types.ts:107,198). The Dashboard builds a review block with `topicId: topic.name.toLowerCase().replace(/\s+/g,'-')` (Dashboard.tsx:792) — a derived slug, not the real id. Meanwhile recordTopicReview keys topics by `{subjectId, name}` lookup (brain.ts:567-569), ignoring topicId entirely. So topicId on blocks/logs is a third, unrelated identifier.
- **Why It Matters:** Renaming a topic (or two topics whose names slug-collide) breaks the linkage between a logged review and its StudyTopic, so spaced-repetition history and 'reviews due' can desync from what the user actually reviewed. Three different identity schemes for the same concept (numeric id, name, slug) is a latent corruption source.
- **Recommended Fix:** Pick one canonical topic key. Either make topicId always the numeric StudyTopic.id and look topics up by it, or commit to {subjectId,name} everywhere and drop the slug. Align the types accordingly.

#### 25. brain-enhanced-integration.generateEnhancedPlan is a dead duplicate of the live orchestrator
`🟡 Medium` · Dead/duplicated code · impact: Maintainability, Correctness · ⟂ unverified

- **File:** `brain-enhanced-integration.ts:588-662`
- **Current Problem:** brain-enhanced-integration.ts exports its own generateEnhancedPlan (588) that calls the core planner then applies performance adjustments — functionally overlapping with brain-ultimate's enhanced strategy. Nothing imports it: index.tsx imports generateEnhancedPlan from brain-ultimate (index.tsx:35), and the only other generateEnhancedPlan reference is the re-export in brain-ultimate. The enhanced-integration version (and its coreAnalyzeLoad import at line 18, applyInterleaving at 540, getQualityColor, getRecentOutcomes, getQualityDistribution, getStudyStreak, deleteOldOutcomes, getAllTimeStats) are largely unreferenced by the planner pipeline.
- **Why It Matters:** Two same-named planning functions with diverging tweak thresholds (e.g. enhanced-integration reduces at avgQuality<=2 / skipRate>0.4, brain-ultimate at avgQuality<2.5) is a maintenance trap — a future dev editing the wrong one changes nothing. It also inflates the apparent sophistication of the system while contributing zero runtime behavior.
- **Recommended Fix:** Delete the dead generateEnhancedPlan from brain-enhanced-integration (keep only the analytics helpers that are actually imported), so there is a single planning entry point.

#### 26. ESA focus loop decrements its budget even when a block fails to insert
`🟡 Medium` · Algorithm correctness · impact: Correctness, Learning outcomes · ⟂ unverified

- **File:** `brain.ts:1048-1060`
- **Current Problem:** The ESA multi-day focus loop computes esaRemaining = maxMinutes*focusRatio, then in a while loop calls tryInsertWithDisplacement(...) and unconditionally does `esaRemaining -= blockDuration` (brain.ts:1059) regardless of whether the insert succeeded. tryInsertWithDisplacement returns a boolean that is ignored. If an insert fails (e.g. maxBlocks reached or no displaceable victim), the budget still shrinks, so the loop can terminate having scheduled fewer focus minutes than intended. Note maxBlocks for ESA is 6 (brain.ts:719-727) and blockDuration is up to 90, so with focusRatio 0.70 of ESA_BASE_MIN=360 the intended ~252 focus minutes may be under-allocated.
- **Why It Matters:** On exam-eve (the highest-stakes planning moment), the focus subject can silently receive less time than the proximity formula promises, and the loop's own reason strings ('70% time reserved') then misrepresent what was actually scheduled.
- **Recommended Fix:** Only decrement esaRemaining when tryInsertWithDisplacement returns true; break out of the loop if an insert fails to avoid spinning. Apply the same fix pattern wherever the return value is ignored.

#### 27. Completion writes are split across FocusSession and index.tsx with no transaction, risking partial saves
`🟡 Medium` · Data integrity · impact: Data safety, Correctness, Maintainability · ⟂ unverified

- **File:** `FocusSession.tsx:458`
- **Current Problem:** A single completion fans out to multiple independent, non-transactional writes in two files: FocusSession.handleQualityRating writes the BlockOutcome (FocusSession.tsx:459) and, for reviews, the topic+log via recordTopicReview (line 469) BEFORE calling onComplete; then index.tsx handleFocusComplete writes the StudyLog (index.tsx:452), updates the plan (467), updates studyBlocks (470) and the assignment (479). None of these are wrapped in a Dexie transaction.
- **Why It Matters:** If any later write throws (e.g. plans.put fails), the earlier writes (blockOutcome, review log) have already committed, leaving the block marked complete in one store but not another, or an outcome with no matching log. handleFocusComplete's try/catch (index.tsx:451) only shows a toast and cannot roll back the FocusSession-side writes that already happened. The completion 'core journey' can therefore land in inconsistent states that the UI never reconciles.
- **Recommended Fix:** Consolidate the completion writes into one place and wrap the related db writes in a single db.transaction('rw', ...). At minimum, order writes so the cheapest/most-likely-to-fail run first, and revert on failure.

#### 28. Day-start hour slider allows 0–23, breaking effective-date and rollover logic for large values
`🟡 Medium` · Input validation / Rollover · impact: Correctness, User retention · ⟂ unverified

- **File:** `SettingsView.tsx:687`
- **Current Problem:** The Day Start Time slider is `min=0 max=23` (SettingsView.tsx:686-688), and getDayStartHour accepts any hour 0–23 (utils/time.ts:24). The effective-date rule is `if (istNow.getHours() < dayStartHour) previousDay` (time.ts:87). The doc comment even says 'configurable day start logic (0–6 AM)' (time.ts:4), contradicting the 0–23 UI.
- **Why It Matters:** If a user sets day start to, say, 20:00, then for 20 of every 24 hours getISTEffectiveDate() returns the previous calendar day, getTimeUntilRollover and the 60s rollover check thrash, and the New-Orbit-Cycle modal can trigger mid-afternoon and (per time-rollover-discards-inprogress-plan) wipe the plan. Even setting it to noon makes 'morning' study count as the prior day. The unbounded control turns a sensible night-owl feature into a foot-gun with no guard rails.
- **Recommended Fix:** Constrain the slider to the documented small-hours window (e.g. 0–6) to match the time.ts comment, or clamp/validate in getDayStartHour. Add a one-line explanation under the slider describing the rollover semantics.

#### 29. Rollover and loadData both set needsContext, racing to show two prompts on a date change
`🟡 Medium` · Rollover / concurrency · impact: Correctness, Engagement · ⟂ unverified

- **File:** `index.tsx:340`
- **Current Problem:** On a date change the checkRollover effect (index.tsx:340-349) detects lastCheckedDate !== current, sets setNeedsContext(true)/setTodayPlan(null) when no plan exists, and then also calls loadData(); loadData independently recomputes and sets needsContext (index.tsx:247-252). Separately, if the stale-plan branch (line 335) fired, showRolloverModal is also true. The 60s interval (line 364) plus the effect re-running on every todayPlan change (dependency at line 369) means checkRollover can run repeatedly while these async setStates settle.
- **Why It Matters:** The user can briefly see both the Rollover modal and the DailyContextModal, or get the context modal flashed open by loadData while the rollover modal is also mounted (both are rendered when their flags are true, index.tsx:583 and :618). The duplicated needsContext-setting logic in two places makes the prompt behavior hard to reason about and produces flicker/double-prompt on every real rollover — the moment that matters most.
- **Recommended Fix:** Make loadData the single owner of needsContext/todayPlan derivation; have checkRollover only invalidate (clear lastCheckedDate / trigger one loadData) and not set needsContext itself. Suppress the DailyContextModal while showRolloverModal is open.

#### 30. Completion toast-undo closure captures stale todayPlan/activeBlock and never reverts the log or studyBlocks row
`🟡 Medium` · State management · impact: Correctness, Data safety · ⟂ unverified

- **File:** `index.tsx:486`
- **Current Problem:** The UNDO handler (index.tsx:486-500) closes over `todayPlan` and `activeBlock` captured at completion time. It only flips the block's `completed` flag back on db.plans; it does NOT delete the StudyLog added at line 452, does NOT revert db.studyBlocks.update(...) from line 470, does NOT revert the assignment completion from line 479, and does NOT revert the BlockOutcome written by FocusSession. Because handleFocusComplete then calls loadData() and setActiveBlock(null) (lines 514-516), the captured `todayPlan` is stale by the time the user clicks UNDO.
- **Why It Matters:** UNDO appears to work (the block shows incomplete again) but the StudyLog, studyBlock row, completed assignment, and blockOutcome remain — so study time, streaks, and assignment status are silently wrong, and the plan write at line 496 is built from a stale plan snapshot that can clobber a newer plan loaded by the intervening loadData(). The product states undo should be a reliable toast pattern; here it is cosmetic and can corrupt state.
- **Recommended Fix:** Make undo reverse the full transaction: capture the inserted log id (db.logs.add returns it) and delete it, revert db.studyBlocks and the assignment, and remove the blockOutcome. Read current plan state inside the handler (or via a ref) instead of the captured closure value.

#### 31. Day rollover defaults to 4 AM, not the product-specified 2 AM
`⚪ Low` · Effective-date / spec mismatch · impact: Correctness · ⟂ unverified

- **File:** `utils/time.ts:41`
- **Current Problem:** getDayStartHour() returns 4 ('Default: 4 AM') when no setting is stored (utils/time.ts:41), and the header comment says 'configurable day start logic (0–6 AM)'. The product spec states rollover happens at 2:00 AM. getISTEffectiveDate uses this hour for every plan/log/backlog date boundary (utils/time.ts:83-92).
- **Why It Matters:** Study done between 2:00 and 3:59 AM IST is attributed to the PREVIOUS day's plan and streak, contradicting the documented 2 AM boundary. It also shifts what counts as 'past' in fetchBacklog's `p.date < today` (Dashboard.tsx:1021), affecting which blocks become backlog. Minor, but it is a real behavioral divergence from spec.
- **Recommended Fix:** Change the default to 2 to match the spec, or update the product definition; ensure the default and any onboarding default agree.

#### 32. Four brain modules with overlapping exports; generateEnhancedPlan duplicated and brain-enhanced-integration's version is dead
`⚪ Low` · Dead/duplicated logic · impact: Maintainability, Correctness · ⟂ unverified

- **File:** `brain-ultimate.ts:299`
- **Current Problem:** index.tsx imports generateEnhancedPlan from brain-ultimate (it aliases generateUltimatePlan, brain-ultimate.ts:299-303 → generateUltimatePlan at :82, which calls coreGeneratePlan in brain.ts and generateResearchGradePlan in brain-research-grade.ts). A SECOND generateEnhancedPlan exists in brain-enhanced-integration.ts:588 and is never the one used by the app. Many source comments are mojibake-corrupted (e.g. index.tsx:354 'âœ¨', :397 'ðŸ†•'), indicating UTF-8/encoding damage across the brain/UI files.
- **Why It Matters:** Two functions with the same name and different behavior is a real foot-gun: a maintainer wiring 'generateEnhancedPlan' could import the dead one and get a different plan pipeline. Dead duplicated planners also make it ambiguous which load-analysis/recovery code is authoritative when debugging backlog/duplication issues.
- **Recommended Fix:** Delete or clearly deprecate brain-enhanced-integration.generateEnhancedPlan, document the single pipeline (index → brain-ultimate → brain/research-grade), and run a one-time re-encode pass to fix the mojibake comments.

#### 33. Day rollover uses 4 AM default, not the product-specified 2 AM
`⚪ Low` · Spec mismatch · impact: Correctness · ⟂ unverified

- **File:** `utils/time.ts:41`
- **Current Problem:** Product spec states day rollover at 2:00 AM. getDayStartHour() returns a hardcoded default of 4 (utils/time.ts:41) when no setting is stored, and the doc comment at the top of time.ts says 'configurable day start logic (0-6 AM)'. getISTEffectiveDate (time.ts:83-92) treats anything before 4 AM IST as the previous day by default.
- **Why It Matters:** Between 2:00 and 4:00 AM IST, a user studying past midnight is logged against the previous study day rather than the new one (or vice-versa for their expectation), and the plan key under which work is saved differs from the user's mental model. Minor, but it is a direct deviation from the stated requirement and affects late-night logging accuracy.
- **Recommended Fix:** Change the default to 2 (matching spec) or update the product spec; ensure the Settings UI default agrees with whatever is chosen.

#### 34. Generating overlay claims a 'triple-brain' run that does not happen for most users
`⚪ Low` · UX honesty / spec mismatch · impact: Engagement, Correctness · ⟂ unverified

- **File:** `DailyContextModal.tsx:21-27`
- **Current Problem:** PLAN_STAGES tells the user it is 'Running the triple-brain algorithm… Core + Enhanced + Research layers' and 'Balancing your subject load… Interleaving & burnout check' (DailyContextModal.tsx:21-27, plus 'Orbit Brain v3' at line 118). In reality, for <5-day and >=30-day users only generateResearchGradePlan runs (no core interleaving/circadian, no break injection), and the burnout/interleaving analysis in brain-ultimate (189-191) is computed but never used to alter blocks. The stage timings are also purely cosmetic timers (setInterval) unrelated to actual compute.
- **Why It Matters:** The overlay overstates the work performed; combined with the dead feedback loop and ignored context fields, it creates a misleading impression of intelligence. For an audit of planner honesty this is worth noting even though it is cosmetic.
- **Recommended Fix:** Make the copy reflect the engine actually selected, or genuinely run and apply the advertised layers (interleaving/burnout-adjusted blocks) before returning the plan.

#### 35. Snapshot 30-day plan cutoff uses toISOString() (UTC), can prune the current logical day's plan early
`⚪ Low` · Timezone consistency · impact: Data safety, Correctness · ⟂ unverified

- **File:** `db.ts:171`
- **Current Problem:** saveDbSnapshot computes the retention cutoff as `thirtyDaysAgo.toISOString().split('T')[0]` (db.ts:169-171) and filters `allPlans.filter(p => p.date >= cutoffDate)` (line 193). Plan dates are IST effective dates, but the cutoff is a UTC date derived from host time, so the comparison mixes timezones.
- **Why It Matters:** The recovery snapshot is the local-first safety net. Because the cutoff boundary is off by the UTC↔IST offset, the oldest day in the 30-day window can be dropped a few hours early relative to the IST calendar. Low severity (only the 30-day-old edge plan, and IndexedDB still holds it), but it is another instance of the toISOString()-for-logical-dates anti-pattern the time module forbids, and it undermines the 'recovery net' guarantee at the boundary.
- **Recommended Fix:** Derive the cutoff from getISTEffectiveDate() arithmetic (parseLocalDate minus 30 days, formatLocalDate) so the snapshot window aligns with the IST dates the plans are actually keyed by.

<a id="part-5"></a>
### Part 5 — Code Quality Audit
_36 findings — 2 Critical, 9 High, 16 Medium, 9 Low_

#### 1. Focus-complete UNDO callback closes over stale `todayPlan`/`activeBlock` and overwrites the DB
`🔴 Critical` · Stale closures · impact: Data safety, Correctness · ✅ verified

- **File:** `index.tsx:485-516`
- **Current Problem:** Inside `handleFocusComplete`, the toast UNDO `onClick` (487-500) captures `todayPlan` and `activeBlock` from the closure at completion time. After registering the toast, the same function calls `await loadData()` (514) — which replaces `todayPlan` with a fresh DB read — and `setActiveBlock(null)` (516). When the user later clicks UNDO, it rebuilds `revertPlan` from the STALE captured `todayPlan` and does `db.plans.put(revertPlan)` (496), clobbering any blocks completed/edited after this one. The undo also never deletes the StudyLog it added (452-460), never reverts the `db.studyBlocks.update(...completed:true)` (470), and never reverts the assignment `completed:true` (479-481).
- **Why It Matters:** The undo can resurrect a stale snapshot of the plan and silently discard subsequent progress (data loss), and even on the happy path it leaves an orphan StudyLog so streaks/analytics double-count a session the user 'undid'. This is the core focus->complete->undo journey.
- **Recommended Fix:** Make undo read the current plan from the DB at click time (not the captured value), and have it fully reverse the transaction: delete the added log by id, revert the studyBlocks row and assignment flag. Better: store the created log id and wrap the original mutation so undo replays the inverse.
- **Verifier note:** index.tsx:485-501 UNDO closes over todayPlan/activeBlock from completion time, writes that stale plan via db.plans.put(revertPlan), and never removes the db.logs.add'd StudyLog (452) nor reverts db.studyBlocks(470)/db.assignments(479) — leaves orphan log and risks stale overwrite.

#### 2. Conditional early return precedes 11+ hooks (Rules of Hooks violation -> crash)
`🔴 Critical` · correctness/react-hooks · impact: crash, broken core journey, data-display loss · ✅ verified

- **File:** `Stats.tsx:666`
- **Current Problem:** The `if (filteredLogs.length === 0) return <EmptyStats/>` early-return at line 666 sits BEFORE useMemo at 700/736/750/766/777-780, useState(0) at 794, useEffect at 796 and 900, and useMemo at 810/1026. The hook call count differs between the empty and non-empty render paths.
- **Why It Matters:** When filteredLogs flips between empty and non-empty (the very first focus session is logged, or the user switches time range so a range becomes empty/non-empty), React's hook order changes and it throws 'Rendered fewer hooks than expected', white-screening the Stats tab — a core journey.
- **Recommended Fix:** Move ALL hooks above the early return. Compute filteredLogs/derived memos unconditionally, then do `if (filteredLogs.length === 0) return <EmptyStats/>` only after every hook has run.
- **Verifier note:** Stats.tsx:666 `if (filteredLogs.length === 0) return <EmptyStats/>` precedes useMemo(700/736/750/766/777-780), useState(794), useEffect(796/900), useMemo(810/1026); hook count differs empty vs non-empty render = genuine Rules of Hooks violation.

#### 3. Project edit silently discards milestone and session-log changes
`🟠 High` · CRUD correctness · impact: data loss, wrong behavior, user confusion · ✅ verified

- **File:** `ProjectsView.tsx:846`
- **Current Problem:** ProjectForm always passes `{ ...f, milestones: ms }` to onSave (line 489), and in edit mode it seeds `ms` from initial milestones and lets the user add/remove them. But handleEdit (846-860) only updates name/subjectId/effort/deadline/priority/notes/githubUrl — it never writes `milestones`. Any milestone the user adds or deletes in the edit modal is silently lost on save.
- **Why It Matters:** The edit form visibly presents an editable milestone list, so users reasonably believe their changes persist; instead they vanish, and because milestones drive getPct() the displayed progress is also affected. This is a silent data-loss-of-intent bug.
- **Recommended Fix:** In handleEdit, include `milestones: form.milestones?.length ? form.milestones : undefined` in the db.projects.update payload (mirroring handleCreate at line 838).
- **Verifier note:** ProjectForm always calls onSave({...f, milestones: ms}) (ProjectsView.tsx:489) and edit mode lets user add/remove ms (367,381,471), but handleEdit (ProjectsView.tsx:849-857) omits milestones from db.projects.update, so milestone changes are silently dropped on edit. (Note: sessionLog is not a form field, so only the milestone-loss half of the title applies.)

#### 4. QuestionCard answer state leaks across questions (not keyed)
`🟠 High` · uncontrolled inputs · impact: wrong behavior, stale UI, grading errors · ✅ verified

- **File:** `ExamSimulator.tsx:684`
- **Current Problem:** QuestionCard holds local `selected`/`shortInput` state (207-208) but is rendered without a key tied to currentQ (684). When the user clicks Next (694), React reuses the same component instance, so the previously selected MCQ option / typed short answer stays in state for the next, different question.
- **Why It Matters:** The next question can show a pre-selected option that belongs to the prior question, and Submit can fire that stale answer — directly corrupting exam results. canSubmit may also be wrongly true before the user touches the new question.
- **Recommended Fix:** Add `key={q.id}` (or `key={currentQ}`) to the <QuestionCard> at line 684 so each question gets a fresh component instance with reset local state.
- **Verifier note:** QuestionCard holds local selected/shortInput state (ExamSimulator.tsx:207-208) and is rendered with no key (684); Next does setCurrentQ(c=>c+1) (694) which only swaps the question prop, so the prior selection/typed text persists into the next unanswered question.

#### 5. Research-grade mastery/gain singletons are in-memory and reset every page reload
`🟠 High` · over-engineering / broken feedback loop · impact: dead-state, misleading-AI, wasted-compute · ✅ verified

- **File:** `brain-research-grade.ts:594`
- **Current Problem:** masteryTracker, gainPredictor, optimizationSolver are module-level singletons (lines 594-596). recordBlockOutcome feeds them via the dual-write in brain-ultimate.ts:259, but nothing persists their state to Dexie/localStorage. In a local-first app users reload constantly, so BKT mastery and the 'learned gain function' always start empty.
- **Why It Matters:** The research path is the active planner when uniqueDays<5 and >=30 (brain-ultimate.ts:104,140). Its plans claim confidence 0.7-0.95 and 'averageMasteryProbability', but those numbers are derived from state that is wiped each session, so the sophistication is an illusion and may bias plans unpredictably.
- **Recommended Fix:** Either persist the tracker state to Dexie and rehydrate on init, or delete the research-grade engine and route all maturity tiers through the core/enhanced planner that reads persisted logs.
- **Verifier note:** brain-research-grade.ts:594-596 declares module-level singletons; BayesianMasteryTracker (line 217-220) stores state only in an in-memory Map with no load/save, fed via brain-ultimate.ts:259 dual-write but never persisted to Dexie/localStorage (db only used for reads at 617-619). State resets on reload.

#### 6. Entire utils/validation.ts (467 lines, 25+ validators) is never imported
`🟠 High` · dead code / missing pre-persistence validation · impact: dead-code, unvalidated-writes, data-integrity · ✅ verified

- **File:** `utils/validation.ts:1`
- **Current Problem:** No source file imports from utils/validation.ts (grep for './utils/validation' and for each validator name returns only the file itself). validateSubject, validateDuration, sanitizeInput, validateDueDate, isValidDateString, etc. are all unreachable.
- **Why It Matters:** This is both pure dead weight and a real gap: subjects, assignments, durations, and dates are persisted to IndexedDB with no validation/sanitization layer, despite a complete one sitting unused. The file header literally says 'Copy this file directly to your project' — it was pasted but never wired in.
- **Recommended Fix:** Wire validateSubject/validateDuration/sanitizeInput into the Courses/assignment/daily-context save paths before db.put/add, or delete the file if validation is intentionally handled inline.
- **Verifier note:** Grep for 'utils/validation' and for validator names (validateSubject, isValidDateString, parseDateString, sanitizeInput, etc.) returns only validation.ts itself; no importers anywhere in the repo (utils/validation.ts:1).

#### 7. Three competing localStorage settings keys; sound-enabled read from a key the UI never writes
`🟠 High` · State management · impact: Correctness, Maintainability · ⟂ unverified

- **File:** `index.tsx:110-116`
- **Current Problem:** Settings are scattered across `orbit-prefs` and `orbit-settings-v2` with no single owner. On mount, index.tsx (112-114) reads `JSON.parse(localStorage.getItem('orbit-prefs')).soundEnabled` to set `SoundManager.setEnabled`. But the live settings UI writes audio to `orbit-settings-v2` (SettingsView.tsx:838 `updateSetting('audio.enabled', ...)`, persisted by SettingsContext.tsx:158) and `sounds.ts` itself reads `orbit-settings-v2` (sounds.ts:25-29). `orbit-prefs` is only ever written by the legacy Onboarding import path (Onboarding.tsx:115). So the startup sound-enable read is from a key the modern UI never populates — it is effectively dead/always-false. time.ts compounds this by reading `orbit-settings-v2.study.dayStartHour` then falling back to `orbit-prefs.dayStartHour` (time.ts:20-37).
- **Why It Matters:** Settings appear not to take effect (sound toggled on in Settings but the boot read says off), and the dual-key fallback means behavior depends on migration order. Scattered try/catch reads with silent `catch {}` hide all of this.
- **Recommended Fix:** Pick one key (`orbit-settings-v2`) as the single source of truth, delete the `orbit-prefs` read in index.tsx (or route it through SettingsContext), and have SoundManager subscribe to settings changes instead of being seeded from a stale key on boot.

#### 8. Dual `view` + `activeTab` state desyncs on focus-exit, rollover, and onboarding
`🟠 High` · State management · impact: Correctness, Maintainability · ⟂ unverified

- **File:** `index.tsx:73-87,517,529,572`
- **Current Problem:** `view` (line 73) and `activeTab` (line 85) are two independent state atoms representing the same concept. `switchTab` (526-530) keeps them in sync, but the focus-exit handler `onExit={() => setView(activeTab as any)}` (572) and focus-complete `setView(activeTab as any)` (517) restore `view` from `activeTab`, trusting it is current. Meanwhile the rollover modal, `needsContext`, and onboarding paths mutate `view`/`needsContext` WITHOUT updating `activeTab` (e.g. 298, 347, 537, 563). Values like 'schedule'/'review' exist in the `view` union but are not in DESKTOP_TABS/MOBILE_TABS, so they can never be returned to via the nav after a focus session — and the main content switch keys entirely off `activeTab` (774-803), so `view` transitions to 'schedule'/'review' render nothing in <main>.
- **Why It Matters:** Two sources of truth for navigation is a classic desync bug factory. A user who deep-links into 'schedule' or 'review' (only reachable via CustomEvent/older code) then starts a focus session is returned to a stale tab, and those views are unreachable from the visible nav at all. The redundancy also makes every new screen require updating two unions plus switchTab.
- **Recommended Fix:** Collapse to a single navigation state. Derive the focus/onboarding/context overlays as booleans (e.g. `mode: 'focus' | 'onboarding' | null`) layered over one `activeTab`, instead of overloading a second `view` union that partially duplicates the tab set.

#### 9. Rollover effect ignores configurable day-start hour and runs on a stale-closure interval
`🟠 High` · Hooks correctness · impact: Correctness, Productivity · ⟂ unverified

- **File:** `index.tsx:321-369`
- **Current Problem:** The rollover effect depends on `[todayPlan, toast]` (369). `getISTEffectiveDate()` depends on `study.dayStartHour` (time.ts:17-42), which is NOT in the dependency array, so changing the day-start hour in Settings does not re-arm or re-evaluate this effect. The 60s `setInterval` (364-366) closes over `checkRollover`, which in turn closes over `loadData` (a non-memoized function recreated every render that itself closes over `todayPlan`/`toast`); because the effect only re-subscribes when `todayPlan`/`toast` change, the interval can call a stale `loadData`. The `rolloverCheckInProgress` ref (325-329) only prevents overlapping calls within one instance — it does nothing for the staleness.
- **Why It Matters:** A user who changes their day-start hour won't see rollover behave correctly until an unrelated state change; and the interval may operate on stale plan state. Day rollover is a core mechanic of the planner.
- **Recommended Fix:** Wrap `loadData` in `useCallback`, add `settings.study.dayStartHour` to the rollover effect deps (or read it inside via a ref), and have the interval call the latest `checkRollover` via a ref to avoid stale closures.

#### 10. Heatmap keys days by UTC date while logs are stored as IST effective dates
`🟠 High` · correctness/date · impact: wrong analytics, misattributed days · ✅ verified

- **File:** `Stats.tsx:756`
- **Current Problem:** heatmapData builds `dateStr = d.toISOString().split('T')[0]` (UTC) to match against `l.date`, but logs store the IST effective date (via formatLocalDate/getISTEffectiveDate). The sibling `series` memo at line 772 correctly uses formatLocalDate, so the two charts disagree.
- **Why It Matters:** For users in IST (UTC+5:30), the local calendar day and the UTC day differ for part of every day, so the 90-day heatmap can show study minutes on the wrong cell or a false zero/gap, undermining the streak/consistency story the product is built around.
- **Recommended Fix:** Use formatLocalDate(d) for the heatmap dateStr (and anywhere else minutes are bucketed by day) so all day-keying matches how logs.date is written.
- **Verifier note:** Stats.tsx:756 uses d.toISOString().split('T')[0] (UTC) to match l.date while sibling series memo (772) uses formatLocalDate(d); in IST UTC string is prior calendar day so heatmap misattributes daily minutes.

#### 11. calculateStreak mixes IST effective date with UTC date strings
`🟠 High` · correctness/date · impact: wrong streak, off-by-one day · ✅ verified

- **File:** `Stats.tsx:399`
- **Current Problem:** `todayStr = getISTEffectiveDate()` (IST) and `today = parseLocalDate(todayStr)`, but the loop compares against `d.toISOString().split('T')[0]` / `checkDate.toISOString().split('T')[0]` (UTC) at lines 399 and 404. The 'broken/continue' branch at 409 compares the UTC string to the IST todayStr.
- **Why It Matters:** The current and thisWeek streak counts can be off by a day for IST users near midnight, and the today-skip logic at line 409 may never match, so a legitimately active today can be misread as a broken streak (or vice versa).
- **Recommended Fix:** Build every dateStr with formatLocalDate of a date derived from parseLocalDate(todayStr); never call toISOString() inside this streak math.
- **Verifier note:** Stats.tsx:392 todayStr=getISTEffectiveDate() and uniqueDates from IST l.date, but loop compares d.toISOString() (399) and checkDate.toISOString() (404) UTC strings; dateStr===todayStr self-heal at 409 compares UTC vs IST and can fail near midnight.

#### 12. AIStudyAssistant is a god-component with a ~520-line render
`🟡 Medium` · oversized components · impact: maintainability, review difficulty · ✅ verified

- **File:** `AIStudyAssistant.tsx:999`
- **Current Problem:** The single AIStudyAssistant component (845-1364) owns 11 useState hooks, context loading, streaming, Feynman branching, plus inline JSX for header, four tabs, chat list, context mini-map, resources list, and input area in one ~520-line return.
- **Why It Matters:** Oversized render bodies are hard to test and reason about; the chat/resources/notes/exam tabs are independent concerns that are re-evaluated on every keystroke (input state lives at the top level), and the inline resource/badge markup is non-reusable.
- **Recommended Fix:** Extract ChatTab, ResourcesTab, the context snapshot block, and the input bar into separate components; lift `input` into the chat subtree so typing doesn't re-render the whole modal.
- **Verifier note:** Single AIStudyAssistant component spans lines 845-1366 with 11 useState hooks (846-856) plus context load, streaming, Feynman branch, and all four tabs inline in one return (999-1364). The render is ~365 lines (not literally 520) but the god-component substance holds; Medium fair.

#### 13. Project delete uses native confirm() and has no toast-undo
`🟡 Medium` · error handling · impact: data loss, inconsistent UX · ✅ verified

- **File:** `ProjectsView.tsx:862`
- **Current Problem:** handleDelete (862-865) calls the blocking native `confirm()` then permanently `db.projects.delete(id)` with only a 'Deleted' success toast — no undo. Milestone delete (161) and the destructive op have no recovery path either.
- **Why It Matters:** Product intent is 'Undo via toasts.' A hard delete of a project (with all milestones and session history) and no undo is unrecoverable data loss; native confirm() is also non-stylable and blocks the event loop, inconsistent with the app's custom modals.
- **Recommended Fix:** Replace confirm() with an in-app confirm modal and implement soft-delete + a toast 'Undo' (re-add the cached project record on undo), matching the documented toast-undo pattern.
- **Verifier note:** handleDelete (ProjectsView.tsx:862-865) uses blocking native confirm() then db.projects.delete(id) with only a 'Deleted' toast and no undo; milestone del (161) likewise has no recovery path.

#### 14. MCQ/true-false grading still false-positives via startsWith
`🟡 Medium` · error handling · impact: wrong scoring, silent correctness bug · ✅ verified

- **File:** `ExamSimulator.tsx:147`
- **Current Problem:** gradeAnswer (140-148) accepts an answer when `question.correctAnswer.toLowerCase().startsWith(given)`. A prior letter-prefix bug was fixed, but this remaining clause means any non-empty prefix of the correct answer grades as correct — e.g. correct 'True' + user typed 'T' (or 'Tr') is marked correct; correct 'False' + 'F' too.
- **Why It Matters:** For true/false and any free-typed option this systematically over-credits partial/prefix inputs, inflating exam scores and undermining the simulator's purpose. The selection UI usually sends full option text, but short prefixes and edited inputs slip through.
- **Recommended Fix:** Drop the startsWith branch for mcq/true_false and compare normalized equality only (optionally also match against the option letter A-D); reserve fuzzy matching for the short-answer path.
- **Verifier note:** gradeAnswer keeps `|| question.correctAnswer.toLowerCase().startsWith(given)` (ExamSimulator.tsx:148); any non-empty prefix of the correct answer grades correct (e.g. correct 'Tomorrow', given 'T'). canSubmit blocks empty, but prefix false-positives remain — Medium is fair.

#### 15. Three parallel readiness algorithms with diverging results
`🟡 Medium` · duplicated logic · impact: duplication, inconsistent-output · ✅ verified

- **File:** `brain.ts:325`
- **Current Problem:** Readiness is computed by brain.calculateReadiness (brain.ts:325), brain.getAllReadinessScores (brain.ts:627), and research calculateProbabilisticReadiness/getAllReadinessScores (brain-research-grade.ts:273,902). brain-ultimate.getUnifiedReadiness switches between core and research at the 14-day boundary (brain-ultimate.ts:280), and Courses.tsx still calls predictReadiness from core directly.
- **Why It Matters:** The same 'readiness' number shown across Dashboard/Courses/DailyContext can be produced by different models depending on data age and which import a component used, so the same subject can show inconsistent scores. Decay constants and weights are duplicated (RESEARCH_CONFIG vs core constants).
- **Recommended Fix:** Pick one readiness implementation behind a single exported function and have every consumer call it; remove the others.
- **Verifier note:** Three implementations exist: brain.calculateReadiness (brain.ts:325, volume/recency), brain.getAllReadinessScores (brain.ts:627), research getAllReadinessScores (brain-research-grade.ts:902, Bayesian). brain-ultimate.getUnifiedReadiness (line 274-289) switches between core/research on uniqueDays>=14, so two diverging algorithms feed the same consumer alias.

#### 16. Dead brain exports: runBrain, runWhatIfScenario, exportResearchData, runAblationStudy, generateEnhancedDailyPlan
`🟡 Medium` · dead code · impact: dead-code, maintenance-drag · ✅ verified

- **File:** `brain.ts:65`
- **Current Problem:** runBrain (brain.ts:65) plus its helpers computeDailyFacts/computeWeeklyFacts/computeAlerts/normalizeWeeklyTrend and the BrainInput/BrainOutput interfaces are referenced only inside brain.ts. runWhatIfScenario (brain.ts:1492), and brain-research-grade exportResearchData/runAblationStudy/generateEnhancedDailyPlan have zero importers across the codebase.
- **Why It Matters:** ~5k LOC across four brain files, much of it unreachable, makes the planning layer extremely hard to reason about and hides which code actually runs. The 'runBrain' facts/alerts pipeline looks like a whole abandoned generation of the engine.
- **Recommended Fix:** Delete unreferenced exports and their private helpers; collapse the brain stack toward the one path index.tsx actually calls (generateEnhancedPlan -> generateUltimatePlan).
- **Verifier note:** runBrain (brain.ts:65), runWhatIfScenario (brain.ts:1492), exportResearchData (brain-research-grade.ts:841), runAblationStudy (brain-research-grade.ts:857), generateEnhancedDailyPlan (brain-research-grade.ts:894): grep for each name outside its definition returns no references; all are dead exports.

#### 17. Block outcome date uses UTC, not the IST effective date the product specifies
`🟡 Medium` · correctness / date handling · impact: wrong-day-bucketing, analytics-skew · ✅ verified

- **File:** `brain-enhanced-integration.ts:195`
- **Current Problem:** recordBlockOutcome stamps date = new Date(now).toISOString().split('T')[0] (UTC) and timeOfDay = getHours() (local) (brain-enhanced-integration.ts:195-196), even though tracking.ts and utils/time export getISTEffectiveDate for exactly this. brain-ultimate uses the same UTC pattern for the research effectiveDate (lines 107,143).
- **Why It Matters:** For an IST user studying in the evening, UTC is still the previous day, so outcomes/streaks/analytics bucket into the wrong day and disagree with the IST-based daily plan, undermining streaks and 'recent quality' trends.
- **Recommended Fix:** Replace toISOString().split('T')[0] date stamping with getISTEffectiveDate() so outcomes align with the plan's effective date.
- **Verifier note:** brain-enhanced-integration.ts:195 stamps date via new Date(now).toISOString().split('T')[0] (UTC) and timeOfDay via getHours() (local, line 196), while getISTEffectiveDate exists and is re-exported from tracking.ts:9 (./utils/time). Around IST midnight the UTC date is off by one day.

#### 18. Active research planner uses hardcoded durations and recentQuality, ignoring most context
`🟡 Medium` · under-engineering behind a research facade · impact: wrong-behavior, plan-quality · ✅ verified

- **File:** `brain-research-grade.ts:640`
- **Current Problem:** generateResearchGradePlan only emits review(45)/prep(30) blocks (lines 640-643) and feeds the 'gain predictor' constant recentQuality:3.5 and interleaving:true (lines 655-656,708-709). Despite the ILP/learned-gain framing, candidate generation is fixed and energyLevel is a crude mood->{60,80,90} mapping (brain-ultimate.ts:93).
- **Why It Matters:** This path runs for brand-new users (uniqueDays<5) and mature users (>=30). Plans look principled but are driven by constants, so the elaborate machinery produces worse, less context-aware plans than the simpler core generateDailyPlan for the very users it serves.
- **Recommended Fix:** Either feed real per-subject recent quality/last-studied into the gain features, or drop the research path and always use core/enhanced.
- **Verifier note:** generateResearchGradePlan emits only review(45)/prep(30) (brain-research-grade.ts:640-643) and hardcodes recentQuality:3.5 + interleaving:true (655-656, 708-709). It is a live path: generateUltimatePlan calls it for uniqueDays<5 (brain-ultimate.ts:108) and >=30 (line 144).

#### 19. Plan persistence writes plan and per-block rows non-atomically; partial failure desyncs stores
`🟡 Medium` · Race conditions · impact: Data safety, Correctness · ⟂ unverified

- **File:** `index.tsx:395-401`
- **Current Problem:** `handleContextGenerate` does `await db.plans.put(plan)` (395) and then a separate `await Promise.all(plan.blocks.map(b => db.studyBlocks.put(...)))` (398-401) outside any transaction. If the second write partially fails, `db.plans` and `db.studyBlocks` diverge. The same split exists in `handleFocusComplete`, which updates `db.plans` (467) and `db.studyBlocks` (470) separately. The `planGenerationInProgress` ref (372-377) only blocks concurrent generation; it provides no atomicity.
- **Why It Matters:** The plan (dashboard source) and studyBlocks (backlog source) can disagree about which blocks exist/are complete after a partial write, which then feeds the manual backlog migration with inconsistent data.
- **Recommended Fix:** Wrap the plan + studyBlocks writes in a single `db.transaction('rw', db.plans, db.studyBlocks, ...)` so they commit or roll back together, in both handleContextGenerate and handleFocusComplete.

#### 20. Cross-view navigation via window CustomEvents is a fragile prop-drilling workaround
`🟡 Medium` · React architecture · impact: Maintainability, Correctness · ⟂ unverified

- **File:** `index.tsx:542-555`
- **Current Problem:** Child views navigate by dispatching global `window` CustomEvents — `orbit:navigate` with `{tab}` and `navigate-to-dashboard` (Stats.tsx:673,874,1059). The App listener (542-555) is registered once with `[]` deps and an eslint-disable, calling `switchTab` from the first-render closure. The event detail `tab` is untyped/unvalidated (544): an event with `detail.tab='schedule'` would set `activeTab='schedule'`, which renders an empty <main> (no DESKTOP/MOBILE tab matches). There is no compile-time guarantee that dispatched tab names are valid tabs.
- **Why It Matters:** String-keyed global events bypass React's data flow, are invisible to type-checking, and silently no-op or render blank when a typo or removed tab name is dispatched. This is a hidden coupling that will rot as views are renamed.
- **Recommended Fix:** Replace the window-event channel with a typed navigation function passed via a small Navigation context (or the existing settings/app context), so navigation targets are type-checked and discoverable.

#### 21. Day-start hour defaults to 4 AM everywhere; product spec says 2:00 AM
`🟡 Medium` · Correctness · impact: Correctness · ⟂ unverified

- **File:** `SettingsContext.tsx:59`
- **Current Problem:** The product owner states day rollover happens at a 2:00 AM day-start hour. Every default in the code uses 4: SettingsContext.tsx:59 (`dayStartHour: 4`), SettingsContext.tsx:241 (`getDayStartHour` fallback `|| 4`), utils/settingsHelper.ts:62 and :141 (`?? 4`), and utils/time.ts:41 (`return 4`). There is no 2 anywhere.
- **Why It Matters:** A brand-new user (or anyone who never opens Settings) gets a 4 AM rollover, so study done between 2:00–4:00 AM is logged to the previous day, contradicting the intended behavior and skewing streaks/plan currency for the exact night-owl users this hour exists to serve.
- **Recommended Fix:** If 2 AM is the intended default, change all five default sites to 2 (and ensure they agree). If 4 AM is actually intended, update the product spec — but the divergence across files should be unified to one shared constant regardless.

#### 22. `loadData` recreated every render and omitted from effect deps via eslint-disable
`🟡 Medium` · Hooks correctness · impact: Maintainability, Correctness · ⟂ unverified

- **File:** `index.tsx:225-268`
- **Current Problem:** `loadData` is a plain async function declared in the component body (225), so it is a new reference every render and closes over `toast`. It is consumed by the init effect (deps `[]`, line 319), the rollover effect/interval (321-369), `handleContextGenerate`, `handleFocusComplete`, and Dashboard's `onRefresh` (784). None of these can list `loadData` as a dependency without churn, so the codebase relies on the closures happening to be 'good enough'. The `loadDataInProgress`/`pendingLoadRef` one-slot queue (228-266) serializes concurrent calls but collapses N queued requests into exactly one re-run, so rapid distinct triggers can be coalesced and a caller's expected refresh may reflect an earlier state.
- **Why It Matters:** Non-memoized async callbacks wired into multiple effects/intervals are the root cause of the stale-closure issues elsewhere in this file (rollover, undo). The pending-queue masks reentrancy rather than ordering it, so under bursty navigation the UI can settle on a stale snapshot.
- **Recommended Fix:** Wrap `loadData` in `useCallback` with explicit deps (or move it into a custom hook/reducer), then add it to the dependent effects. Replace the boolean one-slot queue with a proper request-coalescing/latest-wins pattern that guarantees a final refresh after the last trigger.

#### 23. `calculateStreak` keys days by local/UTC date while logs are stored by IST effective date
`🟡 Medium` · Correctness · impact: Correctness, Engagement · ⟂ unverified

- **File:** `index.tsx:425-441`
- **Current Problem:** `calculateStreak` builds the day keys with `new Date()` and `d.toISOString().split('T')[0]` (436), i.e. the browser's local date converted to UTC. But logs are written with `date: getISTEffectiveDate()` (handleFocusComplete line 449, 458) — an IST + day-start-hour adjusted key. For any user not in UTC (e.g. the IST user this app targets), the generated comparison key can differ from the stored log key around midnight/day-start, breaking the streak match.
- **Why It Matters:** Streaks are a primary engagement mechanic and the app explicitly targets IST. A streak that silently resets because of a timezone key mismatch directly undermines retention, and notification milestones (505) keyed off this value will misfire.
- **Recommended Fix:** Compute the streak day keys using the same `getISTEffectiveDate()`-style logic (IST + dayStartHour) used to write logs, e.g. derive each prior day from the IST effective date and `parseLocalDate`, rather than `toISOString()`.

#### 24. ToastProvider wraps the entire app, so every toast re-renders all of App
`🟡 Medium` · Context design · impact: Engagement, Maintainability · ⟂ unverified

- **File:** `index.tsx:1009-1013`
- **Current Problem:** Root nesting is `<ToastProvider><SettingsProvider><App/></SettingsProvider></ToastProvider>`. ToastProvider holds `toasts` state (Toast.tsx:38) and its context `value` is an inline object recreated every render (Toast.tsx:70). Because the provider's children are the whole app, every `showToast`/`removeToast` (including the 5s auto-dismiss timer, Toast.tsx:49) triggers a state change that re-renders ToastProvider and, with a fresh `value` object, cascades a re-render through SettingsProvider and App on each toast appear/disappear.
- **Why It Matters:** Toasts fire on routine actions (block complete, plan generated, errors). Each one re-renders the entire dashboard/stats tree twice (show + auto-dismiss), causing avoidable jank, and the inline context value defeats any memoization consumers might add.
- **Recommended Fix:** Memoize the ToastContext value with `useMemo`, render `<ToastContainer>` as a sibling portal rather than wrapping children, or split the toast list state out of the provider so toggling toasts doesn't re-render consumers of the context API.

#### 25. 2034-line god component mixing presentation, analytics, and data access
`🟡 Medium` · architecture/oversized-component · impact: unmaintainable, hard to test, poor reuse · ✅ verified

- **File:** `Stats.tsx:544`
- **Current Problem:** StatsView (starts 544) bundles 5 presentational subcomponents, ~9 analytics helpers, 5 useLiveQuery/db calls, CSV/iCal exporters, dynamic brain imports, and a ~900-line return tree with five inline view-mode branches (render returns at 1437/1505/1594/1762/1809/1967).
- **Why It Matters:** The pure analytics math (streak, time-of-day, productivity) is impossible to unit-test in isolation, the date bugs above hide easily in the noise, and every render walks a huge tree. It is the root cause amplifying the other findings.
- **Recommended Fix:** Extract analytics helpers to a pure ./utils/statsMath.ts module (independently testable), split each ViewMode branch into its own component, and lift the db/brain fetching into a useStatsData hook.
- **Verifier note:** Stats.tsx is 2034 lines; StatsView starts :544 with 5 subcomponents, ~9 analytics helpers, multiple useLiveQuery/db calls, CSV/iCal exporters (:924/:955), dynamic brain imports (:606/:628), main return :1114 with inline view-mode branch returns at 1437/1505/1594/1762/1809/1967.

#### 26. Unmemoized `now`/`today` recreated each render defeats useMemo and is an unstable dep
`🟡 Medium` · performance/memoization · impact: wasted recompute, unstable deps · ✅ verified

- **File:** `Stats.tsx:646`
- **Current Problem:** `const now = new Date()` (646) and `today` (567) are recreated every render. `now` is a dependency of the `series` useMemo (line 775), and rangeStart/daysDiff/daysInRange derive from `now`, so the memo recomputes on every render.
- **Why It Matters:** Several O(logs) reductions (series, and indirectly anything depending on daysInRange) re-run every render of a 2000-line tree, negating the useMemo work and adding avoidable jank as the dataset grows.
- **Recommended Fix:** Memoize now/today once (e.g. useMemo(() => new Date(), []) or derive from a stable effective-date string) and remove `now` from dep arrays, or capture a primitive timestamp.
- **Verifier note:** Stats.tsx:646 const now=new Date() recreated every render and listed as dep of series useMemo at :775; rangeStart/daysDiff/daysInRange derive from now, so series recomputes each render.

#### 27. Previous-period boundary uses UTC string while current uses local date
`🟡 Medium` · correctness/date · impact: wrong trend %, inconsistent boundary · ✅ verified

- **File:** `Stats.tsx:663`
- **Current Problem:** `rangeStartStr = formatLocalDate(rangeStart)` (line 658) but `prevRangeStartStr = prevRangeStart.toISOString().split('T')[0]` (line 663). prevLogs is filtered with a UTC lower bound and a local upper bound.
- **Why It Matters:** The trend percentages (totalMinutes vs prevMinutes at line 683 and per-subject trend at 709) can include/exclude an extra boundary day for IST users, producing misleading up/down arrows in the UI.
- **Recommended Fix:** Use formatLocalDate(prevRangeStart) for consistency with rangeStartStr.
- **Verifier note:** Stats.tsx:658 rangeStartStr=formatLocalDate(rangeStart) (local) but :663 prevRangeStartStr=prevRangeStart.toISOString().split('T')[0] (UTC); prevLogs filter at :664 mixes UTC lower bound with local upper bound.

#### 28. No in-UI handling for a missing AI API key
`⚪ Low` · reachability/error handling · impact: poor first-run UX, confusing errors · ✅ verified

- **File:** `ExamSimulator.tsx:539`
- **Current Problem:** A missing VITE_OPENROUTER_API_KEY only triggers a console.warn at gemini.ts:74. In the UI, exam generation fails into the generic 'Failed to generate questions. Check your API key' (539) and chat surfaces whatever raw error string the fetch rejects with (979); there is no detection of the missing-key condition or a way to enter one.
- **Why It Matters:** Without a configured key every AI feature silently degrades to opaque error toasts; users get no actionable guidance and no settings affordance to fix it, making the entire AI surface appear broken on a fresh install.
- **Recommended Fix:** Detect the empty-key case centrally in gemini.ts and throw a typed 'NO_API_KEY' error; in AIStudyAssistant/ExamSimulator render a distinct banner pointing to a key-config UI rather than a generic failure.
- **Verifier note:** Missing key only console.warns at gemini.ts:74-75; no key-specific UI handling in AIStudyAssistant (grep: no API_KEY refs). Exam path shows generic 'Failed to generate questions. Check your API key' (ExamSimulator.tsx:539) and chat renders the raw err string via setError (AIStudyAssistant.tsx:1240).

#### 29. System prompt rebuilt on every render in component body
`⚪ Low` · effect/derived-state misuse · impact: wasted work, subtle staleness · ✅ verified

- **File:** `AIStudyAssistant.tsx:932`
- **Current Problem:** `systemPrompt` is computed by calling buildSystemPrompt(...) directly in the render body (932-934) on every render — including every keystroke into the textarea — rather than via useMemo, and it is also a dependency of the sendMessage useCallback (983).
- **Why It Matters:** buildSystemPrompt serializes the full rich context (grades, topics, readiness) on each render, and because it feeds the memoized sendMessage, the callback identity churns too, defeating the memoization. Mostly perf/cleanliness, not correctness.
- **Recommended Fix:** Wrap in useMemo keyed on [ctxLoaded, block, subjectIntelligence, richCtx] so it recomputes only when inputs change.
- **Verifier note:** systemPrompt = buildSystemPrompt(...) is called directly in the render body every render (AIStudyAssistant.tsx:932-934), not memoized, and is a dependency of the sendMessage useCallback (983) — Low is appropriate.

#### 30. recordBlockOutcome dual-write drops fields and relies on untyped mood string
`⚪ Low` · type safety / data fidelity · impact: lossy-write, loose-typing · ✅ verified

- **File:** `brain-ultimate.ts:255`
- **Current Problem:** The ultimate dual-write calls enhancedRecordOutcome then researchRecordOutcome (brain-ultimate.ts:255-263) but never forwards mood, and the persisted record defaults mood to the untyped string 'normal' (brain-enhanced-integration.ts:206). Mood is a free 'string' rather than the 'low'|'normal'|'high' union that isValidMood (validation.ts:357) already defines.
- **Why It Matters:** Mood-aware analytics silently receive 'normal' for every session, and the loose string type means typos/invalid moods persist unchecked, while a ready type guard goes unused.
- **Recommended Fix:** Type mood as the union, pass outcome.mood through the dual-write, and validate with isValidMood before persisting.
- **Verifier note:** Ultimate recordBlockOutcome outcome type (brain-ultimate.ts:246-251) has no mood field, so the dual-write to researchRecordOutcome (259-263) cannot forward it; enhanced layer defaults mood to untyped string 'normal' (brain-enhanced-integration.ts:206). Correctly rated Low.

#### 31. gemini.ts actually calls OpenRouter; key handling warns but never blocks
`⚪ Low` · naming / API handling · impact: misleading-name, silent-failure · ✅ verified

- **File:** `gemini.ts:4`
- **Current Problem:** The module and every function are named 'gemini*' but BASE_URL is openrouter.ai and the key is VITE_OPENROUTER_API_KEY (gemini.ts:4-5). A missing key only console.warns at load (line 74) and buildHeaders sends `Bearer ` (empty), so calls fail at runtime with a generic OpenRouter error rather than a clear 'AI not configured' state.
- **Why It Matters:** The naming will mislead any future maintainer about the provider/model routing, and end users with no key get opaque streaming/chat failures instead of a disabled-AI message.
- **Recommended Fix:** Rename to an provider-neutral wrapper (or 'openrouter.ts'), and short-circuit AI calls with a clear typed 'AI disabled: no API key' result when API_KEY is empty.
- **Verifier note:** gemini.ts:4-5 uses VITE_OPENROUTER_API_KEY and openrouter.ai BASE_URL while all exports are named gemini* (geminiChat:91, geminiStream:120, geminiChatMultimodal:185, geminiStreamMultimodal:207). Missing key only console.warns (line 74); buildHeaders sends `Bearer ${API_KEY ?? ''}` (line 81), so calls proceed and fail at the API. Correctly rated Low.

#### 32. Auto-backup hourly interval triggers anchor-click downloads with no visibility/focus guard
`⚪ Low` · Hooks correctness · impact: Productivity · ⟂ unverified

- **File:** `index.tsx:139-192`
- **Current Problem:** The auto-backup effect sets a 1-hour `setInterval` (189) that calls `runAutoBackup`, which programmatically creates an `<a download>` and clicks it (173-178) to push a file into the browser's download folder. There is no `document.visibilityState`/focus check (unlike the SW update interval at 943 which does guard), and the effect re-runs/recreates the interval whenever `autoBackup` or `backupFrequency` change (191-192, eslint-disabled).
- **Why It Matters:** A background tab can silently spawn file downloads on a long-lived session, and because the throttle key (`orbit-last-auto-backup`) is only written after a successful click, a denied/blocked download path could retry. It is friction, not data loss, but it is surprising behavior for a 'local-first' app.
- **Recommended Fix:** Gate `runAutoBackup` on `document.visibilityState === 'visible'` (and ideally user gesture/IndexedDB-based backup instead of forced downloads), mirroring the service-worker guard already present in the same file.

#### 33. Copy-pasted color/style maps and gradient defs across subcomponents
`⚪ Low` · maintainability/duplication · impact: duplication, drift risk · ✅ verified

- **File:** `Stats.tsx:214`
- **Current Problem:** Near-identical color->className maps are redeclared in MiniChart (214), StatBadge (256), InsightCard (338), plus five hand-rolled Sparkline gradient <defs> (164-183) and per-call getFocusScoreColor/getTimeOfDayLabel maps. Each redefines the same emerald/amber/red/blue/purple variants inline.
- **Why It Matters:** Style drift is likely (one map updated, others not), and the repeated gradient defs are re-emitted per Sparkline instance, bloating the DOM. This is the maintainability tax of the god-component.
- **Recommended Fix:** Extract a shared semantic color token map and a single shared <defs> (rendered once) into ./components, and reuse across MiniChart/StatBadge/InsightCard.
- **Verifier note:** Stats.tsx:214 (MiniChart colorMap), :256 (StatBadge colorStyles), :338 (InsightCard styles) are near-duplicate color->className maps plus 5 hand-rolled Sparkline gradient defs at :164-183.

#### 34. calculateFocusScore defined in render body, called inside useMemo but absent from deps
`⚪ Low` · correctness/memoization · impact: stale closure risk, redundant passes · ⚖︎ adjusted

- **File:** `Stats.tsx:687`
- **Current Problem:** calculateFocusScore (687-698) closes over filteredLogs and daysInRange but is defined outside the subjectStats useMemo (700) and not listed in its deps. It also re-filters filteredLogs by subjectId twice more (lines 705-706 already filter the same subject), doing 3+ full passes per subject.
- **Why It Matters:** The memo relies on a non-memoized closure not in its dependency list (lint-fragile and stale-prone), and the repeated per-subject .filter passes are O(subjects x logs) when a single groupBy would be O(logs).
- **Recommended Fix:** Move calculateFocusScore inside the memo (or useCallback) and group logs by subjectId once into a Map, then derive mins/sessions/focusScore/notes from that single pass.
- **Verifier note:** Stats.tsx:687-698 calculateFocusScore defined in render body, called at :707 inside subjectStats useMemo and not itself in deps (:732); however its closed-over filteredLogs+daysInRange ARE in the deps, so no staleness bug — purely a smell, downgraded to Low.

#### 35. getTimeRangeInfo switch has no default branch (can return undefined)
`⚪ Low` · correctness/robustness · impact: potential undefined deref · ✅ verified

- **File:** `Stats.tsx:504`
- **Current Problem:** getTimeRangeInfo (504) switches over the five TimeRange literals with no default/return after the switch. Callers immediately do `timeRangeInfo.targetHours` (line 791-792); if range is ever an unexpected value the function returns undefined and the deref throws.
- **Why It Matters:** Today TS exhaustiveness protects this, but any future persisted/legacy timeRange value (e.g. from a stale localStorage snapshot) would crash the Stats render rather than degrade gracefully.
- **Recommended Fix:** Add a default branch returning the 'all' or 'week' shape so the function is total at runtime.
- **Verifier note:** Stats.tsx:504-542 switch over the five TimeRange literals with no default; callers do timeRangeInfo.targetHours at :791-792. TS union makes it exhaustive today, but inferred return type includes undefined — fragile if literals change. Low is appropriate.

#### 36. Magic numbers scattered through analytics math
`⚪ Low` · maintainability/magic-numbers · impact: unexplained constants, tuning friction · ✅ verified

- **File:** `Stats.tsx:693`
- **Current Problem:** Focus score hard-codes 45 (target minutes), 300 (time cap), and weights 0.4/0.3/0.3 (693-696); intensity thresholds 45/120 (761); insight thresholds 70/40/0.3/7 (813/822/1063/1047); getTimeRangeInfo uses 10/30/90 and weekly*N/7 ratios. None are named.
- **Why It Matters:** These tuning constants encode product policy (what 'good focus' means) yet are buried inline and duplicated (45 appears in focus score and in fallback recommendedDuration at line 37), making consistent tuning error-prone.
- **Recommended Fix:** Hoist to named consts (e.g. TARGET_BLOCK_MIN=45, FOCUS_WEIGHTS, HEATMAP_THRESHOLDS) at module top so they are single-sourced and self-documenting.
- **Verifier note:** Stats.tsx:693-696 hard-codes 45/300 and weights 0.4/0.3/0.3; intensity thresholds 45/120 at :761; insight thresholds 7/0.3/70 at :1047/1063/1095; getTimeRangeInfo uses *10/7,*30/7,*90/7 ratios — no named constants.

<a id="part-6"></a>
### Part 6 — Performance Audit
_11 findings — 5 High, 5 Medium, 1 Low_

#### 1. The full db.logs table is read 3-4 independent times every time the Dashboard mounts
`🟠 High` · IndexedDB query patterns · impact: Productivity, Maintainability · ⟂ unverified

- **File:** `Dashboard.tsx:976`
- **Current Problem:** On Dashboard mount there are multiple uncoordinated whole-table reads of `logs`: (1) App.loadData already did db.logs.toArray() and passes `logs` as a prop (index.tsx:238); (2) Dashboard's useEffect([plan]) calls getAllReadinessScores() which internally runs db.logs.toArray() (brain-ultimate.ts:277); (3) AIInsightBanner does useLiveQuery(() => db.logs.toArray()) AND calls getAllReadinessScores() again on mount (AIInsightBanner.tsx:231,248 → another logs.toArray()); (4) ScheduleOptimizer calls getAllReadinessScores() on generate. getUnifiedReadiness re-scans all logs each call just to count unique days. None of these share a result.
- **Why It Matters:** Each getAllReadinessScores call deserializes every StudyLog row from IndexedDB purely to compute readiness, and the result is identical across the three callers within the same mount. For a heavy user with thousands of logs this is several redundant full scans on the critical first-paint path of the home screen, compounding the remount issue above. It is wasted CPU and main-thread blocking with zero behavioral benefit.
- **Recommended Fix:** Compute readiness once at the App level (or a shared context/SWR-style cache keyed by logs length/last timestamp) and pass it down, rather than each child independently calling getAllReadinessScores. Have getUnifiedReadiness accept the already-loaded logs or cache the unique-day count. At minimum, dedupe the two getAllReadinessScores calls that fire on the same Dashboard mount.

#### 2. fetchBacklog loads every plan ever created (db.plans.toArray) and scans all their blocks in JS on each Dashboard mount/plan change
`🟠 High` · IndexedDB query patterns · impact: Productivity, Data safety · ⟂ unverified

- **File:** `Dashboard.tsx:1014`
- **Current Problem:** fetchBacklog does `const allPlans = await db.plans.toArray()` then iterates every plan and every block to find incomplete, non-migrated blocks with date < today. It is invoked from useEffect(() => void fetchBacklog(), [plan]) (Dashboard.tsx:988), i.e. on mount and on every plan object change. `plans` is keyed by date, so this table grows by one row per day indefinitely and is never bounded.
- **Why It Matters:** The plans table is unbounded over the lifetime of the app (one entry per day). Reading and flattening the entire history on every Dashboard mount to surface a backlog is O(total days × blocks/day) work that grows without limit, while the actual backlog only needs recent incomplete plans. Combined with the key-remount issue, this runs on every tab switch back to the dashboard.
- **Recommended Fix:** Query a bounded window with the date index, e.g. db.plans.where('date').between(someLowerBound, todayExclusive) (Dexie supports range queries on the keyPath), or store a dedicated `migrated/incomplete` flag/table so the backlog can be fetched directly. Avoid re-running on every `plan` identity change — depend on plan.date instead.

#### 3. key={activeTab} on the main content wrapper force-remounts the entire view + all its full-table queries on every tab switch
`🟠 High` · Re-renders / mount cost · impact: Productivity, Engagement · ⟂ unverified

- **File:** `index.tsx:773`
- **Current Problem:** The single <div key={activeTab} className="... animate-slide-up"> wraps the conditional render of Dashboard/Courses/Stats/etc. Because the `key` changes on every tab switch, React unmounts the previous view's entire subtree and mounts a brand-new one rather than reconciling. Every mount-time effect re-runs from scratch: Dashboard's getAllReadinessScores (full logs scan), fetchBacklog (db.plans.toArray of ALL plans), the progress/streak setInterval animators, plus the useLiveQuery subscriptions in DashboardInsights/AIInsightBanner/ScheduleOptimizer (each doing subjects/logs/blockOutcomes/schedule .toArray()). The animate-slide-up keyframe (opacity+translateY+blur) also replays on the whole page every switch.
- **Why It Matters:** Tab switching is the single most frequent navigation action in the app. Paying a full remount — re-subscribing live queries and re-scanning the logs table several times — on every switch makes navigation feel sluggish as data grows, and the blur-in animation on the entire content area adds perceived latency. None of this work is necessary; the views could stay mounted (or at least not be keyed) so React reconciles instead of tearing down.
- **Recommended Fix:** Remove `key={activeTab}` from the wrapper (the conditional `activeTab === ...` blocks already swap content). If an entry animation per tab is desired, scope a lightweight CSS transition to the inner view, not a React key that forces unmount. Consider keeping mounted views alive (display toggling) so their live-query subscriptions and computed caches survive a switch.

#### 4. SpaceBackground renders ~275 always-animating absolutely-positioned DOM nodes and is mounted under every non-onboarding view
`🟠 High` · Animation / paint cost · impact: Productivity, Engagement, User retention · ⟂ unverified

- **File:** `SpaceBackground.tsx:325`
- **Current Problem:** SpaceBackground mounts 200 star <div>s (line 216/325), 30 particle <div>s (line 373), 5 blurred nebula divs with blur-[100px] (line 291), plus shooting stars and two SVG aliens — each with infinite CSS keyframe animations (twinkle/float-particle/nebula-drift/shooting-star). It is rendered once in App (index.tsx:582) and stays mounted for every view. The blur-[100px] nebulae and box-shadow glow stars are expensive to composite/repaint, and they animate continuously even when a data-heavy view (Stats with its 90-cell heatmap and many charts) is on screen.
- **Why It Matters:** Hundreds of continuously animating, blurred, shadowed layers run on the GPU/compositor permanently, draining battery on laptops/phones and stealing frame budget from interactive views and scrolling. This is pure decoration competing with the actual study UI for rendering resources on every screen.
- **Recommended Fix:** Drastically cut node counts (e.g. render stars to a single <canvas> or a CSS background, not 200+ DOM nodes), drop blur-[100px] on 5 large elements, and pause/hide the field on data-dense views or when the tab is hidden (visibilitychange). The prefers-reduced-motion branch already proves the counts are tunable — apply similar restraint to the default path.

#### 5. Stats recomputes filteredLogs, prevLogs, subject reductions and focus scores on every render (not memoized; `now`/`today` recreated each render)
`🟠 High` · Expensive derived data · impact: Productivity · ⟂ unverified

- **File:** `Stats.tsx:659`
- **Current Problem:** filteredLogs (659), filteredOutcomes (660), prevLogs (664), totalMinutes/trend (678-683), and calculateFocusScore (687) are computed inline on every render. calculateFocusScore itself does multiple .filter()+.reduce() passes over filteredLogs and is invoked once per subject inside the subjectStats useMemo, but the function is a fresh closure each render and `daysInRange` is recomputed from `now = new Date()` (646) created every render. The subjectStats useMemo (700) lists filteredLogs/prevLogs in its deps, but those arrays are themselves recreated every render (new .filter() results), so the memo's identity check effectively never hits — it recomputes each render. Same for series (766) and heatmapData (750) which depend on `now`.
- **Why It Matters:** On the Analytics view every keystroke-level state change (e.g. editing the weekly target input, expanding a subject, the donut RAF animation calling setDonutPct ~60×/s) re-runs full O(logs × subjects) reductions plus the 90-day heatmap and N-day series builders. With the donut animation alone firing setState every frame for 1s, the entire stats derivation pipeline runs ~60 times during that animation.
- **Recommended Fix:** Memoize filteredLogs/prevLogs/filteredOutcomes on [logs, rangeStartStr] and hoist `now`/`today`/`daysInRange` to a useMemo (or compute once per timeRange). Move calculateFocusScore out of the component or wrap in useCallback, and precompute a per-subject log grouping once instead of filtering the full array per subject. This makes subjectStats' memo deps actually stable.

#### 6. messageTiles/sidebarTiles rebuild large JSX element trees on broad dependency changes, including the per-frame animatedProgress/animatedStreak
`🟡 Medium` · Re-renders / memoization · impact: Productivity · ⟂ unverified

- **File:** `Dashboard.tsx:754`
- **Current Problem:** sidebarTiles is a useMemo whose deps include animatedProgress and animatedStreak (974). Those two values are stepped by setInterval animators (992-1012) that tick every 20ms/50ms until they reach the target. Each tick changes animatedProgress, which re-runs the sidebarTiles useMemo, rebuilding the full array of FrostedTile JSX element trees (goal/streak/reviews/progress/backlog cards). messageTiles (442-747) similarly rebuilds five+ large card subtrees whenever `plan` identity changes. The MessageCarousel additionally triples the tiles array (215) and runs its own requestAnimationFrame translateX loop.
- **Why It Matters:** During the progress/streak count-up after loading the dashboard, the sidebar tile JSX is reconstructed dozens of times in ~1s, allocating new React elements each tick. It works but adds avoidable GC pressure and reconciliation on first paint, on top of the carousel's perpetual rAF. The animatedProgress value only needs to drive a width/percentage, not the whole tile tree.
- **Recommended Fix:** Decouple the animated numbers from the tile-building memo: render animatedProgress/animatedStreak inside small leaf components that read the value, and drop them from the sidebarTiles dependency array so the tile structures are built once per data change. Consider building tile descriptors (data) in useMemo and rendering JSX separately.

#### 7. All heavy views and brain modules are eagerly imported at the top of index.tsx — no route-level code splitting
`🟡 Medium` · Bundle / code-splitting · impact: User retention, Productivity · ⟂ unverified

- **File:** `index.tsx:37`
- **Current Problem:** index.tsx statically imports Dashboard, CoursesView, ProjectsView, ScheduleView, StatsView, ReviewQueueView, SettingsView, AboutView, FocusSession, Onboarding, plus generateEnhancedPlan from brain-ultimate (37-50, 35). Stats.tsx alone is ~2000 lines and Dashboard ~1700. Only a few modules use dynamic import() (Stats lazy-loads brain-enhanced-integration at Stats.tsx:606/628; brain-ultimate internally pulls brain-research-grade). The initial bundle therefore contains every view and the brain pipeline even though the first paint only needs the Dashboard.
- **Why It Matters:** First load downloads, parses, and evaluates the entire app — Settings, Stats charts, Projects, Schedule, Review — before the dashboard can interact. On mobile/cold cache this directly delays time-to-interactive for a local-first PWA whose whole value is a fast home screen. The four brain files compound this if any are statically reachable.
- **Recommended Fix:** Lazy-load non-initial routes with React.lazy + Suspense (Stats, Projects, Schedule, Review, Settings, About, FocusSession). Confirm only one brain entry (brain-ultimate) is statically imported and the others are reached via dynamic import so dead/duplicated brain code isn't bundled into the initial chunk.

#### 8. 60s rollover interval is torn down and recreated on every todayPlan/toast change, and depends on unstable toast identity
`🟡 Medium` · Effects / intervals · impact: Correctness, Maintainability · ⟂ unverified

- **File:** `index.tsx:364`
- **Current Problem:** The rollover useEffect (321-369) creates a setInterval(checkRollover, 60000) and lists [todayPlan, toast] as deps. Every time todayPlan changes (e.g. completing a block, generating a plan, migrating backlog) the effect cleanup clears the interval and a new 60s interval is started, resetting the countdown each time. It also closes over `loadData` (a new function identity every render, not in deps — stale-closure risk) and depends on `toast` whose identity comes from context.
- **Why It Matters:** The 60s timer rarely fires on its intended cadence because frequent todayPlan updates keep resetting it, so a genuine day-rollover could be detected late. The dependency on the recreated checkRollover closure also means it may capture a stale loadData. This is a correctness-adjacent inefficiency in a core daily-cycle mechanism.
- **Recommended Fix:** Stabilize the interval: keep checkRollover in a ref (or useCallback with stable deps) and set up the setInterval once in a mount-only effect, reading the latest todayPlan via a ref. Avoid putting the frequently-changing todayPlan and context `toast` directly in the interval effect's dep array.

#### 9. Donut animation drives a setState every animation frame for 1s, re-rendering the whole 2000-line StatsView each frame
`🟡 Medium` · Effects / re-renders · impact: Productivity · ⟂ unverified

- **File:** `Stats.tsx:796`
- **Current Problem:** The donut useEffect runs a requestAnimationFrame loop that calls setDonutPct(...) on every frame for `duration = 1000`ms (796-808). StatsView is a single ~1900-line component, so each setDonutPct triggers a full re-render of the entire view — including all the inline derived-data computations flagged in perf-stats-unmemoized-derived — roughly 60 times over the animation. The effect re-runs whenever percentRaw changes (e.g. switching timeRange).
- **Why It Matters:** A purely cosmetic count-up forces ~60 full re-renders of the heaviest view in the app, each re-running unmemoized log reductions. The animation and the expensive derivations are coupled, turning a decorative effect into a sustained main-thread load and potential jank right when the view appears.
- **Recommended Fix:** Isolate the animated number into a small dedicated child component (or animate via CSS/SVG stroke transition, which ProgressRing already supports through strokeDashoffset). Then the per-frame setState only re-renders the ring, not the entire StatsView.

#### 10. Performance/Subjects view sections re-run sorts and reductions inline in JSX on every render
`🟡 Medium` · Expensive derived data · impact: Productivity · ⟂ unverified

- **File:** `Stats.tsx:1755`
- **Current Problem:** In the performance view, timeOfDayStats is re-filtered+sorted+sliced directly in JSX (1755-1759), and in the subjects view MiniChart inputs are rebuilt via subjectStats.map(...) three times inline (1719-1736). activityBreakdown's render does Object.entries().filter().sort() inline (1425-1428). While timeOfDayStats/dayOfWeekStats/subjectStats are themselves memoized, the additional sort/filter/slice and the .map() projections run unmemoized on every render of these branches (including during the donut RAF storm).
- **Why It Matters:** These extra passes compound the re-render cost identified above. They are cheap individually but multiply across the ~60 renders/second during the donut animation and on every state toggle (expanding subject rows, etc.), and they allocate new arrays each render that defeat downstream child memoization.
- **Recommended Fix:** Wrap the sorted/sliced projections (peak time-of-day list, MiniChart datasets, sorted activityBreakdown) in useMemo keyed on their source arrays so they are stable across unrelated re-renders.

#### 11. Settings are re-serialized to localStorage on every settings change, including a redundant write triggered at mount by the permission-sync setState
`⚪ Low` · Effects / identity · impact: Maintainability · ⟂ unverified

- **File:** `SettingsContext.tsx:156`
- **Current Problem:** The save effect runs localStorage.setItem(JSON.stringify(settings)) whenever the whole `settings` object changes (156-162). The load effect (129-153) calls setSettings twice on mount (deepMerge, then a permission patch), and updateSetting (180) always returns a new top-level object, so any toggle rewrites the entire settings blob. Downstream, index.tsx effects depend on nested settings slices (e.g. [settings.advanced.autoBackup, settings.advanced.backupFrequency] at index.tsx:192) which is fine, but SettingsView's audio effect depends on five separate primitives (SettingsView.tsx:66-72) and re-pushes all five SoundManager setters on any one change.
- **Why It Matters:** Minor, but every settings interaction serializes the full object and the mount sequence does an extra write. It is wasted work and a small jank source on low-end devices when dragging the volume/day-start sliders (each drag tick calls updateSetting → new object → full JSON stringify + localStorage write synchronously).
- **Recommended Fix:** Debounce the localStorage write in the save effect, and avoid the redundant second setState on mount (merge permission into the initial deepMerge). For slider inputs, debounce updateSetting or commit on change-end rather than on every input event.

<a id="part-7"></a>
### Part 7 — Accessibility Audit
_10 findings — 5 High, 4 Medium, 1 Low_

#### 1. DailyContextModal has no close/cancel control — keyboard dismissal trap
`🟠 High` · Dialog accessibility · impact: keyboard nav, no escape, core journey · ✅ verified

- **File:** `DailyContextModal.tsx:700`
- **Current Problem:** The only footer actions are "Skip for Now" (which generates a plan, line 702) and "Initialize Day" (line 716); there is no X/close button, backdrop-click dismiss, or Escape handler. The modal can only be exited by committing an action.
- **Why It Matters:** A user who opens the daily-context modal cannot cancel out without triggering plan generation, which is both a usability and accessibility trap (no consequence-free exit) on the app's primary daily flow.
- **Recommended Fix:** Add an accessible close button (aria-label="Close") and Escape/backdrop dismissal that exits without generating, distinct from the Skip-generates action.
- **Verifier note:** Confirmed: footer (DailyContextModal.tsx:701-728) only has 'Skip for Now' (702, generates plan) and 'Initialize Day' (716, handleSubmit); no X/close, no onClose prop, no backdrop onClick (369), no Escape -> commit-only exit.

#### 2. Default dark theme has no visible focus indicator; inputs use outline-none
`🟠 High` · Focus visibility (WCAG 2.4.7 / 2.4.11) · impact: keyboard nav, focus visible, core journey · ⚖︎ adjusted

- **File:** `index.css:777`
- **Current Problem:** The global `*:focus-visible` rule (line 777) only sets a transition; the only real `outline: 2px solid` rule is scoped to `.light-mode *:focus-visible` (line 725). In the default dark theme there is no authored focus ring, while form controls explicitly set `outline-none` (DailyContextModal selects 458/529/630, QualityRatingModal input 135).
- **Why It Matters:** Keyboard users cannot see where focus is across the entire default UI, making tab navigation through the planner, modals, and forms effectively unusable — a WCAG 2.4.7 and 2.4.11 failure.
- **Recommended Fix:** Add a strong `*:focus-visible { outline: 2px solid #a855f7; outline-offset: 2px; }` for dark mode (un-scoped from .light-mode), and replace `outline-none` on inputs/selects with `focus-visible:outline`/`focus:border` styles.
- **Verifier note:** Confirmed: index.css:777 global *:focus-visible only sets transition; the only outline:2px rule is .light-mode-scoped (725-728), and inputs use outline-none (QualityRatingModal.tsx:135). Real, but most native buttons still get the UA default focus ring (not removed globally), so 'no visible focus indicator' is over-rated as Critical; the genuine no-ring case is outline-none inputs in dark mode -> High.

#### 3. Icon-only buttons (close, delete) have no accessible name
`🟠 High` · ARIA / screen reader naming · impact: screen reader, destructive action, naming · ✅ verified

- **File:** `Courses.tsx:40`
- **Current Problem:** Buttons containing only a lucide icon lack aria-label: Courses close X (line 40/44), delete-grade Trash2 (728/737), and others; QualityRatingModal close X (QualityRatingModal.tsx:122) and Toast close/Undo icons are similarly unlabeled. The desktop nav buttons render text so are fine, but most icon-only controls are not.
- **Why It Matters:** Screen readers announce these as just "button", so users cannot tell a destructive grade/subject delete from a close action — high risk on irreversible operations.
- **Recommended Fix:** Add explicit `aria-label` (e.g. "Close", "Delete grade") to every icon-only button across Courses.tsx, QualityRatingModal.tsx, Toast.tsx, and components.tsx.
- **Verifier note:** Confirmed: Courses.tsx close X button (40-45) and delete-grade Trash2 button (728-738) have no aria-label; QualityRatingModal.tsx close X (122-124) and Toast.tsx close/Undo buttons (149-167) likewise unlabeled (grep for aria-label in QualityRatingModal/components returned none).

#### 4. Modals lack focus trap, Escape-to-close, and focus return
`🟠 High` · Dialog accessibility · impact: focus management, keyboard nav, screen reader · ✅ verified

- **File:** `DailyContextModal.tsx:368`
- **Current Problem:** DailyContextModal sets `role="dialog" aria-modal="true"` (line 368) but has no onKeyDown/Escape handler, no focus trap, no initial-focus or focus-return logic (grep for onKeyDown/Escape/addEventListener returned nothing). QualityRatingModal (QualityRatingModal.tsx:108) has none of role/aria-modal/Escape/trap either.
- **Why It Matters:** Keyboard and screen-reader users can tab out of the dialog into the inert page behind it, cannot dismiss with Escape, and lose their place when the dialog closes — failing WCAG 2.1.2 and 2.4.3.
- **Recommended Fix:** Add a shared modal wrapper that traps Tab focus, closes on Escape, moves focus to the dialog on open, restores focus to the trigger on close, and add role="dialog"/aria-modal/aria-labelledby to QualityRatingModal.
- **Verifier note:** Confirmed: DailyContextModal.tsx:368 sets role=dialog aria-modal=true; grep for onKeyDown/Escape/addEventListener/focus() across the file returned zero matches -> no focus trap, Escape, or focus return.

#### 5. Toasts (incl. Undo) lack aria-live/role=status and auto-dismiss
`🟠 High` · Screen reader / live regions · impact: screen reader, undo lost, data action · ⚖︎ adjusted

- **File:** `Toast.tsx:86`
- **Current Problem:** The ToastContainer (line 86) and ToastItem (line 133) have no `role="status"`/`aria-live`. Toasts auto-remove after 5000ms (line 46/49). The Undo action — the product's documented undo mechanism — lives only inside this silent, disappearing toast.
- **Why It Matters:** Screen-reader users never hear success/error confirmations and, critically, are never told an Undo is available before it vanishes, so they cannot recover from destructive actions like grade/subject deletion.
- **Recommended Fix:** Wrap the container in `role="region" aria-live="polite"` (use `assertive` for errors), give each toast `role="status"`/`role="alert"`, and pause/extend auto-dismiss when the toast carries an action or on focus/hover.
- **Verifier note:** Confirmed: Toast.tsx ToastContainer (86) and ToastItem (132-168) have no role/aria-live; auto-remove via setTimeout(removeToast, duration) at lines 46/49, default 5000ms. WCAG 4.1.3 Status Messages is Level AA; screen-reader users miss toasts incl. Undo -> High, not Critical.

#### 6. Clickable divs (GlassCard, FrostedTile, FrostedMini) not keyboard operable
`🟡 Medium` · Keyboard / semantics · impact: keyboard nav, semantics, screen reader · ✅ verified

- **File:** `components.tsx:8`
- **Current Problem:** GlassCard (line 9), FrostedTile (line 96), and FrostedMini (line 139) attach onClick to a bare `<div>` with `cursor-pointer` (106/142) but no role="button", tabIndex, or key handler. They are reused as interactive cards throughout the app.
- **Why It Matters:** Interactive cards built on these wrappers are unreachable and unactivatable by keyboard and are not announced as actionable to screen readers (WCAG 2.1.1 / 4.1.2).
- **Recommended Fix:** When onClick is present, render a `<button>` (or add `role="button" tabIndex={0}` plus Enter/Space key handling and focus styles) in these wrappers.
- **Verifier note:** Confirmed: GlassCard (components.tsx:8-9), FrostedTile (84-113, cursor-pointer at 106), FrostedMini (128-147, cursor-pointer at 142) put onClick on bare <div> with no role/tabIndex/key handler (grep for role=/tabIndex returned none).

#### 7. Destructive controls revealed only on hover (opacity-0 group-hover)
`🟡 Medium` · Keyboard / discoverability · impact: keyboard nav, touch, destructive action · ✅ verified

- **File:** `Courses.tsx:735`
- **Current Problem:** The delete-grade button uses `opacity-0 group-hover:opacity-100` (line 735); other row actions follow the same pattern. There is no `focus-within`/`group-focus` variant, so the control is invisible until mouse hover.
- **Why It Matters:** Keyboard-only and touch users may never discover the delete action, and even when focused it can remain visually hidden, failing WCAG 1.4.13 and 2.1.1.
- **Recommended Fix:** Add `group-focus-within:opacity-100` / `focus-visible:opacity-100` alongside the hover variant, or keep actions persistently visible.
- **Verifier note:** Confirmed: Courses.tsx:735 delete-grade button uses 'opacity-0 group-hover:opacity-100' with no focus-within/group-focus-within variant, so it is invisible until mouse hover.

#### 8. No prefers-reduced-motion handling for pervasive animations
`🟡 Medium` · Motion (WCAG 2.3.3 / 2.2.2) · impact: vestibular, motion, polish · ✅ verified

- **File:** `index.css:600`
- **Current Problem:** index.css defines shimmer (line 600, infinite), slideInRight, slide-in-from-bottom/left, fade-in, animate-pulse usage, plus a typewriter setInterval in QualityRatingModal (line 47). A repo-wide grep for `prefers-reduced-motion` matched only SpaceBackground.tsx and the audit fixture — the global animation set is unguarded.
- **Why It Matters:** Users with vestibular disorders or motion sensitivity have no way to suppress the continuous shimmer/slide/pulse motion, failing WCAG 2.3.3 (Animation from Interactions).
- **Recommended Fix:** Add a global `@media (prefers-reduced-motion: reduce)` block in index.css that disables/shortens keyframe animations and transitions, and short-circuit the TypewriterText interval when reduced motion is requested.
- **Verifier note:** Confirmed: index.css defines shimmer infinite (600-612), slideInRight/slide-in/fade-in (614-642), plus QualityRatingModal typewriter setInterval (47); grep 'prefers-reduced-motion' in index.css returned zero matches.

#### 9. text-[9px]/[10px] zinc-500/600 labels likely fail AA contrast
`🟡 Medium` · Color contrast (WCAG 1.4.3) · impact: contrast, low vision, readability · ✅ verified

- **File:** `QualityRatingModal.tsx:158`
- **Current Problem:** Rating labels use `text-[9px] font-bold text-zinc-500` (line 158), topic label `text-[10px] text-zinc-500` (line 130), and `text-zinc-600` helper text (174/178). zinc-500 (#71717a) on the ~zinc-900 modal bg is roughly 3.0:1, and zinc-600 is below 3:1 — under the 4.5:1 AA threshold for this small text.
- **Why It Matters:** Low-vision users cannot reliably read the rating labels and metadata that drive the focus-session feedback loop, failing WCAG 1.4.3.
- **Recommended Fix:** Raise these labels to at least zinc-400 (preferably zinc-300) and increase font size, verifying ≥4.5:1 against the actual background.
- **Verifier note:** Plausible/confirmed: QualityRatingModal.tsx:158 text-[9px] text-zinc-500, :130 text-[10px] text-zinc-500, :174/178 text-zinc-600 on zinc-900 modal bg (109). zinc-500 #71717a on #18181b ~3.1:1 fails WCAG AA 4.5:1 for small text; zinc-600 worse.

#### 10. Primary nav lacks tab/current semantics and AI-tip region not announced
`⚪ Low` · ARIA / live regions · impact: screen reader, navigation, state · ✅ verified

- **File:** `index.tsx:667`
- **Current Problem:** The desktop `<nav>` (line 667) renders `<button>`s with active styling but no `aria-current="page"` or tab roles, so active view isn't conveyed. Separately, the QualityRatingModal AI-tip panel (QualityRatingModal.tsx:202) updates asynchronously with no aria-live, so the generated coaching tip is silent.
- **Why It Matters:** Screen-reader users cannot tell which section is active and never hear the dynamically loaded AI coaching tip after rating a session.
- **Recommended Fix:** Add `aria-current="page"` to the active nav button (or proper tablist/tab roles), and wrap the AI-tip body in `aria-live="polite"`.
- **Verifier note:** Confirmed: index.tsx desktop <nav> (667) renders <button>s with only visual active styling, no aria-current/role=tab (671-696); QualityRatingModal AI-tip panel (202) updates async with no aria-live wrapper. Low severity appropriate.

<a id="part-8"></a>
### Part 8 — Security & Data Safety
_10 findings — 1 Critical, 2 High, 6 Medium, 1 Low_

#### 1. Live OpenRouter API key inlined into client bundle via VITE_ env
`🔴 Critical` · secret-exposure · impact: key theft, billing abuse, data exfil · ✅ verified

- **File:** `gemini.ts:4`
- **Current Problem:** API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY; Vite inlines any VITE_ var into the shipped JS bundle, and .env contains a real key (sk-or-v1-...). Every browser that loads the app receives the secret in plain text and sends it via the Authorization header from the client.
- **Why It Matters:** Anyone who opens the deployed site can read the key from the bundle/network tab and run up unlimited charges or abuse the account; .gitignore protects the repo but not the shipped artifact.
- **Recommended Fix:** Route all AI calls through a server-side proxy that holds the key; never expose it with a VITE_ prefix. Immediately rotate/revoke the leaked key sk-or-v1-d2dc... and add per-user rate limiting.
- **Verifier note:** gemini.ts:4 reads import.meta.env.VITE_OPENROUTER_API_KEY; .env on disk holds a live sk-or-v1-... key. Vite inlines VITE_ vars into the client bundle and buildHeaders() (gemini.ts:78-85) sends it as a Bearer token from the browser — secret is shipped to every client.

#### 2. Import wipes all tables then bulk-inserts JSON with no shape/version validation
`🟠 High` · import-safety · impact: data corruption, irreversible loss · ⚖︎ adjusted

- **File:** `SettingsView.tsx:165`
- **Current Problem:** importData only checks `imported.version && imported.data` exist, then clears all 12 tables and bulkAdds whatever arrays are present. No per-record shape, type, key, or version-compatibility checks. A backup from an older schema or a hand-edited/corrupt file replaces all live data; bulkAdd objects missing required indexed keys can throw mid-batch or insert malformed rows.
- **Why It Matters:** The user's entire study history is destroyed and replaced by unvalidated data with no undo; a slightly malformed export silently corrupts the DB.
- **Recommended Fix:** Validate top-level version against supported range and validate each record (required fields/types) before clearing. Reject the whole import on any failure (the tx already gives atomicity) and surface a clear error instead of partial replacement.
- **Verifier note:** SettingsView.tsx:165 only checks imported.version && imported.data, then clears 12 tables and bulkAdds (169-201) with zero per-record/version-compat validation. Real data-corruption hazard, but local-first single-user with no remote vector and a preceding warning modal; downgraded from Critical to High.

#### 3. Snapshot silently trims plans>30d, logs to 500, outcomes to 200 — recovery loses history
`🟠 High` · recovery-data-loss · impact: silent history loss, stale restore · ✅ verified

- **File:** `db.ts:193`
- **Current Problem:** saveDbSnapshot keeps only plans with date>=30d, logs.slice(-500), blockOutcomes.slice(-200). On auto-recovery (index.tsx:294), restoreDbFromSnapshot clears the real tables and repopulates from this truncated snapshot, making it authoritative — so older logs/plans/outcomes are permanently dropped during recovery.
- **Why It Matters:** A heavy user recovering after an IndexedDB hiccup silently loses months of study logs and spaced-repetition history (which drives the brain scheduling), with no warning that the restore was lossy.
- **Recommended Fix:** Do not let a known-lossy snapshot overwrite a fuller DB; only restore when the DB is genuinely empty/corrupt, and warn the user that recovery is partial. Consider storing full history in a separate durable export rather than capping the recovery copy.
- **Verifier note:** db.ts:193-195 keeps only plans with date>=30d, logs.slice(-500), blockOutcomes.slice(-200); restoreDbFromSnapshot (db.ts:235-256) clears real tables and repopulates from this truncated snapshot, so auto-recovery (index.tsx:294) silently loses older history.

#### 4. clearAllData / critical reset call localStorage.clear(), destroying the recovery snapshot
`🟡 Medium` · deletion-risk · impact: recovery net destroyed, no rollback · ⚖︎ adjusted

- **File:** `SettingsView.tsx:250`
- **Current Problem:** clearAllData clears all IndexedDB tables then calls localStorage.clear(), which also deletes orbit-db-snapshot. The critical-error reset in index.tsx:310-312 does db.delete()+localStorage.clear() the same way. The localStorage snapshot is the only stated recovery net, so wiping it leaves zero rollback path.
- **Why It Matters:** If a user clicks Clear All (or hits the reset prompt) by mistake, the safety-net snapshot is gone too — total, unrecoverable data loss for a local-first app with no cloud backup.
- **Recommended Fix:** Only remove app-owned localStorage keys (not localStorage.clear()), and preserve/take a final snapshot before destructive resets. Force an export-first step or a typed confirmation before clearing.
- **Verifier note:** SettingsView.tsx:250 localStorage.clear() and index.tsx:311-313 db.delete()+localStorage.clear() both destroy the orbit-db-snapshot. For clearAllData this is intended user action; the genuine concern is only the critical-error reset path removing the recovery net — narrower than 'Critical', adjusted to Medium.

#### 5. File uploads base64-encoded into IndexedDB with no size limit
`🟡 Medium` · validation-gap · impact: quota exhaustion, snapshot break, perf · ⚖︎ adjusted

- **File:** `Courses.tsx:203`
- **Current Problem:** processAndSaveFile reads any chosen file via readAsDataURL and stores the full base64 string in subjects[].resources.fileData with no size check. base64 inflates size ~33%, the value lives inside the subject record, and there is no validation of file type/size before persisting.
- **Why It Matters:** One large PDF/video uploaded as base64 can exceed IndexedDB practical limits, instantly push the snapshot past 3.5MB (disabling recovery), and bloat every subject read/write — risking QuotaExceeded crashes during otherwise normal saves.
- **Recommended Fix:** Enforce a hard max file size (e.g. a few MB), validate MIME type, and store binaries as Blobs in a dedicated table (or exclude fileData from the snapshot) rather than base64 inside the subject row.
- **Verifier note:** Courses.tsx:203-229 readAsDataURL then stores full base64 in subjects[].resources.fileData; only records file.size, no cap (grep confirms no size guard). Genuine bloat/quota risk feeding the snapshot issue, but no remote vector in a local single-user app; adjusted High->Medium.

#### 6. Import/clear reload one tab while other tabs hold stale in-memory state and keep snapshotting
`🟡 Medium` · multi-tab-race · impact: stale overwrite, snapshot clobber · ✅ verified

- **File:** `db.ts:139`
- **Current Problem:** notifyDataChange/onDataChange broadcast generic 'changed' pings, but import/clearAllData only window.location.reload() the acting tab (SettingsView 218/254). Other open tabs keep their old in-memory data and can fire saveDbSnapshot (debounced, index.tsx:256/405/515), re-writing a snapshot from pre-import state and racing the freshly imported DB.
- **Why It Matters:** A second tab can silently clobber the recovery snapshot (or re-trigger writes) right after an import/clear, reintroducing data the user just replaced/deleted.
- **Recommended Fix:** Broadcast an explicit 'data-replaced' event on import/clear and have all listening tabs reload (or pause snapshotting) before any further writes; suppress snapshot writes for tabs with known-stale state.
- **Verifier note:** db.ts:139-143 notifyDataChange broadcasts a generic ping with no reload handler; import/clear only window.location.reload() the acting tab (SettingsView.tsx:218,254). Other tabs keep stale in-memory state and saveDbSnapshot (db.ts:165, debounced) can overwrite the restored data.

#### 7. Snapshot restore clears tables then bulkAdds with only a subjects-length sanity check
`🟡 Medium` · recovery · impact: corrupt restore, partial state · ✅ verified

- **File:** `db.ts:222`
- **Current Problem:** restoreDbFromSnapshot validates only `data.subjects?.length`, then in one tx clears all tables and bulkAdds each array. There is no version check against the current schema and no per-record validation; a snapshot written under an older schema/version='2.0' is restored blindly. If JSON.parse yields a truthy-but-wrong shape, the clear still runs before failures surface.
- **Why It Matters:** Auto-recovery can replace good (or empty) state with structurally stale/invalid records, and a mismatched-schema restore can break indexed queries app-wide.
- **Recommended Fix:** Check snapshot.version compatibility and validate each table's records before clearing; abort restore (leaving DB untouched) on any mismatch rather than after the clear.
- **Verifier note:** db.ts:229 validates only data.subjects?.length, then in one tx clears all tables (236-242) and bulkAdds each array (244-255) with no snap.version check against current schema and no per-record validation.

#### 8. Snapshot silently skipped on oversize/quota — recovery net stops working unnoticed
`🟡 Medium` · storage-failure · impact: silent backup failure, stale recovery · ⚖︎ adjusted

- **File:** `db.ts:206`
- **Current Problem:** If serialized snapshot exceeds 3.5MB it console.warns and returns; setItem QuotaExceededError is caught and only console.warned. The user is never told the recovery snapshot is stale/absent, and the last good snapshot may be very old, so recovery silently regresses to outdated data.
- **Why It Matters:** Once a user stores a few base64 files or enough logs, the snapshot silently stops updating; a later recovery restores stale data the user assumes is current — silent partial data loss.
- **Recommended Fix:** Surface a non-blocking toast/banner when snapshot writes fail or are skipped, track last-successful-snapshot timestamp, and prefer IndexedDB-based backup (not 5MB localStorage) for the recovery copy.
- **Verifier note:** db.ts:206-209 console.warns and returns when JSON > 3.5MB; catch at 212-213 only console.warns on quota errors, never surfacing to the user. Real but affects a secondary backup layer (IndexedDB remains primary), so downgraded from High to Medium.

#### 9. Validation helpers exist but core write paths skip them (no negative-duration/date guard at db layer)
`🟡 Medium` · validation-gap · impact: bad data persisted, skewed analytics · ✅ verified

- **File:** `utils/validation.ts:111`
- **Current Problem:** validation.ts provides validateDuration/isValidDateString/etc., but db writes (e.g. studyBlocks.put, plans.put in index.tsx:395-401, resources/file/link adds in Courses.tsx) and import bulkAdds do not run them. There is no DB-level guard, so negative/huge durations or invalid date strings from import or buggy callers persist unchecked.
- **Why It Matters:** Invalid records (bad dates, out-of-range durations) corrupt streaks, GPA, and brain scheduling, and only manifest later as wrong analytics that are hard to trace.
- **Recommended Fix:** Centralize validation at the write boundary (a thin DB wrapper that validates before put/bulkAdd) and run the same validators on imported records before insertion.
- **Verifier note:** validation.ts:111 validateDuration et al. exist but a repo-wide grep finds them imported nowhere (only defined in validation.ts). index.tsx:395-401 db.plans.put/studyBlocks.put and Courses.tsx resource adds run no validation; import bulkAdds (SettingsView.tsx:187-198) likewise skip them — no DB-layer guard.

#### 10. Destructive import/clear gated only by a single modal button; import auto-fires on file select
`⚪ Low` · deletion-risk · impact: accidental wipe, no undo · ⚖︎ adjusted

- **File:** `SettingsView.tsx:1181`
- **Current Problem:** Import runs immediately on file selection (onChange -> importData) before any confirm step, replacing all data; Clear All is a single red 'Delete Everything' button (line 1243) with no typed confirmation. None of these destructive flows are undoable, contrary to the product's toast-undo model.
- **Why It Matters:** A misclick or wrong file selection irreversibly wipes the user's entire local dataset with one tap — the highest-consequence actions have the weakest guardrails.
- **Recommended Fix:** Require a typed confirmation (e.g. type 'DELETE') for clear/import, show a final confirm after a file is chosen, and auto-export a backup immediately before executing any destructive replace.
- **Verifier note:** Import does fire on file select (SettingsView.tsx:1179-1182 onChange->importData), but only after opening the Import modal past a warning (1164-1172); Clear All sits behind a confirm modal with warning text and a 'Delete Everything' button (1243-1248). The 'no confirm step' framing overstates it — there are modals, just no typed confirmation; adjusted High->Low.

---

## Part 9 — Missing Features

### Must Have

- **Subject lifecycle management (add / edit / archive / delete) in Courses** — CoursesView is claimed as the authoritative subject source but cannot mutate subjects at all, blocking mid-semester changes and typo fixes. _(aligns with: CoursesView as the authoritative source of subjects/resources/grades)_
- **Plan editing — reorder, reschedule, skip, and a non-destructive regenerate** — Today the only way to change a plan is a full regenerate that wipes completed progress; users need to adapt the day safely. _(aligns with: Daily plans generated through a Daily Context modal; focus loop)_
- **A reachable, first-class Review (spaced repetition) surface** — The SR queue is fully built but unreachable, removing the single highest-leverage feature for learning outcomes. _(aligns with: Local-first study planner focused on learning outcomes)_
- **Referential integrity: cascade deletes and a single, non-truncating recovery path** — Deletes orphan records and the recovery snapshot silently truncates/erases — durability is a core local-first promise. _(aligns with: Local-first data durability and recovery)_
- **Honest analytics (no fabricated placeholders; explicit low-data states)** — Fabricated quality/skip/burnout numbers and UTC-misattributed days break trust in the product's reason for existing. _(aligns with: Focus sessions create StudyLogs that power trustworthy stats)_

### Should Have

- **A dedicated Backlog management screen (review, bulk-migrate, dismiss)** — Replaces the single hidden tile and the contradictory snooze/auto-recover mechanisms with one clear manual-migration surface. _(aligns with: Unfinished blocks move into backlog; backlog migration is manual)_
- **Editable history — edit/delete study logs, session logs, grades, syllabus units** — Mistyped entries are currently permanent and silently skew every aggregate. _(aligns with: Trustworthy StudyLogs and grades)_
- **An 'explain my plan' panel consolidating the three insight surfaces** — Users can't tell why blocks were chosen, and three overlapping AI surfaces compete for attention; one honest explanation builds trust in the engine. _(aligns with: Daily plans generated through a Daily Context modal)_
- **Server-proxied AI with graceful no-key degradation** — Keeps the AI assistant/exam features without shipping a secret, and shows clear UI when AI is unavailable instead of a console warning. _(aligns with: Local-first with optional AI assistance)_
- **Exam-aware planning surfaced to the user** — An exam schedule already exists in the data model; surfacing it would make 'days to exam' planning visible and actionable. _(aligns with: Daily Context (dayType isa/esa, daysToExam))_

### Nice To Have

- **Keyboard-first command palette (Cmd/Ctrl-K) for navigation and quick actions** — Many views are buried; a palette restores discoverability without adding nav clutter — the Raycast/Linear pattern. _(aligns with: Low-friction, keyboard-driven productivity)_
- **Enable the already-built light/midnight themes end-to-end** — ~500 lines of theme CSS and a CSS-variable foundation already exist but no theme is reachable in practice. _(aligns with: Polished, modern UI quality)_
- **Local reminders tied to review-due and plan-ready** — Notification infrastructure exists; connecting it to the daily loop drives healthy return visits without nagging. _(aligns with: Engagement without bloat)_
- **Shareable/exportable weekly review summary** — Builds on the existing CSV/iCal export work to give students a reflective artifact. _(aligns with: Local-first, user-owned data)_

---

## Part 10 — Final Report

### Top 20 Highest-Impact Improvements

1. **Remove the API key from the client bundle and rotate it** — A live OpenRouter key is inlined via VITE_ env into the shipped JS; any visitor can extract it and run up charges. Route AI through a server proxy and revoke the leaked key now.  
   <sub>refs: sec-api-key-shipped-to-client</sub>
2. **Stop plan regeneration from wiping completed progress** — handleContextGenerate overwrites the day's plan with all-incomplete blocks, destroying logged completions for that day — silent, irreversible data loss in a core action.  
   <sub>refs: plan-regen-overwrites-completed-progress</sub>
3. **Fix the snooze data-loss path** — snoozeBlock deletes the block from plan.blocks but the recovery engine looks for it there — the block is gone forever, directly contradicting the 'recovered tomorrow' promise.  
   <sub>refs: data-snooze-recovery-loss</sub>
4. **Unify block completion so it always logs study time** — The Dashboard checkbox marks a block done without writing a StudyLog, so streaks, readiness and all analytics silently stay empty while the progress ring shows 100%.  
   <sub>refs: prod-dual-complete-divergent-data, uxdf-checkbox-complete-no-log</sub>
5. **Fix the Stats Rules-of-Hooks crash** — An early return before 11 hooks white-screens the Analytics tab the moment filteredLogs flips empty/non-empty (first session, range change) — a guaranteed crash on the happy path.  
   <sub>refs: cqs2-hooks-after-early-return</sub>
6. **Make the Review queue and Schedule reachable** — Two fully-built, headline features are rendered but have zero navigation path; the SR queue (core to learning outcomes) and the timetable that feeds the optimizer are dead-ends.  
   <sub>refs: prod-schedule-review-unreachable, uxor-review-queue-unreachable</sub>
7. **Add subject create/edit/delete to CoursesView** — The 'authoritative source of subjects' is read-only for subjects — users can't add a course mid-semester, fix a typo, or drop a course without wiping all data.  
   <sub>refs: uxcp-no-subject-crud, data-no-subject-delete-cascade</sub>
8. **Stop the quality-rating modal from fabricating a 3/5 on dismiss** — Closing the modal records a fake 'Okay (3)' into the adaptive engine and SR schedule, systematically biasing readiness/mastery toward a phantom average.  
   <sub>refs: uxmod-rating-dismiss-fabricates-3, uxmod-rating-no-escape-no-skip</sub>
9. **Centralize all date logic on the IST effective date** — BlockOutcomes, streaks, heatmap, SR due-dates and the research plan path key off UTC while logs use IST — analytics, streaks and review timing disagree and are wrong for the target user.  
   <sub>refs: time-blockoutcome-utc-date, time-streak-utc-host-clock, cqs2-heatmap-utc-date-mismatch, uxor-sr-utc-due-date, plan-research-path-uses-utc-not-ist-date</sub>
10. **Consolidate the planning engines into one** — A uniqueDays counter routes most users to a primitive engine that ignores holiday/sick/mood/focus/bunk, so the sophisticated core planner is bypassed and the Daily Context is largely wasted.  
   <sub>refs: plan-core-engine-bypassed-for-most-users, plan-research-grade-ignores-daily-context, cql-four-brains-dead-exports</sub>
11. **Pick one source of truth for plan blocks** — db.studyBlocks is a write-only shadow of plan.blocks that diverges (completed in one, not the other) and is never read by app logic — a latent correctness bomb.  
   <sub>refs: data-studyblocks-shadow-divergence</sub>
12. **Add cascade deletes / referential integrity** — Deleting a project (or wiping subjects) orphans plan blocks, studyBlocks, logs and topics by dangling id, quietly skewing every downstream aggregate.  
   <sub>refs: data-project-delete-orphans, data-orphan-stats-silent-drop</sub>
13. **Fix the focus-complete UNDO stale closure** — The undo callback closes over stale todayPlan/activeBlock and can overwrite the DB with old state, leaving an orphan StudyLog — undo can corrupt the day.  
   <sub>refs: cqs-undo-stale-closure-corruption, time-undo-stale-closure</sub>
14. **Validate imports and protect the recovery snapshot** — Import wipes all tables and bulk-inserts unvalidated JSON; clearAllData/reset erase the localStorage snapshot; snapshots silently truncate and silently fail on quota — the recovery net is fragile exactly when needed.  
   <sub>refs: sec-import-no-shape-validation, sec-clearall-wipes-snapshot, sec-snapshot-silent-truncation, sec-snapshot-quota-silent-fail</sub>
15. **Add a plan-editing surface (reorder, reschedule, skip, safe regenerate)** — Once a plan exists the only actions are start/complete/snooze; users can't adapt the day, forcing the destructive full regenerate that loses progress.  
   <sub>refs: prod-no-plan-edit-reorder-regenerate</sub>
16. **Establish an accessibility baseline on core journeys** — No focus ring in the default theme, no modal focus trap/Escape, and toasts not announced make the primary loops unusable by keyboard and screen-reader users.  
   <sub>refs: a11y-default-dark-no-focus-outline, a11y-modals-no-focus-trap-escape, a11y-toasts-not-announced</sub>
17. **Stop presenting fabricated metrics as real data** — Stats renders hardcoded fallbacks (quality 3.0, 0% skip, burnout) and Week Preview shows fake saturation and a false 'encrypted' claim — eroding trust in the whole analytics story.  
   <sub>refs: uxss-fallback-metrics-fabricated, uxmod-week-fake-metrics-and-encryption-claim</sub>
18. **Reduce Daily Context decision fatigue and fix 'Skip' semantics** — The daily ritual front-loads presets + day-type + energy + life events + assignments, and 'Skip for Now' silently discards critical-subject warnings and the user's own choices.  
   <sub>refs: uxmod-context-too-many-decisions, uxmod-context-skip-bypasses-critical-alert, prod-daily-context-decision-fatigue</sub>
19. **Resolve the 2 AM vs 4 AM day-start contradiction** — The spec says 2 AM but code, README and UI all use 4 AM, and the setting is unbounded (0-23) which can break rollover — pick one, document it, and clamp the range.  
   <sub>refs: time-2am-vs-4am-spec-mismatch, time-daystart-unbounded-range</sub>
20. **Wire validation into write paths (or delete the dead module)** — A complete 467-line validation.ts is imported by nothing while grades accept score > max, durations go unchecked, and uploads have no size cap.  
   <sub>refs: cql-validation-utils-fully-dead, uxcp-grade-no-validation, sec-file-upload-no-size-cap</sub>

### Top 20 UX Improvements

1. **Lift the single next action above the insight surfaces** — The 'Next Mission' / Start Focus card sits below a carousel + DashboardInsights + AIInsightBanner; the one thing the user came to do is buried.  
   <sub>refs: uxdf-next-action-buried-under-insights, uxdf-redundant-insight-surfaces</sub>
2. **Surface Review and Schedule in navigation** — Core features are unreachable; add them to the nav (or a secondary menu) and link the Dashboard 'reviews due' tile into the queue.  
   <sub>refs: uxor-review-queue-unreachable, prod-schedule-review-unreachable</sub>
3. **Make CoursesView a real CRUD hub for subjects** — Add 'Add Subject', edit details, and guarded delete; wire the empty-state CTA so a new user isn't dead-ended.  
   <sub>refs: uxcp-no-subject-crud, uxcp-empty-courses-no-action</sub>
4. **Add plan editing: reorder, reschedule, skip, regenerate-safely** — Users need to adapt today's plan without a destructive full rebuild.  
   <sub>refs: prod-no-plan-edit-reorder-regenerate</sub>
5. **Make the quality rating genuinely skippable and escapable** — Provide a real 'Skip' that records nothing, add Escape/backdrop dismissal, and never fabricate a score.  
   <sub>refs: uxmod-rating-dismiss-fabricates-3, uxmod-rating-no-escape-no-skip</sub>
6. **Confirm focus-session exit and log partial time** — Exiting 28 minutes into a 30-minute block silently discards the time with no confirmation.  
   <sub>refs: uxdf-focus-exit-no-confirm-no-log</sub>
7. **Replace native confirm() with the app's modal/toast system** — Block actions and project delete use blocking, unstyled window.confirm, clashing with the custom design language.  
   <sub>refs: uxdf-native-confirm-dialogs, uxcp-native-confirm-inconsistent</sub>
8. **Apply toast-undo (and confirmation) to all destructive deletes** — Resource/grade/milestone/project deletes ignore the app's own built-in undo pattern and several have no confirm at all.  
   <sub>refs: uxcp-deletes-ignore-undo-pattern, uxcp-unconfirmed-inline-deletes</sub>
9. **Lengthen the undo window for destructive toasts** — A 5-second auto-dismiss is too short to recover a dropped/completed block.  
   <sub>refs: uxdf-undo-toast-5s-destructive</sub>
10. **Rewrite the rollover modal: clear copy, preview, no silent plan loss** — 'Your day start threshold was crossed' is jargon, and 'Start New Cycle' discards an in-progress plan with no warning, opt-out or Escape.  
   <sub>refs: uxmod-rollover-copy-vague-and-loses-plan, uxmod-rollover-forced-no-dismiss, time-rollover-discards-inprogress-plan</sub>
11. **Slim the Daily Context modal with smart defaults** — Collapse redundant preset + day-type + energy + life-event decisions into a fast default-first ritual.  
   <sub>refs: uxmod-context-too-many-decisions, prod-daily-context-decision-fatigue</sub>
12. **Add a Dashboard loading state when the plan is briefly null** — The dashboard slot renders nothing (no loader/fallback) during the null window, looking broken.  
   <sub>refs: uxdf-blank-dashboard-no-loading</sub>
13. **Never show fabricated numbers as measured data** — Replace hardcoded fallback metrics and fake 'saturation/encrypted' claims with honest 'not enough data' states.  
   <sub>refs: uxss-fallback-metrics-fabricated, uxmod-week-fake-metrics-and-encryption-claim</sub>
14. **Make Settings searchable and isolate destructive actions** — A ~1500-line accordion with no search co-locates unrecoverable 'Clear All Data' beside benign Export/Reset.  
   <sub>refs: uxss-no-settings-search, uxss-clear-all-data-placement</sub>
15. **Make onboarding shorter, resumable, and end with a first plan** — It's long, forces full timetable placement, isn't resumable on refresh, and drops the user on a dashboard with no plan.  
   <sub>refs: uxor-onboarding-length-friction, uxor-onboarding-not-resumable, uxor-onboarding-no-first-plan</sub>
16. **Surface the Exam Simulator and persist its results** — It's buried three levels deep behind 'AI Help' and discards every result, so it never feeds the loop, SR or stats.  
   <sub>refs: uxor-exam-discoverability, uxor-exam-results-not-persisted</sub>
17. **Make logged history editable** — Study/session logs, grades and syllabus units can't be edited or deleted, so a typo permanently skews the numbers.  
   <sub>refs: uxcp-sessionlog-immutable, uxcp-syllabus-no-delete-edit</sub>
18. **Stop hiding critical status in an auto-scrolling carousel** — Important info lives only in an always-moving carousel that fights reading.  
   <sub>refs: uxdf-carousel-autoscroll-critical-info</sub>
19. **Don't block 'Continue' on the AI coaching tip** — After rating, the user can't finish logging until a network AI tip resolves.  
   <sub>refs: uxdf-quality-continue-blocked-by-ai</sub>
20. **Unify backlog and snooze into one understandable model** — A manual backlog tile and an auto-'dropped' recovery mechanism coexist and contradict each other; the backlog is also discoverable only via one small tile.  
   <sub>refs: prod-snooze-vs-backlog-contradiction, prod-backlog-single-entry-point</sub>

### Top 20 Engineering Improvements

1. **Collapse the four brain files into one engine; delete dead exports** — ~5k LOC across brain.ts/brain-ultimate/brain-enhanced-integration/brain-research-grade with duplicated generateEnhancedPlan, three readiness algorithms and unreferenced exports (runBrain, runAblationStudy, etc.).  
   <sub>refs: cql-four-brains-dead-exports, plan-dead-duplicate-generateEnhancedPlan, cql-duplicated-readiness-algorithms, data-four-brain-files-dead-logic</sub>
2. **Establish one source of truth for plan blocks** — Remove the studyBlocks shadow table or make it canonical; today both are written and they diverge.  
   <sub>refs: data-studyblocks-shadow-divergence, cqs-context-generate-block-persist-partial</sub>
3. **Create a single date boundary on the IST effective date** — Ban toISOString for logical dates app-wide; route every day-key through one helper to kill the UTC/IST drift cluster.  
   <sub>refs: time-blockoutcome-utc-date, cqs2-streak-utc-vs-ist, cqs2-heatmap-utc-date-mismatch, uxor-sr-utc-due-date</sub>
4. **Fix the Stats hooks-after-return crash** — Move all hooks above the empty-state early return; compute derived memos unconditionally.  
   <sub>refs: cqs2-hooks-after-early-return</sub>
5. **Collapse dual view/activeTab into one navigation state** — Two atoms for the same concept desync on focus-exit, rollover and onboarding.  
   <sub>refs: cqs-dual-view-activetab-desync</sub>
6. **Unify settings into one storage backend** — Config is split across localStorage AppSettings + Dexie settings + competing keys (orbit-prefs/orbit-settings-v2), making Reset/Export incoherent and a sound flag read from a key the UI never writes.  
   <sub>refs: uxss-settings-storage-split, cqs-competing-settings-keys</sub>
7. **Wrap multi-table writes in Dexie transactions** — Plan + per-block writes and completion writes across two components are non-transactional, risking partial saves that desync stores.  
   <sub>refs: cqs-context-generate-block-persist-partial, time-completion-split-across-components</sub>
8. **Implement cascade deletes and a subject-delete path** — No cascade infrastructure exists; deleting projects/subjects orphans references across plans/logs/topics.  
   <sub>refs: data-project-delete-orphans, data-no-subject-delete-cascade</sub>
9. **Persist or remove the research mastery trackers** — BKT/gain singletons live in module memory and reset every reload, so the touted feedback loop never persists in a local-first app.  
   <sub>refs: cql-research-tracker-resets-on-reload, plan-dual-track-feedback-never-invoked</sub>
10. **Wire validation.ts into write paths or delete it** — 467 lines of validators are imported nowhere while writes go unvalidated.  
   <sub>refs: cql-validation-utils-fully-dead, sec-validation-not-enforced-at-write</sub>
11. **Move AI calls behind a server proxy and rotate the key** — Never ship secrets via VITE_; proxy requests and add per-user rate limiting.  
   <sub>refs: sec-api-key-shipped-to-client</sub>
12. **Memoize expensive derivations and stabilize now/today** — filteredLogs/prevLogs/focus-score recompute every render in Stats/Dashboard, defeated by a `now` recreated each render and an in-render helper used inside useMemo.  
   <sub>refs: perf-stats-unmemoized-derived, cqs2-now-defeats-memo, cqs2-focusscore-in-render-closure</sub>
13. **Eliminate redundant full-table reads** — db.logs is scanned 3-4x per Dashboard mount and fetchBacklog loads every plan ever created; share one query/source.  
   <sub>refs: perf-duplicate-logs-fulltable-scans, perf-fetchbacklog-all-plans</sub>
14. **Remove key=activeTab remount and lazy-load heavy views** — Changing the key force-remounts the whole subtree (re-firing every query) on each tab switch, and all heavy views + brains are eagerly imported.  
   <sub>refs: perf-key-activetab-remount, perf-no-code-splitting-heavy-views-and-brains</sub>
15. **Throttle per-frame setState animations** — Donut RAF setState and animatedProgress/streak re-render the 2,000-line StatsView / large Dashboard JSX every frame.  
   <sub>refs: perf-stats-donut-raf-rerenders, perf-dashboard-tiles-recreate-jsx</sub>
16. **Fix stale-closure effects (undo + rollover interval)** — The undo closure and the 60s rollover interval capture stale state and ignore the configurable day-start hour.  
   <sub>refs: cqs-rollover-ignores-daystart-and-stale-closure, perf-rollover-interval-deps</sub>
17. **Split the god components** — Stats (2034), AIStudyAssistant (1365) and ProjectsView (1026) mix presentation, analytics and data access in one file.  
   <sub>refs: cqs2-god-component-size, cqa-ai-god-component</sub>
18. **De-duplicate review logging and assignment completion** — Review completion writes two StudyLogs, and assignment completion is split across progress vs completed with different semantics.  
   <sub>refs: time-review-block-double-log, data-assignment-completion-splitbrain</sub>
19. **Harden import/restore and snapshot** — Validate import shape/version, guard QuotaExceeded, and stop clearAllData/reset from erasing the snapshot.  
   <sub>refs: sec-import-no-shape-validation, sec-snapshot-quota-silent-fail, sec-clearall-wipes-snapshot</sub>
20. **Delete dead code and fix encoding** — ~500 lines of dead light-mode CSS, dead SR components, the orphan PageHeader.tsx, dead imports, and pervasive mojibake comments are pure maintenance drag.  
   <sub>refs: ds-dead-light-mode-css, uxor-dead-sr-components, ds-duplicate-pageheader, ds-encoding-mojibake</sub>

### Critical Bugs

| # | Bug | File | Impact |
|---|---|---|---|
| 1 | Live OpenRouter API key inlined into the client bundle | `gemini.ts:4` | Key theft / billing abuse — every visitor can extract and use it |
| 2 | Regenerating the daily plan wipes completed-block progress | `index.tsx:381-401` | Silent, irreversible data loss for the day |
| 3 | Snooze deletes block from plan.blocks but recovery reads that array | `Dashboard.tsx:1138` | Guaranteed loss of snoozed work despite 'recovered tomorrow' promise |
| 4 | Dashboard checkbox 'complete' writes no StudyLog | `Dashboard.tsx:1092-1127` | Streaks/stats/readiness silently never update |
| 5 | Stats early-return before 11 hooks (Rules of Hooks) | `Stats.tsx:666` | Crash/white-screen of the Analytics tab on first log or range change |
| 6 | Closing the quality modal fabricates a 3/5 rating | `FocusSession.tsx:1228` | Corrupts the adaptive engine and SR schedule |
| 7 | Focus-complete UNDO closes over stale state | `index.tsx:485-516` | Undo can overwrite the DB with old data + leave an orphan StudyLog |
| 8 | ScheduleView and ReviewQueue have no navigation path | `index.tsx:793-798` | Two core features unreachable; optimizer starved of timetable data |
| 9 | CoursesView cannot add/edit/delete subjects | `Courses.tsx:125-1099` | Subject roster effectively immutable after onboarding |
| 10 | Core planner bypassed for most users by uniqueDays routing | `brain-ultimate.ts:104-182` | Daily Context largely ignored; plans worse than the engine you built |
| 11 | BlockOutcome date stamped in UTC, not IST | `brain-enhanced-integration.ts:195` | Outcomes misattributed to the wrong day for IST users |
| 12 | Review sessions write two StudyLogs per completion | `index.tsx:452` | Double-counted study time and reviews |
| 13 | Import wipes all tables then inserts unvalidated JSON | `SettingsView.tsx:165` | Corrupt/incompatible import can destroy data with no shape/version check |
| 14 | clearAllData / critical reset erase the recovery snapshot | `SettingsView.tsx:250` | Removes the localStorage safety net (and unrelated keys) |

### Refactor Priority Order

1. **Stop the bleeding — Critical hotfixes** — Proxy + rotate the API key; guard regenerate against progress loss; fix snooze recovery; fix the Stats hooks crash; stop the quality-modal fabrication. Highest harm, mostly localized changes.
2. **Make the data model honest — one source of truth + IST dates + transactions** — Collapse plan.blocks vs studyBlocks, route every date through one IST helper, and wrap multi-table writes in transactions. This unblocks correct analytics and is the foundation everything else sits on.
3. **Consolidate the planning engine** — Merge the four brains into one engine that always consumes the Daily Context; delete dead exports; persist or remove the research tracker. Removes the largest source of incoherence and dead code.
4. **Fix completion semantics** — One completion path that always logs; de-duplicate review logging; reconcile assignment progress vs completed. Restores trust in streaks and stats.
5. **Repair navigation/IA and add core workflows** — Make Review/Schedule reachable, add subject CRUD + cascade deletes, and add plan editing so users stop reaching for the destructive regenerate.
6. **Accessibility baseline** — Focus outlines, modal focus traps + Escape, aria-live toasts, icon-button labels, prefers-reduced-motion. Required for a real release.
7. **Settings + storage unification and import/snapshot hardening** — One settings backend; validate imports; protect and de-silence the recovery snapshot.
8. **Extract a real design system** — Type scale, radius/shadow/color/glass tokens, reuse Button/Card, delete dead light-mode CSS and duplicate PageHeader, fix encoding.
9. **Performance pass** — Memoize derivations, dedupe full-table reads, lazy-load views, drop key=activeTab remount, throttle per-frame animations, split god components.

### Product Roadmap

**Now — Stabilize (release blockers)**
- Eliminate data-loss paths (regenerate, snooze) and the API-key exposure
- Make Review queue and Schedule reachable from navigation
- Add subject create/edit/delete to CoursesView
- Replace fabricated metrics with honest 'not enough data' states
- Resolve and document the 2 AM vs 4 AM day-start

**Next — Complete the daily loop**
- Plan editing: reorder, reschedule, skip, and a non-destructive regenerate
- One completion model (always logs) + unified backlog/snooze
- Surface and persist the Exam Simulator; feed results into SR and stats
- Shorter, resumable onboarding that ends by generating the first plan
- Slim the Daily Context ritual to default-first with smart presets

**Later — Differentiate**
- A single, persisted, explainable adaptive engine ('why these blocks today')
- Review (spaced repetition) as a first-class daily ritual with reminders
- Consolidate the three insight surfaces into one honest, explainable panel
- Trustworthy, exportable weekly review summary

### Design Roadmap

**Now — Foundations & legibility**
- Define a typographic scale and replace 230 ad-hoc text-[Npx] values (kill 7-10px illegible text)
- Fix contrast failures (zinc-600/zinc-500 on near-black) to WCAG AA
- Add a visible focus ring to the default dark theme
- Delete ~500 lines of dead light-mode CSS and the duplicate PageHeader; fix mojibake

**Next — Tokens & primitives**
- Introduce semantic color, radius, shadow and a single 'glass surface' token
- Migrate the 211 hand-styled buttons and 4 glass-card variants onto shared primitives
- Consolidate duplicated keyframes; drive compact mode from tokens, not a hardcoded list
- Unify the card/insight components into one system

**Later — System & theming**
- A documented component library with states (hover/active/focus/disabled)
- End-to-end theming via CSS variables (actually enable the light/midnight themes)
- A motion system that fully honors prefers-reduced-motion

### Engineering Roadmap

**Now — Hotfix & guardrails**
- Patch the Critical security/data-loss/crash bugs
- Create one IST date utility boundary and route all day-keys through it
- Wrap plan-generation and completion writes in Dexie transactions
- Add a typecheck/build gate so regressions are caught (tsc --noEmit already exists)

**Next — Consolidation**
- Merge the four brain files into one engine; delete dead exports and duplicate readiness algorithms
- One source of truth for plan blocks; remove the studyBlocks shadow
- Cascade deletes + referential integrity; subject-delete path
- Unify settings storage; wire validation.ts into writes (or delete it)
- Remove dead code (SR components, light-mode CSS, PageHeader.tsx, dead imports)

**Later — Performance & structure**
- Route-level code splitting and React.lazy for heavy views and brains
- Dedupe full-table reads behind a shared data layer; remove key=activeTab remount
- Throttle per-frame animations; split god components into modules
- Introduce automated tests (date logic, planner, completion) and a server proxy for AI

### Final Score

- **Product Design: 5/10** — Strong, coherent vision (local-first adaptive study planner) and excellent empty states, but product completeness is poor: core workflows are missing (no plan edit/reorder/regenerate, no subject CRUD), two views are unreachable, features are buried 3 levels deep, and competing 'complete a block' paths corrupt the data the product is built on.
- **UX: 5/10** — Pockets of real craft (focus-timer reconciliation, two-step rating, contextual empty/loading states) undercut by buried primary actions, modals that trap keyboard users, a 5-second undo for destructive actions, native confirm() mixed with custom modals, and dismissals that silently fabricate data.
- **UI: 6/10** — The most successful dimension — a distinctive, high-effort 'space-glass' aesthetic that looks great in screenshots. Held back from higher by being ungoverned: no type scale (230 ad-hoc pixel sizes incl. 7px), radius/shadow/glass fragmentation, ~500 lines of dead light-mode CSS, and several contrast failures that cross into illegibility.
- **Code Quality: 4/10** — Real strengths (memoization discipline, NaN-safety, type-guarded gemini module, only 3 `as any` in the brains) are outweighed by a Rules-of-Hooks crash, multiple stale-closure bugs, pervasive dead code (validation.ts, dead brain exports, dead SR components, dead CSS), god components up to 2,034 lines, and encoding damage throughout.
- **Architecture: 4/10** — The weakest dimension. Three planning engines routed by a counter (the good one bypassed for most users), two sources of truth for plan blocks, two settings backends, dual navigation state, no cascade deletes, and non-transactional multi-table writes. Most of the Critical data-loss findings trace directly to these decisions.
- **Performance: 5/10** — Genuine effort (React.memo, indexed Dexie queries, reduced-motion in SpaceBackground) sits beside the same full-table scanned 3-4x per Dashboard mount, expensive unmemoized derivations defeated by an unstable `now`, ~275 always-animating DOM nodes mounted under every view, key=activeTab full remounts, and per-frame setState re-rendering a 2,000-line component. Saved from lower only because single-user local data volumes are small.
- **Accessibility: 3/10** — Systemic, blocking failures: no visible focus indicator in the default dark theme (inputs use outline-none), modals with no focus trap / Escape / focus return, toasts never announced (no aria-live) so screen-reader users lose Undo entirely, clickable divs and unlabeled icon buttons, tiny low-contrast text, and no prefers-reduced-motion outside the background.
- **Production Readiness: 3/10** — Not shippable as-is. A live API key in the client bundle (billing-abuse risk), multiple confirmed data-loss paths (regen wipes progress, snooze loses blocks), a crash bug on the Stats tab, broken analytics from UTC/IST drift, unreachable core features, and near-absent accessibility. Each alone would block a release.
