/**
 * Helpers compartidos para los tests de las API routes.
 *
 * - `createFakeDb()` implementa un Postgres in-memory que emula las consultas
 *   que ejecuta la aplicación, de modo que los tests puedan comprobar tanto
 *   la respuesta HTTP como el estado persistido.
 * - Los builders de request reproducen exactamente lo que llega desde el
 *   navegador (multipart FormData, headers de API key, query params).
 */

import { vi } from "vitest";

export type FakeDocument = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  data: Buffer;
  created_at: string;
  document_type: string | null;
  extracted_data: Record<string, unknown> | null;
  analysis_status: string | null;
  analysis_error: string | null;
  analyzed_at: string | null;
};

export type FakeDbCall = { sql: string; params: unknown[] };

export type FakeDb = {
  docs: FakeDocument[];
  calls: FakeDbCall[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  seed: (partial?: Partial<FakeDocument>) => FakeDocument;
  reset: () => void;
};

/** Fila que devuelve la app (sin la columna `data`, que no se selecciona). */
function toRow(doc: FakeDocument) {
  return {
    id: doc.id,
    filename: doc.filename,
    mime_type: doc.mime_type,
    size_bytes: doc.size_bytes,
    created_at: doc.created_at,
    document_type: doc.document_type,
    extracted_data: doc.extracted_data,
    analysis_status: doc.analysis_status,
    analysis_error: doc.analysis_error,
    analyzed_at: doc.analyzed_at,
  };
}

export function createFakeDb(): FakeDb {
  const docs: FakeDocument[] = [];
  const calls: FakeDbCall[] = [];
  let counter = 0;

  const query = async (
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: unknown[] }> => {
    const text = sql.replace(/\s+/g, " ").trim();
    calls.push({ sql: text, params });

    if (text.startsWith("INSERT INTO documents")) {
      counter += 1;
      const doc: FakeDocument = {
        id: `doc-${counter}`,
        filename: String(params[0]),
        mime_type: String(params[1]),
        size_bytes: String(params[2]),
        data: params[3] as Buffer,
        created_at: new Date(2024, 0, 1 + counter).toISOString(),
        document_type: null,
        extracted_data: null,
        analysis_status: "pending",
        analysis_error: null,
        analyzed_at: null,
      };
      docs.push(doc);
      return { rows: [toRow(doc)] };
    }

    if (text.startsWith("UPDATE documents SET document_type")) {
      const doc = docs.find((d) => d.id === params[2]);
      if (doc) {
        doc.document_type = String(params[0]);
        doc.extracted_data = JSON.parse(String(params[1])) as Record<
          string,
          unknown
        >;
        doc.analysis_status = "completed";
        doc.analysis_error = null;
        doc.analyzed_at = new Date(2024, 1, 1).toISOString();
      }
      return { rows: doc ? [toRow(doc)] : [] };
    }

    if (text.includes("analysis_status = 'failed'")) {
      const doc = docs.find((d) => d.id === params[1]);
      if (doc) {
        doc.analysis_status = "failed";
        doc.analysis_error = String(params[0]);
      }
      return { rows: [] };
    }

    if (text.includes("analysis_status = 'processing'")) {
      const doc = docs.find((d) => d.id === params[0]);
      if (doc) {
        doc.analysis_status = "processing";
        doc.analysis_error = null;
      }
      return { rows: [] };
    }

    if (text.startsWith("SELECT filename, mime_type, data")) {
      const doc = docs.find((d) => d.id === params[0]);
      return {
        rows: doc
          ? [
              {
                filename: doc.filename,
                mime_type: doc.mime_type,
                data: doc.data,
              },
            ]
          : [],
      };
    }

    if (text.startsWith("SELECT id, filename, mime_type, data")) {
      const doc = docs.find((d) => d.id === params[0]);
      return {
        rows: doc
          ? [
              {
                id: doc.id,
                filename: doc.filename,
                mime_type: doc.mime_type,
                data: doc.data,
              },
            ]
          : [],
      };
    }

    if (text.startsWith("SELECT id, filename, mime_type, size_bytes")) {
      return { rows: docs.map(toRow) };
    }

    throw new Error(`FakeDb: consulta no soportada → ${text}`);
  };

  const seed = (partial: Partial<FakeDocument> = {}): FakeDocument => {
    counter += 1;
    const doc: FakeDocument = {
      id: partial.id ?? `doc-${counter}`,
      filename: partial.filename ?? "factura.pdf",
      mime_type: partial.mime_type ?? "application/pdf",
      size_bytes: partial.size_bytes ?? "4",
      data: partial.data ?? Buffer.from("%PDF-1.7"),
      created_at: partial.created_at ?? new Date(2024, 0, 1).toISOString(),
      document_type: partial.document_type ?? null,
      extracted_data: partial.extracted_data ?? null,
      analysis_status: partial.analysis_status ?? "pending",
      analysis_error: partial.analysis_error ?? null,
      analyzed_at: partial.analyzed_at ?? null,
    };
    docs.push(doc);
    return doc;
  };

  return {
    docs,
    calls,
    query,
    seed,
    reset: () => {
      docs.length = 0;
      calls.length = 0;
      counter = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Builders de archivos y requests
// ---------------------------------------------------------------------------

export const PDF_CONTENT = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF";
export const PNG_CONTENT = "\x89PNG\r\n\x1a\nfake-image-bytes";

export function createFile(options?: {
  name?: string;
  type?: string;
  content?: string;
}): File {
  const name = options?.name ?? "factura.pdf";
  const type = options?.type ?? "application/pdf";
  const content = options?.content ?? PDF_CONTENT;
  return new File([content], name, { type });
}

/** Request multipart equivalente al que envía el dropzone del frontend. */
export function buildUploadRequest(
  file?: File | null,
  options?: { analyze?: boolean; headers?: Record<string, string> },
): Request {
  const formData = new FormData();
  if (file) formData.append("file", file, file.name);

  const query = options?.analyze ? "?analyze=true" : "";
  return new Request(`http://localhost:3000/api/documents${query}`, {
    method: "POST",
    body: formData,
    headers: options?.headers,
  });
}

/** Request para `/api/documents/:id/analyze`. */
export function buildAnalyzeRequest(
  id: string,
  options?: { headers?: Record<string, string>; body?: unknown },
): Request {
  return new Request(`http://localhost:3000/api/documents/${id}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

/** Mock del módulo `@/lib/vision` con la extracción por defecto. */
export function mockVision() {
  return {
    analyzeDocumentWithVision: vi.fn(),
  };
}
