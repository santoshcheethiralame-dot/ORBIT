// CoursesView: Academic hub for managing subjects, resources, grades, and syllabus tracking.
// Supports file uploads, previews, grade calculations, and exam readiness predictions.

import React, { useEffect, useState } from "react";
import {
  BookOpen, Award, FileText, Upload, Trash2, X, Search, Target,
  Clock, Download, CheckSquare, Square, Calculator, TrendingUp,
  Link, ExternalLink, Plus, Edit2, StickyNote, Sparkles, Presentation,
  Maximize2, Minimize2, ChevronLeft
} from "lucide-react";
import { db } from "./db";
import { ResourceType, SubjectReadiness } from "./types";
import { ProbabilisticReadiness } from "./brain-ultimate";
import { useLiveQuery } from "dexie-react-hooks";
import { safeDB, withToast } from './utils/dbErrorHandler';
import {
  EmptyCourses, EmptyResources, EmptyGrades,
  EmptyNotes, EmptySyllabus
} from './EmptyStates';
import { getAllReadinessScores } from './brain-ultimate';
import { useToast } from './Toast';
import { FrostedTile, FrostedMini, PageHeader, MetaText, getSubjectColor, SUBJECT_COLOR_CLASSES, SUBJECT_COLORS } from './components';

import { predictReadiness } from './brain';
import { getISTEffectiveDate } from './utils/time';

