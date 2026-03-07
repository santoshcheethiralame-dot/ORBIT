// ScheduleView.tsx — Weekly class timetable CRUD
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { Plus, Trash2, Calendar, Clock } from 'lucide-react';
import { useToast } from './Toast';
import { FrostedTile, FrostedMini, PageHeader, MetaText, getSubjectColor, SUBJECT_COLOR_CLASSES } from './components';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Full-day slots from 6:00 to 23:00 (1-hour blocks = 17 slots).
// Students with early classes (7am lectures) or late labs are now covered.
const SLOT_START_HOUR = 6;
const SLOT_END_HOUR = 23; // last slot starts at 22:00
const SLOT_LABELS: string[] = Array.from(
  { length: SLOT_END_HOUR - SLOT_START_HOUR },
  (_, i) => {
    const h = SLOT_START_HOUR + i;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:00–${pad(h + 1)}:00`;
  }
);

export default function ScheduleView() {
  const toast = useToast();
  const slots = useLiveQuery(() => db.schedule.toArray()) || [];
  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ day: 0, slot: 0, subjectId: '' });

  const getSubject = (id: number) => subjects.find(s => s.id === id);

  const handleAdd = async () => {
    if (!formData.subjectId) {
      toast.error('Please select a subject');
      return;
    }
    const exists = slots.find(
      s => s.day === formData.day && s.slot === formData.slot && s.subjectId === Number(formData.subjectId)
    );
    if (exists) {
      toast.error('That slot is already occupied for this subject');
      return;
    }
    try {
      await db.schedule.add({
        day: formData.day,
        slot: formData.slot,
        subjectId: Number(formData.subjectId),
      });
      toast.success('Class added to schedule');
      setShowForm(false);
      setFormData({ day: 0, slot: 0, subjectId: '' });
    } catch {
      toast.error('Failed to add class');
    }
  };

  const handleDelete = async (id: number) => {
    await db.schedule.delete(id);
    toast.success('Class removed');
  };

  // Build a grid: day → slot → ScheduleSlot
  const grid: Record<number, Record<number, typeof slots[0][]>> = {};
  for (let d = 0; d < 7; d++) {
    grid[d] = {};
    for (let s = 0; s < SLOT_LABELS.length; s++) {
      grid[d][s] = slots.filter(sl => sl.day === d && sl.slot === s);
    }
  }

  return (
    <div className="pb-32 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto">
      <PageHeader
        title="Class Schedule"
        meta={<MetaText>WEEKLY TIMETABLE</MetaText>}
        actions={
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 rounded-2xl font-bold text-sm border border-indigo-500/30 transition-all hover:scale-105 active:scale-95 min-h-[44px]"
          >
            <Plus size={18} />
            Add Class
          </button>
        }
      />

      {/* Add Form */}
      {showForm && (
        <FrostedTile className="p-6 mb-6 animate-in slide-in-from-top-4 fade-in duration-300">
          <h3 className="font-bold text-white mb-4 text-base">Add Class to Timetable</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Day</label>
              <select
                value={formData.day}
                onChange={e => setFormData({ ...formData, day: Number(e.target.value) })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 transition-all"
              >
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Time Slot</label>
              <select
                value={formData.slot}
                onChange={e => setFormData({ ...formData, slot: Number(e.target.value) })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 transition-all"
              >
                {SLOT_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Subject</label>
              <select
                value={formData.subjectId}
                onChange={e => setFormData({ ...formData, subjectId: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 transition-all"
              >
                <option value="">Select subject…</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleAdd}
              className="px-6 py-3 bg-indigo-500/20 hover:bg-indigo-500/30 rounded-xl font-bold text-sm border border-indigo-500/30 transition-all hover:scale-105 active:scale-95 min-h-[44px]"
            >
              Add Class
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-6 py-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl font-semibold text-sm border border-zinc-700 transition-all hover:scale-105 active:scale-95 min-h-[44px]"
            >
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
          <p className="text-zinc-400 font-bold text-lg mb-2">No classes scheduled yet</p>
          <p className="text-zinc-600 text-sm mb-6">Add your weekly class slots to help Orbit plan around your timetable.</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-3 bg-indigo-500/20 hover:bg-indigo-500/30 rounded-xl font-bold text-sm border border-indigo-500/30 transition-all hover:scale-105 active:scale-95 min-h-[44px] inline-flex items-center gap-2"
          >
            <Plus size={18} />
            Add First Class
          </button>
        </FrostedTile>
      ) : (
        /* Timetable Grid */
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr>
                <th className="bg-zinc-900/80 px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-wider w-28 border-b border-white/5">
                  Time
                </th>
                {DAYS.map(day => (
                  <th key={day} className="bg-zinc-900/80 px-3 py-3 text-center text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-white/5">
                    {day.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOT_LABELS.map((label, slotIdx) => (
                <tr key={slotIdx} className="border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors">
                  <td className="px-4 py-2.5 text-xs font-mono text-zinc-600 whitespace-nowrap">
                    {label}
                  </td>
                  {DAYS.map((_, dayIdx) => {
                    const cellSlots = grid[dayIdx][slotIdx] || [];
                    return (
                      <td key={dayIdx} className="px-2 py-2 text-center align-middle min-w-[90px]">
                        {cellSlots.map(sl => {
                          const sub = getSubject(sl.subjectId);
                          if (!sub) return null;
                          const color = getSubjectColor(sl.subjectId);
                          const cls = SUBJECT_COLOR_CLASSES[color];
                          return (
                            <div
                              key={sl.id}
                              className={`group relative inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold ${cls.bg} ${cls.text} border ${cls.border} transition-all hover:scale-105`}
                            >
                              <span className="truncate max-w-[70px]">{sub.code || sub.name}</span>
                              <button
                                onClick={() => handleDelete(sl.id!)}
                                className="opacity-0 group-hover:opacity-100 ml-1 text-red-400 hover:text-red-300 transition-all"
                                title="Remove"
                              >
                                <Trash2 size={11} />
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
      )}
    </div>
  );
}