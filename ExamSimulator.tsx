import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    Brain, Send, CheckCircle2, XCircle, Loader2,
    RotateCcw, Trophy, AlertTriangle, Zap, Target,
    ArrowRight, ChevronRight,
} from 'lucide-react';
import { StudyBlock, Subject, StudyTopic } from './types';
import { geminiChat, geminiStream } from './gemini';
import { db } from './db';

export type QuestionType = 'mcq' | 'short' | 'true_false';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface ExamQuestion {
    id: string;
    type: QuestionType;
    question: string;
    options?: string[];
    correctAnswer: string;
    explanation: string;
    topic: string;
    difficulty: Difficulty;
}

interface ExamAttempt {
    questionId: string;
    userAnswer: string;
    isCorrect: boolean;
    feedback: string;
}

interface ExamSession {
    questions: ExamQuestion[];
    attempts: ExamAttempt[];
    startedAt: number;
    finishedAt?: number;
}

export interface ExamSimulatorProps {
    block: StudyBlock;
    subject?: Subject;
    topics?: StudyTopic[];
}

function scoreColor(pct: number) {
    if (pct >= 80) return '#FFD60A';
    if (pct >= 60) return '#FF7A3C';
    return '#F4453B';
}

function scoreLabel(pct: number) {
    if (pct >= 85) return 'Excellent! 🎉';
    if (pct >= 70) return 'Good Job 💪';
    if (pct >= 55) return 'Getting There 📈';
    return 'Needs Work 🔁';
}

async function generateQuestions(
    block: StudyBlock,
    subject?: Subject,
    topics?: StudyTopic[],
    count = 5,
    difficulty: Difficulty = 'medium',
): Promise<ExamQuestion[]> {
    const syllabusStr = subject?.syllabus?.map(u => u.title).join(', ') ?? '';
    const topicsStr = topics?.map(t => t.name).join(', ') ?? '';

    const raw = await geminiChat(
        [{
            role: 'user',
            parts: [{
                text: `Generate ${count} exam questions.

Subject: ${subject?.name ?? block.subjectName}${subject?.code ? ` (${subject.code})` : ''}${subject?.difficulty ? `, difficulty ${subject.difficulty}/5` : ''}
Session: ${block.type}${block.notes ? `, topic: ${block.notes}` : ''}
${syllabusStr ? `Syllabus: ${syllabusStr}` : ''}
${topicsStr ? `Topics: ${topicsStr}` : ''}
Difficulty: ${difficulty}

Mix types — at least 2 MCQ, 2 short answer, 1 true/false.

Return ONLY a JSON array (no markdown):
[{
  "id":"q1",
  "type":"mcq"|"short"|"true_false",
  "question":"text",
  "options":["A) ...","B) ...","C) ...","D) ..."],
  "correctAnswer":"letter for MCQ, full text for others",
  "explanation":"why — 1-2 sentences",
  "topic":"which topic this tests",
  "difficulty":"${difficulty}"
}]

Rules:
- MCQ: exactly 4 options A-D, one correct
- true_false: options ["True","False"]
- short: open-ended, 1-3 sentence answer expected
- No generic questions — must be specific to ${subject?.name ?? block.subjectName}`
            }],
        }],
        'You are an expert exam question generator. Return only valid JSON array, no markdown.',
        900,
        'complex',
    );

    try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
        console.error('Question parse error:', e);
    }
    return [];
}