const PredictionModal = ({ subject, currentReadiness, onClose }: any) => {
  const prediction = subject && currentReadiness
    ? predictReadiness(currentReadiness, subject, 7, 1)
    : { projectedScore: 0, breakdown: "Waiting for data..." };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 p-6">
      <div className="w-full max-w-lg animate-in slide-in-from-bottom-4 duration-500">
        <FrostedTile className="overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Readiness Predictor</h2>
              <p className="text-sm text-zinc-500">Forecast your exam confidence</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2 font-bold">Subject</div>
              <div className="text-xl font-bold text-white">{subject?.name || 'Unknown'}</div>
            </div>

            <FrostedMini className="p-5 hover:border-white/15 hover:-translate-y-1">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3 font-bold">Current Readiness</div>
              <div className="flex items-end gap-4">
                <div className={`text-5xl font-bold font-mono tabular-nums ${currentReadiness?.status === 'critical' ? 'text-red-400' :
                  currentReadiness?.status === 'maintaining' ? 'text-yellow-400' :
                    'text-yellow-400'
                  }`}>
                  {currentReadiness?.score !== undefined ? Math.round(currentReadiness.score) : 0}%
                </div>
                <div className={`text-xs mb-2 px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider ${currentReadiness?.status === 'critical' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                  currentReadiness?.status === 'maintaining' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                    'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
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

            <div>
              <div className="text-sm font-bold text-zinc-300 flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-yellow-400" />
                Study 1h/day for 7 days:
              </div>
              <FrostedMini className="p-5 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/20 hover:border-yellow-500/30 hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-yellow-300">Projected Readiness</span>
                  <span className="text-4xl font-bold text-yellow-400 tabular-nums">
                    {prediction.projectedScore}%
                  </span>
                </div>
              </FrostedMini>
            </div>

            <div className="text-xs text-zinc-400 whitespace-pre-line p-4 bg-zinc-800/30 rounded-xl border border-white/5 font-mono">
              {prediction.breakdown}
            </div>
            <div className="text-xs text-zinc-500 italic px-4">
              AI engine uses Ebbinghaus memory curve mapped against your credit load.
            </div>
          </div>
        </FrostedTile>
      </div>
    </div>
  );
};

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

const isPowerPoint = (type: string) =>
  type.includes("presentation") || type.includes("powerpoint") || type.includes(".ppt");

export default function CoursesView_Enhanced() {
  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];
  const logs = useLiveQuery(() => db.logs.toArray()) || [];
  const exams = useLiveQuery(() => db.exams.filter((e: any) => !e.completed).toArray()) || [];
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "difficulty" | "progress">("name");
  const [statusFilter, setStatusFilter] = useState<'all' | 'critical' | 'maintaining' | 'mastered'>('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [newUnit, setNewUnit] = useState("");
  const [showGradeForm, setShowGradeForm] = useState(false);
  const [newGrade, setNewGrade] = useState({ type: "", score: "", maxScore: "100", date: "" });
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [newLink, setNewLink] = useState({ title: "", url: "" });
  const [readinessScores, setReadinessScores] = useState<Record<number, SubjectReadiness | ProbabilisticReadiness>>({});
  const [showPrediction, setShowPrediction] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Subject CRUD — CoursesView is the authoritative source for subjects.
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [subjectForm, setSubjectForm] = useState({ name: "", code: "", credits: "3", difficulty: "3" });
  const [deletingSubjectId, setDeletingSubjectId] = useState<number | null>(null);

  useEffect(() => {
    const loadReadiness = async () => {
      const scores = await getAllReadinessScores();
      setReadinessScores(scores);
    };
    loadReadiness();
  }, []);

  const selectedSubject = selectedSubjectId != null
    ? subjects.find((s) => s.id === selectedSubjectId)
    : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showSubjectForm) setShowSubjectForm(false);
        else if (deletingSubjectId !== null) setDeletingSubjectId(null);
        else if (selectedResource) setSelectedResource(null);
        else if (selectedSubjectId) setSelectedSubjectId(null);
        else if (showPrediction !== null) setShowPrediction(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedResource, selectedSubjectId, showPrediction, showSubjectForm, deletingSubjectId]);

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
    if (!selectedSubject || !selectedSubject.id) return;
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
    if (!selectedSubject || !selectedSubject.id || !newLink.title || !newLink.url) return;

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
    if (!selectedSubject || !selectedSubject.id || !newGrade.type || !newGrade.score) return;

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
    if (!selectedSubject || !selectedSubject.id) return;
    await db.subjects.update(selectedSubject.id, {
      resources: (selectedSubject.resources || []).filter((x: any) => x.id !== resourceId),
    });
    toast.success("Resource deleted");
  };

  // New unified resource opener — mirrors FocusSession behavior:
  // - supports link type -> open external URL in new tab
  // - supports fileData (base64) -> creates Blob, opens in new tab using object URL
  // - for Office docs, triggers download via anchor element
  const openResourceInNewTab = (r: any) => {
    if (!r) return;

    // Links: open as-is
    if (r.type === 'link') {
      if (!r.url || r.url.trim() === '') {
        toast.error("No URL available");
        return;
      }
      window.open(r.url, '_blank', 'noopener,noreferrer');
      return;
    }

    // If there's base64 fileData, convert -> Blob -> open
    if (r.fileData && r.fileType) {
      const base64Data = r.fileData.includes('base64,')
        ? r.fileData.split('base64,')[1]
        : r.fileData;

      try {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: r.fileType });
        const blobUrl = URL.createObjectURL(blob);

        if (isOfficeDoc(r.fileType)) {
          // trigger download for office docs
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = r.title || "file";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.info("Office document downloaded");
          // revoke after slight delay
          setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        } else {
          // open in new tab for previewable files
          window.open(blobUrl, "_blank", "noopener,noreferrer");
          // revoke after small delay to ensure the new tab can fetch it
          setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        }
        return;
      } catch (error) {
        console.error('Error opening file:', error);
        toast.error("Unable to preview file");
        return;
      }
    }

    // fallback: if resource has a URL field
    if (r.url && r.url.trim() !== '') {
      window.open(r.url, '_blank', 'noopener,noreferrer');
      return;
    }

    toast.error("Resource cannot be opened");
  };

  const toggleSyllabus = async (u: any) => {
    if (!selectedSubject || !selectedSubject.id) return;
    await db.subjects.update(selectedSubject.id, {
      syllabus: (selectedSubject.syllabus || []).map((x: any) =>
        x.id === u.id ? { ...x, completed: !x.completed } : x
      ),
    });
    toast.success(u.completed ? "Marked as incomplete" : "Unit marked complete");
  };

  const addUnit = async () => {
    if (!selectedSubject || !selectedSubject.id || !newUnit.trim()) return;
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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Auto-download presentations (mirror previous behavior) but now use openResourceInNewTab
  React.useEffect(() => {
    if (selectedResource?.type !== 'link') {
      const isPPT = selectedResource && isPowerPoint(selectedResource.fileType);
      if (isPPT) {
        openResourceInNewTab(selectedResource);
      }
    }
  }, [selectedResource?.id, selectedResource?.fileType]); // note: triggers only when selectedResource changes

  // NOTE: changed below — we open everything externally on click (full-page view / download).
  // The modal/preview remains in file for manual use, but default click opens in new tab.
  if (selectedResource && selectedResource.type !== 'link') {
    const isPPT = isPowerPoint(selectedResource.fileType);
    const canPreview = !isPPT && (
      selectedResource.fileType?.includes("pdf") ||
      selectedResource.fileType?.startsWith("image") ||
      selectedResource.fileType?.startsWith("video")
    );

    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center animate-in fade-in duration-300 p-4 md:p-8">
        <div className="fixed top-4 md:top-8 left-4 md:left-8 right-4 md:right-8 z-[60] flex items-center justify-between gap-4">
          <FrostedTile className="flex items-center gap-3 px-4 md:px-6 py-3 md:py-4 min-w-0 flex-1 shadow-xl hover:border-white/15 transition-all">
            {isPPT && <Presentation size={18} className="text-orange-400 flex-shrink-0" />}
            <div className="font-bold truncate text-sm md:text-base text-white">{selectedResource.title}</div>
          </FrostedTile>

          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            <button
              onClick={toggleFullscreen}
              className="p-3 md:p-4 min-h-[48px] min-w-[48px] md:min-h-[56px] md:min-w-[56px]">
              <FrostedTile className="w-full h-full flex items-center justify-center text-zinc-300 hover:text-white hover:border-white/20 hover:-translate-y-1 transition-all">
                {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </FrostedTile>
            </button>

            <button
              onClick={() => setSelectedResource(null)}
              aria-label="Close preview"
              className="p-3 md:p-4 min-h-[48px] min-w-[48px] md:min-h-[56px] md:min-w-[56px]">
              <FrostedTile className="w-full h-full flex items-center justify-center text-zinc-300 hover:text-white hover:border-red-500/30 hover:-translate-y-1 transition-all">
                <X size={22} />
              </FrostedTile>
            </button>
          </div>
        </div>

        <div className="w-full max-w-6xl h-[85vh] my-auto">
          <FrostedTile className="h-full flex flex-col overflow-hidden">
            <div className="flex-1 bg-zinc-950 p-4 md:p-6 rounded-3xl overflow-hidden flex items-center justify-center min-h-0">
              {isPPT ? (
                <div className="flex flex-col items-center justify-center text-center max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-3xl bg-gradient-to-br from-orange-500/20 to-orange-600/20 flex items-center justify-center mb-8 border border-orange-500/30 shadow-lg shadow-orange-500/20 animate-in zoom-in duration-700">
                    <Presentation size={48} className="text-orange-400" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">PowerPoint Presentation</h3>
                  <p className="text-sm md:text-base text-zinc-400 mb-8 leading-relaxed">
                    Your download should start automatically. If it doesn't, click the button below.
                  </p>
                  <button
                    onClick={() => openResourceInNewTab(selectedResource)}
                    className="px-8 md:px-10 py-4 md:py-5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 rounded-2xl transition-all font-bold text-base md:text-lg border border-indigo-500/30 hover:scale-105 active:scale-95 duration-300 flex items-center justify-center gap-3 min-h-[64px] shadow-lg hover:shadow-indigo-500/20"
                  >
                    <Download size={22} />
                    Download Presentation
                  </button>
                </div>
              ) : canPreview ? (
                selectedResource.fileType.includes("pdf") ? (
                  <iframe src={previewUrl ?? ""} className="w-full h-full bg-white rounded-2xl shadow-2xl" />
                ) : selectedResource.fileType.startsWith("image") ? (
                  <img src={previewUrl ?? ""} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" />
                ) : (
                  <video src={previewUrl ?? ""} controls className="max-w-full max-h-full rounded-2xl shadow-2xl" />
                )
              ) : (
                <div className="flex flex-col items-center justify-center text-center max-w-md animate-in fade-in duration-300">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-8 shadow-lg">
                    <FileText size={48} className="text-zinc-600" />
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-3">Preview not supported</h3>
                  <p className="text-sm md:text-base text-zinc-500 mb-8 leading-relaxed">This file type cannot be previewed in the browser</p>
                  <button
                    onClick={() => openResourceInNewTab(selectedResource)}
                    className="px-8 md:px-10 py-4 md:py-5 bg-indigo-500/20 hover:bg-indigo-500/30 rounded-2xl transition-all font-bold text-base border border-indigo-500/30 hover:scale-105 active:scale-95 duration-300 flex items-center justify-center gap-3 min-h-[64px]"
                  >
                    <Download size={22} />
                    Download File
                  </button>
                </div>
              )}
            </div>
          </FrostedTile>
        </div>
      </div>
    );
  }

  const openAddSubject = () => {
    setEditingSubjectId(null);
    setSubjectForm({ name: "", code: "", credits: "3", difficulty: "3" });
    setShowSubjectForm(true);
  };
  const openEditSubject = (s: any) => {
    setEditingSubjectId(s.id ?? null);
    setSubjectForm({ name: s.name || "", code: s.code || "", credits: String(s.credits ?? 3), difficulty: String(s.difficulty ?? 3) });
    setShowSubjectForm(true);
  };
  const saveSubject = async () => {
    const name = subjectForm.name.trim();
    if (!name) { toast.error("Subject name is required"); return; }
    const code = subjectForm.code.trim();
    const credits = Math.max(0, Math.min(20, parseInt(subjectForm.credits, 10) || 0));
    const difficulty = Math.max(1, Math.min(5, parseInt(subjectForm.difficulty, 10) || 3));
    try {
      if (editingSubjectId != null) {
        await db.subjects.update(editingSubjectId, { name, code, credits, difficulty });
        toast.success("Subject updated");
      } else {
        if (code && subjects.some(s => (s.code || "").toLowerCase() === code.toLowerCase())) {
          toast.error("A subject with that code already exists"); return;
        }
        await db.subjects.add({ name, code, credits, difficulty, createdAt: getISTEffectiveDate(), syllabus: [], resources: [], grades: [] } as any);
        toast.success("Subject added");
      }
      setShowSubjectForm(false);
    } catch (e) {
      console.error("Failed to save subject", e);
      toast.error("Failed to save subject");
    }
  };
  const cascadeDeleteSubject = async (id: number) => {
    try {
      // Remove the subject AND every record that references it, so no orphans
      // are left behind (logs/topics/outcomes/plans drive analytics & planning).
      await db.transaction('rw',
        [db.subjects, db.projects, db.assignments, db.logs, db.topics, db.blockOutcomes, db.schedule, db.exams, db.studyBlocks, db.plans],
        async () => {
          await db.subjects.delete(id);
          await db.projects.filter((x: any) => Number(x.subjectId) === id).delete();
          await db.assignments.filter((x: any) => Number(x.subjectId) === id).delete();
          await db.logs.filter((x: any) => Number(x.subjectId) === id).delete();
          await db.topics.filter((x: any) => Number(x.subjectId) === id).delete();
          await db.blockOutcomes.filter((x: any) => Number(x.subjectId) === id).delete();
          await db.schedule.filter((x: any) => Number(x.subjectId) === id).delete();
          await db.exams.filter((x: any) => Number(x.subjectId) === id).delete();
          await db.studyBlocks.filter((x: any) => Number(x.subjectId) === id).delete();
          const plans = await db.plans.toArray();
          for (const p of plans) {
            const blocks = (p.blocks || []).filter((b: any) => Number(b.subjectId) !== id);
            if (blocks.length !== (p.blocks || []).length) {
              const keep = new Set(blocks.map((b: any) => b.id));
              const droppedBlocks = (p.droppedBlocks || []).filter((bid: string) => keep.has(bid));
              await db.plans.update(p.date, { blocks, droppedBlocks });
            }
          }
        });
      toast.success("Subject and its data deleted");
    } catch (e) {
      console.error("Failed to delete subject", e);
      toast.error("Failed to delete subject");
    } finally {
      setDeletingSubjectId(null);
      setSelectedSubjectId(null);
    }
  };

  const deletingSubject = deletingSubjectId != null ? subjects.find(s => s.id === deletingSubjectId) : null;

  const subjectFormModal = showSubjectForm ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-200 p-6" onClick={() => setShowSubjectForm(false)}>
      <div className="w-full max-w-md animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <FrostedTile className="overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">{editingSubjectId != null ? "Edit Subject" : "Add Subject"}</h2>
            <button onClick={() => setShowSubjectForm(false)} aria-label="Close" className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"><X size={20} /></button>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Name</span>
              <input autoFocus value={subjectForm.name} onChange={e => setSubjectForm(f => ({ ...f, name: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") saveSubject(); }} placeholder="e.g., Data Structures" className="mt-1.5 w-full bg-zinc-900/60 border border-zinc-700/50 rounded-xl px-4 py-3 text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50 transition-all text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Code</span>
              <input value={subjectForm.code} onChange={e => setSubjectForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g., CS201" className="mt-1.5 w-full bg-zinc-900/60 border border-zinc-700/50 rounded-xl px-4 py-3 text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50 transition-all text-sm font-mono" />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Credits</span>
                <input type="number" min={0} max={20} value={subjectForm.credits} onChange={e => setSubjectForm(f => ({ ...f, credits: e.target.value }))} className="mt-1.5 w-full bg-zinc-900/60 border border-zinc-700/50 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500/50 transition-all text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Difficulty (1–5)</span>
                <input type="number" min={1} max={5} value={subjectForm.difficulty} onChange={e => setSubjectForm(f => ({ ...f, difficulty: e.target.value }))} className="mt-1.5 w-full bg-zinc-900/60 border border-zinc-700/50 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500/50 transition-all text-sm" />
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={saveSubject} className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all active:scale-95">{editingSubjectId != null ? "Save changes" : "Add subject"}</button>
              <button onClick={() => setShowSubjectForm(false)} className="px-4 py-3 rounded-xl border border-zinc-700/50 text-zinc-300 hover:bg-white/5 font-semibold text-sm transition-all">Cancel</button>
            </div>
          </div>
        </FrostedTile>
      </div>
    </div>
  ) : null;

  const deleteSubjectModal = deletingSubject ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-200 p-6" onClick={() => setDeletingSubjectId(null)}>
      <div className="w-full max-w-md animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <FrostedTile className="overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center"><Trash2 size={18} className="text-rose-400" /></div>
              <h2 className="text-lg font-bold text-white">Delete “{deletingSubject.name}”?</h2>
            </div>
            <p className="text-sm text-zinc-400">This permanently removes the subject and all of its data — resources, grades, syllabus, projects, assignments, study logs, review topics, schedule slots, exams, and plan blocks. This cannot be undone.</p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => cascadeDeleteSubject(deletingSubject.id!)} className="flex-1 px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-all active:scale-95">Delete everything</button>
              <button onClick={() => setDeletingSubjectId(null)} className="px-4 py-3 rounded-xl border border-zinc-700/50 text-zinc-300 hover:bg-white/5 font-semibold text-sm transition-all">Cancel</button>
            </div>
          </div>
        </FrostedTile>
      </div>
    </div>
  ) : null;

  if (selectedSubject) {
    const subjectColor = getSubjectColor(selectedSubject.id!, selectedSubject.colorIndex);
    const colorClasses = SUBJECT_COLOR_CLASSES[subjectColor];
    const gpa = calculateGPA(selectedSubject.grades || []);

    return (
      <div className="pb-32 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        {subjectFormModal}
        {deleteSubjectModal}
        <button
          onClick={() => setSelectedSubjectId(null)}
          className="mb-6 flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-white transition-all hover:-translate-x-1 min-h-[44px]"
        >
          <ChevronLeft size={16} />
          <span>Back to Courses</span>
        </button>

        <div className="flex items-center gap-4 md:gap-6 mb-8">
          <div className="relative group/avatar shrink-0">
            <div className={`w-16 h-16 md:w-20 md:h-20 ${colorClasses.bg} rounded-3xl flex items-center justify-center font-bold text-black text-xl md:text-2xl shadow-xl animate-in zoom-in duration-500`}>
              {getInitials(selectedSubject.name)}
            </div>
            {/* Color picker swatches on hover */}
            <div className="absolute left-0 top-full mt-2 hidden group-hover/avatar:flex gap-1.5 p-2 rounded-2xl bg-zinc-900/95 border border-white/10 backdrop-blur-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200">
              {SUBJECT_COLORS.map((c, idx) => (
                <button
                  key={c}
                  onClick={async () => {
                    await db.subjects.update(selectedSubject.id!, { colorIndex: idx });
                    toast.success(`Color updated`);
                  }}
                  className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${SUBJECT_COLOR_CLASSES[c].bg}
                    ${(selectedSubject.colorIndex !== undefined ? selectedSubject.colorIndex : selectedSubject.id!) % SUBJECT_COLORS.length === idx
                      ? 'border-white shadow-lg' : 'border-transparent'}`}
                  title={c}
                />
              ))}
            </div>
          </div>
          <div className="min-w-0 animate-in slide-in-from-left duration-500">
            <h1 className="text-3xl md:text-5xl font-bold font-display mb-2 truncate">{selectedSubject.name || "Untitled"}</h1>
            <div className="text-zinc-400 text-sm md:text-base flex items-center gap-2 md:gap-3 flex-wrap">
              <span className="font-mono font-semibold">{selectedSubject.code || "NO CODE"}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              <span>{selectedSubject.credits ?? 0} credits</span>
              <span className="text-[10px] text-zinc-600 font-medium hidden sm:inline">(hover avatar to change color)</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button onClick={() => openEditSubject(selectedSubject)} aria-label="Edit subject details" className="flex items-center gap-2 px-3 md:px-4 py-2.5 rounded-xl border border-zinc-700/50 text-zinc-300 hover:text-white hover:bg-white/5 font-semibold text-sm transition-all min-h-[44px]"><Edit2 size={16} /><span className="hidden sm:inline">Edit</span></button>
            <button onClick={() => setDeletingSubjectId(selectedSubject.id!)} aria-label="Delete subject" className="flex items-center gap-2 px-3 md:px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 font-semibold text-sm transition-all min-h-[44px]"><Trash2 size={16} /><span className="hidden sm:inline">Delete</span></button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8 md:mb-10">
          {[
            { label: "Progress", value: `${computeProgress(selectedSubject)}%`, color: "indigo", icon: Target },
            { label: "Study Time", value: `${getTotalHours(selectedSubject.id!)}h`, color: "yellow", icon: Clock },
            { label: "Avg Score", value: gpa ? `${gpa}%` : '--', color: "amber", icon: TrendingUp },
            { label: "Resources", value: (selectedSubject.resources || []).length, color: "orange", icon: FileText }
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <FrostedTile key={i} className="p-4 md:p-6 group hover:border-indigo-500/30 hover:-translate-y-1 animate-in fade-in duration-300" style={{ animationDelay: `${i * 50}ms` }}>
                <div className={`absolute inset-0 bg-gradient-to-br from-${stat.color}-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative z-10">
                  <div className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-${stat.color}-500/20 flex items-center justify-center mb-3 md:mb-4 text-${stat.color}-400 group-hover:scale-110 transition-transform duration-500 border border-${stat.color}-500/30 shadow-lg shadow-${stat.color}-500/10`}>
                    <Icon size={20} className="md:hidden" />
                    <Icon size={24} className="hidden md:block" />
                  </div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-2">{stat.label}</div>
                  <div className={`text-3xl md:text-4xl font-bold font-mono tabular-nums text-${stat.color}-400`}>
                    {stat.value}
                  </div>
                </div>
              </FrostedTile>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          <FrostedTile className="p-6 md:p-8 hover:border-indigo-500/30 hover:-translate-y-1 animate-in fade-in slide-in-from-left duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform duration-500 border border-indigo-500/30 shadow-lg shadow-indigo-500/10">
                  <Target size={24} className="md:hidden" />
                  <Target size={28} className="hidden md:block" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-white">Syllabus</h3>
              </div>

              {(selectedSubject.syllabus || []).length === 0 ? (
                <EmptySyllabus />
              ) : (
                <div className="space-y-2 mb-6 max-h-[400px] overflow-y-auto">
                  {(selectedSubject.syllabus || []).map((u: any, i: number) => (
                    <div
                      key={u.id}
                      className="animate-in fade-in slide-in-from-left duration-300"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <FrostedMini
                        onClick={() => toggleSyllabus(u)}
                        className="flex items-center gap-3 md:gap-4 cursor-pointer hover:bg-white/5 p-3 md:p-4 hover:scale-[1.02] active:scale-[0.98] duration-300 min-h-[56px] md:min-h-[64px] group hover:-translate-y-0.5"
                      >
                        {u.completed ?
                          <CheckSquare className="text-yellow-400 shrink-0 group-hover:scale-110 transition-transform" size={20} /> :
                          <Square size={20} className="text-zinc-600 shrink-0 group-hover:scale-110 transition-transform" />
                        }
                        <span className={`text-sm md:text-base font-medium ${u.completed ? "line-through text-zinc-500" : "text-zinc-300"}`}>
                          {u.title}
                        </span>
                      </FrostedMini>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="Add unit..."
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 md:px-5 py-3 md:py-4 text-sm md:text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all min-h-[56px] md:min-h-[64px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newUnit.trim()) {
                      addUnit();
                    }
                  }}
                />
                <button
                  onClick={addUnit}
                  className="px-4 md:px-6 py-3 md:py-4 bg-indigo-500/20 hover:bg-indigo-500/30 rounded-2xl transition-all font-bold text-sm md:text-base border border-indigo-500/30 hover:scale-105 active:scale-95 duration-300 min-h-[56px] md:min-h-[64px] min-w-[56px] md:min-w-[64px] flex items-center justify-center"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          </FrostedTile>

          <FrostedTile className="p-6 md:p-8 hover:border-yellow-500/30 hover:-translate-y-1 animate-in fade-in slide-in-from-right duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-yellow-500/20 flex items-center justify-center text-yellow-400 group-hover:scale-110 transition-transform duration-500 border border-yellow-500/30 shadow-lg shadow-yellow-500/10">
                    <Calculator size={24} className="md:hidden" />
                    <Calculator size={28} className="hidden md:block" />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-white">Grades</h3>
                </div>
                <button
                  onClick={() => setShowGradeForm(!showGradeForm)}
                  className="p-2 md:p-3 hover:bg-white/10 rounded-2xl transition-all hover:scale-110 active:scale-95 duration-300 min-h-[44px] md:min-h-[56px] min-w-[44px] md:min-w-[56px] flex items-center justify-center"
                >
                  <Plus size={20} />
                </button>
              </div>

              {showGradeForm && (
                <div className="mb-6 p-4 md:p-6 space-y-3 md:space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <FrostedMini>
                    <input
                      placeholder="Type (e.g., ISA-1, Quiz 2)"
                      value={newGrade.type}
                      onChange={(e) => setNewGrade({ ...newGrade, type: e.target.value })}
                      className="w-full bg-transparent px-4 md:px-5 py-3 md:py-4 text-sm md:text-base outline-none min-h-[56px] md:min-h-[64px]"
                    />
                  </FrostedMini>
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <FrostedMini>
                      <input
                        type="number"
                        placeholder="Score"
                        value={newGrade.score}
                        onChange={(e) => setNewGrade({ ...newGrade, score: e.target.value })}
                        className="w-full bg-transparent px-4 md:px-5 py-3 md:py-4 text-sm md:text-base outline-none min-h-[56px] md:min-h-[64px]"
                      />
                    </FrostedMini>
                    <FrostedMini>
                      <input
                        type="number"
                        placeholder="Max (100)"
                        value={newGrade.maxScore}
                        onChange={(e) => setNewGrade({ ...newGrade, maxScore: e.target.value })}
                        className="w-full bg-transparent px-4 md:px-5 py-3 md:py-4 text-sm md:text-base outline-none min-h-[56px] md:min-h-[64px]"
                      />
                    </FrostedMini>
                  </div>
                  <FrostedMini>
                    <input
                      type="date"
                      value={newGrade.date}
                      onChange={(e) => setNewGrade({ ...newGrade, date: e.target.value })}
                      className="w-full bg-transparent px-4 md:px-5 py-3 md:py-4 text-sm md:text-base font-mono outline-none min-h-[56px] md:min-h-[64px]"
                    />
                  </FrostedMini>
                  <button
                    onClick={addGrade}
                    className="w-full py-3 md:py-4 bg-yellow-500/20 hover:bg-yellow-500/30 rounded-2xl font-bold text-sm md:text-base transition-all hover:scale-[1.02] active:scale-[0.98] duration-300 border border-yellow-500/30 min-h-[56px] md:min-h-[64px]"
                  >
                    Add Grade
                  </button>
                </div>
              )}

              {(!selectedSubject.grades || selectedSubject.grades.length === 0) && !showGradeForm ? (
                <EmptyGrades />
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {selectedSubject.grades && selectedSubject.grades.length > 0 && (
                    <div className="flex items-center justify-between px-2 py-3 mb-2 border-b border-zinc-800">
                      <span className="text-xs text-zinc-500 uppercase tracking-wider font-bold">Average</span>
                      <span className="font-mono font-bold text-yellow-400 text-lg">
                        {gpa}%
                        <span className="ml-2 text-xs font-normal text-zinc-500">
                          ({selectedSubject.grades.length} {selectedSubject.grades.length === 1 ? 'entry' : 'entries'})
                        </span>
                      </span>
                    </div>
                  )}
                  {(selectedSubject.grades || []).map((g: any, i: number) => (
                    <div
                      key={g.id}
                      className="animate-in fade-in slide-in-from-right duration-300"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <FrostedMini className="flex justify-between items-center hover:bg-zinc-800 hover:scale-[1.02] min-h-[72px] md:min-h-[80px] group">
                        <div>
                          <div className="font-bold text-sm md:text-base mb-1">{g.type}</div>
                          <div className="text-xs text-zinc-500 uppercase tracking-wider font-mono">{g.date}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-xl md:text-2xl font-mono font-bold tabular-nums">
                            {g.score}<span className="text-zinc-500 text-base md:text-lg">/{g.maxScore}</span>
                            <span className={`text-xs md:text-sm ml-2 md:ml-3 px-2 md:px-3 py-1 md:py-1.5 rounded-xl ${
                              (g.score / g.maxScore) >= 0.75
                                ? 'text-yellow-400 bg-yellow-500/10'
                                : (g.score / g.maxScore) >= 0.5
                                  ? 'text-amber-400 bg-amber-500/10'
                                  : 'text-red-400 bg-red-500/10'
                            }`}>
                              {((g.score / g.maxScore) * 100).toFixed(0)}%
                            </span>
                          </div>
                          <button
                            onClick={async () => {
                              await db.subjects.update(selectedSubject.id!, {
                                grades: (selectedSubject.grades || []).filter((x: any) => x.id !== g.id),
                              });
                              toast.success('Grade removed');
                            }}
                            aria-label="Remove grade"
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-2 hover:bg-red-500/10 rounded-xl transition-all min-h-[40px] min-w-[40px] flex items-center justify-center"
                          >
                            <Trash2 size={15} className="text-red-400" />
                          </button>
                        </div>
                      </FrostedMini>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FrostedTile>

          <FrostedTile className="lg:col-span-2 p-6 md:p-8 hover:border-purple-500/30 hover:-translate-y-1 animate-in fade-in duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform duration-500 border border-purple-500/30 shadow-lg shadow-purple-500/10">
                  <FileText size={24} className="md:hidden" />
                  <FileText size={28} className="hidden md:block" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-white">Resources</h3>
              </div>

              {(selectedSubject.resources || []).length === 0 ? (
                <EmptyResources />
              ) : (
                <div className="space-y-3 mb-6 md:mb-8 max-h-[400px] overflow-y-auto">
                  {(selectedSubject.resources || []).map((r: any, i: number) => (
                    <div
                      key={r.id}
                      className="animate-in fade-in slide-in-from-bottom duration-300"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <FrostedMini className="flex items-center justify-between p-4 md:p-5 hover:bg-zinc-800 transition-all group border-zinc-800/50 hover:scale-[1.01] duration-300 min-h-[64px] md:min-h-[72px] hover:-translate-y-0.5">
                        <div
                          className="flex items-center gap-3 md:gap-4 flex-1 cursor-pointer min-w-0"
                          onClick={() => {
                            // open links and files externally for full-page view
                            openResourceInNewTab(r);
                          }}
                        >
                          {r.type === 'link' ? (
                            <Link size={20} className="text-orange-400 shrink-0" />
                          ) : isPowerPoint(r.fileType) ? (
                            <Presentation size={20} className="text-orange-400 shrink-0" />
                          ) : (
                            <FileText size={20} className="text-purple-400 shrink-0" />
                          )}
                          <span className="truncate text-sm md:text-base font-medium">{r.title}</span>
                        </div>
                        <div className="flex items-center gap-3 md:gap-4 shrink-0">
                          {r.type === 'link' && (
                            <ExternalLink size={16} className="text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                          <button
                            onClick={() => removeResource(r.id)}
                            aria-label="Remove resource"
                            className="p-2 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
                          >
                            <Trash2 size={16} className="text-red-400" />
                          </button>
                        </div>
                      </FrostedMini>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                <label className="flex-1">
                  <FrostedTile className="px-4 md:px-6 py-4 md:py-5 text-sm md:text-base text-center cursor-pointer hover:border-indigo-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] duration-300 font-semibold min-h-[56px] md:min-h-[64px] flex items-center justify-center gap-2 md:gap-3 hover:-translate-y-1">
                    <input type="file" multiple hidden onChange={async (e: any) => {
                      const files = Array.from((e.target?.files || [])) as File[];
                      for (const f of files) await processAndSaveFile(f);
                    }} />
                    <Upload size={20} />
                    <span>Upload Files</span>
                  </FrostedTile>
                </label>

                <button
                  onClick={() => setShowLinkForm(!showLinkForm)}
                  className="px-4 md:px-6 py-4 md:py-5 bg-orange-500/20 hover:bg-orange-500/30 rounded-2xl font-bold text-sm md:text-base transition-all hover:scale-[1.02] active:scale-[0.98] duration-300 border border-orange-500/30 min-h-[56px] md:min-h-[64px] flex items-center justify-center gap-2 md:gap-3"
                >
                  <Link size={20} />
                  <span>Add Link</span>
                </button>
              </div>

              {showLinkForm && (
                <div className="mt-6 p-4 md:p-6 space-y-3 md:space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <FrostedMini>
                    <input
                      placeholder="Link title"
                      value={newLink.title}
                      onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
                      className="w-full bg-transparent px-4 md:px-5 py-3 md:py-4 text-sm md:text-base outline-none min-h-[56px] md:min-h-[64px]"
                    />
                  </FrostedMini>
                  <FrostedMini>
                    <input
                      placeholder="URL"
                      value={newLink.url}
                      onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                      className="w-full bg-transparent px-4 md:px-5 py-3 md:py-4 text-sm md:text-base outline-none min-h-[56px] md:min-h-[64px]"
                    />
                  </FrostedMini>
                  <button
                    onClick={addWebLink}
                    className="w-full py-3 md:py-4 bg-orange-500/20 hover:bg-orange-500/30 rounded-2xl font-bold text-sm md:text-base transition-all hover:scale-[1.02] active:scale-[0.98] duration-300 border border-orange-500/30 min-h-[56px] md:min-h-[64px]"
                  >
                    Add Link
                  </button>
                </div>
              )}
            </div>
          </FrostedTile>

          <FrostedTile className="lg:col-span-2 p-6 md:p-8 hover:border-amber-500/30 hover:-translate-y-1 animate-in fade-in duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform duration-500 border border-amber-500/30 shadow-lg shadow-amber-500/10">
                  <StickyNote size={24} className="md:hidden" />
                  <StickyNote size={28} className="hidden md:block" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-white">Session Notes</h3>
              </div>

              {(() => {
                const subjectLogs = logs
                  .filter(l => l.subjectId === selectedSubject.id && l.notes && l.notes.trim().length > 0)
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .slice(0, 10);

                if (subjectLogs.length === 0) {
                  return <EmptyNotes />;
                }

                return (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-3">
                    {subjectLogs.map((log, i) => (
                      <div
                        key={log.id}
                        className="animate-in fade-in slide-in-from-bottom duration-300"
                        style={{ animationDelay: `${i * 30}ms` }}
                      >
                        <FrostedMini className="p-4 md:p-6 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-300">
                          <div className="flex items-center justify-between mb-3 md:mb-4">
                            <div className="flex items-center gap-2 md:gap-3 text-xs font-bold uppercase tracking-wider text-zinc-500">
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
                          <p className="text-sm md:text-base text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {log.notes}
                          </p>
                        </FrostedMini>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </FrostedTile>
        </div>
      </div>
    );
  }

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
    <div className="pb-32 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 md:space-y-8">
      <PageHeader
        title="Academic Loadout"
        meta={
          <MetaText>
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            }).toUpperCase()}
          </MetaText>
        }
      />

      {showPrediction !== null && (
        <PredictionModal
          subject={subjects.find(s => s.id === showPrediction)}
          currentReadiness={readinessScores[showPrediction]}
          onClose={() => setShowPrediction(null)}
        />
      )}

      {subjectFormModal}

      {/* control bar */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between animate-in fade-in duration-300">
        <div className="relative flex-1 lg:max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input
            className="w-full pl-11 pr-4 py-3 bg-ink2 border border-white/10 rounded-full outline-none text-sm font-medium placeholder:text-zinc-600 focus:border-orange-500/50 transition-colors"
            placeholder="Search the loadout…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {([{ k: 'all', label: 'All' }, { k: 'critical', label: 'Critical' }, { k: 'maintaining', label: 'Maintaining' }, { k: 'mastered', label: 'Mastered' }] as const).map(f => {
            const active = statusFilter === f.k;
            return (
              <button key={f.k} onClick={() => setStatusFilter(f.k)}
                className={`text-[10px] font-mono font-bold uppercase tracking-[0.14em] px-3.5 py-2 rounded-full transition-colors ${active ? 'bg-white text-ink' : 'bg-ink2 text-mute border border-white/10 hover:text-white'}`}>
                {f.label}
              </button>
            );
          })}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
            className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] px-3.5 py-2 rounded-full bg-ink2 text-mute border border-white/10 outline-none cursor-pointer hover:text-white">
            <option value="name">Sort · Name</option>
            <option value="difficulty">Sort · Difficulty</option>
            <option value="progress">Sort · Progress</option>
          </select>
          <button onClick={openAddSubject}
            className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] px-4 py-2 rounded-full bg-orange-500 text-ink hover:bg-orange-400 transition-colors active:scale-95">
            + Add
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        searchQuery ? (
          <div className="text-center py-24">
            <div className="font-display font-black text-3xl text-white">No results</div>
            <p className="text-zinc-500 text-sm mt-2 mb-6">Nothing matches “<span className="text-white font-semibold">{searchQuery}</span>”.</p>
            <button onClick={() => setSearchQuery('')} className="bg-white text-ink font-bold text-sm px-6 py-3 rounded-2xl">Clear search</button>
          </div>
        ) : (
          <EmptyCourses onAddCourse={openAddSubject} />
        )
      ) : (() => {
        const STATUS = {
          critical:    { solid: 'bg-orange-500', text: 'text-orange-400', seg: 'bg-orange-500', pill: 'bg-orange-500/15 text-orange-400', ring: '#FF5A1F', label: 'Critical' },
          maintaining: { solid: 'bg-yellow-400', text: 'text-yellow-300', seg: 'bg-yellow-400', pill: 'bg-yellow-400/15 text-yellow-300', ring: '#FFD60A', label: 'Maintaining' },
          mastered:    { solid: 'bg-paper',      text: 'text-white',      seg: 'bg-white',      pill: 'bg-white/10 text-white',          ring: '#F7F5EF', label: 'Mastered' },
        } as const;
        const today = getISTEffectiveDate();
        const examFor = (id: number) => {
          const up = exams.filter((e: any) => Number(e.subjectId) === Number(id) && e.examDate >= today).sort((a: any, b: any) => String(a.examDate).localeCompare(String(b.examDate)))[0];
          if (!up) return null;
          const days = Math.max(0, Math.round((new Date(up.examDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000));
          return { days, type: String(up.examType).toUpperCase() };
        };
        const meta = (s: any) => {
          const r: any = readinessScores[s.id];
          const score = r ? Math.round(r.score) : 0;
          const status: 'critical' | 'maintaining' | 'mastered' = (r?.status || 'maintaining');
          return { score, status, st: STATUS[status], hours: getTotalHours(s.id), exam: examFor(s.id) };
        };
        const fuel = (score: number, segCls: string) => {
          const f = Math.round(score / 10);
          return <div className="flex gap-1">{Array.from({ length: 10 }).map((_, i) => <div key={i} className={`h-3 flex-1 rounded-sm ${i < f ? segCls : 'bg-white/10'}`} />)}</div>;
        };
        const ranked = [...filtered].map((s: any) => ({ s, m: meta(s) }));
        const shown = statusFilter === 'all' ? ranked : ranked.filter(x => x.m.status === statusFilter);
        const priority = [...ranked].filter(x => x.m.status !== 'mastered').sort((a, b) => a.m.score - b.m.score)[0];
        const avgRead = ranked.length ? Math.round(ranked.reduce((a, x) => a + x.m.score, 0) / ranked.length) : 0;
        const totalCredits = filtered.reduce((a: number, s: any) => a + (s.credits || 0), 0);
        const totalHours = Math.round(filtered.reduce((a: number, s: any) => a + Number(getTotalHours(s.id)), 0));
        const examCount = exams.filter((e: any) => e.examDate >= today).length;
        const criticalCount = ranked.filter(x => x.m.status === 'critical').length;
        const RC = 2 * Math.PI * 42;
        return (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="grid lg:grid-cols-3 gap-4">
              {priority ? (
                <div onClick={() => setSelectedSubjectId(priority.s.id)} className={`lg:col-span-2 rounded-5xl ${priority.m.st.solid} text-ink p-7 md:p-8 cursor-pointer relative overflow-hidden group`}>
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] bg-ink/90 text-white px-3 py-1.5 rounded-full">{priority.m.status === 'critical' ? '⚠ Needs you most' : '◎ Focus next'}</span>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] opacity-70">{priority.m.st.label}</span>
                  </div>
                  <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] opacity-70">{priority.s.code || 'NO CODE'} · {priority.s.credits ?? 0} cr</div>
                      <div className="font-display font-black text-4xl md:text-5xl mt-1 leading-[0.95]">{priority.s.name}</div>
                      <div className="mt-6 max-w-sm">
                        <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] opacity-70">Readiness</span><span className="font-display font-black text-2xl">{priority.m.score}%</span></div>
                        {fuel(priority.m.score, 'bg-ink')}
                      </div>
                    </div>
                    {priority.m.exam && (
                      <div className="text-center shrink-0">
                        <div className="font-display font-black text-6xl md:text-7xl leading-none">{String(priority.m.exam.days).padStart(2, '0')}</div>
                        <div className="text-[9px] font-mono font-bold uppercase tracking-[0.14em] opacity-70 mt-1">days to {priority.m.exam.type}</div>
                      </div>
                    )}
                  </div>
                  <div className="mt-7 bg-ink text-white font-bold text-sm px-6 py-4 rounded-2xl inline-flex items-center gap-2 group-hover:gap-3 transition-all">▶ Open subject</div>
                </div>
              ) : (
                <div className="lg:col-span-2 rounded-5xl bg-ink2 border border-white/10 p-8 flex flex-col items-center justify-center text-center min-h-[220px]">
                  <div className="font-display font-black text-3xl">All subjects stable</div>
                  <div className="text-sm text-mute mt-2">Nothing critical right now — keep the streak going.</div>
                </div>
              )}

              <div className="rounded-5xl bg-ink2 border border-white/10 p-7 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-mute">Loadout</span>
                  {criticalCount > 0 && <span className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-orange-400">{criticalCount} critical</span>}
                </div>
                <div className="flex items-center gap-4 my-4">
                  <div className="relative w-[84px] h-[84px] shrink-0">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="11" />
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#FF5A1F" strokeWidth="11" strokeLinecap="round" strokeDasharray={RC} strokeDashoffset={RC * (1 - avgRead / 100)} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-display font-black text-2xl">{avgRead}<span className="text-xs">%</span></div>
                  </div>
                  <div>
                    <div className="font-display font-black text-xl">{filtered.length} subject{filtered.length === 1 ? '' : 's'}</div>
                    <div className="text-xs text-mute mt-1">avg readiness</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-ink3 rounded-2xl py-3"><div className="font-display font-black text-xl text-yellow-400">{totalCredits}</div><div className="text-[8px] font-mono uppercase tracking-[0.14em] text-mute mt-1">credits</div></div>
                  <div className="bg-ink3 rounded-2xl py-3"><div className="font-display font-black text-xl">{totalHours}<span className="text-[10px] text-mute">h</span></div><div className="text-[8px] font-mono uppercase tracking-[0.14em] text-mute mt-1">logged</div></div>
                  <div className="bg-ink3 rounded-2xl py-3"><div className="font-display font-black text-xl text-orange-400">{examCount}</div><div className="text-[8px] font-mono uppercase tracking-[0.14em] text-mute mt-1">exams</div></div>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shown.map(({ s, m }, i) => (
                <FrostedTile key={s.id} onClick={() => setSelectedSubjectId(s.id)} className="p-6 cursor-pointer animate-in fade-in duration-300" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-5">
                      <div className={`w-14 h-14 rounded-2xl ${m.st.solid} text-ink font-display font-black text-2xl flex items-center justify-center group-hover:scale-105 transition-transform`}>{getInitials(s.name)}</div>
                      <span className={`text-[9px] font-mono font-bold uppercase tracking-[0.14em] ${m.st.pill} px-2.5 py-1 rounded-full`}>{m.st.label}</span>
                    </div>
                    <div className="text-[9px] font-mono font-bold uppercase tracking-[0.14em] text-mute">{s.code || 'NO CODE'} · {s.credits ?? 0} cr</div>
                    <div className="font-display font-black text-2xl mt-1 leading-tight truncate">{s.name}</div>
                    <div className="mt-5 mb-2">{fuel(m.score, m.st.seg)}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-mute">readiness <b className={m.st.text}>{m.score}%</b></span>
                      <span className="text-[9px] font-mono font-bold uppercase tracking-[0.14em] text-mute">{m.hours}h{m.exam ? ` · ${m.exam.type} ${m.exam.days}d` : ''}</span>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                      <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-zinc-600">{(s.syllabus || []).filter((u: any) => !u.completed).length} units · {(s.resources || []).length} files</span>
                      <button onClick={(e) => { e.stopPropagation(); if (s.id !== undefined) setShowPrediction(s.id); }} className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full bg-white/5 text-mute border border-white/10 hover:text-white transition-colors">Predict</button>
                    </div>
                  </div>
                </FrostedTile>
              ))}
              <button onClick={openAddSubject} className="rounded-4xl border-2 border-dashed border-white/15 p-6 flex flex-col items-center justify-center text-center min-h-[200px] hover:border-orange-500/50 transition-colors">
                <div className="w-12 h-12 rounded-2xl bg-ink2 border border-white/10 flex items-center justify-center text-orange-400 text-2xl mb-3">+</div>
                <div className="font-bold text-white">Add subject</div>
                <div className="text-xs text-mute mt-1">Build out your loadout</div>
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}