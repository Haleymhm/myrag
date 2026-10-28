/**
 * Tests para POST /api/documents/[id]/analyze (análisis con Visión LLM).
 *
 * Casos cubiertos:
 *  ✅ Analiza un PDF COMPLETO → 200, extracción validada y persistida
 *  ✅ Marca el documento como "processing" antes de llamar al modelo
 *  ✅ Usa la API key del header x-openrouter-api-key
 *  ✅ Usa la API key del body JSON
 *  ❌ Documento inexistente → 404
 *  ❌ PDF INCOMPLETO (faltan campos obligatorios) → 422 + errores de validación
 *  ❌ PDF CORRUPTO (el modelo falla) → 422 + error persistido
 *  ❌ Error de base de datos → 500
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createFakeDb,
  buildAnalyzeRequest,
  type FakeDb,
} from "@/app/api/__tests__/helpers";
import {
  validFactura,
  validContrato,
  facturaWithoutNumero,
  facturaWithoutFechaEmision,
} from "@/lib/__tests__/fixtures";

const { queryMock, ensureSchemaMock, visionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  ensureSchemaMock: vi.fn(async () => undefined),
  visionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  ensureSchema: ensureSchemaMock,
  pool: { query: queryMock },
}));

vi.mock("@/lib/vision", () => ({
  analyzeDocumentWithVision: visionMock,
}));

import { POST } from "@/app/api/documents/[id]/analyze/route";

let db: FakeDb;

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakeDb();
  queryMock.mockImplementation((sql: string, params: unknown[] = []) =>
    db.query(sql, params),
  );
  ensureSchemaMock.mockResolvedValue(undefined);
  visionMock.mockReset();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("POST /api/documents/[id]/analyze — éxito", () => {
  it("✅ analiza un PDF COMPLETO y persiste la extracción validada", async () => {
    const doc = db.seed({ filename: "factura.pdf", mime_type: "application/pdf" });
    visionMock.mockResolvedValue(validFactura);

    const res = await POST(buildAnalyzeRequest(doc.id), {
      params: Promise.resolve({ id: doc.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.document.analysis_status).toBe("completed");
    expect(body.document.document_type).toBe("factura");
    expect(body.extraction.datos_extraidos.factura.total).toBe(1210);
    expect(body.warnings).toEqual([]);

    // Estado persistido en Postgres
    expect(db.docs[0].analysis_status).toBe("completed");
    expect(db.docs[0].document_type).toBe("factura");
    expect(db.docs[0].extracted_data).toMatchObject({ tipo_documento: "factura" });
  });

  it("✅ clasifica un CONTRATO y guarda el tipo detectado", async () => {
    const doc = db.seed({ filename: "contrato.pdf" });
    visionMock.mockResolvedValue(validContrato);

    const res = await POST(buildAnalyzeRequest(doc.id), {
      params: Promise.resolve({ id: doc.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.document.document_type).toBe("contrato");
    expect(db.docs[0].document_type).toBe("contrato");
  });

  it("✅ marca el documento como 'processing' antes de analizar", async () => {
    const doc = db.seed({ filename: "factura.pdf" });
    visionMock.mockResolvedValue(validFactura);

    await POST(buildAnalyzeRequest(doc.id), {
      params: Promise.resolve({ id: doc.id }),
    });

    const processingCall = db.calls.find((c) =>
      c.sql.includes("analysis_status = 'processing'"),
    );
    expect(processingCall).toBeDefined();
    expect(processingCall?.params).toEqual([doc.id]);
  });
});

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------

describe("POST /api/documents/[id]/analyze — clave de API", () => {
  it("✅ usa la clave enviada en el header x-openrouter-api-key", async () => {
    const doc = db.seed();
    visionMock.mockResolvedValue(validFactura);

    await POST(
      buildAnalyzeRequest(doc.id, { headers: { "x-openrouter-api-key": "sk-header" } }),
      { params: Promise.resolve({ id: doc.id }) },
    );

    expect(visionMock).toHaveBeenCalledTimes(1);
    expect(visionMock.mock.calls[0][2]).toBe("sk-header");
  });

  it("✅ usa la clave enviada en el body JSON cuando no hay header", async () => {
    const doc = db.seed();
    visionMock.mockResolvedValue(validFactura);

    await POST(buildAnalyzeRequest(doc.id, { body: { apiKey: "sk-body" } }), {
      params: Promise.resolve({ id: doc.id }),
    });

    expect(visionMock.mock.calls[0][2]).toBe("sk-body");
  });
});

// ---------------------------------------------------------------------------
// Casos de error
// ---------------------------------------------------------------------------

describe("POST /api/documents/[id]/analyze — errores", () => {
  it("❌ responde 404 cuando el documento no existe", async () => {
    const res = await POST(buildAnalyzeRequest("id-inexistente"), {
      params: Promise.resolve({ id: "id-inexistente" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain("id-inexistente");
    expect(visionMock).not.toHaveBeenCalled();
  });

  it("❌ responde 422 con un PDF INCOMPLETO y persiste el error de validación", async () => {
    const doc = db.seed({ filename: "factura-incompleta.pdf" });
    visionMock.mockResolvedValue(facturaWithoutNumero);

    const res = await POST(buildAnalyzeRequest(doc.id), {
      params: Promise.resolve({ id: doc.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toContain("no pasó la validación de esquema");
    expect(Array.isArray(body.validation_errors)).toBe(true);
    expect(body.validation_errors.some((e: string) => e.includes("numero_factura"))).toBe(true);
    expect(body.extraction).toBeDefined();

    // Persistencia del fallo
    expect(db.docs[0].analysis_status).toBe("failed");
    expect(db.docs[0].analysis_error).toContain("Errores de validación");
    expect(db.docs[0].extracted_data).toBeNull();
  });

  it("❌ responde 422 cuando falta la fecha de emisión de la factura", async () => {
    const doc = db.seed();
    visionMock.mockResolvedValue(facturaWithoutFechaEmision);

    const res = await POST(buildAnalyzeRequest(doc.id), {
      params: Promise.resolve({ id: doc.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(
      body.validation_errors.some((e: string) => e.includes("fecha_emision")),
    ).toBe(true);
    expect(db.docs[0].analysis_status).toBe("failed");
  });

  it("❌ responde 422 cuando el servicio de visión falla (PDF corrupto)", async () => {
    const doc = db.seed({ filename: "corrupto.pdf" });
    visionMock.mockRejectedValue(new Error("Fallo al parsear el JSON extraído"));

    const res = await POST(buildAnalyzeRequest(doc.id), {
      params: Promise.resolve({ id: doc.id }),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toContain("Fallo al parsear el JSON");
    expect(db.docs[0].analysis_status).toBe("failed");
    expect(db.docs[0].analysis_error).toContain("Fallo al parsear el JSON");
  });

  it("❌ devuelve 500 cuando la base de datos falla", async () => {
    queryMock.mockRejectedValue(new Error("ECONNREFUSED 5432"));

    const res = await POST(buildAnalyzeRequest("doc-1"), {
      params: Promise.resolve({ id: "doc-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("ECONNREFUSED");
  });
});
