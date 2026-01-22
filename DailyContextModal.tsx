import React, { useState } from "react";
import { CloudRain, Activity, ThermometerSun, X } from "lucide-react";
import { Subject, DailyContext } from "./types";
import { Input, Button } from "./components";
import { SpaceBackground } from "./SpaceBackground";
import { db } from "./db";
import FocusTrap from 'focus-trap-react';

interface DailyContextModalProps {
  subjects: Subject[];
  onGenerate: (ctx: DailyContext) => void;
}

export const DailyContextModal = ({ subjects, onGenerate }: DailyContextModalProps) => {
  const [mood, setMood] = useState<'low' | 'normal' | 'high'>('normal');
  const [dayType, setDayType] = useState<'normal' | 'isa' | 'esa'>('normal');
  const [focusSubjectId, setFocusSubjectId] = useState<number>(subjects[0]?.id || 0);
  const [isHoliday, setIsHoliday] = useState(false);
  const [isSick, setIsSick] = useState(false);
  const [bunked, setBunked] = useState(false);
  const [bunkedSubjectId, setBunkedSubjectId] = useState<number>(subjects[0]?.id || 0);
  const [examDays, setExamDays] = useState<number | ''>('');
  const [hasAssignment, setHasAssignment] = useState(false);
  const [newAssignment, setNewAssignment] = useState({ subjectId: subjects[0]?.id, title: "", dueDate: "" });

  const handleSubmit = async () => {
    if (hasAssignment && newAssignment.title && newAssignment.subjectId) {
      await db.assignments.add({
        id: Math.random().toString(36).substr(2, 9),
        subjectId: newAssignment.subjectId,
        title: newAssignment.title,
        dueDate: newAssignment.dueDate,
        completed: false
      });
    }

    onGenerate({
      mood,
      dayType,
      focusSubjectId: (dayType === 'isa' || dayType === 'esa') ? focusSubjectId : undefined,
      isHoliday,
      isSick,
      bunkedSubjectId: bunked ? bunkedSubjectId : undefined,
      daysToExam: examDays !== '' ? Number(examDays) : undefined
    });
  };

  return (
    <FocusTrap>
      <div className="fixed inset-0 z-[100]..." role="dialog" aria-modal="true">
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
          <SpaceBackground />
          <div className="w-full max-w-lg bg-zinc-900/50 border border-white/10 rounded-3xl p-8 shadow-2xl animate-float relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <h2 className="text-3xl font-display font-bold mb-2 relative z-10">Morning Protocol</h2>
            <p className="text-zinc-400 text-sm mb-8 relative z-10">Calibrate your algorithm for the day.</p>

            <div className="mb-8 relative z-10">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-3">Cognitive Status</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { val: 'low', icon: CloudRain, label: 'Low Energy' },
                  { val: 'normal', icon: Activity, label: 'Optimal' },
                  { val: 'high', icon: ThermometerSun, label: 'Peak State' }
                ].map((opt) => (
                  <button key={opt.val} onClick={() => setMood(opt.val as any)} className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all group ${mood === opt.val ? 'bg-white text-black border-white' : 'bg-black/30 border-white/5 text-zinc-500 hover:bg-white/5'}`}>
                    <opt.icon size={24} className={`transition-transform duration-500 ${mood === opt.val ? 'rotate-12 scale-110' : 'group-hover:scale-110'}`} />
                    <span className="text-xs font-bold">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8 relative z-10">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-3">Day Classification</label>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {['normal', 'isa', 'esa'].map(type => (
                  <button key={type} onClick={() => setDayType(type as any)} className={`py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${dayType === type ? (type === 'esa' ? 'bg-red-600 text-white shadow-lg shadow-red-900/50' : type === 'isa' ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/50' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50') : 'bg-black/30 text-zinc-600 border border-white/5 hover:border-white/10'}`}>
                    {type}
                  </button>
                ))}
              </div>
              {(dayType === 'isa' || dayType === 'esa') && (
                <select className="w-full bg-black/30 border border-white/10 text-white p-3 rounded-xl outline-none focus:border-indigo-500/50 transition-colors" value={focusSubjectId} onChange={e => setFocusSubjectId(Number(e.target.value))}>
                  {subjects.map(s => <option key={s.id} value={s.id}>Focus: {s.name}</option>)}
                </select>
              )}
            </div>

            <div className="mb-8 space-y-4 relative z-10 transition-all">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Life Events</label>
              <div className="flex gap-2">
                <button onClick={() => setIsHoliday(!isHoliday)} className={`flex-1 py-3 px-2 rounded-xl border text-xs font-bold transition-all ${isHoliday ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-black/30 border-white/5 text-zinc-600 hover:bg-white/5'}`}>Holiday</button>
                <button onClick={() => setIsSick(!isSick)} className={`flex-1 py-3 px-2 rounded-xl border text-xs font-bold transition-all ${isSick ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'bg-black/30 border-white/5 text-zinc-600 hover:bg-white/5'}`}>Sick</button>
                <button onClick={() => setBunked(!bunked)} className={`flex-1 py-3 px-2 rounded-xl border text-xs font-bold transition-all ${bunked ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300' : 'bg-black/30 border-white/5 text-zinc-600 hover:bg-white/5'}`}>Bunked</button>
              </div>

              {bunked && (
                <div className="animate-fade-in p-3 bg-yellow-900/10 border border-yellow-500/20 rounded-xl">
                  <label className="text-xs text-yellow-500/60 font-bold uppercase block mb-2">Which class did you miss?</label>
                  <select className="w-full bg-black/40 border border-white/10 text-white p-2 rounded-lg outline-none text-sm" value={bunkedSubjectId} onChange={e => setBunkedSubjectId(Number(e.target.value))}>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
              )}

              {(dayType === 'isa' || dayType === 'esa') && (
                <div className="pt-2 animate-fade-in">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Days to Exam</label>
                  <div className="flex items-center gap-3">
                    <Input type="number" placeholder="Days remaining..." className="p-3 text-sm bg-black/30 border-white/10 focus:border-indigo-500/50" value={examDays} onChange={(e: any) => setExamDays(e.target.value)} />
                    {examDays !== '' && Number(examDays) < 7 && <span className="text-xs font-bold text-red-400 animate-pulse">CRITICAL</span>}
                  </div>
                </div>
              )}
            </div>

            <div className="mb-8 relative z-10">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-3">Workload Calibration</label>
              {!hasAssignment ? (
                <button onClick={() => setHasAssignment(true)} className="w-full py-3 border border-dashed border-white/20 rounded-xl text-zinc-500 text-sm hover:text-white hover:border-white/40 transition-all flex items-center justify-center gap-2">
                  <span>+ Add Urgent Assignment</span>
                </button>
              ) : (
                <div className="bg-indigo-500/10 border border-indigo-500/30 p-4 rounded-xl space-y-3 animate-fade-in relative">
                  <button onClick={() => setHasAssignment(false)} className="absolute top-2 right-2 text-zinc-500 hover:text-white"><X size={14} /></button>
                  <div className="text-xs font-bold text-indigo-300 uppercase">New Mission Objective</div>
                  <select className="w-full bg-black/40 border border-white/10 p-2 rounded-lg outline-none text-sm text-white focus:border-indigo-500/50" value={newAssignment.subjectId} onChange={e => setNewAssignment({ ...newAssignment, subjectId: Number(e.target.value) })}>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <Input placeholder="Assignment Title" className="p-2 text-sm bg-black/40 border-white/10" value={newAssignment.title} onChange={(e: any) => setNewAssignment({ ...newAssignment, title: e.target.value })} />
                </div>
              )}
            </div>

            <Button onClick={handleSubmit} className="w-full py-4 text-lg bg-white text-black hover:bg-zinc-200 border-none relative z-10 font-bold">Initialize Systems</Button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
};