async function gradeAnswer(
    question: ExamQuestion,
    userAnswer: string,
): Promise<{ isCorrect: boolean; feedback: string }> {
    if (question.type === 'mcq' || question.type === 'true_false') {
        const norm = (s: string) => s.trim().toLowerCase().replace(/^[a-d]\)\s*/, '');
        const correct = norm(question.correctAnswer);
        const given = norm(userAnswer);
        const isCorrect = correct === given
            || question.correctAnswer.toLowerCase().startsWith(given);
        return {
            isCorrect,
            feedback: isCorrect
                ? `✓ Correct! ${question.explanation}`
                : `✗ Correct answer: ${question.correctAnswer}. ${question.explanation}`,
        };
    }

    try {
        const raw = await geminiChat(
            [{
                role: 'user',
                parts: [{
                    text: `Grade this answer. Be fair but precise.
Question: ${question.question}
Expected: ${question.correctAnswer}
Student: ${userAnswer}

Return ONLY JSON: {"isCorrect":true/false,"feedback":"1-2 sentence feedback"}
isCorrect=true if student captured the key concept (partial credit = true).` }],
            }],
            'You are a precise academic grader. Return only valid JSON.',
            120,
            'simple',
        );
        const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
        if (typeof result.isCorrect === 'boolean' && result.feedback) return result;
    } catch { }

    const keys = question.correctAnswer.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const hits = keys.filter(w => userAnswer.toLowerCase().includes(w)).length;
    const isCorrect = hits >= Math.ceil(keys.length * 0.4);
    return {
        isCorrect,
        feedback: isCorrect
            ? `Correct! ${question.explanation}`
            : `Not quite. Expected: ${question.correctAnswer}. ${question.explanation}`,
    };
}

const DIFF_COLOR: Record<Difficulty, string> = {
    easy: '#FFD60A', medium: '#FF7A3C', hard: '#F4453B',
};

const QuestionCard: React.FC<{
    question: ExamQuestion;
    attempt?: ExamAttempt;
    onSubmit: (answer: string) => void;
    grading: boolean;
    num: number;
    total: number;
}> = ({ question, attempt, onSubmit, grading, num, total }) => {
    const [selected, setSelected] = useState('');
    const [shortInput, setShortInput] = useState('');

    const canSubmit = question.type === 'short' ? shortInput.trim().length > 0 : selected.length > 0;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    Q{num}/{total}
                </span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md"
                    style={{ background: `${DIFF_COLOR[question.difficulty]}18`, color: DIFF_COLOR[question.difficulty] }}>
                    {question.difficulty}
                </span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>
                    {question.type === 'true_false' ? 'T/F' : question.type === 'mcq' ? 'MCQ' : 'Short'}
                </span>
                <span className="text-[10px] ml-auto" style={{ color: 'rgba(255,255,255,0.2)' }}>{question.topic}</span>
            </div>

            <div className="px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-sm text-white/85 leading-relaxed">{question.question}</p>
            </div>

            {!attempt ? (
                <div className="space-y-3">
                    {(question.type === 'mcq' || question.type === 'true_false') && question.options?.map((opt, i) => (
                        <button key={i} onClick={() => setSelected(opt)}
                            className="w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all"
                            style={{
                                background: selected === opt ? 'rgba(255,90,31,0.15)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${selected === opt ? 'rgba(255,90,31,0.4)' : 'rgba(255,255,255,0.06)'}`,
                                color: selected === opt ? '#FF7A3C' : 'rgba(255,255,255,0.6)',
                            }}>
                            {opt}
                        </button>
                    ))}

                    {question.type === 'short' && (
                        <textarea
                            value={shortInput}
                            onChange={e => setShortInput(e.target.value)}
                            placeholder="Write your answer…"
                            rows={3}
                            className="w-full px-4 py-3 rounded-xl text-sm text-white/80 placeholder:text-white/20 resize-none focus:outline-none"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                        />
                    )}

                    <button
                        onClick={() => onSubmit(question.type === 'short' ? shortInput : selected)}
                        disabled={grading || !canSubmit}
                        className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-30 transition-all"
                        style={{ background: 'linear-gradient(135deg,#FF5A1F,#FF7A3C)', color: '#fff' }}>
                        {grading ? <Loader2 size={14} className="animate-spin" /> : <><Send size={13} strokeWidth={2.5} />Submit</>}
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="px-3.5 py-2.5 rounded-xl text-sm"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                            Your answer
                        </span>
                        {attempt.userAnswer}
                    </div>
                    <div className="px-3.5 py-3 rounded-xl text-sm leading-relaxed"
                        style={{
                            background: attempt.isCorrect ? 'rgba(255,214,10,0.08)' : 'rgba(244,69,59,0.08)',
                            border: `1px solid ${attempt.isCorrect ? 'rgba(255,214,10,0.22)' : 'rgba(244,69,59,0.22)'}`,
                            color: attempt.isCorrect ? 'rgba(255,236,160,0.9)' : 'rgba(254,205,200,0.9)',
                        }}>
                        {attempt.feedback}
                    </div>
                </div>
            )}
        </div>
    );
};

