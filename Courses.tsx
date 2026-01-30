import React, { useEffect, useState } from "react";
import {
  BookOpen, Award, FileText, Upload, Trash2, X, Search, Target,
  Clock, Download, CheckSquare, Square, Calculator, TrendingUp,
  Link, ExternalLink, Plus, Edit2, StickyNote
} from "lucide-react";
import { db } from "./db";
import { ResourceType } from "./types";
import { useLiveQuery } from "dexie-react-hooks";
import {
  EmptyCourses, EmptyResources, EmptyGrades,
  EmptyNotes, EmptySyllabus
} from './EmptyStates';
import { getAllReadinessScores, SubjectReadiness } from './brain';
import { useToast } from './Toast';
import { FrostedTile, FrostedMini, PageHeader, MetaText } from './components';

// ✨ PRODUCTION-GRADE: Enhanced Prediction Modal
const PredictionModal = ({ subject, currentReadiness, onClose }: any) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
    <FrostedTile
      className="p-10 max-w-lg w-full relative animate-in slide-in-from-bottom-4 duration-500"
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-3xl pointer-events-none" />

      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-zinc-400 hover:text-white transition-all p-2.5 hover:bg-white/10 rounded-xl hover:scale-110 active:scale-95 duration-300"
      >
        <X size={20} />
      </button>

      <div className="relative z-10">
        <h2 className="text-3xl font-bold mb-3 text-white font-display">📈 Readiness Predictor</h2>
        <p className="text-sm text-zinc-500 mb-8">Forecast your exam confidence trajectory</p>

        <div className="mb-8">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2 font-bold">Subject</div>
          <div className="text-2xl font-bold text-white">{subject?.name || 'Unknown'}</div>
        </div>

        <FrostedMini className="mb-8 hover:bg-zinc-800/70">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3 font-bold">Current Readiness</div>
          <div className="flex items-end gap-4">
            <div className={`text-5xl font-bold font-mono tabular-nums ${currentReadiness?.status === 'critical' ? 'text-red-400' :
              currentReadiness?.status === 'maintaining' ? 'text-yellow-400' :
                'text-emerald-400'
              }`}>
              {currentReadiness?.score || 0}%
            </div>
            <div className={`text-sm mb-2 px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider ${currentReadiness?.status === 'critical' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
              currentReadiness?.status === 'maintaining' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
              {currentReadiness?.status || 'unknown'}
            </div>
          </div>
          {currentReadiness?.lastStudiedDays !== undefined && (
            <div className="text-sm text-zinc-400 mt-4 flex items-center gap-2">
              <Clock size={14} />
              Last studied: {currentReadiness.lastStudiedDays === 0 ? 'Today' : `${currentReadiness.lastStudiedDays} days ago`}
            </div>
          )}
        </FrostedMini>

        <div className="space-y-4 mb-8">
          <div className="text-sm font-bold text-zinc-300 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            Study for 1h/day for 7 days:
          </div>
          <div className="flex items-center justify-between p-5 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 rounded-2xl border border-emerald-500/20 hover:scale-[1.02] transition-all duration-300">
            <span className="text-sm font-semibold text-emerald-300">Projected Readiness</span>
            <span className="text-4xl font-bold text-emerald-400 tabular-nums">
              {Math.min(100, (currentReadiness?.score || 0) + 25)}%
            </span>
          </div>
        </div>

        <div className="text-xs text-zinc-500 italic p-4 bg-zinc-800/30 rounded-xl border border-white/5">
          💡 This is a simplified prediction. Actual results depend on comprehension, retention, and review quality.
        </div>
      </div>
    </FrostedTile>
  </div>
);


const base64ToBlobUrl = (dataUrl: string, mime: string) => {
  try {
    const parts = dataUrl.split(",");
    if (parts.length < 2) throw new Error("Invalid data URL");
    const base64 = parts[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch (err) {
    console.error("Failed to create blob url:", err);
    return null;
  }
};

const isOfficeDoc = (type: string) =>
  type.includes("presentation") || type.includes("msword") || type.includes("officedocument");

export default function CoursesView_v2() {
  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];
  const logs = useLiveQuery(() => db.logs.toArray()) || [];
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "difficulty" | "progress">("name");
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [newUnit, setNewUnit] = useState("");
  const [showGradeForm, setShowGradeForm] = useState(false);
  const [newGrade, setNewGrade] = useState({ type: "", score: "", maxScore: "100", date: "" });
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [newLink, setNewLink] = useState({ title: "", url: "" });
  const [readinessScores, setReadinessScores] = useState<Record<number, SubjectReadiness>>({});
  const [showPrediction, setShowPrediction] = useState<number | null>(null);

  useEffect(() => {
    const loadReadiness = async () => {
      const scores = await getAllReadinessScores();
      setReadinessScores(scores);
    };
    loadReadiness();
  }, []);

  const selectedSubject = selectedSubjectId != null
    ? subjects.find((s) => Number(s.id) === Number(selectedSubjectId))
    : null;

  useEffect(() => {
    document.body.style.overflow = selectedSubject || selectedResource ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedSubject, selectedResource]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedResource) setSelectedResource(null);
        else if (selectedSubjectId) setSelectedSubjectId(null);
        else if (showPrediction !== null) setShowPrediction(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedResource, selectedSubjectId, showPrediction]);

  useEffect(() => {
    if (!selectedResource) {
      setPreviewUrl(null);
      return;
    }
    const url = base64ToBlobUrl(selectedResource.fileData, selectedResource.fileType);
    if (url) {
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setPreviewUrl(null);
      };
    } else {
      setPreviewUrl(null);
    }
  }, [selectedResource]);

  const themes = [
    { text: "text-indigo-400", bg: "bg-indigo-500", border: "border-indigo-500" },
    { text: "text-emerald-400", bg: "bg-emerald-500", border: "border-emerald-500" },
    { text: "text-amber-400", bg: "bg-amber-500", border: "border-amber-500" },
    { text: "text-rose-400", bg: "bg-rose-500", border: "border-rose-500" },
    { text: "text-cyan-400", bg: "bg-cyan-500", border: "border-cyan-500" },
  ];

  const getInitials = (name: string) =>
    (name || "").split(" ").slice(0, 2).map((p) => (p && p[0]) || "").join("").toUpperCase();

  const computeProgress = (s: any) => {
    const total = s?.syllabus?.length || 0;
    const done = (s?.syllabus || []).filter((u: any) => u.completed).length;
    return total ? Math.round((done / total) * 100) : 0;
  };

  const getTotalHours = (id: number | string) =>
    Math.round((logs.filter((l: any) => Number(l.subjectId) === Number(id)).reduce((a: number, b: any) => a + (b.duration || 0), 0) / 60) * 10) / 10;

  const calculateGPA = (grades: any[]) => {
    if (!grades || grades.length === 0) return null;
    const total = grades.reduce((sum, g) => sum + (g.score / g.maxScore) * 100, 0);
    return (total / grades.length).toFixed(1);
  };

  const processAndSaveFile = async (file: File) => {
    if (!selectedSubject) return;
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((res, rej) => {
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      await db.subjects.update(selectedSubject.id, {
        resources: [
          ...(selectedSubject.resources || []),
          {
            id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
            title: file.name,
            type: file.type.startsWith('image/') ? 'image' as ResourceType
              : file.type.includes('pdf') ? 'pdf' as ResourceType
                : file.type.includes('video') ? 'video' as ResourceType
                  : 'file' as ResourceType,
            fileData: base64,
            fileType: file.type,
            fileSize: file.size,
            dateAdded: new Date().toISOString().split("T")[0],
          },
        ],
      });
      toast.success("File added successfully");
    } catch (err) {
      console.error("Failed to save file", err);
      toast.error("Failed to upload file");
    }
  };

  const addWebLink = async () => {
    if (!selectedSubject || !newLink.title || !newLink.url) return;

    await db.subjects.update(selectedSubject.id, {
      resources: [
        ...(selectedSubject.resources || []),
        {
          id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          title: newLink.title,
          url: newLink.url,
          type: 'link',
          dateAdded: new Date().toISOString().split("T")[0],
        },
      ],
    });

    toast.success("Link added successfully");
    setNewLink({ title: "", url: "" });
    setShowLinkForm(false);
  };

  const addGrade = async () => {
    if (!selectedSubject || !newGrade.type || !newGrade.score) return;

    await db.subjects.update(selectedSubject.id, {
      grades: [
        ...(selectedSubject.grades || []),
        {
          id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          type: newGrade.type,
          score: parseFloat(newGrade.score),
          maxScore: parseFloat(newGrade.maxScore),
          date: newGrade.date || new Date().toISOString().split("T")[0],
        },
      ],
    });

    toast.success("Grade added successfully");
    setNewGrade({ type: "", score: "", maxScore: "100", date: "" });
    setShowGradeForm(false);
  };

  const removeResource = async (resourceId: any) => {
    if (!selectedSubject) return;
    await db.subjects.update(selectedSubject.id, {
      resources: (selectedSubject.resources || []).filter((x: any) => x.id !== resourceId),
    });
    toast.success("Resource deleted");
  };

  const openExternally = (r: any) => {
    if (r.type === 'link') {
      window.open(r.url, '_blank');
      return;
    }

    const url = base64ToBlobUrl(r.fileData, r.fileType);
    if (!url) {
      toast.error("Unable to preview file");
      return;
    }

    if (isOfficeDoc(r.fileType)) {
      const link = document.createElement("a");
      link.href = url;
      link.download = r.title || "file";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.info("Office document downloaded");
    } else {
      window.open(url, "_blank");
    }
  };

  const toggleSyllabus = async (u: any) => {
    if (!selectedSubject) return;
    await db.subjects.update(selectedSubject.id, {
      syllabus: (selectedSubject.syllabus || []).map((x: any) =>
        x.id === u.id ? { ...x, completed: !x.completed } : x
      ),
    });
    toast.success(u.completed ? "Marked as incomplete" : "Unit marked complete");
  };

  const addUnit = async () => {
    if (!selectedSubject || !newUnit.trim()) return;
    await db.subjects.update(selectedSubject.id, {
      syllabus: [
        ...(selectedSubject.syllabus || []),
        {
          id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          title: newUnit,
          completed: false,
        },
      ],
    });
    toast.success("Unit added successfully");
    setNewUnit("");
  };

  // Resource Viewer
  if (selectedResource && selectedResource.type !== 'link') {
    const canPreview = selectedResource.fileType?.includes("pdf") ||
      selectedResource.fileType?.startsWith("image") ||
      selectedResource.fileType?.startsWith("video");

    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center animate-in fade-in duration-300">
        <button
          onClick={() => setSelectedResource(null)}
          className="fixed top-8 right-8 p-4 bg-white/10 rounded-2xl hover:bg-white/20 transition-all hover:scale-110 active:scale-95 duration-300 min-h-[56px] min-w-[56px]"
        >
          <X size={24} />
        </button>

        <div className="w-full max-w-6xl h-[90vh] bg-zinc-900 rounded-3xl border border-white/10 flex flex-col shadow-2xl">
          <div className="p-6 border-b border-white/10 flex justify-between items-center">
            <div className="font-bold truncate text-lg">{selectedResource.title}</div>
            <button
              onClick={() => openExternally(selectedResource)}
              className="px-6 py-3 bg-indigo-500/20 hover:bg-indigo-500/30 rounded-xl transition-all font-bold text-sm border border-indigo-500/30 hover:scale-105 active:scale-95 duration-300 min-h-[56px]"
            >
              Open in new tab
            </button>
          </div>

          <div className="flex-1 bg-zinc-950 p-6 rounded-b-3xl overflow-hidden">
            {canPreview ? (
              selectedResource.fileType.includes("pdf") ? (
                <iframe src={previewUrl ?? ""} className="w-full h-full bg-white rounded-2xl" />
              ) : selectedResource.fileType.startsWith("image") ? (
                <img src={previewUrl ?? ""} className="max-w-full max-h-full mx-auto rounded-2xl" />
              ) : (
                <video src={previewUrl ?? ""} controls className="w-full h-full rounded-2xl" />
              )
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-center">
                <div>
                  <FileText size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Preview not supported</p>
                  <p className="text-sm mt-2">Use "Open in new tab"</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Subject Detail View
  if (selectedSubject) {
    const theme = themes[subjects.findIndex((s) => Number(s.id) === Number(selectedSubject.id)) % themes.length];
    const gpa = calculateGPA(selectedSubject.grades || []);

    return (
      <div className="fixed inset-0 z-40 bg-black overflow-y-auto pt-16 pb-24">
        <div className="max-w-[1400px] mx-auto p-8 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <button
            onClick={() => setSelectedSubjectId(null)}
            className="fixed top-24 right-8 p-4 bg-white/10 rounded-2xl hover:bg-white/20 transition-all hover:scale-110 active:scale-95 duration-300 z-50 min-h-[56px] min-w-[56px]"
          >
            <X size={24} />
          </button>

          {/* ✨ Enhanced Header */}
          <div className="flex items-center gap-6">
            <div className={`w-20 h-20 ${theme.bg} rounded-3xl flex items-center justify-center font-bold text-black text-2xl shadow-xl`}>
              {getInitials(selectedSubject.name)}
            </div>
            <div>
              <h1 className="text-5xl font-bold font-display mb-2">{selectedSubject.name || "Untitled"}</h1>
              <div className="text-zinc-400 text-base flex items-center gap-3">
                <span className="font-mono font-semibold">{selectedSubject.code || "NO CODE"}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                <span>{selectedSubject.credits ?? 0} credits</span>
              </div>
            </div>
          </div>

          {/* ✨ Enhanced Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: "Progress", value: `${computeProgress(selectedSubject)}%`, color: "indigo" },
              { label: "Study Time", value: `${getTotalHours(selectedSubject.id)}h`, color: "emerald" },
              { label: "Avg Score", value: gpa ? `${gpa}%` : '--', color: "amber" },
              { label: "Resources", value: (selectedSubject.resources || []).length, color: "cyan" }
            ].map((stat, i) => (
              <FrostedTile key={i} className="p-6 hover:border-white/20 hover:-translate-y-1 group">
                <div className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-3">{stat.label}</div>
                <div className={`text-4xl md:text-5xl font-bold font-mono tabular-nums text-${stat.color}-400 group-hover:scale-110 transition-transform duration-300`}>
                  {stat.value}
                </div>
              </FrostedTile>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* ✨ Enhanced Syllabus Section */}
            <FrostedTile className="p-8 hover:border-indigo-500/30">
              <h3 className="font-bold text-xl mb-6 flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/20 flex items-center justify-center border border-indigo-500/30">
                  <Target size={22} className="text-indigo-400" />
                </div>
                <span>Syllabus</span>
              </h3>

              {(selectedSubject.syllabus || []).length === 0 ? (
                <EmptySyllabus />
              ) : (
                <div className="space-y-2 mb-6">
                  {(selectedSubject.syllabus || []).map((u: any) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-4 cursor-pointer hover:bg-white/5 p-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] duration-300 min-h-[64px] group"
                      onClick={() => toggleSyllabus(u)}
                    >
                      {u.completed ?
                        <CheckSquare className="text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" size={24} /> :
                        <Square size={24} className="text-zinc-600 shrink-0 group-hover:scale-110 transition-transform" />
                      }
                      <span className={`text-base font-medium ${u.completed ? "line-through text-zinc-500" : "text-zinc-300"}`}>
                        {u.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="Add unit..."
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all min-h-[64px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newUnit.trim()) {
                      addUnit();
                    }
                  }}
                />
                <button
                  onClick={addUnit}
                  className="px-6 py-4 bg-indigo-500/20 hover:bg-indigo-500/30 rounded-2xl transition-all font-bold text-base border border-indigo-500/30 hover:scale-105 active:scale-95 duration-300 min-h-[64px] min-w-[64px]"
                >
                  <Plus size={20} />
                </button>
              </div>
            </FrostedTile>

            {/* ✨ Enhanced Grades Section */}
            <FrostedTile className="p-8 hover:border-emerald-500/30">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-xl flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 flex items-center justify-center border border-emerald-500/30">
                    <Calculator size={22} className="text-emerald-400" />
                  </div>
                  <span>Grades</span>
                </h3>
                <button
                  onClick={() => setShowGradeForm(!showGradeForm)}
                  className="p-3 hover:bg-white/10 rounded-2xl transition-all hover:scale-110 active:scale-95 duration-300 min-h-[56px] min-w-[56px]"
                >
                  <Plus size={20} />
                </button>
              </div>

              {showGradeForm && (
                <div className="mb-6 p-6 bg-zinc-900/60 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border border-zinc-800">
                  <input
                    placeholder="Type (e.g., ISA-1, Quiz 2)"
                    value={newGrade.type}
                    onChange={(e) => setNewGrade({ ...newGrade, type: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all min-h-[64px]"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="number"
                      placeholder="Score"
                      value={newGrade.score}
                      onChange={(e) => setNewGrade({ ...newGrade, score: e.target.value })}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all min-h-[64px]"
                    />
                    <input
                      type="number"
                      placeholder="Max (100)"
                      value={newGrade.maxScore}
                      onChange={(e) => setNewGrade({ ...newGrade, maxScore: e.target.value })}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all min-h-[64px]"
                    />
                  </div>
                  <input
                    type="date"
                    value={newGrade.date}
                    onChange={(e) => setNewGrade({ ...newGrade, date: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-base font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all min-h-[64px]"
                  />
                  <button
                    onClick={addGrade}
                    className="w-full py-4 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-2xl font-bold text-base transition-all hover:scale-[1.02] active:scale-[0.98] duration-300 border border-emerald-500/30 min-h-[64px]"
                  >
                    Add Grade
                  </button>
                </div>
              )}

              {(!selectedSubject.grades || selectedSubject.grades.length === 0) && !showGradeForm ? (
                <EmptyGrades />
              ) : (
                <div className="space-y-3">
                  {(selectedSubject.grades || []).map((g: any) => (
                    <FrostedMini key={g.id} className="flex justify-between items-center hover:bg-zinc-800 hover:scale-[1.02] min-h-[80px]">
                      <div>
                        <div className="font-bold text-base mb-1">{g.type}</div>
                        <div className="text-xs text-zinc-500 uppercase tracking-wider font-mono">{g.date}</div>
                      </div>
                      <div className="text-2xl font-mono font-bold tabular-nums">
                        {g.score}<span className="text-zinc-500 text-lg">/{g.maxScore}</span>
                        <span className="text-sm text-emerald-400 ml-3 bg-emerald-500/10 px-3 py-1.5 rounded-xl">
                          {((g.score / g.maxScore) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </FrostedMini>
                  ))}
                </div>
              )}
            </FrostedTile>

            {/* ✨ Enhanced Resources Section */}
            <FrostedTile className="lg:col-span-2 p-8 hover:border-purple-500/30">
              <h3 className="font-bold text-xl mb-6 flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 flex items-center justify-center border border-purple-500/30">
                  <FileText size={22} className="text-purple-400" />
                </div>
                <span>Resources</span>
              </h3>

              {(selectedSubject.resources || []).length === 0 ? (
                <EmptyResources />
              ) : (
                <div className="space-y-3 mb-8">
                  {(selectedSubject.resources || []).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between p-5 bg-zinc-900 rounded-2xl hover:bg-zinc-800 transition-all group border border-zinc-800/50 hover:scale-[1.01] duration-300 min-h-[72px]">
                      <div
                        className="flex items-center gap-4 flex-1 cursor-pointer"
                        onClick={() => r.type === 'link' ? openExternally(r) : setSelectedResource(r)}
                      >
                        {r.type === 'link' ?
                          <Link size={20} className="text-cyan-400 shrink-0" /> :
                          <FileText size={20} className="text-purple-400 shrink-0" />
                        }
                        <span className="truncate text-base font-medium">{r.title}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        {r.type === 'link' && (
                          <ExternalLink size={16} className="text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                        <button
                          onClick={() => removeResource(r.id)}
                          className="p-2 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100 min-h-[44px] min-w-[44px]"
                        >
                          <Trash2 size={16} className="text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4">
                <label className={`flex-1 px-6 py-5 text-base text-center rounded-2xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] duration-300 font-semibold min-h-[64px] flex items-center justify-center gap-3 ${dragActive ? "border-cyan-400 bg-cyan-500/20" : "border-white/10 hover:border-indigo-500/40"
                  }`}>
                  <input type="file" multiple hidden onChange={async (e: any) => {
                    const files = Array.from((e.target?.files || [])) as File[];
                    for (const f of files) await processAndSaveFile(f);
                  }} />
                  <Upload size={20} />
                  <span>Upload Files</span>
                </label>

                <button
                  onClick={() => setShowLinkForm(!showLinkForm)}
                  className="px-6 py-5 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-2xl font-bold text-base transition-all hover:scale-[1.02] active:scale-[0.98] duration-300 border border-cyan-500/30 min-h-[64px] flex items-center justify-center gap-3"
                >
                  <Link size={20} />
                  <span>Add Link</span>
                </button>
              </div>

              {showLinkForm && (
                <div className="mt-6 p-6 bg-zinc-900/60 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border border-zinc-800">
                  <input
                    placeholder="Link title"
                    value={newLink.title}
                    onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-base outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all min-h-[64px]"
                  />
                  <input
                    placeholder="URL"
                    value={newLink.url}
                    onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-base outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all min-h-[64px]"
                  />
                  <button
                    onClick={addWebLink}
                    className="w-full py-4 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-2xl font-bold text-base transition-all hover:scale-[1.02] active:scale-[0.98] duration-300 border border-cyan-500/30 min-h-[64px]"
                  >
                    Add Link
                  </button>
                </div>
              )}
            </FrostedTile>

            {/* ✨ Enhanced Session Notes */}
            <FrostedTile className="lg:col-span-2 p-8 hover:border-amber-500/30">
              <h3 className="font-bold text-xl mb-6 flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/20 flex items-center justify-center border border-amber-500/30">
                  <StickyNote size={22} className="text-amber-400" />
                </div>
                <span>Session Notes</span>
              </h3>

              {(() => {
                const subjectLogs = logs
                  .filter(l => l.subjectId === selectedSubject.id && l.notes && l.notes.trim().length > 0)
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .slice(0, 10);

                if (subjectLogs.length === 0) {
                  return <EmptyNotes />;
                }

                return (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-3 custom-scrollbar">
                    {subjectLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-6 bg-zinc-900/40 rounded-2xl border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-300"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-zinc-500">
                            <span className="font-mono">{log.date}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                            <span className="text-amber-500/80">{log.type}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                            <span>{log.duration}m</span>
                          </div>
                          <span className="text-xs font-mono text-zinc-600">
                            {new Date(log.timestamp).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="text-base text-zinc-300 leading-relaxed whitespace-pre-wrap">
                          {log.notes}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </FrostedTile>
          </div>
        </div>
      </div>
    );
  }

  // ✨ MAIN COURSES GRID - Production Grade
  const filtered = subjects
    .filter((s) =>
      (s.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.code || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "difficulty") return (b.difficulty || 0) - (a.difficulty || 0);
      return computeProgress(b) - computeProgress(a);
    });

  return (
    <div className="max-w-[1400px] mx-auto p-8 space-y-10 pb-32">
      <PageHeader
        title="Academic Loadout"
        meta={
          <>
            <MetaText>
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              }).toUpperCase()}
            </MetaText>
          </>
        }
      />
      {/* Prediction Modal */}
      {showPrediction !== null && (
        <PredictionModal
          subject={subjects.find(s => s.id === showPrediction)}
          currentReadiness={readinessScores[showPrediction]}
          onClose={() => setShowPrediction(null)}
        />
      )}

      {/* ✨ Enhanced Search & Sort */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
          <input
            className="w-full pl-14 pr-5 py-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all outline-none text-base font-medium placeholder:text-zinc-600 hover:bg-zinc-900/70 min-h-[64px]"
            placeholder="Search subjects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="bg-zinc-900/50 border border-zinc-800 rounded-2xl px-6 py-4 text-base outline-none cursor-pointer hover:bg-zinc-800/50 transition-all font-semibold min-h-[64px]"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
        >
          <option value="name">Sort by Name</option>
          <option value="difficulty">Sort by Difficulty</option>
          <option value="progress">Sort by Progress</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        searchQuery ? (
          <div className="text-center py-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-24 h-24 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-8 shadow-xl">
              <Search size={40} className="text-zinc-700" />
            </div>
            <h3 className="text-3xl font-bold text-zinc-300 mb-3">No results found</h3>
            <p className="text-zinc-500 text-base max-w-md mx-auto mb-8">
              We couldn't find any courses matching "<span className="text-white font-semibold">{searchQuery}</span>". Try a different term.
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="px-8 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-2xl text-base font-bold transition-all border border-zinc-700 hover:scale-105 active:scale-95 duration-300 min-h-[64px]"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <EmptyCourses />
        )
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          {filtered.map((s, i) => {
            const t = themes[i % themes.length];
            const progress = computeProgress(s);
            const gpa = calculateGPA(s.grades || []);
            const readiness = readinessScores[s.id!];

            return (
              <FrostedTile
                key={s.id}
                onClick={() => setSelectedSubjectId(Number(s.id))}
                className="p-8 hover:border-indigo-500/40 hover:bg-white/[0.05] shadow-lg hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-2"
              >
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 via-transparent to-purple-500/0 group-hover:from-indigo-500/5 group-hover:to-purple-500/5 transition-all duration-500 pointer-events-none" />

                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex gap-5 flex-1 min-w-0">
                      <div className={`w-16 h-16 ${t.bg} rounded-2xl flex items-center justify-center font-bold text-black text-2xl shadow-xl shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                        {getInitials(s.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xl group-hover:text-indigo-100 transition-colors leading-tight mb-2 truncate">
                          {s.name}
                        </div>
                        <div className="text-sm text-zinc-500 font-mono tracking-wider font-semibold">
                          {s.code || "NO CODE"} • {s.credits ?? 0} CREDITS
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3 shrink-0 ml-5">
                      <div className={`text-4xl font-bold font-mono tabular-nums ${t.text} group-hover:scale-110 transition-transform duration-300`}>
                        {progress}%
                      </div>
                      {gpa && (
                        <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                          {gpa}% AVG
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPrediction(s.id);
                        }}
                        className="text-sm text-indigo-400 hover:text-indigo-300 px-4 py-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 transition-all font-bold border border-indigo-500/30 whitespace-nowrap hover:scale-110 active:scale-95 duration-300 min-h-[44px]"
                      >
                        📈 Predict
                      </button>
                    </div>
                  </div>

                  <div className="h-2.5 bg-white/5 rounded-full mb-6 overflow-hidden shadow-inner">
                    <div
                      className={`${t.bg} h-full transition-all duration-1000 ease-out shadow-lg`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="flex gap-8 text-sm text-zinc-500 font-bold uppercase tracking-wider">
                    <div className="flex items-center gap-2 group-hover:text-zinc-300 transition-colors">
                      <Clock size={16} className="text-zinc-600" />
                      <span className="tabular-nums">{getTotalHours(s.id)}H</span>
                    </div>
                    <div className="flex items-center gap-2 group-hover:text-zinc-300 transition-colors">
                      <Target size={16} className="text-zinc-600" />
                      <span className="tabular-nums">{(s.syllabus || []).filter((u: any) => !u.completed).length} units</span>
                    </div>
                    <div className="flex items-center gap-2 group-hover:text-zinc-300 transition-colors">
                      <FileText size={16} className="text-zinc-600" />
                      <span className="tabular-nums">{(s.resources || []).length} files</span>
                    </div>
                  </div>
                </div>
              </FrostedTile>
            );
          })}
        </div>
      )}
    </div>
  );
}