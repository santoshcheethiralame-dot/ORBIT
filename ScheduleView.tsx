// ScheduleView.tsx — Weekly class timetable CRUD (brutalist concept v5)
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { Plus, Trash2, Calendar, Clock } from 'lucide-react';
import { useToast } from './Toast';
import { FrostedTile, PageHeader, MetaText, getSubjectColor, SUBJECT_COLOR_CLASSES } from './components';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Full-day slots from 6:00 to 23:00 (1-hour blocks = 17 slots).
// SLOT CONTRACT: slot 0 = 06:00, slot N = (06 + N):00.
// This must match ScheduleOptimizer.tsx (SLOT_START = 6) and
// Onboarding.tsx (ONBOARDING_SLOT_START = 6). Never change independently.
const SLOT_START_HOUR = 6;
const SLOT_END_HOUR = 23; // last slot starts at 22:00
const pad = (n: number) => String(n).padStart(2, '0');
const SLOT_LABELS: string[] = Array.from(
  { length: SLOT_END_HOUR - SLOT_START_HOUR },
  (_, i) => `${pad(SLOT_START_HOUR + i)}:00–${pad(SLOT_START_HOUR + i + 1)}:00`,
);

export default function ScheduleView() {
  const toast = useToast();
  const slots = useLiveQuery(() => db.schedule.toArray()) || [];
  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ day: 0, slot: 0, subjectId: '' });

  const getSubject = (id: number) => subjects.find(s => s.id === id);
  // Solid palette block class for a subject (bg-orange-500 / bg-amber-500 / bg-yellow-400 / bg-paper).
  const subjectSolid = (id: number) => {
    const sub = getSubject(id);
    return SUBJECT_COLOR_CLASSES[getSubjectColor(id, sub?.colorIndex)].bg;
  };

  // ── Clock context: which column is "today", which slot is "now", and what's up next ──
  const now = new Date();
  const todayIdx = (now.getDay() + 6) % 7;          // 0 = Monday
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const currentSlotIdx = (now.getHours() >= SLOT_START_HOUR && now.getHours() < SLOT_END_HOUR)
    ? now.getHours() - SLOT_START_HOUR : -1;

  const nextClass = useMemo(() => {
    const flat = slots
      .map(sl => ({ ...sl, startMins: (SLOT_START_HOUR + sl.slot) * 60, sub: getSubject(sl.subjectId) }))
      .filter(x => x.sub)
      .map(x => {
        let dayOffset = (x.day - todayIdx + 7) % 7;
        if (dayOffset === 0 && x.startMins + 60 <= nowMins) dayOffset = 7; // already finished today
        return { ...x, dayOffset };
      })
      .sort((a, b) => a.dayOffset - b.dayOffset || a.startMins - b.startMins);
    return flat[0] || null;
  }, [slots, subjects, todayIdx, nowMins]);

  const nextIsNow = !!nextClass && nextClass.dayOffset === 0 && nextClass.startMins <= nowMins && nowMins < nextClass.startMins + 60;
  const whenLabel = (() => {
    if (!nextClass) return '';
    if (nextIsNow) return 'happening now';
    if (nextClass.dayOffset === 0) {
      const m = nextClass.startMins - nowMins;
      return m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)}h ${m % 60}m`;
    }
    if (nextClass.dayOffset === 1) return 'tomorrow';
    return DAYS[nextClass.day];
  })();

  // Compact visible slot range — only render around the classes that actually exist.
  const usedSlots = slots.map(s => s.slot);
  const minSlot = usedSlots.length ? Math.max(0, Math.min(...usedSlots)) : 2;                       // default 08:00
  const maxSlot = usedSlots.length ? Math.min(SLOT_LABELS.length - 1, Math.max(...usedSlots)) : 8;  // default 14:00
  const visibleSlots = Array.from({ length: maxSlot - minSlot + 1 }, (_, i) => minSlot + i);

  const handleAdd = async () => {
    if (!formData.subjectId) { toast.error('Please select a subject'); return; }
    const exists = slots.find(
      s => s.day === formData.day && s.slot === formData.slot && s.subjectId === Number(formData.subjectId),
    );
    if (exists) { toast.error('That slot is already occupied for this subject'); return; }
    try {
      await db.schedule.add({ day: formData.day, slot: formData.slot, subjectId: Number(formData.subjectId) });
      toast.success('Class added to schedule');
      setShowForm(false);
      setFormData({ day: 0, slot: 0, subjectId: '' });
    } catch { toast.error('Failed to add class'); }
  };

  const handleDelete = async (id: number) => {
    await db.schedule.delete(id);
    toast.success('Class removed');
  };

  // Build a grid: day → slot → ScheduleSlot[]
  const grid: Record<number, Record<number, typeof slots[0][]>> = {};
  for (let d = 0; d < 7; d++) {
    grid[d] = {};
    for (let s = 0; s < SLOT_LABELS.length; s++) grid[d][s] = slots.filter(sl => sl.day === d && sl.slot === s);
  }

  const selectCls = 'w-full bg-ink3 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-orange-500/60 transition-all';

  return (
    <div className="pb-32 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto">
      <PageHeader
        title="Class Schedule"
        meta={<MetaText>WEEKLY TIMETABLE</MetaText>}
        actions={
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-ink rounded-full font-bold text-sm transition-transform hover:scale-105 active:scale-95 min-h-[44px]"
          >
            <Plus size={18} strokeWidth={2.5} />
            Add Class
          </button>
        }
      />

      {/* Up-next hero */}
      {nextClass && (
        <div className="rounded-4xl bg-orange-500 text-ink p-5 mb-4 flex items-center gap-4 animate-in fade-in duration-500">
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest bg-ink text-orange-400 px-2.5 py-1 rounded-full shrink-0">
            {nextIsNow ? 'Now' : 'Up next'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-display text-xl md:text-2xl leading-none truncate">{nextClass.sub!.name}</div>
            <div className="text-xs font-semibold opacity-70 mt-1">
              {pad(SLOT_START_HOUR + nextClass.slot)}:00–{pad(SLOT_START_HOUR + nextClass.slot + 1)}:00
              {nextClass.sub!.code ? ` · ${nextClass.sub!.code}` : ''} · {whenLabel}
            </div>
          </div>
          <div className="font-display text-3xl md:text-4xl shrink-0">
            {pad(SLOT_START_HOUR + nextClass.slot)}<span className="text-base align-top opacity-60">:00</span>
          </div>
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <FrostedTile className="p-6 mb-6 animate-in slide-in-from-top-4 fade-in duration-300">
          <h3 className="font-display text-xl text-white mb-4">Add class to timetable</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest block mb-2">Day</label>
              <select value={formData.day} onChange={e => setFormData({ ...formData, day: Number(e.target.value) })} className={selectCls}>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest block mb-2">Time slot</label>
              <select value={formData.slot} onChange={e => setFormData({ ...formData, slot: Number(e.target.value) })} className={selectCls}>
                {SLOT_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest block mb-2">Subject</label>
              <select value={formData.subjectId} onChange={e => setFormData({ ...formData, subjectId: e.target.value })} className={selectCls}>
                <option value="">Select subject…</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAdd}
              className="px-6 py-3 bg-orange-500 text-ink rounded-xl font-bold text-sm transition-transform hover:scale-105 active:scale-95 min-h-[44px]">
              Add Class
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-6 py-3 bg-ink3 hover:bg-ink2 rounded-xl font-semibold text-sm border border-white/10 transition-all hover:scale-105 active:scale-95 min-h-[44px]">
              Cancel
            </button>
          </div>
        </FrostedTile>
      )}

      {subjects.length === 0 ? (
        <FrostedTile className="p-12 text-center">
          <Calendar size={40} className="text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-500 font-medium">Add subjects first to build your schedule.</p>
        </FrostedTile>
      ) : slots.length === 0 && !showForm ? (
        <FrostedTile className="p-12 text-center">
          <Clock size={40} className="text-zinc-600 mx-auto mb-4" />
          <p className="font-display text-2xl text-white mb-2">No classes scheduled yet</p>
          <p className="text-zinc-500 text-sm mb-6">Add your weekly class slots to help Orbit plan around your timetable.</p>
          <button onClick={() => setShowForm(true)}
            className="px-6 py-3 bg-orange-500 text-ink rounded-full font-bold text-sm transition-transform hover:scale-105 active:scale-95 min-h-[44px] inline-flex items-center gap-2">
            <Plus size={18} strokeWidth={2.5} />
            Add First Class
          </button>
        </FrostedTile>
      ) : (
        /* Timetable Grid */
        <div className="rounded-4xl bg-ink2 border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left font-mono text-[9px] text-zinc-500 uppercase tracking-widest w-24">Time</th>
                  {DAYS.map((day, di) => (
                    <th key={day}
                      className={`px-3 py-3 text-center font-mono text-[9px] uppercase tracking-widest ${di === todayIdx ? 'bg-orange-500 text-ink' : 'text-zinc-500'}`}>
                      {day.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSlots.map(slotIdx => (
                  <tr key={slotIdx} className="border-b border-white/[0.05]">
                    <td className="px-4 py-2.5 text-left font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                      {pad(SLOT_START_HOUR + slotIdx)}:00
                    </td>
                    {DAYS.map((_, dayIdx) => {
                      const cellSlots = grid[dayIdx][slotIdx] || [];
                      const isToday = dayIdx === todayIdx;
                      return (
                        <td key={dayIdx} className={`p-2 text-center align-middle min-w-[90px] ${isToday ? 'bg-orange-500/5' : ''}`}>
                          {cellSlots.map(sl => {
                            const sub = getSubject(sl.subjectId);
                            if (!sub) return null;
                            const isNow = isToday && slotIdx === currentSlotIdx;
                            return (
                              <div key={sl.id}
                                className={`group relative ${subjectSolid(sl.subjectId)} text-ink rounded-xl px-2 py-2 transition-transform hover:scale-105 ${isNow ? 'ring-2 ring-white/40' : ''}`}>
                                <div className="font-display text-xs leading-none truncate">{sub.code || sub.name}</div>
                                {sub.code && <div className="font-mono text-[8px] opacity-60 mt-0.5 truncate">{sub.name}</div>}
                                <button onClick={() => handleDelete(sl.id!)}
                                  className="absolute -top-1.5 -right-1.5 opacity-0 group-hover:opacity-100 bg-ink text-orange-400 rounded-full w-5 h-5 flex items-center justify-center transition-all"
                                  title="Remove">
                                  <Trash2 size={10} />
                                </button>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-4 py-3 border-t border-white/10 flex items-center gap-4 flex-wrap">
            {subjects.slice(0, 8).map(s => (
              <span key={s.id} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <span className={`w-2.5 h-2.5 rounded ${subjectSolid(s.id!)}`} />{s.code || s.name}
              </span>
            ))}
            <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest ml-auto">↤ swipe · mobile scrolls</span>
          </div>
        </div>
      )}
    </div>
  );
}