const Results: React.FC<{
    session: ExamSession;
    onRetry: () => void;
    onNew: () => void;
    subjectId?: number;
    existingTopics: string[];
}> = ({ session, onRetry, onNew, subjectId, existingTopics }) => {
    const [added, setAdded] = useState(0);
    const correct = session.attempts.filter(a => a.isCorrect).length;
    const total = session.questions.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const color = scoreColor(pct);
    const timeTaken = session.finishedAt
        ? Math.round((session.finishedAt - session.startedAt) / 60000) : 0;

    const weakTopics = [...new Set(
        session.questions
            .filter((q, i) => !session.attempts[i]?.isCorrect)
            .map(q => q.topic),
    )].filter(Boolean);

    const newWeak = weakTopics.filter(t => !existingTopics.includes(t));
    const addToPlan = async () => {
        if (!subjectId || newWeak.length === 0) return;
        const today = new Date().toISOString().split('T')[0];
        await db.topics.bulkAdd(newWeak.map(name => ({
            subjectId, name,
            lastStudied: today,
            nextReview: today,
            easeFactor: 1.4,
            reviewCount: 0,
            comprehensionHistory: [1],
        })));
        setAdded(newWeak.length);
    };

    return (
        <div className="space-y-4 py-2">
            <div className="text-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2 font-black text-2xl"
                    style={{ background: `${color}15`, border: `2px solid ${color}40`, color }}>
                    {pct}%
                </div>
                <p className="text-sm font-bold text-white/80">{scoreLabel(pct)}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {correct}/{total} correct · {timeTaken}min
                </p>
            </div>

            <div className="space-y-2">
                {session.questions.map((q, i) => {
                    const a = session.attempts[i];
                    return (
                        <div key={q.id} className="flex items-start gap-3 px-3.5 py-2.5 rounded-xl"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            {a?.isCorrect
                                ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" style={{ color: '#FFD60A' }} strokeWidth={2} />
                                : <XCircle size={13} className="shrink-0 mt-0.5" style={{ color: '#F4453B' }} strokeWidth={2} />}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-white/60 leading-snug line-clamp-2">{q.question}</p>
                                {!a?.isCorrect && (
                                    <p className="text-[10px] mt-0.5" style={{ color: '#fca5a5' }}>→ {q.correctAnswer}</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {weakTopics.length > 0 && (
                <div className="px-3.5 py-3 rounded-xl space-y-2"
                    style={{ background: 'rgba(255,122,60,0.06)', border: '1px solid rgba(255,122,60,0.18)' }}>
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,122,60,0.7)' }}>
                        Review these
                    </p>
                    <div className="space-y-1.5">
                        {weakTopics.map(t => (
                            <div key={t} className="flex items-center gap-2">
                                <AlertTriangle size={10} style={{ color: '#FF7A3C' }} strokeWidth={2.5} />
                                <span className="text-xs" style={{ color: 'rgba(255,235,210,0.8)' }}>{t}</span>
                            </div>
                        ))}
                    </div>
                    {subjectId && (added > 0 ? (
                        <div className="flex items-center gap-2 pt-0.5 text-xs font-bold" style={{ color: '#FFD60A' }}>
                            <CheckCircle2 size={13} strokeWidth={2.5} />
                            Added {added} — they'll surface in Review &amp; Today
                        </div>
                    ) : newWeak.length > 0 ? (
                        <button onClick={addToPlan}
                            className="w-full mt-1 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                            style={{ background: 'linear-gradient(135deg,#FF5A1F,#FF7A3C)', color: '#0A0A0A' }}>
                            <Target size={13} strokeWidth={2.5} />Add {newWeak.length} weak {newWeak.length === 1 ? 'topic' : 'topics'} to plan
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 pt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            <CheckCircle2 size={12} strokeWidth={2.5} />Already in your plan
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-2 gap-2">
                <button onClick={onRetry}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                    <RotateCcw size={12} strokeWidth={2.5} />Retry Same
                </button>
                <button onClick={onNew}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold"
                    style={{ background: 'linear-gradient(135deg,rgba(255,90,31,0.2),rgba(255,122,60,0.2))', border: '1px solid rgba(255,90,31,0.35)', color: '#FF7A3C' }}>
                    <Brain size={12} strokeWidth={2.5} />New Exam
                </button>
            </div>
        </div>
    );
};

const EXAM_STAGES = [
    { icon: '🔍', text: 'Scanning your syllabus…', sub: 'Mapping topic coverage' },
    { icon: '⚡', text: 'Finding your weak spots…', sub: 'Cross-referencing review history' },
    { icon: '🧠', text: 'Crafting exam-grade questions…', sub: 'Targeting highest-yield concepts' },
    { icon: '🎯', text: 'Setting difficulty traps…', sub: 'Calibrating to your level' },
    { icon: '✅', text: 'Verifying answer keys…', sub: 'One last quality check' },
];

const ExamGeneratingLoader: React.FC<{
    count: number;
    subject: string;
    difficulty: Difficulty;
}> = ({ count, subject, difficulty }) => {
    const [stage, setStage] = useState(0);
    const [dotCount, setDotCount] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [barWidth, setBarWidth] = useState(0);

    useEffect(() => {
        const stageTimer = setInterval(() => {
            setStage(s => Math.min(s + 1, EXAM_STAGES.length - 1));
        }, 1800);
        const dotTimer = setInterval(() => setDotCount(d => (d + 1) % 4), 420);
        const elapsedTimer = setInterval(() => setElapsed(e => e + 1), 1000);
        const barTimer = setInterval(() => {
            setBarWidth(w => {
                if (w >= 92) return w + 0.05;
                if (w >= 70) return w + 0.15;
                return w + 0.6;
            });
        }, 80);

        return () => {
            clearInterval(stageTimer);
            clearInterval(dotTimer);
            clearInterval(elapsedTimer);
            clearInterval(barTimer);
        };
    }, []);

    const current = EXAM_STAGES[stage];
    const dots = '.'.repeat(dotCount);
    const diffColor = difficulty === 'easy' ? '#FFD60A' : difficulty === 'hard' ? '#F4453B' : '#FF7A3C';

    return (
        <div className="flex flex-col items-center justify-center py-10 gap-6 select-none">
            <div className="relative">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                    style={{
                        background: 'linear-gradient(135deg,rgba(255,90,31,0.15),rgba(255,90,31,0.12))',
                        border: '1px solid rgba(255,90,31,0.3)',
                        boxShadow: '0 0 30px rgba(255,90,31,0.15)',
                        animation: 'pulse 2s ease-in-out infinite',
                    }}>
                    {current.icon}
                </div>
                <div className="absolute inset-0" style={{ animation: 'spin 2s linear infinite' }}>
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                        style={{ background: 'rgba(255,122,60,0.7)', boxShadow: '0 0 6px rgba(255,122,60,0.5)' }} />
                </div>
            </div>

            <div className="text-center space-y-1.5">
                <p className="text-sm font-bold text-white/80">
                    {current.text}{dots}
                </p>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {current.sub}
                </p>
            </div>

            <div className="w-full max-w-[220px] space-y-1.5">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full transition-none"
                        style={{
                            width: `${Math.min(barWidth, 98)}%`,
                            background: 'linear-gradient(90deg,#FF5A1F,#FF7A3C)',
                            boxShadow: '0 0 8px rgba(255,90,31,0.5)',
                            transition: 'width 0.08s linear',
                        }} />
                </div>
                <div className="flex justify-between">
                    <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        {Math.round(Math.min(barWidth, 98))}%
                    </span>
                    <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        {elapsed}s
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold"
                    style={{ background: 'rgba(255,90,31,0.12)', border: '1px solid rgba(255,90,31,0.22)', color: '#FF7A3C' }}>
                    {count} questions
                </span>
                <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold"
                    style={{ background: `${diffColor}12`, border: `1px solid ${diffColor}28`, color: diffColor }}>
                    {difficulty}
                </span>
                <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold max-w-[100px] truncate"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
                    {subject}
                </span>
            </div>

            <div className="flex gap-1.5">
                {EXAM_STAGES.map((_, i) => (
                    <div key={i} className="rounded-full transition-all duration-500"
                        style={{
                            width: i === stage ? 16 : 6,
                            height: 6,
                            background: i < stage ? '#FF5A1F' : i === stage ? 'rgba(255,122,60,0.9)' : 'rgba(255,255,255,0.1)',
                        }} />
                ))}
            </div>

            {elapsed > 8 && (
                <p className="text-[10px] text-center animate-pulse"
                    style={{ color: 'rgba(255,255,255,0.2)' }}>
                    Complex subject — building high-quality questions takes time
                </p>
            )}
        </div>
    );
};

type State = 'setup' | 'loading' | 'running' | 'results';

export const ExamSimulator: React.FC<ExamSimulatorProps> = ({ block, subject, topics }) => {
    const [state, setState] = useState<State>('setup');
    const [session, setSession] = useState<ExamSession | null>(null);
    const [currentQ, setCurrentQ] = useState(0);
    const [grading, setGrading] = useState(false);
    const [difficulty, setDifficulty] = useState<Difficulty>('medium');
    const [count, setCount] = useState(5);
    const [error, setError] = useState('');

    const startExam = useCallback(async () => {
        setError('');
        setState('loading');
        const questions = await generateQuestions(block, subject, topics, count, difficulty);
        if (questions.length === 0) {
            setError('Failed to generate questions. Check your API key and try again.');
            setState('setup');
            return;
        }
        setSession({ questions, attempts: [], startedAt: Date.now() });
        setCurrentQ(0);
        setState('running');
    }, [block, subject, topics, count, difficulty]);

    const handleAnswer = useCallback(async (answer: string) => {
        if (!session) return;
        const q = session.questions[currentQ];
        setGrading(true);
        const result = await gradeAnswer(q, answer);
        const attempt: ExamAttempt = { questionId: q.id, userAnswer: answer, ...result };

        const isLast = currentQ === session.questions.length - 1;
        const updated: ExamSession = {
            ...session,
            attempts: [...session.attempts, attempt],
            ...(isLast ? { finishedAt: Date.now() } : {}),
        };
        setSession(updated);
        setGrading(false);
        if (isLast) setState('results');
    }, [session, currentQ]);

    if (state === 'setup') {
        const syllabus = subject?.syllabus ?? [];
        const done = syllabus.filter(u => u.completed).length;
        return (
            <div className="space-y-5 py-2">
                <div className="text-center">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                        style={{ background: 'linear-gradient(135deg,rgba(255,90,31,0.15),rgba(255,90,31,0.15))', border: '1px solid rgba(255,90,31,0.25)' }}>
                        <Trophy size={20} style={{ color: '#FF7A3C' }} strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-bold text-white/70">Exam Simulator</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        AI-generated questions from your {block.subjectName} syllabus
                    </p>
                </div>

                {error && (
                    <div className="px-3.5 py-2.5 rounded-xl text-xs flex items-start gap-2"
                        style={{ background: 'rgba(244,69,59,0.08)', border: '1px solid rgba(244,69,59,0.22)', color: 'rgba(254,205,200,0.9)' }}>
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" strokeWidth={2.5} />{error}
                    </div>
                )}

                {syllabus.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { label: 'Units Done', value: `${done}/${syllabus.length}` },
                            { label: 'Topics', value: `${topics?.length ?? 0}` },
                        ].map(s => (
                            <div key={s.label} className="px-3 py-2.5 rounded-xl text-center"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div className="text-lg font-black text-white/70">{s.value}</div>
                                <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.2)' }}>Difficulty</p>
                    <div className="grid grid-cols-3 gap-2">
                        {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
                            <button key={d} onClick={() => setDifficulty(d)}
                                className="py-2 rounded-xl text-xs font-bold capitalize transition-all"
                                style={difficulty === d
                                    ? { background: 'rgba(255,90,31,0.2)', border: '1px solid rgba(255,90,31,0.4)', color: '#FF7A3C' }
                                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                                {d}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.2)' }}>Questions</p>
                    <div className="grid grid-cols-4 gap-2">
                        {[3, 5, 7, 10].map(n => (
                            <button key={n} onClick={() => setCount(n)}
                                className="py-2 rounded-xl text-xs font-bold transition-all"
                                style={count === n
                                    ? { background: 'rgba(255,90,31,0.2)', border: '1px solid rgba(255,90,31,0.4)', color: '#FF7A3C' }
                                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                <button onClick={startExam}
                    className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                    style={{ background: 'linear-gradient(135deg,#FF5A1F,#FF7A3C)', color: '#fff', boxShadow: '0 4px 16px rgba(255,90,31,0.3)' }}>
                    <Zap size={15} strokeWidth={2.5} />Start {count}-Question Exam
                </button>
            </div>
        );
    }

    if (state === 'loading') {
        return <ExamGeneratingLoader count={count} subject={subject?.name ?? block.subjectName} difficulty={difficulty} />;
    }

    if (state === 'results' && session) {
        return (
            <Results
                session={session}
                subjectId={block.subjectId}
                existingTopics={(topics ?? []).map(t => t.name)}
                onRetry={() => {
                    setSession({ ...session, attempts: [], startedAt: Date.now(), finishedAt: undefined });
                    setCurrentQ(0);
                    setState('running');
                }}
                onNew={() => setState('setup')}
            />
        );
    }

    if (state === 'running' && session) {
        const q = session.questions[currentQ];
        const attempt = session.attempts.find(a => a.questionId === q.id);
        const progress = ((currentQ + (attempt ? 1 : 0)) / session.questions.length) * 100;

        return (
            <div className="space-y-4">
                <div className="space-y-1">
                    <div className="flex justify-between text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        <span>{currentQ + 1} of {session.questions.length}</span>
                        <span>{session.attempts.filter(a => a.isCorrect).length} correct</span>
                    </div>
                    <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#FF5A1F,#FF7A3C)' }} />
                    </div>
                </div>

                <QuestionCard
                    question={q}
                    attempt={attempt}
                    onSubmit={handleAnswer}
                    grading={grading}
                    num={currentQ + 1}
                    total={session.questions.length}
                />

                {attempt && currentQ < session.questions.length - 1 && (
                    <button onClick={() => setCurrentQ(c => c + 1)}
                        className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                        style={{ background: 'rgba(255,90,31,0.12)', border: '1px solid rgba(255,90,31,0.25)', color: '#FF7A3C' }}>
                        Next Question <ArrowRight size={12} strokeWidth={2.5} />
                    </button>
                )}
            </div>
        );
    }

    return null;
};
