import React, { useState, useMemo } from "react";
import {
  FolderKanban, Plus, Clock, Trash2, Edit2, Calendar,
  MoreHorizontal, X, Check, Archive, AlertTriangle, Flame,
  Circle, LogIn
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { useToast } from "./Toast";
import { getSubjectColor, SUBJECT_COLOR_CLASSES } from "./components";

const PRIORITY_META = {
  low: { label: "Low", dot: "bg-zinc-500", text: "text-zinc-400", ring: "border-zinc-700" },
  normal: { label: "Normal", dot: "bg-blue-500", text: "text-blue-400", ring: "border-blue-800" },
  high: { label: "High", dot: "bg-amber-500", text: "text-amber-400", ring: "border-amber-800" },
  urgent: { label: "Urgent", dot: "bg-red-500", text: "text-red-400", ring: "border-red-800" },
} as const;

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}
function fmtMins(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// ─── Log-session modal ────────────────────────────────────────────────────────
function LogSessionModal({ project, onClose }: { project: any; onClose: () => void }) {
  const toast = useToast();
  const [minutes, setMinutes] = useState("30");

  const handleLog = async () => {
    const m = parseInt(minutes, 10);
    if (isNaN(m) || m <= 0) { toast.error("Enter a valid duration"); return; }
    const newDone = Math.min(project.totalEffortMinutes, project.completedEffortMinutes + m);
    await db.projects.update(project.id!, { completedEffortMinutes: newDone });
    toast.success(`+${fmtMins(m)} logged on "${project.name}"`);
    onClose();
  };

  const previewPct = Math.min(100, Math.round(
    ((project.completedEffortMinutes + (parseInt(minutes, 10) || 0)) / project.totalEffortMinutes) * 100
  ));

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-0.5">Log Work Session</p>
            <h3 className="text-sm font-bold text-white truncate max-w-[220px]">{project.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-all"><X size={15} /></button>
        </div>
        <div className="space-y-3 mb-4">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Quick pick (minutes)</label>
          <div className="flex gap-2">
            {[15, 30, 45, 60, 90].map(m => (
              <button key={m} onClick={() => setMinutes(String(m))}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${minutes === String(m) ? "bg-indigo-600 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"}`}
              >{m}</button>
            ))}
          </div>
          <input type="number" value={minutes} onChange={e => setMinutes(e.target.value)}
            placeholder="Custom..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500 transition-colors" />
        </div>
        <div className="mb-5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
            <span>After logging</span>
            <span className="text-white font-bold">{previewPct}%</span>
          </div>
          <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${previewPct}%` }} />
          </div>
        </div>
        <button onClick={handleLog} className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]">
          Log {fmtMins(parseInt(minutes, 10) || 0)}
        </button>
      </div>
    </div>
  );
}

// ─── Project form modal ───────────────────────────────────────────────────────
function ProjectFormModal({ initial, subjects, onSave, onClose }: { initial?: any; subjects: any[]; onSave: (d: any) => void; onClose: () => void; }) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    subjectId: initial?.subjectId?.toString() ?? "",
    totalEffortMinutes: initial?.totalEffortMinutes?.toString() ?? "120",
    deadline: initial?.deadline ?? "",
    priority: initial?.priority ?? "normal",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-white">{initial ? "Edit Project" : "New Project"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-all"><X size={15} /></button>
        </div>
        <div className="space-y-3 mb-5">
          <input placeholder="Project name *" value={form.name} onChange={e => set("name", e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 transition-colors" />
          <select value={form.subjectId} onChange={e => set("subjectId", e.target.value)}
            className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 transition-colors">
            <option value="">Select subject *</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Total effort (min)</label>
              <input type="number" value={form.totalEffortMinutes} onChange={e => set("totalEffortMinutes", e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Deadline</label>
              <input type="date" value={form.deadline} onChange={e => set("deadline", e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 transition-colors font-mono" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">Priority</label>
            <div className="grid grid-cols-4 gap-2">
              {(["low", "normal", "high", "urgent"] as const).map(p => {
                const meta = PRIORITY_META[p];
                return (
                  <button key={p} onClick={() => set("priority", p)}
                    className={`py-2 rounded-lg text-xs font-bold border transition-all ${form.priority === p ? `${meta.text} border-current bg-white/5` : "text-zinc-500 border-transparent hover:border-zinc-700 hover:text-zinc-300"}`}>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <button onClick={() => { if (form.name && form.subjectId) onSave(form); }}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]">
          {initial ? "Save Changes" : "Create Project"}
        </button>
      </div>
    </div>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────
function ProjectCard({ project, subject, onLog, onEdit, onDelete, onToggleComplete }: {
  project: any; subject: any;
  onLog: () => void; onEdit: () => void; onDelete: () => void; onToggleComplete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pct = Math.min(100, Math.round((project.completedEffortMinutes / project.totalEffortMinutes) * 100));
  const remaining = Math.max(0, project.totalEffortMinutes - project.completedEffortMinutes);
  const priority = PRIORITY_META[project.priority as keyof typeof PRIORITY_META] ?? PRIORITY_META.normal;
  const colorKey = subject ? getSubjectColor(subject.id!, subject.colorIndex) : "indigo";
  const cc = SUBJECT_COLOR_CLASSES[colorKey];
  const days = project.deadline ? daysUntil(project.deadline) : null;
  const deadlineColor = days === null ? "" : days < 0 ? "text-red-400" : days <= 2 ? "text-orange-400" : days <= 7 ? "text-amber-400" : "text-zinc-600";

  const barColor = pct >= 100 ? "bg-emerald-500"
    : project.priority === "urgent" ? "bg-red-500"
      : project.priority === "high" ? "bg-amber-500"
        : "bg-indigo-500";

  return (
    <div className={`group relative rounded-2xl border overflow-hidden transition-all duration-300 ${project.completed
      ? "bg-zinc-900/30 border-white/[0.04] opacity-55"
      : "bg-zinc-900/50 border-white/[0.08] hover:border-white/[0.16] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
      }`}>
      {/* Left priority accent bar */}
      {!project.completed && (
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${priority.dot} opacity-80`} />
      )}
      {/* Subtle subject color glow */}
      {!project.completed && (
        <div className={`pointer-events-none absolute inset-0 ${cc.bgLight} opacity-0 group-hover:opacity-30 transition-opacity duration-300`} />
      )}

      <div className="pl-5 pr-3.5 pt-4 pb-3.5 relative">
        {/* Top: subject chip + title + actions */}
        <div className="flex items-start gap-2.5 mb-3">
          <div className="flex-1 min-w-0">
            <div className={`inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg mb-1.5 ${cc.bgLight} ${cc.text} border ${cc.borderLight}`}>
              <div className={`w-1 h-1 rounded-full ${cc.bg} shrink-0`} />{subject?.name ?? "Unknown"}
            </div>
            <h3 className={`font-semibold text-[13.5px] leading-snug ${project.completed ? "line-through text-zinc-600" : "text-white"}`}>
              {project.name}
            </h3>
          </div>

          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            {!project.completed && (
              <button onClick={onLog}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-[10.5px] font-bold transition-all border border-indigo-500/20 hover:border-indigo-400/30 active:scale-95">
                <LogIn size={10} />Log
              </button>
            )}
            <div className="relative">
              <button onClick={() => setMenuOpen(o => !o)}
                className="p-1.5 rounded-lg text-zinc-700 hover:text-zinc-300 hover:bg-white/[0.07] transition-all">
                <MoreHorizontal size={14} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-zinc-900/95 border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <button onClick={() => { onEdit(); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-all">
                    <Edit2 size={11} />Edit
                  </button>
                  <button onClick={() => { onToggleComplete(); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-all">
                    {project.completed ? <><Circle size={11} />Reopen</> : <><Check size={11} />Mark done</>}
                  </button>
                  <div className="h-px bg-white/[0.06] my-0.5" />
                  <button onClick={() => { onDelete(); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 size={11} />Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10.5px] mb-1.5">
            <span className="text-zinc-600 tabular-nums">{fmtMins(project.completedEffortMinutes)}</span>
            <span className={`font-bold tabular-nums ${pct >= 100 ? "text-emerald-400" : pct >= 60 ? "text-indigo-300" : "text-zinc-500"}`}>{pct}%</span>
            <span className="text-zinc-700 tabular-nums">{fmtMins(remaining)} left</span>
          </div>
          <div className="h-1.5 bg-zinc-800/70 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between text-[10.5px] pt-2 border-t border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            {days !== null && (
              <span className={`flex items-center gap-1 font-semibold ${deadlineColor}`}>
                <Calendar size={10} />
                {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}
              </span>
            )}
            <span className={`flex items-center gap-1 font-medium ${priority.text}`}>
              <div className={`w-1 h-1 rounded-full ${priority.dot} shrink-0`} />{priority.label}
            </span>
          </div>
          {project.completed && (
            <span className="flex items-center gap-1 text-emerald-500 font-semibold">
              <Check size={10} />Done
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
type FilterType = "all" | "active" | "done";
type SortType = "deadline" | "priority" | "progress" | "name";
const PRANK = { urgent: 0, high: 1, normal: 2, low: 3 };

export default function ProjectsView() {
  const toast = useToast();
  const projects = useLiveQuery(() => db.projects.toArray()) || [];
  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];

  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("deadline");
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [logTarget, setLogTarget] = useState<any | null>(null);

  const getSubject = (id: number) => subjects.find(s => s.id === id);

  const active = projects.filter(p => !p.completed);
  const done = projects.filter(p => p.completed);
  const urgent = active.filter(p => p.priority === "urgent" || p.priority === "high");
  const overdue = active.filter(p => p.deadline && daysUntil(p.deadline) < 0);
  const totalLeft = active.reduce((s, p) => s + Math.max(0, p.totalEffortMinutes - p.completedEffortMinutes), 0);
  const avgPct = active.length
    ? Math.round(active.reduce((s, p) => s + (p.completedEffortMinutes / p.totalEffortMinutes) * 100, 0) / active.length)
    : 0;

  const visible = useMemo(() => {
    let list = filter === "active" ? active : filter === "done" ? done : projects;
    return [...list].sort((a, b) => {
      if (sort === "deadline") {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1; if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (sort === "priority") return (PRANK[a.priority as keyof typeof PRANK] ?? 2) - (PRANK[b.priority as keyof typeof PRANK] ?? 2);
      if (sort === "progress") {
        const pa = (a.completedEffortMinutes / a.totalEffortMinutes);
        const pb = (b.completedEffortMinutes / b.totalEffortMinutes);
        return pa - pb;
      }
      return a.name.localeCompare(b.name);
    });
  }, [projects, filter, sort]);

  const handleCreate = async (form: any) => {
    try {
      await db.projects.add({
        name: form.name, subjectId: Number(form.subjectId),
        totalEffortMinutes: Number(form.totalEffortMinutes),
        completedEffortMinutes: 0,
        deadline: form.deadline || undefined, priority: form.priority, completed: false,
      });
      toast.success("Project created");
      setShowForm(false);
    } catch { toast.error("Failed to create"); }
  };

  const handleEdit = async (form: any) => {
    if (!editTarget) return;
    try {
      await db.projects.update(editTarget.id!, {
        name: form.name, subjectId: Number(form.subjectId),
        totalEffortMinutes: Number(form.totalEffortMinutes),
        deadline: form.deadline || undefined, priority: form.priority,
      });
      toast.success("Updated"); setEditTarget(null);
    } catch { toast.error("Failed to update"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this project?")) return;
    await db.projects.delete(id); toast.success("Deleted");
  };

  const handleToggle = async (p: any) => {
    await db.projects.update(p.id!, { completed: !p.completed });
    toast.success(p.completed ? "Reopened" : "Marked complete 🎉");
  };

  // Empty state
  if (projects.length === 0) return (
    <div className="pb-32 pt-8 px-4 lg:px-8 w-full max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white">Projects</h1>
          <p className="text-zinc-500 text-sm mt-1">Track assignments, papers, labs, and more</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all hover:scale-105 active:scale-95">
          <Plus size={14} />New Project
        </button>
      </div>
      <div className="border-2 border-dashed border-white/[0.07] rounded-2xl py-24 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-5">
          <FolderKanban size={28} className="text-indigo-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">No projects yet</h3>
        <p className="text-zinc-500 text-sm max-w-xs mx-auto mb-6">Create a project for any large deliverable. Log sessions to track your effort.</p>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all hover:scale-105 active:scale-95">
          <Plus size={14} />Create first project
        </button>
      </div>
      {showForm && <ProjectFormModal subjects={subjects} onSave={handleCreate} onClose={() => setShowForm(false)} />}
    </div>
  );

  return (
    <div className="pb-32 pt-8 px-4 lg:px-8 w-full max-w-5xl mx-auto animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-3xl font-bold text-white">Projects</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{active.length} active · {done.length} done</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.97]">
          <Plus size={14} />New Project
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { icon: FolderKanban, label: "Active", value: active.length, color: "indigo" },
          { icon: Clock, label: "Hours left", value: `${(totalLeft / 60).toFixed(1)}h`, color: "cyan" },
          { icon: Flame, label: "High/Urgent", value: urgent.length, color: "amber" },
          { icon: AlertTriangle, label: "Overdue", value: overdue.length, color: overdue.length > 0 ? "red" : "zinc" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${color === "red" && overdue.length > 0
            ? "bg-red-500/[0.06] border-red-500/20 hover:border-red-500/35"
            : "bg-white/[0.025] border-white/[0.07] hover:border-white/[0.12]"
            }`}>
            <div className="p-4">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${color === "indigo" ? "bg-indigo-500/15 border border-indigo-500/20"
                : color === "cyan" ? "bg-cyan-500/15 border border-cyan-500/20"
                  : color === "amber" ? "bg-amber-500/15 border border-amber-500/20"
                    : color === "red" && overdue.length > 0 ? "bg-red-500/15 border border-red-500/20"
                      : "bg-white/[0.04] border border-white/[0.06]"
                }`}>
                <Icon size={14} className={
                  color === "indigo" ? "text-indigo-400"
                    : color === "cyan" ? "text-cyan-400"
                      : color === "amber" ? "text-amber-400"
                        : color === "red" && overdue.length > 0 ? "text-red-400"
                          : "text-zinc-600"} />
              </div>
              <div className={`text-2xl font-bold font-mono tabular-nums ${color === "indigo" ? "text-white"
                : color === "cyan" ? "text-white"
                  : color === "amber" ? "text-white"
                    : color === "red" && overdue.length > 0 ? "text-red-400"
                      : "text-zinc-600"}`}>{value}</div>
              <div className="text-[9.5px] text-zinc-600 font-bold uppercase tracking-widest mt-1">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Overall progress */}
      {active.length > 0 && (
        <div className="mb-6 px-4 py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-zinc-500">Overall progress</span>
              <span className="font-bold text-white">{avgPct}%</span>
            </div>
            <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700" style={{ width: `${avgPct}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Filters + sort */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          {(["all", "active", "done"] as FilterType[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${filter === f ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
              {f}{f === "active" ? ` (${active.length})` : f === "done" ? ` (${done.length})` : `(${projects.length})`}
            </button>
          ))}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as SortType)}
          className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-1.5 text-xs text-zinc-400 outline-none cursor-pointer hover:text-zinc-200 transition-colors">
          <option value="deadline">Sort: Deadline</option>
          <option value="priority">Sort: Priority</option>
          <option value="progress">Sort: Progress</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Archive size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No projects in this view</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {visible.map(p => (
            <ProjectCard key={p.id} project={p} subject={getSubject(p.subjectId)}
              onLog={() => setLogTarget(p)} onEdit={() => setEditTarget(p)}
              onDelete={() => handleDelete(p.id!)} onToggleComplete={() => handleToggle(p)} />
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && <ProjectFormModal subjects={subjects} onSave={handleCreate} onClose={() => setShowForm(false)} />}
      {editTarget && <ProjectFormModal initial={editTarget} subjects={subjects} onSave={handleEdit} onClose={() => setEditTarget(null)} />}
      {logTarget && <LogSessionModal project={logTarget} onClose={() => setLogTarget(null)} />}
    </div>
  );
}