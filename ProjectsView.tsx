import React, { useState } from "react";
import { FolderKanban, Plus, Target, Clock, Zap, CheckSquare, Trash2, Edit2, Play, Calendar } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { useToast } from "./Toast";
import { FrostedTile, FrostedMini, getSubjectColor, SUBJECT_COLOR_CLASSES, PageHeader, MetaText } from "./components";

export default function ProjectsView() {
    const toast = useToast();
    const projects = useLiveQuery(() => db.projects.toArray()) || [];
    const subjects = useLiveQuery(() => db.subjects.toArray()) || [];

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        subjectId: "",
        totalEffortMinutes: "120",
        completedEffortMinutes: "0",
        deadline: "",
        priority: "normal" as "low" | "normal" | "high" | "urgent"
    });

    const getSubject = (id: number) => subjects.find(s => s.id === id);

    const handleSubmit = async () => {
        if (!formData.name || !formData.subjectId) {
            toast.error("Name and Subject are required");
            return;
        }

        try {
            const dbUrl = editingId ? db.projects.update(editingId, {
                name: formData.name,
                subjectId: Number(formData.subjectId),
                totalEffortMinutes: Number(formData.totalEffortMinutes),
                completedEffortMinutes: Number(formData.completedEffortMinutes),
                deadline: formData.deadline || undefined,
                priority: formData.priority
            }) : db.projects.add({
                name: formData.name,
                subjectId: Number(formData.subjectId),
                totalEffortMinutes: Number(formData.totalEffortMinutes),
                completedEffortMinutes: Number(formData.completedEffortMinutes),
                deadline: formData.deadline || undefined,
                priority: formData.priority,
                completed: false
            });

            await dbUrl;
            toast.success(editingId ? "Project updated" : "Project created");
            setShowForm(false);
            setEditingId(null);
            setFormData({ name: "", subjectId: "", totalEffortMinutes: "120", completedEffortMinutes: "0", deadline: "", priority: "normal" });
        } catch (e) {
            toast.error("Failed to save project");
        }
    };

    const handleEdit = (p: any) => {
        setFormData({
            name: p.name,
            subjectId: p.subjectId.toString(),
            totalEffortMinutes: p.totalEffortMinutes.toString(),
            completedEffortMinutes: p.completedEffortMinutes.toString(),
            deadline: p.deadline || "",
            priority: p.priority || "normal"
        });
        setEditingId(p.id!);
        setShowForm(true);
    };

    const handleToggleComplete = async (id: number, currentStat: boolean) => {
        await db.projects.update(id, { completed: !currentStat });
        toast.success(currentStat ? "Project reopened" : "Project completed!");
    };

    const handleDelete = async (id: number) => {
        await db.projects.delete(id);
        toast.success("Project deleted");
    };

    // Stats
    const activeProjects = projects.filter(p => !p.completed);
    const totalHoursLeft = activeProjects.reduce((sum, p) => sum + ((p.totalEffortMinutes - p.completedEffortMinutes) / 60), 0);
    const highPriority = activeProjects.filter(p => p.priority === "high" || p.priority === "urgent");

    return (
        <div className="pb-32 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">

            <PageHeader
                title="Projects Workspace"
                meta={<MetaText>Track long-term deliverables</MetaText>}
            />

            {/* Stats row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <FrostedTile className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                            <FolderKanban size={24} />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-zinc-400">ACTIVE PROJECTS</div>
                            <div className="text-3xl font-bold font-mono text-white">{activeProjects.length}</div>
                        </div>
                    </div>
                </FrostedTile>
                <FrostedTile className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Clock size={24} />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-zinc-400">ESTIMATED HOURS LEFT</div>
                            <div className="text-3xl font-bold font-mono text-white">{totalHoursLeft.toFixed(1)}h</div>
                        </div>
                    </div>
                </FrostedTile>
                <FrostedTile className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                            <Zap size={24} />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-zinc-400">URGENT DEADLINES</div>
                            <div className="text-3xl font-bold font-mono text-white">{highPriority.length}</div>
                        </div>
                    </div>
                </FrostedTile>
            </div>

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Project Pipeline</h2>
                <button
                    onClick={() => {
                        setFormData({ name: "", subjectId: "", totalEffortMinutes: "120", completedEffortMinutes: "0", deadline: "", priority: "normal" });
                        setEditingId(null);
                        setShowForm(!showForm);
                    }}
                    className="px-6 py-3 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-xl font-bold flex items-center gap-2 transition-all"
                >
                    {showForm ? "Cancel" : <><Plus size={20} /> Create Project</>}
                </button>
            </div>

            {showForm && (
                <FrostedTile className="p-6 mb-8 border-indigo-500/30 animate-in slide-in-from-top-4">
                    <h3 className="text-lg font-bold text-white mb-4">{editingId ? "Edit Project" : "New Project"}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <input
                            placeholder="Project Name"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white w-full focus:border-indigo-500 outline-none"
                        />
                        <select
                            value={formData.subjectId}
                            onChange={e => setFormData({ ...formData, subjectId: e.target.value })}
                            className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white w-full focus:border-indigo-500 outline-none appearance-none"
                        >
                            <option value="">Select Subject...</option>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>

                        <div className="flex gap-4">
                            <input
                                type="number"
                                placeholder="Total Effort (mins)"
                                value={formData.totalEffortMinutes}
                                onChange={e => setFormData({ ...formData, totalEffortMinutes: e.target.value })}
                                className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white w-full focus:border-indigo-500 outline-none"
                            />
                            <input
                                type="number"
                                placeholder="Done (mins)"
                                value={formData.completedEffortMinutes}
                                onChange={e => setFormData({ ...formData, completedEffortMinutes: e.target.value })}
                                className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white w-full focus:border-indigo-500 outline-none"
                            />
                        </div>

                        <input
                            type="date"
                            value={formData.deadline}
                            onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                            className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white w-full focus:border-indigo-500 outline-none font-mono"
                        />

                        <select
                            value={formData.priority}
                            onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                            className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white w-full focus:border-indigo-500 outline-none appearance-none md:col-span-2"
                        >
                            <option value="low">Low Priority</option>
                            <option value="normal">Normal Priority</option>
                            <option value="high">High Priority</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>
                    <button
                        onClick={handleSubmit}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all"
                    >
                        {editingId ? "Save Changes" : "Create Project"}
                    </button>
                </FrostedTile>
            )}

            {projects.length === 0 && !showForm ? (
                <div className="text-center py-20 px-6">
                    <FolderKanban size={64} className="mx-auto text-zinc-700 mb-6" />
                    <h3 className="text-2xl font-bold text-white mb-2">No projects running</h3>
                    <p className="text-zinc-500">Use projects to track large assignments and have the planner automatically chunk them towards your deadline.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {projects.sort((a, b) => Number(a.completed) - Number(b.completed)).map(p => {
                        const sub = getSubject(p.subjectId);
                        const colorClass = sub ? SUBJECT_COLOR_CLASSES[getSubjectColor(sub.id!)] : SUBJECT_COLOR_CLASSES.indigo;
                        const progress = Math.min(100, Math.round((p.completedEffortMinutes / p.totalEffortMinutes) * 100));

                        return (
                            <FrostedTile key={p.id} className={`p-6 relative overflow-hidden ${p.completed ? 'opacity-50 grayscale' : ''}`}>
                                {p.priority === 'urgent' && !p.completed && (
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/20 blur-3xl -z-10 rounded-full" />
                                )}
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className={`text-xs font-bold uppercase tracking-wider mb-2 px-3 py-1 bg-black/40 rounded-lg inline-block text-${colorClass.bg.split('-')[1]}-400`}>
                                            {sub?.name || 'Unknown Subject'}
                                        </div>
                                        <h3 className="text-xl font-bold text-white">{p.name}</h3>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEdit(p)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-all text-zinc-400 hover:text-white">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDelete(p.id!)} className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-all text-red-400">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4 mb-6">
                                    <div className="flex justify-between text-sm text-zinc-400">
                                        <span className="flex items-center gap-2"><Target size={14} /> {p.completedEffortMinutes} / {p.totalEffortMinutes} mins</span>
                                        {p.deadline && <span className="flex items-center gap-2"><Calendar size={14} /> Due: {p.deadline}</span>}
                                    </div>
                                    <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                                        <div className={`h-full bg-${colorClass.bg.split('-')[1]}-500 rounded-full transition-all duration-1000`} style={{ width: `${progress}%` }} />
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleToggleComplete(p.id!, p.completed)}
                                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${p.completed
                                        ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white border border-zinc-700"
                                        : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30"
                                        }`}
                                >
                                    {p.completed ? "Reopen Project" : <><CheckSquare size={18} /> Mark Complete</>}
                                </button>
                            </FrostedTile>
                        )
                    })}
                </div>
            )}
        </div>
    );
}
