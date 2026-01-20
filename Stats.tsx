import React from "react";
import { StudyLog, Subject, Project } from "./types";
import { GlassCard } from "./components";
import { PageHeader } from "./PageHeader";
import { Clock, Check, Briefcase, FileText, Download } from "lucide-react";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";

export const StatsView = ({ logs, subjects }: { logs: StudyLog[]; subjects: Subject[] }) => {
  const projects = useLiveQuery(() => db.projects.toArray()) || [];
  const totalMinutes = logs.reduce((acc, log) => acc + log.duration, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  const subjectStats = subjects
    .map((sub) => {
      const mins = logs.filter((l) => l.subjectId === sub.id).reduce((a, b) => a + b.duration, 0);
      return { ...sub, mins };
    })
    .sort((a, b) => b.mins - a.mins);

  // Generate last 30 days heatmap data from REAL logs
  const today = new Date();
  const heatmapData = Array(30)
    .fill(0)
    .map((_, i) => {
      const d = new Date();
      d.setDate(today.getDate() - (29 - i));
      const dateStr = d.toISOString().split("T")[0];
      const dailyMins = logs.filter((l) => l.date === dateStr).reduce((sum, log) => sum + log.duration, 0);

      if (dailyMins === 0) return 0;
      if (dailyMins < 45) return 1;
      if (dailyMins < 120) return 2;
      return 3;
    });

  // Export session notes to a plaintext file
  const exportNotes = () => {
    const notesLogs = logs.filter((l) => l.notes && l.notes.trim());
    if (notesLogs.length === 0) {
      alert("No session notes to export yet!");
      return;
    }

    const notesText = notesLogs
      .slice() // shallow copy
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((l) => {
        const subject = subjects.find((s) => s.id === l.subjectId);
        return `═══════════════════════════════════════════════
📅 ${l.date} | ⏱️ ${l.duration}min | 📚 ${subject?.name || "Unknown"}
───────────────────────────────────────────────
${l.notes}
`;
      })
      .join("\n\n");

    const header = `ORBIT SESSION NOTES EXPORT
Generated: ${new Date().toLocaleString()}
Total Sessions with Notes: ${notesLogs.length}

═══════════════════════════════════════════════

`;

    const blob = new Blob([header + notesText], { type: "text/plain; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orbit-notes-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pb-24 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 animate-fade-in">
      <PageHeader title="Performance Data" showDate={true} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Left Column */}
        <div className="space-y-5">

          {/* Stats Cards Row */}
          <div className="grid grid-cols-2 gap-5">
            <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 bg-gradient-to-br from-indigo-900/20 to-transparent hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
              <div className="relative z-10">
                <Clock className="text-indigo-400 mb-3 group-hover:scale-110 transition-transform" size={20} />
                <div className="text-3xl font-mono font-bold mb-1 group-hover:text-indigo-100 transition-colors">{totalHours}</div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Total Hours</div>
              </div>
            </div>

            <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 bg-gradient-to-br from-emerald-900/20 to-transparent hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
              <div className="relative z-10">
                <Check className="text-emerald-400 mb-3 group-hover:scale-110 transition-transform" size={20} />
                <div className="text-3xl font-mono font-bold mb-1 group-hover:text-emerald-100 transition-colors">{logs.length}</div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Sessions</div>
              </div>
            </div>
          </div>

          {/* Heatmap Card */}
          <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 hover:border-indigo-500/20 transition-all duration-300 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
            <div className="relative z-10">
              <h3 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wider group-hover:text-indigo-300 transition-colors">
                Activity Heatmap (Last 30 Days)
              </h3>
              <div className="flex flex-wrap gap-1">
                {heatmapData.map((intensity, i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-md transition-all duration-200 hover:scale-125 hover:z-10 cursor-pointer ${intensity === 0
                        ? "bg-zinc-900 border border-zinc-800 hover:border-zinc-700"
                        : intensity === 1
                          ? "bg-indigo-900/60 border border-indigo-900 hover:border-indigo-700"
                          : intensity === 2
                            ? "bg-indigo-600 border border-indigo-500 hover:border-indigo-400"
                            : "bg-indigo-400 border border-indigo-300 shadow-[0_0_10px_rgba(129,140,248,0.4)] hover:shadow-[0_0_15px_rgba(129,140,248,0.6)]"
                      }`}
                    title={`Intensity: ${intensity}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Session Notes Card (Export) */}
          <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 hover:border-purple-500/20 transition-all duration-300 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
            <div className="relative z-10">
              <h3 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wider group-hover:text-purple-300 transition-colors flex items-center gap-2">
                <FileText size={16} />
                Session Notes
              </h3>
              <p className="text-xs text-zinc-500 mb-4">
                {logs.filter((l) => l.notes && l.notes.trim()).length} sessions with notes recorded
              </p>
              <button
                onClick={exportNotes}
                className="w-full py-3 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 rounded-lg transition-all font-medium text-sm border border-purple-500/20 hover:border-purple-500/40 flex items-center justify-center gap-2"
              >
                <Download size={14} />
                Export All Notes
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Subject Distribution */}
        <div className="group rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 h-full hover:border-indigo-500/20 transition-all duration-300 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
          <div className="relative z-10">
            <h3 className="text-sm font-bold text-zinc-400 mb-4 uppercase tracking-wider group-hover:text-indigo-300 transition-colors">
              Subject Distribution
            </h3>
            <div className="space-y-4">
              {subjectStats.map((stat, index) => (
                <div
                  key={stat.id}
                  className="group/item hover:translate-x-1 transition-all"
                  style={{ transitionDelay: `${index * 30}ms` }}
                >
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-zinc-300 group-hover/item:text-white transition-colors font-medium">{stat.code}</span>
                    <span className="font-mono text-zinc-400 group-hover/item:text-indigo-300 transition-colors">
                      {Math.round(stat.mins / 60)}h
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden group-hover/item:h-3 transition-all">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-full rounded-full transition-all duration-500 group-hover/item:from-indigo-400 group-hover/item:to-cyan-400"
                      style={{
                        width: `${totalMinutes > 0 ? (stat.mins / totalMinutes) * 100 : 0}%`,
                        transitionDelay: `${index * 50}ms`
                      }}
                    />
                  </div>
                </div>
              ))}
              {subjectStats.length === 0 && (
                <div className="text-zinc-500 italic text-sm text-center py-8">No data recorded yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Project Stats - Full Width */}
        <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 hover:border-indigo-500/20 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
          <div className="relative z-10">
            <h3 className="text-sm font-bold text-zinc-400 mb-5 uppercase tracking-wider flex items-center gap-2 group-hover:text-indigo-300 transition-colors">
              <Briefcase size={16} className="group-hover:scale-110 transition-transform" />
              Project Activity
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {projects.map((p, index) => {
                const projMins = logs.filter((l) => l.projectId === p.id).reduce((sum, l) => sum + l.duration, 0);
                return (
                  <div
                    key={p.id}
                    className="group/proj bg-zinc-900/60 p-5 rounded-xl border border-zinc-800 hover:border-indigo-500/30 hover:bg-zinc-900/80 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-indigo-500/5"
                    style={{ transitionDelay: `${index * 50}ms` }}
                  >
                    <div className="font-bold text-white mb-3 group-hover/proj:text-indigo-100 transition-colors">{p.name}</div>
                    <div className="flex justify-between items-end">
                      <div className="text-2xl font-mono text-zinc-400 group-hover/proj:text-indigo-300 transition-colors">
                        {Math.round(projMins / 60)}
                        <span className="text-xs ml-0.5">h</span>
                      </div>
                      <div className="text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 group-hover/proj:bg-indigo-500/20 group-hover/proj:text-indigo-300 group-hover/proj:border-indigo-500/30 transition-all">
                        {p.progression}% Done
                      </div>
                    </div>
                  </div>
                );
              })}
              {projects.length === 0 && (
                <div className="text-zinc-500 italic col-span-3 text-center py-8">
                  No active projects initialized.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
