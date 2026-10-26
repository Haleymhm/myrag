"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type StoredDoc = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  created_at: string;
};

type Pending = {
  key: string;
  file: File;
  url: string;
  status: "idle" | "uploading" | "done" | "error";
  error?: string;
};

type ViewMode = "grid" | "table";
type TypeFilter = "all" | "pdf" | "image";
type SortOption = "newest" | "oldest" | "size-desc" | "name-asc";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
const ACCEPTED_STRING = ACCEPTED_TYPES.join(",");

function formatBytes(value: number | string): string {
  const bytes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return isoString;
  }
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "hace un momento";
    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours} h`;
    if (diffDays === 1) return "ayer";
    if (diffDays < 7) return `hace ${diffDays} días`;
    return formatDate(isoString).split(",")[0];
  } catch {
    return formatDate(isoString);
  }
}

function getFormatBadge(mimeType: string) {
  if (mimeType === "application/pdf") {
    return {
      label: "PDF",
      className:
        "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20",
    };
  }
  if (mimeType.startsWith("image/")) {
    const subtype = mimeType.replace("image/", "").toUpperCase();
    return {
      label: subtype,
      className:
        "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
    };
  }
  return {
    label: "DOC",
    className:
      "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20",
  };
}

function Preview({
  url,
  type,
  name,
  isInteractive = false,
}: {
  url: string;
  type: string;
  name: string;
  isInteractive?: boolean;
}) {
  if (type.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="h-full w-full object-contain p-2 transition-transform duration-200"
      />
    );
  }
  return (
    <iframe
      src={url}
      title={name}
      className={`h-full w-full border-0 ${isInteractive ? "" : "pointer-events-none"}`}
      loading="lazy"
    />
  );
}

export default function Home() {
  const searchInputId = useId();
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [stored, setStored] = useState<StoredDoc[]>([]);
  const [loadingStored, setLoadingStored] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedDoc, setSelectedDoc] = useState<StoredDoc | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<Set<string>>(new Set());

  const loadStored = useCallback(async () => {
    setLoadingStored(true);
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar documentos");
      setStored(data.documents ?? []);
      setDbError(null);
    } catch (error) {
      setDbError((error as Error).message);
    } finally {
      setLoadingStored(false);
    }
  }, []);

  useEffect(() => {
    void loadStored();
  }, [loadStored]);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Keyboard shortcut: Escape to close drawer; Ctrl+U / Cmd+U to upload
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedDoc) setSelectedDoc(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
        e.preventDefault();
        inputRef.current?.click();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDoc]);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const next: Pending[] = [];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") continue;
      const url = URL.createObjectURL(file);
      urlsRef.current.add(url);
      next.push({ key: crypto.randomUUID(), file, url, status: "idle" });
    }
    if (next.length) setPending((current) => [...current, ...next]);
  }, []);

  const removePending = useCallback((key: string) => {
    setPending((current) => {
      const target = current.find((item) => item.key === key);
      if (target) {
        URL.revokeObjectURL(target.url);
        urlsRef.current.delete(target.url);
      }
      return current.filter((item) => item.key !== key);
    });
  }, []);

  const clearDonePending = useCallback(() => {
    setPending((current) => {
      current.forEach((item) => {
        if (item.status === "done") {
          URL.revokeObjectURL(item.url);
          urlsRef.current.delete(item.url);
        }
      });
      return current.filter((item) => item.status !== "done");
    });
  }, []);

  const upload = useCallback(
    async (item: Pending) => {
      setPending((current) =>
        current.map((p) => (p.key === item.key ? { ...p, status: "uploading", error: undefined } : p)),
      );
      try {
        const formData = new FormData();
        formData.append("file", item.file, item.file.name);
        const res = await fetch("/api/documents", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Fallo en la subida");
        setPending((current) =>
          current.map((p) => (p.key === item.key ? { ...p, status: "done" } : p)),
        );
        await loadStored();
      } catch (error) {
        setPending((current) =>
          current.map((p) =>
            p.key === item.key ? { ...p, status: "error", error: (error as Error).message } : p,
          ),
        );
      }
    },
    [loadStored],
  );

  const uploadAll = useCallback(async () => {
    const queue = pending.filter((item) => item.status === "idle" || item.status === "error");
    for (const item of queue) {
      await upload(item);
    }
  }, [pending, upload]);

  const copyToClipboard = useCallback((text: string, id?: string) => {
    void navigator.clipboard.writeText(text);
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    }
  }, []);

  const copyDockerCommand = useCallback(() => {
    void navigator.clipboard.writeText("docker compose up -d");
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  }, []);

  // Filter and sort stored docs
  const filteredDocs = useMemo(() => {
    return stored
      .filter((doc) => {
        const matchesSearch = doc.filename.toLowerCase().includes(searchQuery.toLowerCase());
        const isPdf = doc.mime_type === "application/pdf";
        const isImage = doc.mime_type.startsWith("image/");
        if (!matchesSearch) return false;
        if (typeFilter === "pdf") return isPdf;
        if (typeFilter === "image") return isImage;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (sortBy === "size-desc") return Number(b.size_bytes) - Number(a.size_bytes);
        if (sortBy === "name-asc") return a.filename.localeCompare(b.filename);
        return 0;
      });
  }, [stored, searchQuery, typeFilter, sortBy]);

  // Aggregate stats
  const totalSizeBytes = useMemo(
    () => stored.reduce((acc, curr) => acc + (Number(curr.size_bytes) || 0), 0),
    [stored],
  );
  const pdfCount = useMemo(
    () => stored.filter((d) => d.mime_type === "application/pdf").length,
    [stored],
  );
  const imageCount = useMemo(
    () => stored.filter((d) => d.mime_type.startsWith("image/")).length,
    [stored],
  );

  const pendingCount = pending.filter((item) => item.status === "idle" || item.status === "error").length;
  const donePendingCount = pending.filter((item) => item.status === "done").length;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 antialiased dark:bg-[#09090b] dark:text-zinc-100">
      {/* Top Navigation Shell */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-zinc-50/90 backdrop-blur-md dark:border-zinc-800/80 dark:bg-[#09090b]/90">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-black">
              {/* Minimalist Faceted Document Glyph */}
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="m9 15 2 2 4-4" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight text-sm text-zinc-900 dark:text-white">
                  EXTRACTO
                </span>
                <span className="rounded bg-zinc-200/60 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  RAG Ingestion
                </span>
              </div>
            </div>
          </div>

          {/* Telemetry and System Health */}
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-900/70 md:flex">
              {dbError ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-zinc-600 dark:text-zinc-400">Base de datos desconectada</span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    pgvector activo · <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{stored.length}</span> docs
                  </span>
                  <span className="text-zinc-300 dark:text-zinc-700">|</span>
                  <span className="tabular-nums font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {formatBytes(totalSizeBytes)}
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 active:bg-zinc-950 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Subir</span>
              <kbd className="ml-1 hidden rounded bg-zinc-700/50 px-1 py-0.5 font-mono text-[11px] text-zinc-300 dark:bg-zinc-200 dark:text-zinc-600 sm:inline-block">
                ⌘U
              </kbd>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {/* Database Offline Alert */}
        {dbError && (
          <div className="mb-6 rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <h2 className="font-medium text-amber-900 dark:text-amber-200">
                    No se pudo conectar con el motor PostgreSQL / pgvector
                  </h2>
                  <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                    {dbError}. Inicia el contenedor Docker para habilitar la persistencia y búsqueda vectorial.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyDockerCommand}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 font-mono text-xs text-amber-900 shadow-sm transition hover:bg-amber-50 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-zinc-800"
                >
                  <code>docker compose up -d</code>
                  <span className="text-[11px] text-zinc-400">
                    {copiedCommand ? "✓ Copiado" : "Copiar"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void loadStored()}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700"
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ingestion Dropzone */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
            dragging
              ? "border-zinc-900 bg-zinc-100/80 dark:border-zinc-100 dark:bg-zinc-900/60"
              : "border-zinc-200 bg-white/40 hover:border-zinc-400 hover:bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/20 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/40"
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-xs transition-transform duration-200 group-hover:scale-105 dark:border-zinc-800 dark:bg-zinc-900">
            <svg
              className="h-6 w-6 text-zinc-500 transition-colors group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-100"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
              <path d="M12 12v9" />
              <path d="m8 16 4-4 4 4" />
            </svg>
          </div>
          <p className="mt-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Arrastra tus documentos aquí o{" "}
            <span className="text-zinc-950 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-950 dark:text-white dark:decoration-zinc-700 dark:hover:decoration-white">
              selecciona archivos
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">PDF</span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">PNG</span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">JPEG</span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">WEBP</span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">GIF</span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span>Almacenamiento directo en PostgreSQL con vector embedding</span>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_STRING}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </section>

        {/* Staging Queue */}
        {pending.length > 0 && (
          <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-900">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
                  Cola de procesamiento ({pending.length})
                </h2>
                {donePendingCount > 0 && (
                  <button
                    type="button"
                    onClick={clearDonePending}
                    className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-300"
                  >
                    Limpiar completados ({donePendingCount})
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    pending.forEach((p) => URL.revokeObjectURL(p.url));
                    urlsRef.current.clear();
                    setPending([]);
                  }}
                  className="rounded-lg px-2.5 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                >
                  Cancelar todo
                </button>
                <button
                  type="button"
                  onClick={uploadAll}
                  disabled={pendingCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900"
                >
                  {pendingCount > 0 ? (
                    <>
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                      <span>Subir {pendingCount} {pendingCount === 1 ? "archivo" : "archivos"}</span>
                    </>
                  ) : (
                    <span>Todos guardados</span>
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {pending.map((item) => {
                const badge = getFormatBadge(item.file.type);
                return (
                  <div
                    key={item.key}
                    className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/50 transition-colors dark:border-zinc-800/80 dark:bg-zinc-900/40"
                  >
                    <div className="relative h-32 w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                      <Preview url={item.url} type={item.file.type} name={item.file.name} />
                      <span
                        className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wider ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="flex flex-1 flex-col p-3">
                      <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <p className="mt-0.5 text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                        {formatBytes(item.file.size)}
                      </p>

                      <div className="mt-auto flex items-center justify-between pt-3">
                        <div>
                          {item.status === "idle" && (
                            <span className="text-[11px] text-zinc-500">En espera</span>
                          )}
                          {item.status === "uploading" && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-700 dark:text-zinc-300">
                              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              Guardando...
                            </span>
                          )}
                          {item.status === "done" && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Guardado
                            </span>
                          )}
                          {item.status === "error" && (
                            <span className="text-[11px] text-red-500" title={item.error}>
                              Error al subir
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {item.status === "idle" && (
                            <button
                              type="button"
                              onClick={() => void upload(item)}
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              Subir
                            </button>
                          )}
                          {item.status === "error" && (
                            <button
                              type="button"
                              onClick={() => void upload(item)}
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-zinc-800"
                            >
                              Reintentar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removePending(item.key)}
                            className="rounded p-1 text-zinc-400 hover:text-red-500"
                            title="Quitar de la lista"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Corpus Management Workspace */}
        <section className="mt-10">
          {/* Section Toolbar */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
                Corpus Documental
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {stored.length === 0
                  ? "Sin documentos almacenados"
                  : `${stored.length} documentos indexados · ${pdfCount} PDFs · ${imageCount} imágenes`}
              </p>
            </div>

            {/* Filter and View Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search input */}
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <label htmlFor={searchInputId} className="sr-only">Buscar por nombre</label>
                <svg
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  id={searchInputId}
                  type="text"
                  placeholder="Buscar por nombre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-7 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Type Filter Buttons */}
              <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setTypeFilter("all")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    typeFilter === "all"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Todos ({stored.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter("pdf")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    typeFilter === "pdf"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  PDFs ({pdfCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter("image")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    typeFilter === "image"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Imágenes ({imageCount})
                </button>
              </div>

              {/* Sort Selector */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <option value="newest">Más recientes</option>
                <option value="oldest">Más antiguos</option>
                <option value="size-desc">Mayor tamaño</option>
                <option value="name-asc">Nombre (A-Z)</option>
              </select>

              {/* View Mode Toggle */}
              <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  title="Vista de cuadrícula"
                  className={`rounded-md p-1.5 transition ${
                    viewMode === "grid"
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                      : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  title="Vista de tabla técnica"
                  className={`rounded-md p-1.5 transition ${
                    viewMode === "table"
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                      : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Stored Documents Listing */}
          {loadingStored ? (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Cargando corpus documental...</span>
              </div>
            </div>
          ) : stored.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-white">
                No hay documentos en el corpus
              </h3>
              <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
                Comienza arrastrando archivos PDF o imágenes arriba para almacenarlos en PostgreSQL y prepararlos para recuperación RAG.
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Cargar primer documento
              </button>
            </div>
          ) : filteredDocs.length === 0 ? (
            /* Zero Filter Results */
            <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Ningún documento coincide con los filtros
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Prueba buscando otro término o restablece los filtros activos.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setTypeFilter("all");
                }}
                className="mt-3 rounded-md bg-zinc-100 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Restablecer filtros
              </button>
            </div>
          ) : viewMode === "grid" ? (
            /* Grid View */
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredDocs.map((doc) => {
                const badge = getFormatBadge(doc.mime_type);
                const isSelected = selectedDoc?.id === doc.id;
                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-zinc-950 ${
                      isSelected
                        ? "border-zinc-900 ring-1 ring-zinc-900 dark:border-white dark:ring-white"
                        : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                    }`}
                  >
                    {/* Media Thumbnail */}
                    <div className="relative h-44 w-full overflow-hidden bg-zinc-100/70 dark:bg-zinc-900/50">
                      <Preview
                        url={`/api/documents/${doc.id}/file`}
                        type={doc.mime_type}
                        name={doc.filename}
                      />
                      <span
                        className={`absolute left-2.5 top-2.5 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wider ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      {/* Hover action overlay */}
                      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        <span className="rounded-lg bg-white/90 px-2.5 py-1 text-xs font-medium text-zinc-900 shadow-sm backdrop-blur-xs">
                          Inspeccionar
                        </span>
                      </div>
                    </div>

                    {/* Metadata Card Footer */}
                    <div className="flex flex-1 flex-col p-3.5">
                      <p
                        className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100"
                        title={doc.filename}
                      >
                        {doc.filename}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
                        <span className="tabular-nums font-mono">
                          {formatBytes(doc.size_bytes)}
                        </span>
                        <span>{formatRelativeTime(doc.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50/75 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Documento</th>
                      <th scope="col" className="px-4 py-3 font-medium">Formato</th>
                      <th scope="col" className="px-4 py-3 font-medium">Tamaño</th>
                      <th scope="col" className="px-4 py-3 font-medium">Fecha de ingesta</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {filteredDocs.map((doc) => {
                      const badge = getFormatBadge(doc.mime_type);
                      const isSelected = selectedDoc?.id === doc.id;
                      return (
                        <tr
                          key={doc.id}
                          onClick={() => setSelectedDoc(doc)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-zinc-100/70 dark:bg-zinc-900/70"
                              : "hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                                {doc.mime_type === "application/pdf" ? (
                                  <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                  </svg>
                                ) : (
                                  <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                  </svg>
                                )}
                              </div>
                              <span className="max-w-[260px] truncate font-medium text-zinc-800 dark:text-zinc-200 sm:max-w-md" title={doc.filename}>
                                {doc.filename}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wider ${badge.className}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 tabular-nums font-mono text-zinc-600 dark:text-zinc-400">
                            {formatBytes(doc.size_bytes)}
                          </td>
                          <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                            {formatDate(doc.created_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setSelectedDoc(doc)}
                                className="rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                              >
                                Inspeccionar
                              </button>
                              <a
                                href={`/api/documents/${doc.id}/file`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                                title="Abrir en pestaña nueva"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Deep Document Inspector Drawer */}
      {selectedDoc && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity duration-200"
          onClick={() => setSelectedDoc(null)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-2xl transition-transform dark:border-zinc-800 dark:bg-[#0c0c0e]"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="min-w-0 pr-4">
                <span className="text-[11px] font-mono text-zinc-400">
                  DOCUMENTO · {getFormatBadge(selectedDoc.mime_type).label}
                </span>
                <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white" title={selectedDoc.filename}>
                  {selectedDoc.filename}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                title="Cerrar (Esc)"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Live Document Preview Frame */}
            <div className="relative h-80 w-full overflow-hidden border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
              <Preview
                url={`/api/documents/${selectedDoc.id}/file`}
                type={selectedDoc.mime_type}
                name={selectedDoc.filename}
                isInteractive
              />
              <div className="absolute bottom-2 right-2 flex gap-1">
                <a
                  href={`/api/documents/${selectedDoc.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-zinc-900/80 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-xs hover:bg-zinc-900 dark:bg-zinc-100/90 dark:text-zinc-900 dark:hover:bg-white"
                >
                  Abrir original ↗
                </a>
              </div>
            </div>

            {/* Technical Metadata & Vector Info */}
            <div className="flex-1 overflow-y-auto p-6">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Metadatos Técnicos
              </h4>

              <dl className="mt-3 divide-y divide-zinc-100 text-xs dark:divide-zinc-900">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-zinc-500">ID (UUID)</dt>
                  <dd className="flex items-center gap-1.5 font-mono text-zinc-900 dark:text-zinc-100">
                    <span className="max-w-[200px] truncate">{selectedDoc.id}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedDoc.id, "drawer-id")}
                      className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      title="Copiar UUID"
                    >
                      {copiedId === "drawer-id" ? (
                        <span className="text-[11px] text-emerald-500 font-sans">✓ Copiado</span>
                      ) : (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  </dd>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-zinc-500">Tipo MIME</dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-100">{selectedDoc.mime_type}</dd>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-zinc-500">Tamaño de archivo</dt>
                  <dd className="tabular-nums font-mono text-zinc-900 dark:text-zinc-100">
                    {formatBytes(selectedDoc.size_bytes)} ({Number(selectedDoc.size_bytes).toLocaleString()} B)
                  </dd>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-zinc-500">Fecha de ingesta</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">{formatDate(selectedDoc.created_at)}</dd>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-zinc-500">Persistencia</dt>
                  <dd className="font-mono text-zinc-600 dark:text-zinc-400">PostgreSQL (documents.data bytea)</dd>
                </div>
              </dl>

              {/* RAG & Vector Info Card */}
              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-white">
                    Preparado para Vectorización RAG
                  </h4>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Este documento está listo para ser segmentado en <code className="font-mono text-zinc-700 dark:text-zinc-300">document_chunks</code> y recibir embeddings de 1536 dimensiones con índice HNSW en pgvector.
                </p>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="rounded bg-zinc-200/60 px-1.5 py-0.5 font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    vector(1536)
                  </span>
                  <span className="rounded bg-zinc-200/60 px-1.5 py-0.5 font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    vector_cosine_ops
                  </span>
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex gap-2">
                <a
                  href={`/api/documents/${selectedDoc.id}/file`}
                  download={selectedDoc.filename}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white py-2 text-center text-xs font-medium text-zinc-800 shadow-xs transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Descargar archivo
                </a>
                <button
                  type="button"
                  onClick={() => copyToClipboard(window.location.origin + `/api/documents/${selectedDoc.id}/file`, "drawer-link")}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {copiedId === "drawer-link" ? "¡Enlace copiado!" : "Copiar enlace"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
