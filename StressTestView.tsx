import React, { useState, useEffect, useRef } from "react";
import { OrbitDB } from "./db";
import {
    generateDailyPlan,
    calculateReadiness,
    resolveConstraints,
    recordTopicReview,
    getTopicsDueForReview,
    updateAssignmentProgress,
} from "./brain";
import {
    generateEnhancedPlan,
    recordBlockOutcome,
    detectBurnout,
    getSubjectPerformance,
    analyzeInterleaving,
    applyInterleaving,
    validateEnergyBudget,
    getEnergyProfile,
    saveEnergyProfile,
    getDashboardInsights,
} from "./brain-enhanced-integration";
import { Subject, DailyContext, BlockOutcome, Assignment, StudyBlock, Project, EnergyProfile, DailyPlan } from "./types";
import { Activity, Terminal, Play, AlertCircle, CheckCircle, XCircle, Settings, Zap } from "lucide-react";

type TestMode = 'auto' | 'manual';

export const StressTestEnhanced = ({ onBack }: { onBack: () => void }) => {
    console.log('StressTestEnhanced component mounting...');

    const [logs, setLogs] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [failedCount, setFailedCount] = useState(0);
    const [passedCount, setPassedCount] = useState(0);
    const [mode, setMode] = useState<TestMode>('auto');

    // Manual simulation state
    const [manualSubjects, setManualSubjects] = useState<Subject[]>([]);
    const [manualAssignments, setManualAssignments] = useState<Assignment[]>([]);
    const [manualProjects, setManualProjects] = useState<Project[]>([]);
    const [manualEnergy, setManualEnergy] = useState<EnergyProfile>({
        morning: 100,
        afternoon: 80,
        evening: 60,
        night: 40,
    });
    const [manualContext, setManualContext] = useState<DailyContext>({
        mood: 'normal',
        dayType: 'normal',
        isHoliday: false,
        isSick: false,
    });
    const [generatedPlan, setGeneratedPlan] = useState<StudyBlock[]>([]);
    const [planAnalysis, setplanAnalysis] = useState<any>(null);

    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'header' | 'warning' = 'info') => {
        const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
        const prefix = type === 'header' ? '\n' : `[${timestamp}] `;
        setLogs(prev => [...prev, `${prefix}${msg}`]);
        if (type === 'error') setFailedCount(c => c + 1);
        if (type === 'success') setPassedCount(c => c + 1);
    };

    const assert = (condition: boolean, msg: string) => {
        if (!condition) {
            addLog(`❌ FAILED: ${msg}`, 'error');
            throw new Error(msg);
        } else {
            addLog(`✅ PASS: ${msg}`, 'success');
        }
    };

    const runAutoTests = async () => {
        setIsRunning(true);
        setLogs([]);
        setFailedCount(0);
        setPassedCount(0);
        setProgress(0);

        const testDBName = "OrbitDB_StressTest_" + Date.now();
        const testDB = new OrbitDB(testDBName);

        try {
            addLog("🚀 ORBIT COMPREHENSIVE STRESS TEST v2.0", "header");
            addLog(`Isolated DB Instance: ${testDBName}`);
            addLog(`Start Time: ${new Date().toISOString()}`);

            const todayStr = new Date().toISOString().split('T')[0];
            const oneDay = 24 * 60 * 60 * 1000;

            // ==========================================
            // PHASE 1: DATA LAYER STRESS TEST
            // ==========================================
            addLog("📦 PHASE 1: DATA LAYER INTEGRITY", "header");

            // 1.1 Subjects Table - Edge Cases
            addLog("Test 1.1: Subjects Table...");
            await testDB.subjects.clear();

            const extremeSubjects: Subject[] = [
                { name: "A", code: "X", credits: 1, difficulty: 1 },
                { name: "X".repeat(100), code: "Y".repeat(50), credits: 10, difficulty: 5 },
                { name: "Math & Physics™", code: "M&P-101", credits: 3, difficulty: 3 },
                { name: "数学", code: "数101", credits: 4, difficulty: 4 },
                { name: "", code: "", credits: 0, difficulty: 0 }, // Empty edge case
            ];

            for (const subject of extremeSubjects) {
                const id = await testDB.subjects.add(subject);
                const retrieved = await testDB.subjects.get(id);
                assert(retrieved?.name === subject.name, `Subject persistence: "${subject.name}"`);

                await testDB.subjects.update(id, { name: "Updated" });
                const updated = await testDB.subjects.get(id);
                assert(updated?.name === "Updated", `Subject update for ID ${id}`);
            }
            setProgress(5);

            // 1.2 Semesters & Schedule
            addLog("Test 1.2: Semesters & Schedule Slots...");
            await testDB.semesters.clear();
            const semesterId = await testDB.semesters.add({
                name: "Fall 2026",
                major: "Computer Science",
                startDate: "2026-01-01",
                endDate: "2026-05-30"
            });
            const storedSem = await testDB.semesters.get(semesterId);
            assert(storedSem?.name === "Fall 2026", "Semester persistence");

            await testDB.schedule.clear();
            await testDB.schedule.add({ day: 1, slot: 1, subjectId: 101 });
            await testDB.schedule.add({ day: 1, slot: 2, subjectId: 102 });
            assert(await testDB.schedule.count() === 2, "Schedule slots persistence");
            setProgress(7);

            // 1.3 Setup Standard Test Data
            addLog("Test 1.3: Creating standard test dataset...");
            await testDB.subjects.clear();

            const sub1 = await testDB.subjects.add({ name: "Math", code: "MATH101", credits: 3, difficulty: 4 });
            const sub2 = await testDB.subjects.add({ name: "History", code: "HIST201", credits: 3, difficulty: 2 });
            const sub3 = await testDB.subjects.add({ name: "Physics", code: "PHYS301", credits: 4, difficulty: 5 });
            const sub4 = await testDB.subjects.add({ name: "Literature", code: "LIT101", credits: 2, difficulty: 1 });

            assert(await testDB.subjects.count() === 4, "4 subjects created");
            setProgress(12);

            // 1.4 Subject Metadata (Syllabus, Resources, Grades)
            addLog("Test 1.4: Subject Deep Metadata...");
            const subWithMeta = await testDB.subjects.add({
                name: "Deep Math",
                code: "MATH-ADV",
                credits: 4,
                difficulty: 5,
                syllabus: [{ id: "u1", title: "Quantum Calculus", completed: false }],
                resources: [{ id: "r1", title: "Secret Papers", type: "pdf", priority: "required" }],
                grades: [{ id: "g1", type: "Midterm", score: 85, maxScore: 100, date: todayStr }]
            });
            const retrievedMeta = await testDB.subjects.get(subWithMeta);
            assert(retrievedMeta?.syllabus?.length === 1, "Syllabus persistence");
            assert(retrievedMeta?.resources?.length === 1, "Resources persistence");
            assert(retrievedMeta?.grades?.length === 1, "Grades persistence");
            setProgress(15);

            // 1.5 Assignments - Backward Planning Logic
            addLog("Test 1.5: Assignments & Progress Tracking...");
            const today = new Date();
            const tomorrow = new Date(Date.now() + oneDay).toISOString().split('T')[0];
            const threeDays = new Date(Date.now() + 3 * oneDay).toISOString().split('T')[0];
            const nextWeek = new Date(Date.now() + 7 * oneDay).toISOString().split('T')[0];
            const overdue = new Date(Date.now() - oneDay).toISOString().split('T')[0];

            const assignments: Omit<Assignment, 'id'>[] = [
                { subjectId: Number(sub1), title: "Urgent Calc HW", dueDate: tomorrow, estimatedEffort: 120, progressMinutes: 0, completed: false },
                { subjectId: Number(sub2), title: "Essay Draft", dueDate: threeDays, estimatedEffort: 180, progressMinutes: 60, completed: false },
                { subjectId: Number(sub3), title: "Lab Report", dueDate: nextWeek, estimatedEffort: 600, progressMinutes: 0, completed: false },
                { subjectId: Number(sub1), title: "OVERDUE", dueDate: overdue, estimatedEffort: 60, progressMinutes: 0, completed: false },
            ];

            const assignmentIds: string[] = [];
            for (const a of assignments) {
                const id = `test-assignment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                await testDB.assignments.add({ ...a, id } as Assignment);
                assignmentIds.push(id);
            }

            // Test progress tracking
            await updateAssignmentProgress(assignmentIds[0], 30, testDB);
            const a1Updated = await testDB.assignments.get(assignmentIds[0]);
            assert(a1Updated?.progressMinutes === 30, "Assignment progress updated");

            await updateAssignmentProgress(assignmentIds[0], 90, testDB); // Complete it
            const a1Completed = await testDB.assignments.get(assignmentIds[0]);
            assert(a1Completed?.completed === true, "Assignment auto-completed");

            setProgress(15);

            // 1.4 Projects
            addLog("Test 1.4: Projects & Stall Detection...");

            const projects = [
                { name: "Research Paper", subjectId: Number(sub2), effort: "high" as const, progression: 0 },
                { name: "Portfolio", subjectId: Number(sub4), effort: "med" as const, progression: 45 },
                { name: "Experiment", subjectId: Number(sub3), effort: "low" as const, progression: 10 },
            ];

            for (const p of projects) {
                await testDB.projects.add(p);
            }

            assert(await testDB.projects.count() === 3, "3 projects created");
            setProgress(20);

            // 1.5 Study Logs & Topics (Spaced Repetition)
            addLog("Test 1.5: Study Logs & Spaced Repetition...");

            // Add study logs
            for (let i = 0; i < 10; i++) {
                const daysAgo = i;
                const logDate = new Date(Date.now() - daysAgo * oneDay);
                const dateStr = logDate.toISOString().split('T')[0];

                await testDB.logs.add({
                    subjectId: Number(sub1),
                    date: dateStr,
                    duration: 60 - i * 5, // Decreasing duration
                    timestamp: logDate.getTime(),
                    type: 'review'
                } as any);
            }

            // Test topic review system
            await recordTopicReview(Number(sub1), "Calculus Basics", 3, 45, todayStr, testDB);
            await recordTopicReview(Number(sub2), "World War II", 2, 30, todayStr, testDB);

            const topics = await testDB.topics.toArray();
            assert(topics.length === 2, "Topics created via review");

            const dueTomorrow = new Date(Date.now() + oneDay).toISOString().split('T')[0];
            const dueTopics = await getTopicsDueForReview(dueTomorrow, testDB);
            addLog(`Found ${dueTopics.length} topics due for review`);

            setProgress(25);

            // ==========================================
            // PHASE 2: CORE BRAIN LOGIC
            // ==========================================
            addLog("🧠 PHASE 2: CORE BRAIN LOGIC", "header");

            // 2.1 Context Combinations
            addLog("Test 2.1: All Context Combinations...");

            const contexts: Array<{ ctx: DailyContext; name: string }> = [
                { ctx: { mood: "normal", dayType: "normal", isHoliday: false, isSick: false }, name: "Normal Day" },
                { ctx: { mood: "high", dayType: "normal", isHoliday: false, isSick: false }, name: "High Energy" },
                { ctx: { mood: "low", dayType: "normal", isHoliday: false, isSick: false }, name: "Low Energy" },
                { ctx: { mood: "normal", dayType: "esa", focusSubjectId: Number(sub1), daysToExam: 2, isHoliday: false, isSick: false }, name: "ESA Mode" },
                { ctx: { mood: "normal", dayType: "isa", focusSubjectId: Number(sub3), isHoliday: false, isSick: false }, name: "ISA Mode" },
                { ctx: { mood: "low", dayType: "normal", isHoliday: false, isSick: true }, name: "Sick Day" },
                { ctx: { mood: "normal", dayType: "normal", isHoliday: true, isSick: false }, name: "Holiday" },
            ];

            for (const { ctx, name } of contexts) {
                const result = await generateDailyPlan(ctx, testDB);
                const constraints = resolveConstraints(ctx);
                const totalMinutes = result.blocks.reduce((sum, b) => sum + b.duration, 0);

                assert(totalMinutes <= constraints.maxMinutes, `${name}: Max minutes (${totalMinutes}/${constraints.maxMinutes})`);
                assert(result.blocks.length <= constraints.maxBlocks, `${name}: Max blocks (${result.blocks.length}/${constraints.maxBlocks})`);

                if (ctx.isSick) {
                    assert(totalMinutes <= 60, `${name}: Sick day capped`);
                }

                if (ctx.dayType === 'esa' && ctx.focusSubjectId) {
                    const hasESAFocus = result.blocks.some(b => b.subjectId === ctx.focusSubjectId);
                    assert(hasESAFocus || result.blocks.length === 0, `${name}: ESA focus present`);
                }

                addLog(`  → ${name}: ${result.blocks.length} blocks, ${totalMinutes}m`, 'info');
            }
            setProgress(40);

            // 2.2 Readiness Calculation
            addLog("Test 2.2: Readiness Engine...");

            const allLogs = await testDB.logs.toArray();
            const fullSub1 = await testDB.subjects.get(sub1);
            const fullSub2 = await testDB.subjects.get(sub2);

            const readiness1 = calculateReadiness(fullSub1!, allLogs, todayStr);
            assert(readiness1.score >= 0 && readiness1.score <= 100, "Math readiness in range");

            const readiness2 = calculateReadiness(fullSub2!, allLogs, todayStr);
            assert(readiness2.score <= readiness1.score, "History readiness lower (no logs)");

            addLog(`  → Math: ${readiness1.score}% (${readiness1.status})`);
            addLog(`  → History: ${readiness2.score}% (${readiness2.status})`);
            setProgress(50);

            // 2.3 Constraint Resolution
            addLog("Test 2.3: Constraint Edge Cases...");

            const extremeContexts = [
                { mood: "low" as const, isSick: true, expected: { maxMin: 60, maxBlocks: 2 } },
                { mood: "high" as const, isSick: false, expected: { maxMin: 270, maxBlocks: 6 } },
            ];

            for (const test of extremeContexts) {
                const constraints = resolveConstraints({
                    mood: test.mood,
                    dayType: 'normal',
                    isHoliday: false,
                    isSick: test.isSick,
                });

                assert(constraints.maxMinutes === test.expected.maxMin, `Constraint maxMin for ${test.mood}/${test.isSick}`);
                assert(constraints.maxBlocks === test.expected.maxBlocks, `Constraint maxBlocks for ${test.mood}/${test.isSick}`);
            }
            setProgress(55);

            // ==========================================
            // PHASE 3: ENHANCED FEATURES (Quick Wins)
            // ==========================================
            addLog("🚀 PHASE 3: ENHANCED FEATURES", "header");

            // 3.1 Quality Tracking
            addLog("Test 3.1: Block Outcome Recording...");

            for (let i = 0; i < 10; i++) {
                await recordBlockOutcome({
                    id: 'test-block-' + i,
                    subjectId: Number(sub1),
                    subjectName: 'Math',
                    type: 'review',
                    duration: 45,
                    completed: false,
                    priority: 1
                } as any, {
                    actualDuration: 30 + Math.random() * 20,
                    completionQuality: Math.floor(Math.random() * 3) + 3 as 3 | 4 | 5,
                    skipped: false
                }, testDB);
            }

            const outcomes = await testDB.blockOutcomes.toArray();
            assert(outcomes.length >= 10, "Block outcomes recorded");
            setProgress(60);

            // 3.2 Dynamic Difficulty Adjustment
            addLog("Test 3.2: Performance Analysis & Adjustment...");

            const performance = await getSubjectPerformance(Number(sub1), 30, testDB);

            assert(performance.avgQuality >= 1 && performance.avgQuality <= 5, "Quality avg in range");
            assert(performance.recommendedDuration >= 20 && performance.recommendedDuration <= 90, "Recommended duration valid");
            assert(performance.skipRate >= 0 && performance.skipRate <= 1, "Skip rate in range");

            addLog(`  → Avg Quality: ${performance.avgQuality.toFixed(2)}/5`);
            addLog(`  → Skip Rate: ${(performance.skipRate * 100).toFixed(1)}%`);
            addLog(`  → Recommended: ${performance.recommendedDuration}m (was ${performance.targetDuration}m)`);
            setProgress(65);

            // 3.3 Energy Budget System
            addLog("Test 3.3: Energy Budget System...");

            // Set custom energy profile
            saveEnergyProfile({
                morning: 100,
                afternoon: 80,
                evening: 60,
                night: 40,
            });

            const profile = getEnergyProfile();
            assert(profile.morning === 100, "Energy profile saved");

            const normalPlan = await generateDailyPlan({
                mood: 'normal',
                dayType: 'normal',
                isHoliday: false,
                isSick: false,
            }, testDB);

            const subjects = await testDB.subjects.toArray();
            const energyValidation = validateEnergyBudget(normalPlan.blocks, subjects);

            assert(energyValidation.budget > 0, "Energy budget calculated");
            assert(energyValidation.allocated >= 0, "Energy allocated calculated");
            addLog(`  → Budget: ${energyValidation.budget}, Allocated: ${energyValidation.allocated}, Valid: ${energyValidation.valid}`);
            setProgress(70);

            // 3.4 Burnout Detection
            addLog("Test 3.4: Burnout Detection...");

            // Simulate burnout scenario (many skipped blocks)
            for (let i = 0; i < 15; i++) {
                await recordBlockOutcome({
                    id: 'burnout-' + i,
                    subjectId: Number(sub2),
                    subjectName: 'History',
                    type: 'review',
                    duration: 45,
                    completed: false,
                    priority: 1
                } as any, {
                    actualDuration: 0,
                    skipped: true
                }, testDB);
            }

            const burnout = await detectBurnout(7, testDB);
            assert(burnout.score >= 0 && burnout.score <= 100, "Burnout score in range");
            assert(burnout.skipRate >= 0, "Skip rate calculated");

            if (burnout.atRisk) {
                addLog(`  → ⚠️ BURNOUT RISK DETECTED: Score ${burnout.score}`, 'warning');
                addLog(`  → ${burnout.recommendation}`, 'warning');
            } else {
                addLog(`  → Burnout Score: ${burnout.score} (Safe)`);
            }
            setProgress(75);

            // 3.5 Interleaving Analysis
            addLog("Test 3.5: Interleaving & Variety...");

            // Create monotonous schedule
            const monotonous: StudyBlock[] = [
                { id: '1', subjectId: Number(sub1), subjectName: 'Math', type: 'review', duration: 45, completed: false, priority: 1 },
                { id: '2', subjectId: Number(sub1), subjectName: 'Math', type: 'review', duration: 45, completed: false, priority: 1 },
                { id: '3', subjectId: Number(sub1), subjectName: 'Math', type: 'review', duration: 45, completed: false, priority: 1 },
                { id: '4', subjectId: Number(sub1), subjectName: 'Math', type: 'assignment', duration: 60, completed: false, priority: 1 },
            ];

            const analysis = analyzeInterleaving(monotonous);
            assert(analysis.needsInterleaving === true, "Monotonous schedule detected");
            assert(analysis.consecutiveSameSubject >= 3, "Consecutive same subject detected");

            const interleaved = applyInterleaving(monotonous);
            addLog(`  → Variety Score: ${analysis.varietyScore}% (needs interleaving: ${analysis.needsInterleaving})`);
            setProgress(80);

            // 3.6 Enhanced Plan Generation
            addLog("Test 3.6: Enhanced Plan Generator...");

            const enhancedResult = await generateEnhancedPlan({
                mood: 'normal',
                dayType: 'normal',
                isHoliday: false,
                isSick: false,
            }, testDB);

            assert(enhancedResult.blocks.length > 0, "Enhanced plan generated");
            assert(enhancedResult.loadAnalysis !== undefined, "Load analysis present");

            if (enhancedResult.performanceAdjustments && enhancedResult.performanceAdjustments.length > 0) {
                addLog(`  → ${enhancedResult.performanceAdjustments.length} performance adjustments applied`);
                enhancedResult.performanceAdjustments.forEach(adj => {
                    addLog(`    • ${adj.reason} (${adj.oldDuration}m → ${adj.newDuration}m)`);
                });
            }
            setProgress(85);

            // 3.7 Dashboard Insights
            addLog("Test 3.7: Dashboard Insights...");

            const insights = await getDashboardInsights(testDB);

            assert(insights.burnout !== undefined, "Burnout insights present");
            assert(Array.isArray(insights.topPerformers), "Top performers array");
            assert(Array.isArray(insights.strugglingSubjects), "Struggling subjects array");

            addLog(`  → Top Performers: ${insights.topPerformers.length}`);
            addLog(`  → Struggling: ${insights.strugglingSubjects.length}`);
            addLog(`  → Burnout Risk: ${insights.burnout.atRisk ? 'YES' : 'NO'}`);
            setProgress(90);

            // ==========================================
            // PHASE 4: INTEGRATION & EDGE CASES
            // ==========================================
            addLog("⚡ PHASE 4: INTEGRATION TESTS", "header");

            // 4.1 Empty Database
            addLog("Test 4.1: Empty Database Handling...");
            const emptyDB = new OrbitDB("EmptyTest_" + Date.now());

            const emptyPlan = await generateDailyPlan({
                mood: 'normal',
                dayType: 'normal',
                isHoliday: false,
                isSick: false,
            }, emptyDB);

            assert(emptyPlan.blocks.length === 0, "Empty DB produces empty plan");
            await emptyDB.delete();
            setProgress(93);

            // 4.2 Concurrent Operations
            addLog("Test 4.2: Concurrent Operations...");

            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(recordBlockOutcome({
                    id: 'concurrent-' + i,
                    subjectId: Number(sub1),
                    subjectName: 'Math',
                    type: 'review',
                    duration: 45,
                    completed: false,
                    priority: 1
                } as any, {
                    actualDuration: 45,
                    completionQuality: 3,
                    skipped: false
                }, testDB));
            }

            await Promise.all(promises);
            const concurrentOutcomes = await testDB.blockOutcomes
                .where('blockId')
                .startsWith('concurrent-')
                .toArray();

            assert(concurrentOutcomes.length === 5, "Concurrent writes succeeded");
            setProgress(96);

            // 4.3 Data Integrity After Multiple Updates
            addLog("Test 4.3: Data Integrity...");

            const integritySubject = await testDB.subjects.get(sub1);
            assert(integritySubject?.name === "Math", "Subject data intact after all operations");

            const integrityAssignments = await testDB.assignments.toArray();
            const integrityProjects = await testDB.projects.toArray();

            assert(integrityAssignments.length > 0, "Assignments intact");
            assert(integrityProjects.length === 3, "Projects intact");
            setProgress(99);

            // ==========================================
            // FINAL SUMMARY
            // ==========================================
            addLog("", "header");
            addLog("=".repeat(60), "header");
            addLog("🎉 ALL TESTS PASSED SUCCESSFULLY", "header");
            addLog("=".repeat(60), "header");
            addLog(`Total Tests Passed: ${passedCount}`);
            addLog(`Total Tests Failed: ${failedCount}`);
            addLog(`Success Rate: ${((passedCount / (passedCount + failedCount)) * 100).toFixed(1)}%`);
            addLog(`End Time: ${new Date().toISOString()}`);
            setProgress(100);

        } catch (err: any) {
            addLog("", "header");
            addLog("❌ CRITICAL FAILURE", "error");
            addLog(`Error: ${err.message}`, 'error');
            addLog(`Stack: ${err.stack}`, 'error');
            console.error(err);
        } finally {
            addLog("🧹 Cleaning up test database...");
            await testDB.delete();
            setIsRunning(false);
        }
    };

    const runManualSimulation = async () => {
        if (manualSubjects.length === 0) {
            addLog("⚠️ Add at least one subject first", 'warning');
            return;
        }

        setIsRunning(true);
        setLogs([]);
        setFailedCount(0);
        setPassedCount(0);

        const testDBName = "OrbitDB_Manual_" + Date.now();
        const testDB = new OrbitDB(testDBName);

        try {
            addLog("🎮 MANUAL SIMULATION MODE", "header");
            addLog("Setting up test environment...");

            // Add subjects
            for (const subject of manualSubjects) {
                await testDB.subjects.add(subject);
            }

            // Add assignments
            for (const assignment of manualAssignments) {
                await testDB.assignments.add(assignment);
            }

            // Add projects
            for (const project of manualProjects) {
                await testDB.projects.add(project);
            }

            // Save energy profile
            saveEnergyProfile(manualEnergy);

            addLog(`✓ Added ${manualSubjects.length} subjects, ${manualAssignments.length} assignments, ${manualProjects.length} projects`);
            addLog(`✓ Context: Mood=${manualContext.mood}, Type=${manualContext.dayType}, Sick=${manualContext.isSick}, Holiday=${manualContext.isHoliday}`);

            // Generate plan
            addLog("Generating plan...");
            const result = await generateEnhancedPlan(manualContext, testDB);

            addLog("", "header");
            addLog("📋 GENERATED PLAN:", "header");
            addLog(`Total Blocks: ${result.blocks.length}`);
            addLog(`Total Minutes: ${result.blocks.reduce((s, b) => s + b.duration, 0)}`);
            addLog(`Load Level: ${result.loadAnalysis.loadLevel}`);

            if (result.loadAnalysis.warning) {
                addLog(`⚠️ Warning: ${result.loadAnalysis.warning}`, 'warning');
            }

            addLog("", "header");
            result.blocks.forEach((block, i) => {
                addLog(`${i + 1}. [${block.type.toUpperCase()}] ${block.subjectName} - ${block.duration}m`);
                if (block.notes) addLog(`   💬 ${block.notes}`);
                if (block.reason) addLog(`   📌 ${block.reason}`);
            });

            // Energy analysis
            if (result.loadAnalysis.energyBudget) {
                addLog("", "header");
                addLog("⚡ ENERGY ANALYSIS:", "header");
                addLog(`Budget: ${result.loadAnalysis.energyBudget.budget}`);
                addLog(`Allocated: ${result.loadAnalysis.energyBudget.allocated}`);
                addLog(`Remaining: ${result.loadAnalysis.energyBudget.remaining}`);
                addLog(`Valid: ${result.loadAnalysis.energyBudget.valid ? 'YES ✓' : 'NO ✗'}`);
            }

            // Interleaving
            if (result.loadAnalysis.interleaving) {
                addLog("", "header");
                addLog("🔄 INTERLEAVING ANALYSIS:", "header");
                addLog(`Variety Score: ${result.loadAnalysis.interleaving.varietyScore}%`);
                addLog(`Max Same Subject: ${result.loadAnalysis.interleaving.consecutiveSameSubject}`);
                addLog(`Needs Adjustment: ${result.loadAnalysis.interleaving.needsInterleaving ? 'YES' : 'NO'}`);
            }

            setGeneratedPlan(result.blocks);
            setplanAnalysis(result.loadAnalysis);

        } catch (err: any) {
            addLog(`❌ Error: ${err.message}`, 'error');
            console.error(err);
        } finally {
            await testDB.delete();
            setIsRunning(false);
        }
    };

    const addManualSubject = () => {
        const id = Date.now() + manualSubjects.length;
        setManualSubjects([...manualSubjects, {
            id,
            name: `Subject ${manualSubjects.length + 1}`,
            code: `SUB${manualSubjects.length + 1}`,
            credits: 3,
            difficulty: 3,
        }]);
    };

    const updateManualSubject = (index: number, field: keyof Subject, value: any) => {
        const updated = [...manualSubjects];
        updated[index] = { ...updated[index], [field]: value };
        setManualSubjects(updated);
    };

    const removeManualSubject = (index: number) => {
        setManualSubjects(manualSubjects.filter((_, i) => i !== index));
    };

    const addManualAssignment = () => {
        if (manualSubjects.length === 0) return;
        setManualAssignments([...manualAssignments, {
            id: `manual-a-${Date.now()}`,
            subjectId: manualSubjects[0].id || 0,
            title: `Assignment ${manualAssignments.length + 1}`,
            dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            completed: false,
            estimatedEffort: 120,
            progressMinutes: 0,
        }]);
    };

    const updateManualAssignment = (index: number, field: keyof Assignment, value: any) => {
        const updated = [...manualAssignments];
        updated[index] = { ...updated[index], [field]: value };
        setManualAssignments(updated);
    };

    const removeManualAssignment = (index: number) => {
        setManualAssignments(manualAssignments.filter((_, i) => i !== index));
    };

    const addManualProject = () => {
        if (manualSubjects.length === 0) return;
        setManualProjects([...manualProjects, {
            name: `Project ${manualProjects.length + 1}`,
            subjectId: manualSubjects[0].id || 0,
            progression: 0,
            effort: 'med',
            deadline: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
        }]);
    };

    const updateManualProject = (index: number, field: keyof Project, value: any) => {
        const updated = [...manualProjects];
        updated[index] = { ...updated[index], [field]: value };
        setManualProjects(updated);
    };

    const removeManualProject = (index: number) => {
        setManualProjects(manualProjects.filter((_, i) => i !== index));
    };

    if (!mode) {
        return <div className="min-h-screen bg-black text-green-400 flex items-center justify-center">
            <div className="animate-pulse">Loading...</div>
        </div>;
    }

    return (
        <div className="min-h-screen bg-black text-green-400 font-mono p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between border-b border-green-900/50 pb-4">
                    <div className="flex items-center gap-3">
                        <Activity className="animate-pulse" />
                        <h1 className="text-xl font-bold tracking-widest">ORBIT_STRESS_TEST_v2.0</h1>
                    </div>
                    <button
                        onClick={onBack}
                        className="text-xs hover:text-white transition-colors"
                    >
                        [EXIT_CONSOLE]
                    </button>
                </div>

                {/* Mode Selector */}
                <div className="flex gap-4 border border-green-900/50 rounded p-4">
                    <button
                        onClick={() => setMode('auto')}
                        className={`flex-1 py-2 px-4 rounded border transition-all ${mode === 'auto'
                            ? 'bg-green-500/20 border-green-500 text-green-300'
                            : 'border-green-900/50 hover:border-green-700'
                            }`}
                    >
                        <Terminal className="inline mr-2" size={16} />
                        AUTO TEST MODE
                    </button>
                    <button
                        onClick={() => setMode('manual')}
                        className={`flex-1 py-2 px-4 rounded border transition-all ${mode === 'manual'
                            ? 'bg-green-500/20 border-green-500 text-green-300'
                            : 'border-green-900/50 hover:border-green-700'
                            }`}
                    >
                        <Settings className="inline mr-2" size={16} />
                        MANUAL SIMULATION
                    </button>
                </div>

                {/* Manual Simulation Controls */}
                {mode === 'manual' && (
                    <div className="border border-green-900/50 rounded p-4 space-y-4">
                        <h2 className="text-lg font-bold">MANUAL SIMULATION SETUP</h2>

                        {/* Context Controls */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs opacity-70">MOOD</label>
                                <select
                                    value={manualContext.mood}
                                    onChange={(e) => setManualContext({ ...manualContext, mood: e.target.value as any })}
                                    className="w-full bg-black border border-green-900/50 rounded px-2 py-1 text-green-400"
                                >
                                    <option value="normal">Normal</option>
                                    <option value="high">High Energy</option>
                                    <option value="low">Low Energy</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs opacity-70">DAY TYPE</label>
                                <select
                                    value={manualContext.dayType}
                                    onChange={(e) => setManualContext({ ...manualContext, dayType: e.target.value as any })}
                                    className="w-full bg-black border border-green-900/50 rounded px-2 py-1 text-green-400"
                                >
                                    <option value="normal">Normal</option>
                                    <option value="esa">ESA (Exam)</option>
                                    <option value="isa">ISA (Multiple Assignments)</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={manualContext.isSick}
                                    onChange={(e) => setManualContext({ ...manualContext, isSick: e.target.checked })}
                                    className="accent-green-500"
                                />
                                <label className="text-xs">Sick Day</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={manualContext.isHoliday}
                                    onChange={(e) => setManualContext({ ...manualContext, isHoliday: e.target.checked })}
                                    className="accent-green-500"
                                />
                                <label className="text-xs">Holiday</label>
                            </div>
                        </div>

                        {/* Subjects */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs opacity-70">SUBJECTS</label>
                                <button
                                    onClick={addManualSubject}
                                    className="text-xs px-3 py-1 bg-green-900/20 border border-green-500/50 rounded hover:bg-green-500/20"
                                >
                                    + ADD SUBJECT
                                </button>
                            </div>

                            <div className="space-y-2">
                                {manualSubjects.map((subject, i) => (
                                    <div key={i} className="grid grid-cols-6 gap-2 items-center p-2 bg-green-900/10 rounded">
                                        <input
                                            type="text"
                                            value={subject.name}
                                            onChange={(e) => updateManualSubject(i, 'name', e.target.value)}
                                            placeholder="Name"
                                            className="col-span-2 bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        />
                                        <input
                                            type="text"
                                            value={subject.code}
                                            onChange={(e) => updateManualSubject(i, 'code', e.target.value)}
                                            placeholder="Code"
                                            className="bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        />
                                        <input
                                            type="number"
                                            value={subject.credits}
                                            onChange={(e) => updateManualSubject(i, 'credits', parseInt(e.target.value))}
                                            min="1"
                                            max="10"
                                            className="bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        />
                                        <input
                                            type="number"
                                            value={subject.difficulty}
                                            onChange={(e) => updateManualSubject(i, 'difficulty', parseInt(e.target.value))}
                                            min="1"
                                            max="5"
                                            className="bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        />
                                        <button
                                            onClick={() => removeManualSubject(i)}
                                            className="text-red-500 hover:text-red-300 text-xs"
                                        >
                                            ✗
                                        </button>
                                    </div>
                                ))}
                                {manualSubjects.length === 0 && (
                                    <div className="text-center py-4 text-green-900 italic">
                                        No subjects added yet
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Assignments */}
                        <div className="border-t border-green-900/30 pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs opacity-70">ASSIGNMENTS</label>
                                <button
                                    onClick={addManualAssignment}
                                    className="text-xs px-3 py-1 bg-green-900/20 border border-green-500/50 rounded hover:bg-green-500/20 transition-colors"
                                >
                                    + ADD ASSIGNMENT
                                </button>
                            </div>
                            <div className="space-y-2">
                                {manualAssignments.map((a, i) => (
                                    <div key={i} className="grid grid-cols-12 gap-2 items-center p-2 bg-green-900/10 rounded">
                                        <input
                                            type="text"
                                            value={a.title}
                                            onChange={(e) => updateManualAssignment(i, 'title', e.target.value)}
                                            placeholder="Title"
                                            className="col-span-4 bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        />
                                        <select
                                            value={a.subjectId}
                                            onChange={(e) => updateManualAssignment(i, 'subjectId', parseInt(e.target.value))}
                                            className="col-span-3 bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        >
                                            <option value={0}>Subject</option>
                                            {manualSubjects.map((s, idx) => <option key={idx} value={s.id}>{s.name} ({s.code})</option>)}
                                        </select>
                                        <input
                                            type="date"
                                            value={a.dueDate}
                                            onChange={(e) => updateManualAssignment(i, 'dueDate', e.target.value)}
                                            className="col-span-3 bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        />
                                        <input
                                            type="number"
                                            value={a.estimatedEffort}
                                            onChange={(e) => updateManualAssignment(i, 'estimatedEffort', parseInt(e.target.value))}
                                            placeholder="Effort (m)"
                                            className="col-span-2 bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        />
                                        <button onClick={() => removeManualAssignment(i)} className="text-red-500 hover:text-red-300 text-xs font-bold px-2">✗</button>
                                    </div>
                                ))}
                                {manualAssignments.length === 0 && (
                                    <div className="text-center py-2 text-green-900 text-[10px] italic">No assignments added</div>
                                )}
                            </div>
                        </div>

                        {/* Projects */}
                        <div className="border-t border-green-900/30 pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs opacity-70">PROJECTS</label>
                                <button
                                    onClick={addManualProject}
                                    className="text-xs px-3 py-1 bg-green-900/20 border border-green-500/50 rounded hover:bg-green-500/20 transition-colors"
                                >
                                    + ADD PROJECT
                                </button>
                            </div>
                            <div className="space-y-2">
                                {manualProjects.map((p, i) => (
                                    <div key={i} className="grid grid-cols-12 gap-2 items-center p-2 bg-green-900/10 rounded">
                                        <input
                                            type="text"
                                            value={p.name}
                                            onChange={(e) => updateManualProject(i, 'name', e.target.value)}
                                            placeholder="Project Name"
                                            className="col-span-4 bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        />
                                        <select
                                            value={p.subjectId}
                                            onChange={(e) => updateManualProject(i, 'subjectId', parseInt(e.target.value))}
                                            className="col-span-3 bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        >
                                            <option value={0}>Subject</option>
                                            {manualSubjects.map((s, idx) => <option key={idx} value={s.id}>{s.name} ({s.code})</option>)}
                                        </select>
                                        <select
                                            value={p.effort}
                                            onChange={(e) => updateManualProject(i, 'effort', e.target.value)}
                                            className="col-span-2 bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        >
                                            <option value="low">Low Effort</option>
                                            <option value="med">Medium Effort</option>
                                            <option value="high">High Effort</option>
                                        </select>
                                        <input
                                            type="number"
                                            value={p.progression}
                                            onChange={(e) => updateManualProject(i, 'progression', parseInt(e.target.value))}
                                            placeholder="%"
                                            className="col-span-2 bg-black border border-green-900/50 rounded px-2 py-1 text-sm text-green-400"
                                        />
                                        <button onClick={() => removeManualProject(i)} className="text-red-500 hover:text-red-300 text-xs font-bold px-2">✗</button>
                                    </div>
                                ))}
                                {manualProjects.length === 0 && (
                                    <div className="text-center py-2 text-green-900 text-[10px] italic">No projects added</div>
                                )}
                            </div>
                        </div>

                        {/* Energy Profile */}
                        <div className="border-t border-green-900/30 pt-4">
                            <label className="text-xs opacity-70 block mb-2 font-bold tracking-wider">ENERGY PROFILE (% CAPACITY)</label>
                            <div className="grid grid-cols-4 gap-4">
                                {Object.entries(manualEnergy).map(([period, value]) => (
                                    <div key={period} className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase opacity-50">{period}</label>
                                        <input
                                            type="number"
                                            value={value}
                                            onChange={(e) => setManualEnergy({ ...manualEnergy, [period]: parseInt(e.target.value) || 0 })}
                                            min="0"
                                            max="100"
                                            className="w-full bg-black border border-green-900/50 rounded px-2 py-1 text-xs text-green-400 focus:border-green-500 outline-none"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={runManualSimulation}
                            disabled={isRunning || manualSubjects.length === 0}
                            className={`w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-900/20 border border-green-500/50 rounded 
                                hover:bg-green-500/20 transition-all font-bold uppercase tracking-wider
                                ${(isRunning || manualSubjects.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                        >
                            <Zap size={16} />
                            {isRunning ? 'SIMULATING...' : 'RUN SIMULATION'}
                        </button>
                    </div>
                )}

                {/* Auto Test Controls */}
                {mode === 'auto' && (
                    <div className="flex gap-4">
                        <button
                            onClick={runAutoTests}
                            disabled={isRunning}
                            className={`
                                flex items-center gap-2 px-6 py-3 bg-green-900/20 border border-green-500/50 rounded 
                                hover:bg-green-500/20 transition-all font-bold uppercase tracking-wider
                                ${isRunning ? 'opacity-50 cursor-wait' : ''}
                            `}
                        >
                            <Play size={16} />
                            {isRunning ? 'EXECUTION_IN_PROGRESS...' : 'INITIATE_COMPREHENSIVE_TEST'}
                        </button>
                    </div>
                )}

                {/* Progress Bar */}
                <div className="w-full bg-green-900/20 h-2 rounded overflow-hidden border border-green-900/30">
                    <div
                        className="h-full bg-green-500 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Console Output */}
                <div className="bg-black border border-green-800 rounded p-4 h-[60vh] overflow-y-auto font-mono text-sm shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] scrollbar-thin scrollbar-thumb-green-900 scrollbar-track-black">
                    {logs.length === 0 && (
                        <div className="text-green-900 italic text-center mt-20">
                            {mode === 'auto' ? 'AWAITING COMMAND...' : 'CONFIGURE SIMULATION PARAMETERS...'}
                        </div>
                    )}
                    {logs.map((log, i) => (
                        <div key={i} className={`
                            mb-1 whitespace-pre-wrap
                            ${log.includes('❌') ? 'text-red-500 font-bold' : ''}
                            ${log.includes('✅') ? 'text-green-300' : ''}
                            ${log.includes('⚠️') ? 'text-yellow-500' : ''}
                            ${log.includes('🎉') ? 'text-green-300 font-bold text-lg mt-4' : ''}
                            ${log.includes('PHASE') || log.includes('===') ? 'text-cyan-400 font-bold mt-4 border-t border-cyan-900/30 pt-2' : ''}
                        `}>
                            {log}
                        </div>
                    ))}
                    <div ref={logEndRef} />
                </div>

                {/* Stats Footer */}
                <div className="grid grid-cols-4 gap-4 text-xs border-t border-green-900/50 pt-4 opacity-70">
                    <div>STATUS: {isRunning ? '🔴 RUNNING' : '🟢 IDLE'}</div>
                    <div>PASSED: {passedCount}</div>
                    <div>FAILED: {failedCount}</div>
                    <div>MODE: {mode.toUpperCase()}</div>
                </div>

            </div>
        </div>
    );
};

export default StressTestEnhanced;