import React, { useEffect, useState } from "react";
import {
  BookOpen, Award, FileText, Upload, Trash2, X, Search, Target, 
  Clock, Download, CheckSquare, Square, Calculator, TrendingUp,
  LinkIcon, ExternalLink, Plus, Edit2
} from "lucide-react";
import { db } from "./db";
import { ResourceType } from "./types";
import { useLiveQuery } from "dexie-react-hooks";

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

export default function EnhancedCoursesView() {
  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];
  const logs = useLiveQuery(() => db.logs.toArray()) || [];

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
        else setSelectedSubjectId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedResource]);

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
    } catch (err) {
      console.error("Failed to save file", err);
      alert("Failed to upload file.");
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
    
    setNewGrade({ type: "", score: "", maxScore: "100", date: "" });
    setShowGradeForm(false);
  };

  const openExternally = (r: any) => {
    if (r.type === 'link') {
      window.open(r.url, '_blank');
      return;
    }
    
    const url = base64ToBlobUrl(r.fileData, r.fileType);
    if (!url) {
      alert("Unable to preview file.");
      return;
    }

    if (isOfficeDoc(r.fileType)) {
      const link = document.createElement("a");
      link.href = url;
      link.download = r.title || "file";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      alert(`Office documents will be downloaded. Open with your local Office suite.`);
    } else {
      window.open(url, "_blank");
    }
  };

  // Resource Viewer
  if (selectedResource && selectedResource.type !== 'link') {
    const canPreview = selectedResource.fileType?.includes("pdf") || 
                       selectedResource.fileType?.startsWith("image") || 
                       selectedResource.fileType?.startsWith("video");

    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center">
        <button onClick={() => setSelectedResource(null)} className="fixed top-6 right-6 p-3 bg-white/10 rounded-xl">
          <X />
        </button>

        <div className="w-full max-w-6xl h-[90vh] bg-zinc-900 rounded-2xl border border-white/10 flex flex-col">
          <div className="p-4 border-b border-white/10 flex justify-between">
            <div className="font-bold truncate">{selectedResource.title}</div>
            <button onClick={() => openExternally(selectedResource)} className="px-4 py-2 bg-indigo-500/20 rounded-lg">
              Open in new tab
            </button>
          </div>

          <div className="flex-1 bg-zinc-950 p-4">
            {canPreview ? (
              selectedResource.fileType.includes("pdf") ? (
                <iframe src={previewUrl ?? ""} className="w-full h-full bg-white rounded-lg" />
              ) : selectedResource.fileType.startsWith("image") ? (
                <img src={previewUrl ?? ""} className="max-w-full max-h-full mx-auto" />
              ) : (
                <video src={previewUrl ?? ""} controls className="w-full h-full" />
              )
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-center">
                Preview not supported.<br />Use "Open in new tab".
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
      <div className="fixed inset-0 z-40 bg-black overflow-y-auto pt-16">
        <div className="max-w-[1400px] mx-auto p-6 space-y-6 pb-24">
          <button onClick={() => setSelectedSubjectId(null)} className="fixed top-20 right-6 p-3 bg-white/10 rounded-xl">
            <X />
          </button>

          {/* Header */}
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 ${theme.bg} rounded-2xl flex items-center justify-center font-bold text-black`}>
              {getInitials(selectedSubject.name)}
            </div>
            <div>
              <h1 className="text-4xl font-bold">{selectedSubject.name || "Untitled"}</h1>
              <div className="text-zinc-400 text-sm">
                {selectedSubject.code || ""} • {selectedSubject.credits ?? 0} credits
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-6">
            <div>
              <div className="text-xs text-zinc-500">Progress</div>
              <div className="text-4xl font-bold">{computeProgress(selectedSubject)}%</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Study Time</div>
              <div className="text-4xl font-bold">{getTotalHours(selectedSubject.id)}h</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Avg Score</div>
              <div className="text-4xl font-bold">{gpa || '--'}%</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Resources</div>
              <div className="text-4xl font-bold">{(selectedSubject.resources || []).length}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Syllabus */}
            <div className="border border-white/10 rounded-2xl p-6">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Target size={18} className="text-indigo-400" />
                Syllabus
              </h3>

              {(selectedSubject.syllabus || []).map((u: any) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 mb-2 cursor-pointer hover:bg-zinc-900/40 p-2 rounded-lg transition-all"
                  onClick={() =>
                    db.subjects.update(selectedSubject.id, {
                      syllabus: (selectedSubject.syllabus || []).map((x: any) =>
                        x.id === u.id ? { ...x, completed: !x.completed } : x
                      ),
                    })
                  }
                >
                  {u.completed ? <CheckSquare className="text-emerald-400" size={20} /> : <Square size={20} />}
                  <span className={u.completed ? "line-through text-zinc-500" : ""}>{u.title}</span>
                </div>
              ))}

              <div className="flex gap-2 mt-3">
                <input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="Add unit"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newUnit.trim()) {
                      db.subjects.update(selectedSubject.id, {
                        syllabus: [
                          ...(selectedSubject.syllabus || []),
                          {
                            id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
                            title: newUnit,
                            completed: false,
                          },
                        ],
                      });
                      setNewUnit("");
                    }
                  }}
                />
                <button
                  onClick={async () => {
                    if (!newUnit.trim()) return;
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
                    setNewUnit("");
                  }}
                  className="px-4 py-2 bg-indigo-500/20 rounded-lg hover:bg-indigo-500/30"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Grades */}
            <div className="border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2">
                  <Calculator size={18} className="text-emerald-400" />
                  Grades
                </h3>
                <button
                  onClick={() => setShowGradeForm(!showGradeForm)}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-all"
                >
                  <Plus size={16} />
                </button>
              </div>

              {showGradeForm && (
                <div className="mb-4 p-4 bg-zinc-900/60 rounded-xl space-y-3 animate-fade-in">
                  <input
                    placeholder="Type (e.g., ISA-1, Quiz 2)"
                    value={newGrade.type}
                    onChange={(e) => setNewGrade({...newGrade, type: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Score"
                      value={newGrade.score}
                      onChange={(e) => setNewGrade({...newGrade, score: e.target.value})}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Max (100)"
                      value={newGrade.maxScore}
                      onChange={(e) => setNewGrade({...newGrade, maxScore: e.target.value})}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <input
                    type="date"
                    value={newGrade.date}
                    onChange={(e) => setNewGrade({...newGrade, date: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={addGrade}
                    className="w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-lg text-sm font-bold"
                  >
                    Add Grade
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {(selectedSubject.grades || []).map((g: any) => (
                  <div key={g.id} className="flex justify-between items-center p-3 bg-zinc-900 rounded-lg">
                    <div>
                      <div className="font-bold">{g.type}</div>
                      <div className="text-xs text-zinc-500">{g.date}</div>
                    </div>
                    <div className="text-lg font-mono font-bold">
                      {g.score}/{g.maxScore}
                      <span className="text-sm text-zinc-500 ml-2">
                        ({((g.score/g.maxScore)*100).toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                ))}
                {(!selectedSubject.grades || selectedSubject.grades.length === 0) && !showGradeForm && (
                  <div className="text-zinc-500 text-sm italic text-center py-4">No grades yet</div>
                )}
              </div>
            </div>

            {/* Resources */}
            <div className="lg:col-span-2 border border-white/10 rounded-2xl p-6">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <FileText size={18} className="text-purple-400" />
                Resources
              </h3>

              <div className="space-y-2 mb-4">
                {(selectedSubject.resources || []).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-all group">
                    <div 
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      onClick={() => r.type === 'link' ? openExternally(r) : setSelectedResource(r)}
                    >
                      {r.type === 'link' ? <LinkIcon size={16} className="text-cyan-400" /> : <FileText size={16} />}
                      <span className="truncate">{r.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.type === 'link' && (
                        <ExternalLink size={14} className="text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                      <Trash2
                        size={16}
                        className="text-red-400 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() =>
                          db.subjects.update(selectedSubject.id, {
                            resources: (selectedSubject.resources || []).filter((x: any) => x.id !== r.id),
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <label
                  className={`flex-1 px-4 py-3 text-sm text-center rounded-lg border cursor-pointer hover:border-indigo-500/40 ${
                    dragActive ? "border-cyan-400 bg-cyan-500/20" : "border-white/10"
                  }`}
                  onDragEnter={() => setDragActive(true)}
                  onDragLeave={() => setDragActive(false)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const files = Array.from((e.dataTransfer?.files || [])) as File[];
                    for (const f of files) await processAndSaveFile(f);
                  }}
                >
                  <input type="file" multiple hidden onChange={async (e: any) => {
                    const files = Array.from((e.target?.files || [])) as File[];
                    for (const f of files) await processAndSaveFile(f);
                  }} />
                  <Upload size={16} className="inline mr-2" />
                  Upload Files
                </label>

                <button
                  onClick={() => setShowLinkForm(!showLinkForm)}
                  className="px-4 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-sm font-bold"
                >
                  <LinkIcon size={16} className="inline mr-2" />
                  Add Link
                </button>
              </div>

              {showLinkForm && (
                <div className="mt-4 p-4 bg-zinc-900/60 rounded-xl space-y-3 animate-fade-in">
                  <input
                    placeholder="Link title"
                    value={newLink.title}
                    onChange={(e) => setNewLink({...newLink, title: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="URL"
                    value={newLink.url}
                    onChange={(e) => setNewLink({...newLink, url: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={addWebLink}
                    className="w-full py-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-sm font-bold"
                  >
                    Add Link
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main List
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
    <div className="max-w-[1400px] mx-auto p-6 space-y-6 pb-24">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 text-zinc-500" size={16} />
          <input
            className="w-full pl-9 py-2 bg-zinc-900 border border-zinc-800 rounded-xl"
            placeholder="Search subjects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
        >
          <option value="name">Name</option>
          <option value="difficulty">Difficulty</option>
          <option value="progress">Progress</option>
        </select>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {filtered.map((s, i) => {
          const t = themes[i % themes.length];
          const progress = computeProgress(s);
          const gpa = calculateGPA(s.grades || []);
          
          return (
            <div
              key={s.id}
              onClick={() => setSelectedSubjectId(Number(s.id))}
              className="cursor-pointer border border-white/10 rounded-2xl p-5 bg-white/[0.02] hover:border-indigo-500/30 transition-all group"
            >
              <div className="flex justify-between mb-4">
                <div className="flex gap-3">
                  <div className={`w-12 h-12 ${t.bg} rounded-xl flex items-center justify-center font-bold text-black`}>
                    {getInitials(s.name)}
                  </div>
                  <div>
                    <div className="font-bold group-hover:text-indigo-100 transition-colors">{s.name}</div>
                    <div className="text-xs text-zinc-400">{s.code || ""} • {s.credits ?? 0} CR</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${t.text}`}>{progress}%</div>
                  {gpa && <div className="text-xs text-zinc-500">{gpa}% avg</div>}
                </div>
              </div>

              <div className="h-2 bg-white/5 rounded-full mb-3 overflow-hidden">
                <div className={`${t.bg} h-full transition-all duration-500`} style={{ width: `${progress}%` }} />
              </div>

              <div className="flex gap-4 text-xs text-zinc-400">
                <div className="flex items-center gap-1">
                  <Clock size={12} /> {getTotalHours(s.id)}h
                </div>
                <div className="flex items-center gap-1">
                  <Target size={12} /> {(s.syllabus || []).filter((u: any) => !u.completed).length} pending
                </div>
                <div className="flex items-center gap-1">
                  <FileText size={12} /> {(s.resources || []).length} files
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}