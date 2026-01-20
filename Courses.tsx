import React, { useState, useEffect, useMemo } from "react";
import {
  CheckSquare,
  Square,
  Plus,
  BookOpen,
  Clock,
  Award,
  FileText,
  Upload,
  Trash2,
  X,
  Search,
  TrendingUp,
  Calendar,
  Briefcase,
  ExternalLink,
  Download,
  Edit2,
  Save,
  Target
} from "lucide-react";

// Mock DB and types for demonstration
const db = {
  subjects: {
    get: async (id) => mockSubjects.find(s => s.id === id),
    update: async (id, data) => {
      const idx = mockSubjects.findIndex(s => s.id === id);
      if (idx >= 0) mockSubjects[idx] = { ...mockSubjects[idx], ...data };
    },
    delete: async (id) => {
      mockSubjects = mockSubjects.filter(s => s.id !== id);
    },
    toArray: async () => mockSubjects
  },
  assignments: {
    toArray: async () => mockAssignments,
    where: (field) => ({
      equals: (val) => ({
        delete: async () => {
          mockAssignments = mockAssignments.filter(a => a[field] !== val);
        }
      })
    })
  },
  projects: {
    toArray: async () => mockProjects,
    where: (field) => ({
      equals: (val) => ({
        delete: async () => {
          mockProjects = mockProjects.filter(p => p[field] !== val);
        }
      })
    })
  },
  logs: {
    toArray: async () => mockLogs,
    where: (field) => ({
      equals: (val) => ({
        delete: async () => {
          mockLogs = mockLogs.filter(l => l[field] !== val);
        }
      })
    }),
    add: async (log) => mockLogs.push({ ...log, id: Date.now() })
  },
  schedule: {
    where: (field) => ({
      equals: (val) => ({
        delete: async () => {
          mockSchedule = mockSchedule.filter(s => s[field] !== val);
        }
      })
    })
  },
  transaction: async (mode, tables, callback) => {
    await callback();
  }
};

let mockSubjects = [
  {
    id: 1,
    name: "Computer Intelligence & Engineering",
    code: "CS006",
    credits: 4,
    difficulty: 4,
    syllabus: [
      { id: "u1", title: "Introduction to AI", completed: true },
      { id: "u2", title: "Machine Learning Basics", completed: true },
      { id: "u3", title: "Neural Networks", completed: false },
      { id: "u4", title: "Deep Learning", completed: false }
    ],
    resources: [],
    grades: [
      { id: "g1", type: "Quiz 1", score: 18, maxScore: 20, date: "2026-01-15" }
    ]
  },
  {
    id: 2,
    name: "Data Structures & Algorithms",
    code: "CS201",
    credits: 4,
    difficulty: 5,
    syllabus: [
      { id: "u1", title: "Arrays & Linked Lists", completed: true },
      { id: "u2", title: "Stacks & Queues", completed: false }
    ],
    resources: [],
    grades: []
  },
  {
    id: 3,
    name: "Web Development",
    code: "CS301",
    credits: 3,
    difficulty: 2,
    syllabus: [],
    resources: [],
    grades: []
  }
];

let mockAssignments = [];
let mockProjects = [];
let mockLogs = [
  { id: 1, subjectId: 1, duration: 45, date: "2026-01-20", timestamp: Date.now() - 86400000 },
  { id: 2, subjectId: 1, duration: 60, date: "2026-01-19", timestamp: Date.now() - 172800000 },
  { id: 3, subjectId: 2, duration: 30, date: "2026-01-20", timestamp: Date.now() - 86400000 }
];
let mockSchedule = [];

