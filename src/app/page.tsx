"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocumentType, AnalysisStatus } from "@/lib/db";
import type { VisionExtractionResult } from "@/lib/vision";

type StoredDoc = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  created_at: string;
  document_type?: DocumentType | null;
  extracted_data?: VisionExtractionResult | null;
  analysis_status?: AnalysisStatus | null;
  analysis_error?: string | null;
  analyzed_at?: string | null;
};

type Pending = {
  key: string;
  file: File;
  url: string;
  status: "idle" | "uploading" | "done" | "error";
  error?: string;
};

type ViewMode = "grid" | "table";
type CategoryFilter = "all" | "factura" | "recibo" | "contrato" | "pending";
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

function getTypeBadge(type?: DocumentType | null, status?: AnalysisStatus | null) {
  if (status === "processing") {
    return {
      label: "Analizando...",
      className:
        "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 animate-pulse",
    };
  }
  if (status === "failed") {
    return {
      label: "Error IA",
      className:
        "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20",
    };
  }
  switch (type) {
    case "factura":
      return {
        label: "Factura",
        className:
          "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
      };
    case "recibo":
      return {
        label: "Recibo",
        className:
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
      };
    case "contrato":
      return {
        label: "Contrato",
        className:
          "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20",
      };
    case "otro":
      return {
        label: "Otro Doc",
        className:
          "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border border-zinc-500/20",
      };
    default:
      return {
        label: "Sin analizar",
        className:
          "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700",
      };
  }
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
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedDoc, setSelectedDoc] = useState<StoredDoc | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"preview" | "extraction" | "json">("extraction");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);
  const [autoAnalyzeOnUpload, setAutoAnalyzeOnUpload] = useState(true);

  // Gemini API Key management
  const [apiKey, setApiKey] = useState<string>("");
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<Set<string>>(new Set());

  // Load API Key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("extracto_gemini_api_key");
    if (saved) {
      setApiKey(saved);
      setTempApiKey(saved);
    }
  }, []);

  const saveApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    setApiKey(trimmed);
    if (trimmed) {
      localStorage.setItem("extracto_gemini_api_key", trimmed);
    } else {
      localStorage.removeItem("extracto_gemini_api_key");
    }
    setShowKeyModal(false);
  }, []);

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

  // Keyboard shortcut: Escape to close drawer / modal; Ctrl+U / Cmd+U to upload
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showKeyModal) setShowKeyModal(false);
        else if (selectedDoc) setSelectedDoc(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
        e.preventDefault();
        inputRef.current?.click();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDoc, showKeyModal]);

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

  // Analyze single document with Vision LLM
  const analyzeDocument = useCallback(
    async (docId: string) => {
      setAnalyzingDocId(docId);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (apiKey) {
          headers["x-gemini-api-key"] = apiKey;
        }

        const res = await fetch(`/api/documents/${docId}/analyze`, {
          method: "POST",
          headers,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Fallo en el análisis de visión");

        // Update stored docs state with latest analysis
        setStored((current) =>
          current.map((d) => (d.id === docId ? data.document : d)),
        );

        // If active in drawer, update selectedDoc
        setSelectedDoc((current) => (current?.id === docId ? data.document : current));
      } catch (error) {
        const msg = (error as Error).message;
        alert(`Error al analizar documento: ${msg}`);
        await loadStored();
      } finally {
        setAnalyzingDocId(null);
      }
    },
    [apiKey, loadStored],
  );

  const upload = useCallback(
    async (item: Pending) => {
      setPending((current) =>
        current.map((p) =>
          p.key === item.key ? { ...p, status: "uploading", error: undefined } : p,
        ),
      );
      try {
        const formData = new FormData();
        formData.append("file", item.file, item.file.name);

        const headers: Record<string, string> = {};
        if (apiKey) {
          headers["x-gemini-api-key"] = apiKey;
        }

        const url = autoAnalyzeOnUpload
          ? "/api/documents?analyze=true"
          : "/api/documents";

        const res = await fetch(url, {
          method: "POST",
          headers,
          body: formData,
        });
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
    [apiKey, autoAnalyzeOnUpload, loadStored],
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
        if (!matchesSearch) return false;

        if (categoryFilter === "all") return true;
        if (categoryFilter === "factura") return doc.document_type === "factura";
        if (categoryFilter === "recibo") return doc.document_type === "recibo";
        if (categoryFilter === "contrato") return doc.document_type === "contrato";
        if (categoryFilter === "pending") return !doc.document_type;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (sortBy === "size-desc") return Number(b.size_bytes) - Number(a.size_bytes);
        if (sortBy === "name-asc") return a.filename.localeCompare(b.filename);
        return 0;
      });
  }, [stored, searchQuery, categoryFilter, sortBy]);

  // Aggregate stats
  const totalSizeBytes = useMemo(
    () => stored.reduce((acc, curr) => acc + (Number(curr.size_bytes) || 0), 0),
    [stored],
  );
  const facturaCount = useMemo(
    () => stored.filter((d) => d.document_type === "factura").length,
    [stored],
  );
  const reciboCount = useMemo(
    () => stored.filter((d) => d.document_type === "recibo").length,
    [stored],
  );
  const contratoCount = useMemo(
    () => stored.filter((d) => d.document_type === "contrato").length,
    [stored],
  );
  const pendingAnalysisCount = useMemo(
    () => stored.filter((d) => !d.document_type).length,
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-black">
              {/* Minimalist Document Vision Glyph */}
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M9 13h6" />
                <path d="M9 17h4" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight text-sm text-zinc-900 dark:text-white">
                  EXTRACTO
                </span>
                <span className="rounded bg-zinc-200/60 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  Visión LLM · Gemini 3.8
                </span>
              </div>
            </div>
          </div>

          {/* Telemetry and Controls */}
          <div className="flex items-center gap-3">
            {/* Gemini API Key status chip */}
            <button
              type="button"
              onClick={() => {
                setTempApiKey(apiKey);
                setShowKeyModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white/80 px-2.5 py-1 text-xs text-zinc-700 shadow-2xs transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
              title="Configurar clave API de Gemini"
            >
              <svg className="h-3.5 w-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2l-2 2m-1-1l2 2" />
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>{apiKey ? "API Key activa" : "Configurar API Key"}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${apiKey ? "bg-emerald-500" : "bg-amber-500"}`} />
            </button>

            <div className="hidden items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-900/70 md:flex">
              {dbError ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-zinc-600 dark:text-zinc-400">PostgreSQL desconectado</span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{stored.length}</span> docs
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-2xs transition-colors hover:bg-zinc-800 active:bg-zinc-950 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
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
                    {dbError}. Inicia el contenedor Docker para habilitar la persistencia.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyDockerCommand}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 font-mono text-xs text-amber-900 shadow-2xs transition hover:bg-amber-50 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-zinc-800"
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-2xs transition-transform duration-200 group-hover:scale-105 dark:border-zinc-800 dark:bg-zinc-900">
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
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span>Detección inteligente de Facturas, Recibos y Contratos</span>
          </div>

          {/* Auto-analyze Toggle */}
          <div
            className="mt-4 flex items-center gap-2 rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-300"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              id="auto-analyze"
              checked={autoAnalyzeOnUpload}
              onChange={(e) => setAutoAnalyzeOnUpload(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-0 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <label htmlFor="auto-analyze" className="cursor-pointer select-none text-[11px]">
              Analizar automáticamente con Visión IA al subir
            </label>
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
          <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950">
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
                              {autoAnalyzeOnUpload ? "Analizando y guardando..." : "Guardando..."}
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
                Corpus & Clasificación IA
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {stored.length === 0
                  ? "Sin documentos almacenados"
                  : `${stored.length} documentos · ${facturaCount} Facturas · ${reciboCount} Recibos · ${contratoCount} Contratos`}
              </p>
            </div>

            {/* Filter and View Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search input */}
              <div className="relative min-w-[180px] flex-1 sm:flex-initial">
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

              {/* Classification Category Filters */}
              <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setCategoryFilter("all")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    categoryFilter === "all"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Todos ({stored.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("factura")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    categoryFilter === "factura"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Facturas ({facturaCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("recibo")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    categoryFilter === "recibo"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Recibos ({reciboCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("contrato")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    categoryFilter === "contrato"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Contratos ({contratoCount})
                </button>
                {pendingAnalysisCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("pending")}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                      categoryFilter === "pending"
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    }`}
                  >
                    Pendientes ({pendingAnalysisCount})
                  </button>
                )}
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
                Sube facturas, recibos o contratos para analizarlos con visión artificial y extraer sus datos estructurados en formato JSON.
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
                  setCategoryFilter("all");
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
                const typeBadge = getTypeBadge(doc.document_type, doc.analysis_status);
                const isSelected = selectedDoc?.id === doc.id;
                const isAnalyzing = analyzingDocId === doc.id || doc.analysis_status === "processing";

                return (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setSelectedDoc(doc);
                      setInspectorTab(doc.extracted_data ? "extraction" : "preview");
                    }}
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
                      {/* Format and Type Tags */}
                      <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wider ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${typeBadge.className}`}
                        >
                          {typeBadge.label}
                        </span>
                      </div>

                      {/* Quick Inspect Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        <span className="rounded-lg bg-white/95 px-2.5 py-1 text-xs font-medium text-zinc-900 shadow-sm backdrop-blur-xs">
                          {doc.extracted_data ? "Ver Extracción JSON" : "Inspeccionar"}
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

                      {/* AI Extraction Status or Trigger */}
                      <div className="mt-2.5 flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-900" onClick={(e) => e.stopPropagation()}>
                        {doc.extracted_data ? (
                          <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>Datos extraídos</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void analyzeDocument(doc.id)}
                            disabled={isAnalyzing}
                            className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          >
                            {isAnalyzing ? (
                              <>
                                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                <span>Analizando...</span>
                              </>
                            ) : (
                              <>
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                                <span>Analizar con IA</span>
                              </>
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDoc(doc);
                            setInspectorTab("extraction");
                          }}
                          className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        >
                          Detalles ↗
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xs dark:border-zinc-800 dark:bg-zinc-950">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50/75 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Documento</th>
                      <th scope="col" className="px-4 py-3 font-medium">Tipo Detectado</th>
                      <th scope="col" className="px-4 py-3 font-medium">Formato</th>
                      <th scope="col" className="px-4 py-3 font-medium">Tamaño</th>
                      <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Extracción IA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {filteredDocs.map((doc) => {
                      const badge = getFormatBadge(doc.mime_type);
                      const typeBadge = getTypeBadge(doc.document_type, doc.analysis_status);
                      const isSelected = selectedDoc?.id === doc.id;
                      const isAnalyzing = analyzingDocId === doc.id || doc.analysis_status === "processing";

                      return (
                        <tr
                          key={doc.id}
                          onClick={() => {
                            setSelectedDoc(doc);
                            setInspectorTab(doc.extracted_data ? "extraction" : "preview");
                          }}
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
                              <span className="max-w-[220px] truncate font-medium text-zinc-800 dark:text-zinc-200 sm:max-w-xs" title={doc.filename}>
                                {doc.filename}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${typeBadge.className}`}>
                              {typeBadge.label}
                            </span>
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
                              {doc.extracted_data ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedDoc(doc);
                                    setInspectorTab("extraction");
                                  }}
                                  className="rounded px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-zinc-800"
                                >
                                  Ver JSON
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void analyzeDocument(doc.id)}
                                  disabled={isAnalyzing}
                                  className="rounded bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                >
                                  {isAnalyzing ? "Analizando..." : "Analizar con IA"}
                                </button>
                              )}
                              <a
                                href={`/api/documents/${doc.id}/file`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                                title="Abrir archivo original"
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
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-2xs transition-opacity duration-200"
          onClick={() => setSelectedDoc(null)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-2xl flex-col border-l border-zinc-200 bg-white shadow-2xl transition-transform dark:border-zinc-800 dark:bg-[#0c0c0e]"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-zinc-400">
                    {getFormatBadge(selectedDoc.mime_type).label}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      getTypeBadge(selectedDoc.document_type, selectedDoc.analysis_status).className
                    }`}
                  >
                    {getTypeBadge(selectedDoc.document_type, selectedDoc.analysis_status).label}
                  </span>
                </div>
                <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white" title={selectedDoc.filename}>
                  {selectedDoc.filename}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void analyzeDocument(selectedDoc.id)}
                  disabled={analyzingDocId === selectedDoc.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-2xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {analyzingDocId === selectedDoc.id ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Analizando...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span>{selectedDoc.extracted_data ? "Re-analizar" : "Analizar con IA"}</span>
                    </>
                  )}
                </button>
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
            </div>

            {/* Inspector Navigation Tabs */}
            <div className="flex border-b border-zinc-200 px-6 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setInspectorTab("extraction")}
                className={`border-b-2 py-2.5 text-xs font-medium transition ${
                  inspectorTab === "extraction"
                    ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                Extracción Estructurada IA
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab("json")}
                className={`ml-6 border-b-2 py-2.5 text-xs font-medium transition ${
                  inspectorTab === "json"
                    ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                JSON Crudo
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab("preview")}
                className={`ml-6 border-b-2 py-2.5 text-xs font-medium transition ${
                  inspectorTab === "preview"
                    ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                Visor de Archivo
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-6">
              {inspectorTab === "extraction" && (
                <div>
                  {!selectedDoc.extracted_data ? (
                    /* Not analyzed yet */
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </div>
                      <h4 className="mt-3 text-xs font-semibold text-zinc-900 dark:text-white">
                        Documento pendiente de análisis
                      </h4>
                      <p className="mt-1 max-w-xs text-[11px] text-zinc-500 dark:text-zinc-400">
                        Envía este archivo al modelo multimodal Gemini 3.8 Flash para clasificarlo como factura, recibo o contrato y extraer sus datos en JSON.
                      </p>
                      <button
                        type="button"
                        onClick={() => void analyzeDocument(selectedDoc.id)}
                        disabled={analyzingDocId === selectedDoc.id}
                        className="mt-4 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
                      >
                        {analyzingDocId === selectedDoc.id ? "Analizando..." : "Iniciar Análisis con Visión IA"}
                      </button>
                    </div>
                  ) : (
                    /* Structured Extraction View */
                    <div className="space-y-6">
                      {/* Summary Banner */}
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                                getTypeBadge(selectedDoc.extracted_data.tipo_documento).className
                              }`}
                            >
                              {selectedDoc.extracted_data.tipo_documento}
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              Confianza: {(selectedDoc.extracted_data.confianza * 100).toFixed(0)}%
                            </span>
                          </div>
                          {selectedDoc.extracted_data.idioma && (
                            <span className="text-[11px] font-mono text-zinc-400">
                              Idioma: {selectedDoc.extracted_data.idioma.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <p className="mt-2.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                          {selectedDoc.extracted_data.resumen}
                        </p>
                      </div>

                      {/* Factura View */}
                      {selectedDoc.extracted_data.tipo_documento === "factura" &&
                        selectedDoc.extracted_data.datos_extraidos.factura && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/60">
                                <span className="text-[11px] font-medium text-zinc-400">Emisor</span>
                                <p className="mt-1 font-semibold text-zinc-900 dark:text-white">
                                  {selectedDoc.extracted_data.datos_extraidos.factura.emisor?.nombre ?? "—"}
                                </p>
                                <p className="text-[11px] text-zinc-500 font-mono">
                                  {selectedDoc.extracted_data.datos_extraidos.factura.emisor?.identificacion_fiscal ?? ""}
                                </p>
                              </div>
                              <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/60">
                                <span className="text-[11px] font-medium text-zinc-400">Receptor</span>
                                <p className="mt-1 font-semibold text-zinc-900 dark:text-white">
                                  {selectedDoc.extracted_data.datos_extraidos.factura.receptor?.nombre ?? "—"}
                                </p>
                                <p className="text-[11px] text-zinc-500 font-mono">
                                  {selectedDoc.extracted_data.datos_extraidos.factura.receptor?.identificacion_fiscal ?? ""}
                                </p>
                              </div>
                            </div>

                            <dl className="grid grid-cols-3 gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
                              <div>
                                <dt className="text-[11px] text-zinc-400">N° Factura</dt>
                                <dd className="font-mono font-medium text-zinc-900 dark:text-white">
                                  {selectedDoc.extracted_data.datos_extraidos.factura.numero_factura ?? "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[11px] text-zinc-400">Fecha Emisión</dt>
                                <dd className="text-zinc-900 dark:text-white">
                                  {selectedDoc.extracted_data.datos_extraidos.factura.fecha_emision ?? "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[11px] text-zinc-400">Total a pagar</dt>
                                <dd className="tabular-nums font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                  {selectedDoc.extracted_data.datos_extraidos.factura.moneda ?? "$"}{" "}
                                  {selectedDoc.extracted_data.datos_extraidos.factura.total?.toLocaleString() ?? "—"}
                                </dd>
                              </div>
                            </dl>

                            {/* Items table */}
                            {selectedDoc.extracted_data.datos_extraidos.factura.items &&
                              selectedDoc.extracted_data.datos_extraidos.factura.items.length > 0 && (
                                <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-zinc-50 text-[11px] text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                                      <tr>
                                        <th className="px-3 py-2 font-medium">Concepto / Ítem</th>
                                        <th className="px-2 py-2 text-right font-medium">Cant.</th>
                                        <th className="px-2 py-2 text-right font-medium">P. Unit</th>
                                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                                      {selectedDoc.extracted_data.datos_extraidos.factura.items.map((it, idx) => (
                                        <tr key={idx}>
                                          <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">{it.descripcion}</td>
                                          <td className="px-2 py-2 text-right tabular-nums text-zinc-500">{it.cantidad ?? "1"}</td>
                                          <td className="px-2 py-2 text-right tabular-nums font-mono text-zinc-600 dark:text-zinc-400">{it.precio_unitario?.toLocaleString() ?? "—"}</td>
                                          <td className="px-3 py-2 text-right tabular-nums font-mono font-medium text-zinc-900 dark:text-white">{it.subtotal?.toLocaleString() ?? "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                          </div>
                        )}

                      {/* Recibo View */}
                      {selectedDoc.extracted_data.tipo_documento === "recibo" &&
                        selectedDoc.extracted_data.datos_extraidos.recibo && (
                          <div className="space-y-4">
                            <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/60">
                              <span className="text-[11px] font-medium text-zinc-400">Comercio / Establecimiento</span>
                              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
                                {selectedDoc.extracted_data.datos_extraidos.recibo.establecimiento ?? "—"}
                              </p>
                              {selectedDoc.extracted_data.datos_extraidos.recibo.fecha_hora && (
                                <p className="text-[11px] text-zinc-500">
                                  {selectedDoc.extracted_data.datos_extraidos.recibo.fecha_hora}
                                </p>
                              )}
                            </div>

                            <dl className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
                              <div>
                                <dt className="text-[11px] text-zinc-400">N° Recibo / Ticket</dt>
                                <dd className="font-mono font-medium text-zinc-900 dark:text-white">
                                  {selectedDoc.extracted_data.datos_extraidos.recibo.numero_recibo ?? "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[11px] text-zinc-400">Método de Pago</dt>
                                <dd className="text-zinc-900 dark:text-white">
                                  {selectedDoc.extracted_data.datos_extraidos.recibo.metodo_pago ?? "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[11px] text-zinc-400">Total Abonado</dt>
                                <dd className="tabular-nums font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                  ${selectedDoc.extracted_data.datos_extraidos.recibo.total?.toLocaleString() ?? "—"}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        )}

                      {/* Contrato View */}
                      {selectedDoc.extracted_data.tipo_documento === "contrato" &&
                        selectedDoc.extracted_data.datos_extraidos.contrato && (
                          <div className="space-y-4">
                            <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/60">
                              <span className="text-[11px] font-medium text-zinc-400">Título del Contrato</span>
                              <p className="mt-1 font-semibold text-zinc-900 dark:text-white">
                                {selectedDoc.extracted_data.datos_extraidos.contrato.titulo ?? "Contrato"}
                              </p>
                              <p className="mt-0.5 text-[11px] text-zinc-500">
                                Tipo: {selectedDoc.extracted_data.datos_extraidos.contrato.tipo_contrato ?? "Acuerdo Legal"}
                              </p>
                            </div>

                            {/* Partes involucradas */}
                            {selectedDoc.extracted_data.datos_extraidos.contrato.partes && (
                              <div className="space-y-2">
                                <h5 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Partes Intervinientes</h5>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {selectedDoc.extracted_data.datos_extraidos.contrato.partes.map((p, idx) => (
                                    <div key={idx} className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/30">
                                      <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">{p.rol}</span>
                                      <p className="font-semibold text-zinc-900 dark:text-white">{p.nombre}</p>
                                      {p.identificacion && <p className="text-[11px] font-mono text-zinc-400">{p.identificacion}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Cláusulas Clave */}
                            {selectedDoc.extracted_data.datos_extraidos.contrato.clausulas_clave && (
                              <div className="space-y-2">
                                <h5 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Cláusulas Clave Extraídas</h5>
                                <div className="space-y-2">
                                  {selectedDoc.extracted_data.datos_extraidos.contrato.clausulas_clave.map((c, idx) => (
                                    <div key={idx} className="rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
                                      <p className="font-semibold text-zinc-900 dark:text-white">
                                        {c.numero ? `${c.numero}. ` : ""}{c.titulo}
                                      </p>
                                      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">{c.resumen}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              )}

              {/* Raw JSON Viewer Tab */}
              {inspectorTab === "json" && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-400">
                      Esquema JSON Extraído
                    </span>
                    {selectedDoc.extracted_data && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(JSON.stringify(selectedDoc.extracted_data, null, 2), "json-copy")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 shadow-2xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        {copiedId === "json-copy" ? (
                          <>
                            <span className="text-emerald-500 font-sans">✓ Copiado</span>
                          </>
                        ) : (
                          <>
                            <svg className="h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            <span>Copiar JSON</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {selectedDoc.extracted_data ? (
                    <pre className="max-h-[500px] overflow-auto rounded-xl border border-zinc-200 bg-zinc-950 p-4 font-mono text-[11px] text-zinc-200 dark:border-zinc-800">
                      <code>{JSON.stringify(selectedDoc.extracted_data, null, 2)}</code>
                    </pre>
                  ) : (
                    <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
                      No hay JSON extraído todavía. Ejecuta el análisis con visión artificial para generar el esquema estructurado.
                    </div>
                  )}
                </div>
              )}

              {/* File Preview Tab */}
              {inspectorTab === "preview" && (
                <div>
                  <div className="relative h-80 w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                    <Preview
                      url={`/api/documents/${selectedDoc.id}/file`}
                      type={selectedDoc.mime_type}
                      name={selectedDoc.filename}
                      isInteractive
                    />
                  </div>

                  <dl className="mt-6 divide-y divide-zinc-100 text-xs dark:divide-zinc-900">
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
                      <dt className="text-zinc-500">Tamaño</dt>
                      <dd className="tabular-nums font-mono text-zinc-900 dark:text-zinc-100">
                        {formatBytes(selectedDoc.size_bytes)} ({Number(selectedDoc.size_bytes).toLocaleString()} B)
                      </dd>
                    </div>

                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-zinc-500">Fecha de ingesta</dt>
                      <dd className="text-zinc-900 dark:text-zinc-100">{formatDate(selectedDoc.created_at)}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex gap-2">
                <a
                  href={`/api/documents/${selectedDoc.id}/file`}
                  download={selectedDoc.filename}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white py-2 text-center text-xs font-medium text-zinc-800 shadow-2xs transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Descargar archivo original
                </a>
                <a
                  href={`/api/documents/${selectedDoc.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Abrir en pestaña ↗
                </a>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Gemini API Key Configuration Modal */}
      {showKeyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs"
          onClick={() => setShowKeyModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-[#121215]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                Clave API de Google Gemini (Visión LLM)
              </h3>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Para analizar y extraer datos de facturas, recibos y contratos, se utiliza el modelo multimodal <code className="font-mono text-zinc-700 dark:text-zinc-300">gemini-3.8-flash</code>.
            </p>

            <div className="mt-4">
              <label htmlFor="gemini-key-input" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Gemini API Key
              </label>
              <input
                id="gemini-key-input"
                type="password"
                placeholder="AIzaSy..."
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-600"
              />
              <p className="mt-1.5 text-[11px] text-zinc-400">
                Puedes obtener una clave gratuita en{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-700 underline dark:text-zinc-300"
                >
                  Google AI Studio ↗
                </a>
                . También puedes definirla como <code className="font-mono">GEMINI_API_KEY</code> en tu archivo <code className="font-mono">.env.local</code>.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => saveApiKey(tempApiKey)}
                className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Guardar Clave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
