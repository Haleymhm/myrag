"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

const ACCEPTED = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

function formatBytes(value: number | string): string {
  const bytes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function Preview({ url, type, name }: { url: string; type: string; name: string }) {
  if (type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-full w-full object-contain" />;
  }
  return <iframe src={url} title={name} className="h-full w-full" />;
}

export default function Home() {
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [stored, setStored] = useState<StoredDoc[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<Set<string>>(new Set());

  const loadStored = useCallback(async () => {
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load documents");
      setStored(data.documents);
      setDbError(null);
    } catch (error) {
      setDbError((error as Error).message);
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

  const upload = useCallback(
    async (item: Pending) => {
      setPending((current) =>
        current.map((p) => (p.key === item.key ? { ...p, status: "uploading" } : p)),
      );
      try {
        const formData = new FormData();
        formData.append("file", item.file, item.file.name);
        const res = await fetch("/api/documents", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
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

  const pendingCount = pending.filter(
    (item) => item.status === "idle" || item.status === "error",
  ).length;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Extracto</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Sube imágenes o PDF y previsualízalos al instante. Los archivos se guardan en
          PostgreSQL con pgvector.
        </p>
      </header>

      <section
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
          dragging
            ? "border-black bg-zinc-100 dark:border-white dark:bg-zinc-900"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="mb-4 h-10 w-10 text-zinc-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v12" />
          <path d="m7 8 5-5 5 5" />
          <path d="M5 21h14" />
        </svg>
        <p className="text-base font-medium">Arrastra archivos aquí o haz clic para seleccionar</p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">PNG, JPEG, WEBP, GIF o PDF</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </section>

      {pending.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium">Vista previa ({pending.length})</h2>
            <button
              type="button"
              onClick={uploadAll}
              disabled={pendingCount === 0}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-black"
            >
              {pendingCount > 0 ? `Subir ${pendingCount}` : "Subido"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {pending.map((item) => (
              <div
                key={item.key}
                className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="h-40 w-full bg-zinc-100 dark:bg-zinc-900">
                  <Preview url={item.url} type={item.file.type} name={item.file.name} />
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="truncate text-sm font-medium" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatBytes(item.file.size)}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="text-xs">
                      {item.status === "uploading" && "Subiendo..."}
                      {item.status === "done" && "✓ Guardado"}
                      {item.status === "error" && (
                        <span className="text-red-500">{item.error}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePending(item.key)}
                      className="text-xs text-zinc-400 hover:text-red-500"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-medium">Documentos guardados</h2>
        {dbError && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            No se pudo conectar con PostgreSQL: {dbError}. ¿Está corriendo el contenedor?{" "}
            <code>docker compose up -d</code>
          </p>
        )}
        {!dbError && stored.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Todavía no hay documentos.</p>
        )}
        {stored.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {stored.map((doc) => (
              <a
                key={doc.id}
                href={`/api/documents/${doc.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
              >
                <div className="h-40 w-full bg-zinc-100 dark:bg-zinc-900">
                  <Preview
                    url={`/api/documents/${doc.id}/file`}
                    type={doc.mime_type}
                    name={doc.filename}
                  />
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium" title={doc.filename}>
                    {doc.filename}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatBytes(doc.size_bytes)} ·{" "}
                    {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