export  function CoursesView({ subjects: propSubjects, logs: propLogs, onRefresh }) {
  // Use props if provided, otherwise use mock data
  const [subjects, setSubjects] = useState(propSubjects || mockSubjects);
  const [logs, setLogs] = useState(propLogs || mockLogs);
  const [assignments, setAssignments] = useState([]);
  const [projects, setProjects] = useState([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [subjectDetail, setSubjectDetail] = useState(null);
  const [gradeInputs, setGradeInputs] = useState({ type: "", score: "", maxScore: "" });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchMeta = async () => {
      const a = await db.assignments.toArray();
      const p = await db.projects.toArray();
      setAssignments(a);
      setProjects(p);
    };
    fetchMeta();
  }, []);

  useEffect(() => {
    if (selectedSubjectId == null) {
      setSubjectDetail(null);
      return;
    }
    let mounted = true;
    (async () => {
      const s = await db.subjects.get(selectedSubjectId);
      if (!mounted) return;
      setSubjectDetail(s || null);
      setGradeInputs({ type: "", score: "", maxScore: "" });
    })();
    return () => { mounted = false; };
  }, [selectedSubjectId]);

  const filteredSubjects = useMemo(() => {
    return subjects
      .filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) =>
        sortBy === "name" ? a.name.localeCompare(b.name) : (b.difficulty || 0) - (a.difficulty || 0)
      );
  }, [subjects, searchQuery, sortBy]);

  const themes = [
    { text: "text-indigo-400", bg: "bg-indigo-500", border: "border-indigo-500/20" },
    { text: "text-emerald-400", bg: "bg-emerald-500", border: "border-emerald-500/20" },
    { text: "text-amber-400", bg: "bg-amber-500", border: "border-amber-500/20" },
    { text: "text-rose-400", bg: "bg-rose-500", border: "border-rose-500/20" },
    { text: "text-cyan-400", bg: "bg-cyan-500", border: "border-cyan-500/20" }
  ];

  const getInitials = (name) => {
    const parts = name.split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const computeProgress = (sub) => {
    if (!sub.syllabus || sub.syllabus.length === 0) return 0;
    const done = sub.syllabus.filter(u => u.completed).length;
    return Math.round((done / sub.syllabus.length) * 100);
  };

  const getTotalHours = (subjectId) => {
    const totalMinutes = logs.filter(l => l.subjectId === subjectId).reduce((sum, log) => sum + (log.duration || 0), 0);
    return Math.round((totalMinutes / 60) * 10) / 10;
  };

  const refreshSubjectDetail = async () => {
    if (!subjectDetail?.id) return;
    const s = await db.subjects.get(subjectDetail.id);
    setSubjectDetail(s || null);
    setSubjects(await db.subjects.toArray());
    if (onRefresh) onRefresh();
  };

  const toggleSyllabusUnit = async (subId, unitId) => {
    const s = await db.subjects.get(subId);
    if (!s) return;
    const updatedSyllabus = (s.syllabus || []).map(u => u.id === unitId ? { ...u, completed: !u.completed } : u);
    await db.subjects.update(subId, { syllabus: updatedSyllabus });
    await refreshSubjectDetail();
  };

  const addGrade = async () => {
    if (!subjectDetail || !gradeInputs.type || !gradeInputs.score) return;
    const grade = {
      id: crypto.randomUUID(),
      type: gradeInputs.type,
      score: Number(gradeInputs.score),
      maxScore: Number(gradeInputs.maxScore) || 100,
      date: new Date().toISOString().split("T")[0]
    };
    await db.subjects.update(subjectDetail.id, { grades: [...(subjectDetail.grades || []), grade] });
    setGradeInputs({ type: "", score: "", maxScore: "" });
    await refreshSubjectDetail();
  };

  const deleteGrade = async (gradeId) => {
    if (!subjectDetail) return;
    const updated = (subjectDetail.grades || []).filter(g => g.id !== gradeId);
    await db.subjects.update(subjectDetail.id, { grades: updated });
    await refreshSubjectDetail();
  };

  const processAndSaveFile = async (file) => {
    if (!subjectDetail) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const newRes = {
        id: crypto.randomUUID(),
        title: file.name,
        url: "#",
        fileData: base64,
        fileType: file.type,
        fileSize: file.size,
        dateAdded: new Date().toISOString().split("T")[0]
      };
      const current = subjectDetail.resources || [];
      await db.subjects.update(subjectDetail.id, { resources: [...current, newRes] });
      await refreshSubjectDetail();
    } catch (err) {
      console.error("File save failed", err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = async (e) => {
    const files = e.target.files;
    if (!files || !subjectDetail) return;
    for (let i = 0; i < files.length; i++) {
      await processAndSaveFile(files[i]);
    }
    e.currentTarget.value = "";
  };

  const downloadResource = (res) => {
    if (!res) return;
    if (res.fileData) {
      const a = document.createElement("a");
      a.href = res.fileData;
      a.download = res.title;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (res.url && res.url !== "#") {
      window.open(res.url, "_blank", "noreferrer");
    }
  };

  const deleteResource = async (resourceId) => {
    if (!subjectDetail) return;
    const updated = (subjectDetail.resources || []).filter(r => r.id !== resourceId);
    await db.subjects.update(subjectDetail.id, { resources: updated });
    await refreshSubjectDetail();
  };

  const deleteSubject = async (subId) => {
    const s = await db.subjects.get(subId);
    if (!s) return;
    const subjectName = s.name;
    const confirmText = `Type "${subjectName}" to confirm deletion:`;
    const userInput = prompt(confirmText);
    if (userInput !== subjectName) {
      alert("Subject name did not match. Deletion cancelled.");
      return;
    }

    try {
      await db.transaction("rw", [db.subjects, db.assignments, db.projects, db.schedule, db.logs], async () => {
        await db.subjects.delete(subId);
        await db.assignments.where("subjectId").equals(subId).delete();
        await db.projects.where("subjectId").equals(subId).delete();
        await db.schedule.where("subjectId").equals(subId).delete();
        await db.logs.where("subjectId").equals(subId).delete();
      });
      setSelectedSubjectId(null);
      setSubjectDetail(null);
      setSubjects(await db.subjects.toArray());
      if (onRefresh) onRefresh();
      alert(`"${subjectName}" has been permanently deleted.`);
    } catch (err) {
      console.error("Failed to delete subject:", err);
      alert("An error occurred. Please try again.");
    }
  };

  const openSubject = (id) => setSelectedSubjectId(id);
  const closeDetail = () => {
    setSelectedSubjectId(null);
    setSubjectDetail(null);
  };

  return (
    <div className="pb-24 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 animate-fade-in">
      {/* Header with Date - Matching AboutView */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-zinc-500 font-mono uppercase tracking-wider">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl md:text-4xl font-display font-bold">Subject Array</h1>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input
            type="text"
            placeholder="Search subjects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50 transition-all"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white outline-none focus:border-indigo-500/50 transition-all"
        >
          <option value="name">Sort: Name</option>
          <option value="difficulty">Sort: Difficulty</option>
        </select>
      </div>

      {/* Subjects Grid - Two Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredSubjects.map((sub, idx) => {
          const theme = themes[idx % themes.length];
          const progress = computeProgress(sub);
          const totalHours = getTotalHours(sub.id);
          const pending = (sub.syllabus || []).filter(u => !u.completed).length;

          return (
            <div
              key={sub.id}
              className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>

              <div className="relative z-10">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl ${theme.bg} flex items-center justify-center font-bold text-lg text-black`}>
                      {getInitials(sub.name)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{sub.name}</h3>
                      <div className="text-xs text-zinc-400 uppercase mt-1">{sub.code} • {sub.credits} CR</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${theme.text}`}>{progress}%</div>
                  </div>
                </div>

                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-4">
                  <div className={`${theme.bg} h-full transition-all duration-500`} style={{ width: `${progress}%` }} />
                </div>

                <div className="flex items-center gap-4 text-xs text-zinc-400 mb-4">
                  <div className="flex items-center gap-1">
                    <Clock size={14} />
                    <span>{totalHours}h</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Target size={14} />
                    <span>{pending} pending</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Award size={14} />
                    <span>{(sub.grades || []).length} grades</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openSubject(sub.id)}
                    className="flex-1 py-2 px-4 rounded-xl bg-white text-black font-bold hover:bg-zinc-200 transition-all"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => {
                      const next = (sub.syllabus || []).find(u => !u.completed);
                      if (next) toggleSyllabusUnit(sub.id, next.id);
                      else alert("No pending units");
                    }}
                    className="py-2 px-4 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 transition-all text-sm"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Subject Detail Modal */}
      {subjectDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl shadow-2xl">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center text-xl font-bold">
                    {getInitials(subjectDetail.name)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{subjectDetail.name}</h2>
                    <div className="text-sm text-zinc-400 mt-1">{subjectDetail.code} • {subjectDetail.credits} Credits</div>
                  </div>
                </div>
                <button onClick={closeDetail} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all">
                  <X size={20} />
                </button>
              </div>

              {/* Bento Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left Column - Main Content */}
                <div className="lg:col-span-8 flex flex-col gap-5">
                  {/* Overview */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent"></div>
                    <div className="relative z-10">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-zinc-500 uppercase mb-2">Progress</div>
                          <div className="text-3xl font-bold text-white">{computeProgress(subjectDetail)}%</div>
                          <div className="text-xs text-zinc-400 mt-1">{(subjectDetail.syllabus || []).length} units</div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500 uppercase mb-2">Time Logged</div>
                          <div className="text-3xl font-bold text-indigo-400">{getTotalHours(subjectDetail.id)}h</div>
                          <div className="text-xs text-zinc-400 mt-1">{logs.filter(l => l.subjectId === subjectDetail.id).length} sessions</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Syllabus */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 max-h-[400px] overflow-y-auto">
                    <h3 className="text-sm font-bold text-zinc-300 mb-4 flex items-center gap-2">
                      <FileText size={16} className="text-indigo-400" />
                      Syllabus Tracker
                    </h3>
                    <div className="space-y-2">
                      {(subjectDetail.syllabus || []).length === 0 ? (
                        <div className="text-zinc-500 py-8 text-center text-sm">No units tracked</div>
                      ) : (
                        (subjectDetail.syllabus || []).map(u => (
                          <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-all group">
                            <button onClick={() => toggleSyllabusUnit(subjectDetail.id, u.id)}>
                              {u.completed ? (
                                <CheckSquare size={18} className="text-emerald-400" />
                              ) : (
                                <Square size={18} className="text-zinc-600 group-hover:text-indigo-400" />
                              )}
                            </button>
                            <span className={`flex-1 text-sm ${u.completed ? "line-through text-zinc-500" : "text-white"}`}>
                              {u.title}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Sessions Timeline */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5 max-h-[300px] overflow-y-auto">
                    <h3 className="text-sm font-bold text-zinc-300 mb-4 flex items-center gap-2">
                      <Clock size={16} className="text-cyan-400" />
                      Recent Sessions
                    </h3>
                    <div className="space-y-3">
                      {(() => {
                        const sessions = logs
                          .filter(l => l.subjectId === subjectDetail.id)
                          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                          .slice(0, 5);

                        if (sessions.length === 0) {
                          return <div className="text-zinc-500 py-8 text-center text-sm">No sessions logged</div>;
                        }

                        return sessions.map(s => (
                          <div key={s.id} className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800">
                            <div className="flex justify-between items-start">
                              <div className="text-xs text-zinc-400">{s.date}</div>
                              <div className="text-sm font-bold text-indigo-300">{s.duration} min</div>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>

                {/* Right Column - Actions & Data */}
                <div className="lg:col-span-4 flex flex-col gap-5">
                  {/* Quick Actions */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5">
                    <h3 className="text-sm font-bold text-zinc-300 mb-4">Quick Actions</h3>
                    <div className="space-y-3">
                      <button
                        onClick={async () => {
                          const next = (subjectDetail.syllabus || []).find(u => !u.completed);
                          if (next) {
                            await toggleSyllabusUnit(subjectDetail.id, next.id);
                            alert("Unit marked complete!");
                          } else {
                            alert("No pending units");
                          }
                        }}
                        className="w-full py-2.5 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-left text-sm transition-all"
                      >
                        Mark next unit complete
                      </button>
                      <button
                        onClick={async () => {
                          await db.logs.add({
                            subjectId: subjectDetail.id,
                            duration: 25,
                            date: new Date().toISOString().split("T")[0],
                            timestamp: Date.now()
                          });
                          setLogs(await db.logs.toArray());
                          await refreshSubjectDetail();
                          alert("Added 25-minute session");
                        }}
                        className="w-full py-2.5 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-left text-sm transition-all"
                      >
                        Log 25 min session
                      </button>
                    </div>
                  </div>

                  {/* Grades */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5">
                    <h3 className="text-sm font-bold text-zinc-300 mb-4 flex items-center gap-2">
                      <Award size={16} className="text-yellow-400" />
                      Grades
                    </h3>

                    <div className="flex gap-2 mb-4">
                      <input
                        placeholder="Exam"
                        className="flex-1 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-lg text-sm outline-none focus:border-indigo-500/50"
                        value={gradeInputs.type}
                        onChange={(e) => setGradeInputs({ ...gradeInputs, type: e.target.value })}
                      />
                      <input
                        placeholder="Score"
                        className="w-20 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-lg text-sm outline-none focus:border-indigo-500/50"
                        value={gradeInputs.score}
                        onChange={(e) => setGradeInputs({ ...gradeInputs, score: e.target.value })}
                      />
                      <button
                        onClick={addGrade}
                        className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-all"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {(subjectDetail.grades || []).length === 0 ? (
                        <div className="text-zinc-500 py-6 text-center text-sm">No grades recorded</div>
                      ) : (
                        (subjectDetail.grades || []).map(g => (
                          <div key={g.id} className="flex items-center justify-between p-3 bg-zinc-900/40 rounded-lg border border-zinc-800">
                            <div>
                              <div className="text-sm font-bold text-white">{g.type}</div>
                              <div className="text-xs text-zinc-500">{g.date}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-bold text-emerald-300">
                                {g.score}<span className="text-xs text-zinc-400">/{g.maxScore}</span>
                              </div>
                              <button
                                onClick={() => deleteGrade(g.id)}
                                className="p-1 text-zinc-600 hover:text-red-400 transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Resources */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5">
                    <h3 className="text-sm font-bold text-zinc-300 mb-4 flex items-center gap-2">
                      <BookOpen size={16} className="text-cyan-400" />
                      Resources
                    </h3>

                    <label className="block mb-4">
                      <input
                        type="file"
                        multiple
                        onChange={handleFileInput}
                        className="hidden"
                      />
                      <div className="w-full py-3 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all text-center text-sm flex items-center justify-center gap-2">
                        <Upload size={16} />
                        {uploading ? "Uploading..." : "Upload Files"}
                      </div>
                    </label>

                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {(subjectDetail.resources || []).length === 0 ? (
                        <div className="text-zinc-500 py-6 text-center text-sm">No resources uploaded</div>
                      ) : (
                        (subjectDetail.resources || []).map(res => (
                          <div key={res.id} className="flex items-center justify-between p-3 bg-zinc-900/40 rounded-lg border border-zinc-800 group">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-white truncate">{res.title}</div>
                              <div className="text-xs text-zinc-500">
                                {res.fileSize ? `${Math.round(res.fileSize / 1024)} KB` : res.dateAdded}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => downloadResource(res)}
                                className="p-2 text-zinc-400 hover:text-indigo-400 transition-all"
                                title="Download"
                              >
                                <Download size={14} />
                              </button>
                              <button
                                onClick={() => deleteResource(res.id)}
                                className="p-2 text-zinc-400 hover:text-red-400 transition-all"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Settings */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-5">
                    <h3 className="text-sm font-bold text-zinc-300 mb-4">Settings</h3>
                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          const newName = prompt("Rename subject", subjectDetail.name || "");
                          if (newName && subjectDetail.id) {
                            db.subjects.update(subjectDetail.id, { name: newName }).then(refreshSubjectDetail);
                          }
                        }}
                        className="w-full py-2.5 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-left text-sm transition-all"
                      >
                        Rename Subject
                      </button>
                      <button
                        onClick={() => {
                          if (!subjectDetail?.id) return;
                          if (!confirm("Archive this subject? (This will hide it from the main view)")) return;
                          db.subjects.update(subjectDetail.id, { archived: true }).then(() => {
                            if (onRefresh) onRefresh();
                            setSelectedSubjectId(null);
                          });
                        }}
                        className="w-full py-2.5 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-left text-sm transition-all"
                      >
                        Archive Subject
                      </button>
                      <button
                        onClick={() => subjectDetail?.id && deleteSubject(subjectDetail.id)}
                        className="w-full py-2.5 px-4 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-left text-sm transition-all"
                      >
                        Delete Subject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}