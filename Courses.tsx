import React, { useEffect, useState } from "react";
import {
  BookOpen,
  Award,
  FileText,
  Upload,
  Trash2,
  X,
  Search,
  Target,
  Clock,
  Download,
  File,
  CheckSquare,
  Square,
} from "lucide-react";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";

/* ====================== HELPERS ====================== */

const base64ToBlobUrl = (dataUrl: string, mime: string) => {
  const base64 = dataUrl.split(",")[1];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
};

const isOfficeDoc = (type: string) =>
  type.includes("presentation") ||
  type.includes("msword") ||
  type.includes("officedocument");

/* ===================================================== */

export default function CoursesView({
  subjects: propSubjects,
  logs: propLogs,
}: {
  subjects?: any[];
  logs?: any[];
}) {
  const subjects =
    useLiveQuery(() => db.subjects.toArray()) || propSubjects || [];
  const logs = useLiveQuery(() => db.logs.toArray()) || propLogs || [];

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "difficulty">("name");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [spinClose, setSpinClose] = useState(false);
  const [newUnit, setNewUnit] = useState("");

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);

  /* ---------------- BODY LOCK ---------------- */
  useEffect(() => {
    document.body.style.overflow =
      selectedSubject || selectedResource ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedSubject, selectedResource]);

  /* ---------------- ESC ---------------- */
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

  /* ---------------- PREVIEW URL ---------------- */
  useEffect(() => {
    if (!selectedResource) return;
    const url = base64ToBlobUrl(
      selectedResource.fileData,
      selectedResource.fileType
    );
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedResource]);

  /* ---------------- HELPERS ---------------- */

  const themes = [
    { text: "text-indigo-400", bg: "bg-indigo-500" },
    { text: "text-emerald-400", bg: "bg-emerald-500" },
    { text: "text-amber-400", bg: "bg-amber-500" },
    { text: "text-rose-400", bg: "bg-rose-500" },
    { text: "text-cyan-400", bg: "bg-cyan-500" },
  ];

  const getInitials = (name: string) =>
    name
      .split(" ")
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();

  const computeProgress = (s: any) => {
    const total = s.syllabus?.length || 0;
    const done = (s.syllabus || []).filter((u: any) => u.completed).length;
    return total ? Math.round((done / total) * 100) : 0;
  };

  const getTotalHours = (id: string) =>
    Math.round(
      (logs
        .filter((l: any) => l.subjectId === id)
        .reduce((a: number, b: any) => a + (b.duration || 0), 0) /
        60) *
      10
    ) / 10;

  /* ---------------- FILE SAVE ---------------- */

  const processAndSaveFile = async (file: File) => {
    if (!selectedSubject) return;

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
          id: crypto.randomUUID(),
          title: file.name,
          fileData: base64,
          fileType: file.type,
          fileSize: file.size,
          dateAdded: new Date().toISOString().split("T")[0],
        },
      ],
    });
  };

  const openExternally = (r: any) => {
    const url = base64ToBlobUrl(r.fileData, r.fileType);

    // For Office docs, use Google Docs Viewer
    if (isOfficeDoc(r.fileType)) {
      // Create a temporary download to get the file URL
      const link = document.createElement('a');
      link.href = url;
      link.download = r.title;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Then open in Google Docs viewer (requires the file to be accessible via URL)
      // Alternative: Show a message to user
      alert(`Office documents can't be previewed in browser. File will be downloaded. You can open it with Microsoft Office or Google Docs.`);
    } else {
      window.open(url, "_blank");
    }
  };
  /* =====================================================
     RESOURCE VIEWER
  ===================================================== */

  if (selectedResource) {
    const canPreview =
      selectedResource.fileType.includes("pdf") ||
      selectedResource.fileType.startsWith("image") ||
      selectedResource.fileType.startsWith("video");

    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center">
        <button
          onClick={() => {
            setSpinClose(true);
            setTimeout(() => {
              setSpinClose(false);
              setSelectedResource(null);
            }, 250);
          }}
          className={`fixed top-6 right-6 p-3 bg-white/10 rounded-xl transition-transform ${spinClose ? "rotate-180 scale-90" : ""
            }`}
        >
          <X />
        </button>

        <div className="w-full max-w-6xl h-[90vh] bg-zinc-900 rounded-2xl border border-white/10 flex flex-col">
          <div className="p-4 border-b border-white/10 flex justify-between">
            <div className="font-bold truncate">
              {selectedResource.title}
            </div>
            <button
              onClick={() => openExternally(selectedResource)}
              className="px-4 py-2 bg-indigo-500/20 rounded-lg"
            >
              Open in new tab
            </button>
          </div>

          <div className="flex-1 bg-zinc-950 p-4">
            {canPreview ? (
              selectedResource.fileType.includes("pdf") ? (
                <iframe
                  src={previewUrl ?? ""}
                  className="w-full h-full bg-white rounded-lg"
                />
              ) : selectedResource.fileType.startsWith("image") ? (
                <img
                  src={previewUrl ?? ""}
                  className="max-w-full max-h-full mx-auto"
                />
              ) : (
                <video
                  src={previewUrl ?? ""}
                  controls
                  className="w-full h-full"
                />
              )
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-center">
                Preview not supported for this file type.<br />
                Use “Open in new tab”.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* =====================================================
     SUBJECT DETAIL
  ===================================================== */

  if (selectedSubject) {
    const theme =
      themes[
      subjects.findIndex((s) => s.id === selectedSubject.id) % themes.length
      ];

    return (
      <div className="fixed inset-0 z-40 bg-black overflow-y-auto pt-16">
        <div className="max-w-[1400px] mx-auto p-6 space-y-6 pb-24">
          <button
            onClick={() => setSelectedSubjectId(null)}
            className="fixed top-20 right-6 p-3 bg-white/10 rounded-xl"
          >
            <X />
          </button>

          {/* HEADER */}
          <div className="flex items-center gap-4">
            <div
              className={`w-16 h-16 ${theme.bg} rounded-2xl flex items-center justify-center font-bold text-black`}
            >
              {getInitials(selectedSubject.name)}
            </div>
            <div>
              <h1 className="text-4xl font-bold">{selectedSubject.name}</h1>
              <div className="text-zinc-400 text-sm">
                {selectedSubject.code} • {selectedSubject.credits} credits
              </div>
            </div>
          </div>

          {/* STATS */}
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-xs text-zinc-500">Progress</div>
              <div className="text-4xl font-bold">
                {computeProgress(selectedSubject)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Study Time</div>
              <div className="text-4xl font-bold">
                {getTotalHours(selectedSubject.id)}h
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Grades</div>
              <div className="text-4xl font-bold">
                {(selectedSubject.grades || []).length}
              </div>
            </div>
          </div>

          {/* UNITS */}
          <div className="border border-white/10 rounded-2xl p-6">
            <h3 className="font-bold mb-4">Syllabus</h3>

            {(selectedSubject.syllabus || []).map((u: any) => (
              <div
                key={u.id}
                className="flex items-center gap-3 mb-2 cursor-pointer"
                onClick={() =>
                  db.subjects.update(selectedSubject.id, {
                    syllabus: selectedSubject.syllabus.map((x: any) =>
                      x.id === u.id
                        ? { ...x, completed: !x.completed }
                        : x
                    ),
                  })
                }
              >
                {u.completed ? (
                  <CheckSquare className="text-emerald-400" />
                ) : (
                  <Square />
                )}
                <span className={u.completed ? "line-through text-zinc-500" : ""}>
                  {u.title}
                </span>
              </div>
            ))}

            <div className="flex gap-2 mt-3">
              <input
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="Add unit"
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2"
              />
              <button
                onClick={async () => {
                  if (!newUnit.trim()) return;
                  await db.subjects.update(selectedSubject.id, {
                    syllabus: [
                      ...(selectedSubject.syllabus || []),
                      {
                        id: crypto.randomUUID(),
                        title: newUnit,
                        completed: false,
                      },
                    ],
                  });
                  setNewUnit("");
                }}
                className="px-4 py-2 bg-indigo-500/20 rounded-lg"
              >
                Add
              </button>
            </div>
          </div>

          {/* SESSION NOTES */}
          <div className="border border-white/10 rounded-2xl p-6">
            <h3 className="font-bold mb-4">Session Notes</h3>

            {logs
              .filter(
                (l: any) =>
                  l.subjectId === selectedSubject.id &&
                  l.notes &&
                  l.notes.trim()
              )
              .map((s: any) => (
                <div
                  key={s.id}
                  className="p-4 bg-zinc-900 rounded-xl border border-zinc-800 mb-3"
                >
                  <div className="flex justify-between text-xs text-zinc-500 mb-2">
                    <span>{s.type}</span>
                    <span>{s.duration} min</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{s.notes}</p>
                </div>
              ))}
          </div>

          {/* RESOURCES */}
          <div className="border border-white/10 rounded-2xl p-6">
            <h3 className="font-bold mb-4">Resources</h3>

            {(selectedSubject.resources || []).map((r: any) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg mb-2"
              >
                <span
                  className="truncate cursor-pointer"
                  onClick={() => setSelectedResource(r)}
                >
                  {r.title}
                </span>
                <Trash2
                  size={16}
                  className="text-red-400 cursor-pointer"
                  onClick={() =>
                    db.subjects.update(selectedSubject.id, {
                      resources: selectedSubject.resources.filter(
                        (x: any) => x.id !== r.id
                      ),
                    })
                  }
                />
              </div>
            ))}

            <label
              className={`mt-4 block px-4 py-3 text-sm text-center rounded-lg border cursor-pointer ${dragActive
                  ? "border-cyan-400 bg-cyan-500/20"
                  : "border-white/10 hover:border-cyan-500/40"
                }`}
              onDragEnter={() => setDragActive(true)}
              onDragLeave={() => setDragActive(false)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                setDragActive(false);
                for (const f of e.dataTransfer.files) {
                  await processAndSaveFile(f);
                }
              }}
            >
              <input
                type="file"
                multiple
                hidden
                onChange={async (e: any) => {
                  for (const f of e.target.files) {
                    await processAndSaveFile(f);
                  }
                }}
              />
              + Add files (PDF, images, videos, PPT, DOC)
            </label>
          </div>
        </div>
      </div>
    );
  }

  /* ================= MAIN LIST ================= */

  const filtered = subjects
    .filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) =>
      sortBy === "name"
        ? a.name.localeCompare(b.name)
        : (b.difficulty || 0) - (a.difficulty || 0)
    );

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
        </select>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {filtered.map((s, i) => {
          const t = themes[i % themes.length];
          const progress = computeProgress(s);
          return (
            <div
              key={s.id}
              onClick={() => setSelectedSubjectId(s.id)}
              className="cursor-pointer border border-white/10 rounded-2xl p-5 bg-white/[0.02] hover:border-indigo-500/30"
            >
              <div className="flex justify-between mb-4">
                <div className="flex gap-3">
                  <div
                    className={`w-12 h-12 ${t.bg} rounded-xl flex items-center justify-center font-bold text-black`}
                  >
                    {getInitials(s.name)}
                  </div>
                  <div>
                    <div className="font-bold">{s.name}</div>
                    <div className="text-xs text-zinc-400">
                      {s.code} • {s.credits} CR
                    </div>
                  </div>
                </div>
                <div className={`text-2xl font-bold ${t.text}`}>
                  {progress}%
                </div>
              </div>

              <div className="h-2 bg-white/5 rounded-full mb-3 overflow-hidden">
                <div
                  className={`${t.bg} h-full`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex gap-4 text-xs text-zinc-400">
                <div className="flex items-center gap-1">
                  <Clock size={12} /> {getTotalHours(s.id)}h
                </div>
                <div className="flex items-center gap-1">
                  <Target size={12} />{" "}
                  {(s.syllabus || []).filter((u: any) => !u.completed).length}{" "}
                  pending
                </div>
                <div className="flex items-center gap-1">
                  <Award size={12} /> {(s.grades || []).length} grades
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
