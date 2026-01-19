import React, { useState, useEffect } from "react";
import { Subject, Project, Assignment, SyllabusUnit } from "./types";
import { GlassCard, Button, Input, Slider } from "./components";
import { PageHeader } from "./PageHeader";
import { ChevronDown, ChevronUp, CheckSquare, Square, FileText, Plus, Trash2, Briefcase, Calendar } from "lucide-react";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";

export const CoursesView = ({ subjects }: { subjects: Subject[] }) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Local state for forms
  const [newUnit, setNewUnit] = useState("");

  const [newAssignment, setNewAssignment] = useState({ title: "", date: "" });
  const [newProject, setNewProject] = useState({ name: "", deadline: "" });

  // Fetch live data for nested items
  const projects = useLiveQuery(() => db.projects.toArray()) || [];
  const assignments = useLiveQuery(() => db.assignments.toArray()) || [];

  const updateSubjectSyllabus = async (sub: Subject, updatedSyllabus: SyllabusUnit[]) => {
    await db.subjects.update(sub.id!, { syllabus: updatedSyllabus });
  };

  const addSyllabusUnit = async (sub: Subject) => {
    if (!newUnit.trim()) return;
    const current = sub.syllabus || [];
    const updated = [...current, { id: Math.random().toString(36).substr(2, 9), title: newUnit, completed: false }];
    await updateSubjectSyllabus(sub, updated);
    setNewUnit("");
  };

  const toggleSyllabusUnit = async (sub: Subject, unitId: string) => {
    const current = sub.syllabus || [];
    const updated = current.map(u => u.id === unitId ? { ...u, completed: !u.completed } : u);
    await updateSubjectSyllabus(sub, updated);
  };

  const deleteSyllabusUnit = async (sub: Subject, unitId: string) => {
    const current = sub.syllabus || [];
    const updated = current.filter(u => u.id !== unitId);
    await updateSubjectSyllabus(sub, updated);
  };

  const updateProjectProgress = async (proj: Project, val: number) => {
    await db.projects.update(proj.id!, { progression: val });
  };

  const addAssignment = async (subId: number) => {
    if (!newAssignment.title) return;
    await db.assignments.add({
      id: Math.random().toString(36).substr(2, 9),
      subjectId: subId,
      title: newAssignment.title,
      dueDate: newAssignment.date,
      completed: false
    });
    setNewAssignment({ title: "", date: "" });
  };

  async function addProject(subId: number) {
    if (!newProject.name) return;
    await db.projects.add({
      name: newProject.name,
      subjectId: subId,
      progression: 0,
      effort: 'med',
      deadline: newProject.deadline
    });
    setNewProject({ name: "", deadline: "" });
  }

  const toggleAssignment = async (asm: Assignment) => {
    await db.assignments.update(asm.id, { completed: !asm.completed });
  };

  return (
    <div className="pb-24 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 animate-fade-in">
      <PageHeader title="Subject Array" showDate={true} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {subjects.map(sub => {
          const isExpanded = expandedId === sub.id;
          const subProjects = projects.filter(p => p.subjectId === sub.id);
          const subAssignments = assignments.filter(a => a.subjectId === sub.id && !a.completed); // Show incomplete

          // Calculate Readiness based on Syllabus completion + Difficulty
          const totalUnits = sub.syllabus?.length || 0;
          const completedUnits = sub.syllabus?.filter(u => u.completed).length || 0;
          const syllabusScore = totalUnits > 0 ? (completedUnits / totalUnits) * 50 : 0;
          const diffScore = 50 - (sub.difficulty * 10);
          const readiness = Math.round(syllabusScore + diffScore);

          return (
            <GlassCard key={sub.id} className="transition-all" onClick={() => setExpandedId(isExpanded ? null : sub.id!)}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg">{sub.name}</h3>
                  <p className="text-xs font-mono text-zinc-500">{sub.code} • {sub.credits} CR</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs font-bold text-zinc-500">READY</div>
                    <div className={`font-mono font-bold ${readiness > 70 ? 'text-emerald-400' : readiness > 40 ? 'text-orange-400' : 'text-red-400'}`}>{readiness}%</div>
                  </div>
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-white/5 space-y-6" onClick={e => e.stopPropagation()}>

                  {/* --- Projects Section --- */}
                  <div>
                    <h4 className="text-xs font-bold text-indigo-400 uppercase mb-2 flex items-center gap-2"><Briefcase size={12} /> Active Projects</h4>

                    {subProjects.length > 0 ? (
                      <div className="space-y-3 mb-3">
                        {subProjects.map(p => (
                          <div key={p.id} className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                            <div className="flex justify-between text-sm mb-1 font-medium">
                              <span>{p.name}</span>
                              <span>{p.progression}%</span>
                            </div>
                            <input
                              type="range" min="0" max="100"
                              value={p.progression}
                              onChange={(e) => updateProjectProgress(p, parseInt(e.target.value))}
                              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-zinc-600 text-sm italic mb-3">No active projects</div>
                    )}

                    <div className="flex gap-2">
                      <Input
                        placeholder="Project Name..."
                        className="p-2 text-xs bg-zinc-900 border border-zinc-800"
                        value={newProject.name}
                        onChange={(e: any) => setNewProject({ ...newProject, name: e.target.value })}
                      />
                      <Button variant="secondary" className="w-auto px-3 py-1" onClick={() => addProject(sub.id!)}><Plus size={14} /></Button>
                    </div>
                  </div>

                  {/* --- Assignments Section --- */}
                  <div>
                    <h4 className="text-xs font-bold text-orange-400 uppercase mb-2 flex items-center gap-2"><Calendar size={12} /> Pending Assignments</h4>
                    <div className="space-y-2 mb-2">
                      {subAssignments.map(a => (
                        <div key={a.id} className="flex items-center gap-3 bg-zinc-900/30 p-2 rounded-lg">
                          <button onClick={() => toggleAssignment(a)} className="text-zinc-600 hover:text-emerald-500"><Square size={16} /></button>
                          <span className="text-sm flex-1">{a.title}</span>
                          <span className="text-[10px] text-zinc-500 border border-zinc-700 px-1 rounded">{a.dueDate || 'No Date'}</span>
                        </div>
                      ))}
                      {subAssignments.length === 0 && <div className="text-zinc-600 text-sm italic">No active assignments</div>}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="New Assignment..."
                        className="p-2 text-xs"
                        value={newAssignment.title}
                        onChange={(e: any) => setNewAssignment({ ...newAssignment, title: e.target.value })}
                      />
                      <input
                        type="date"
                        className="bg-zinc-900 border border-zinc-800 rounded-xl px-2 text-xs text-zinc-400 outline-none"
                        value={newAssignment.date}
                        onChange={(e) => setNewAssignment({ ...newAssignment, date: e.target.value })}
                      />
                      <Button variant="secondary" className="w-auto px-3 py-1" onClick={() => addAssignment(sub.id!)}><Plus size={14} /></Button>
                    </div>
                  </div>

                  {/* --- Syllabus Section --- */}
                  <div>
                    <h4 className="text-xs font-bold text-emerald-400 uppercase mb-2 flex items-center gap-2"><FileText size={12} /> Syllabus Tracker</h4>
                    <div className="space-y-2 mb-3">
                      {(sub.syllabus || []).map((u) => (
                        <div key={u.id} className="flex items-center gap-2 text-sm text-zinc-300 group">
                          <button onClick={() => toggleSyllabusUnit(sub, u.id)} className={`${u.completed ? 'text-emerald-500' : 'text-zinc-600 hover:text-indigo-400'}`}>
                            {u.completed ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                          <span className={`flex-1 ${u.completed ? 'line-through text-zinc-600' : ''}`}>{u.title}</span>
                          <button onClick={() => deleteSyllabusUnit(sub, u.id)} className="text-zinc-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {(!sub.syllabus || sub.syllabus.length === 0) && <div className="text-zinc-600 text-sm italic">No units tracked</div>}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add Unit/Topic..."
                        className="p-2 text-xs"
                        value={newUnit}
                        onChange={(e: any) => setNewUnit(e.target.value)}
                        onKeyDown={(e: any) => e.key === 'Enter' && addSyllabusUnit(sub)}
                      />
                      <Button variant="secondary" className="w-auto px-3 py-1" onClick={() => addSyllabusUnit(sub)}><Plus size={14} /></Button>
                    </div>
                  </div>

                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
};
