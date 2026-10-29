/**
 * Tests para POST/GET /api/documents (subida de archivos).
 *
 * Casos cubiertos:
 *  ✅ Sube un PDF correctamente → 201, persistido con estado "pending"
 *  ✅ Sube una imagen (PNG) correctamente
 *  ✅ Sube un PDF COMPLETO con auto-análisis → extracción validada y guardada
 *  ❌ Sube un PDF INCOMPLETO (faltan campos obligatorios) → estado "failed"
 *  ❌ Sube un PDF corrupto (el servicio de visión lanza error) → estado "failed"
 *  ❌ Envía la clave de OpenRouter del header al servicio de visión
 *  ❌ Sin archivo en el FormData → 400
 *  ❌ Tipo de archivo no admitido (text/plain) → 415
 *  ❌ Error de base de datos → 500
 *  ✅ GET lista los documentos guardados
 *  ❌ GET con error de base de datos → 500
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createFakeDb,
  buildUploadRequest,
  createFile,
  PDF_CONTENT,
  type FakeDb,
} from "@/app/api/__tests__/helpers";
import {
  validFactura,
  validRecibo,
  validContrato,
  facturaWithoutNumero,
  facturaWithoutFechaEmision,
  facturaIncoherenciaTotal,
  facturaFechaImpossible,
  facturaVencimientoAnterior,
  reciboSinEstablecimiento,
  reciboIncoherenciaTotal,
  contratoUnaParteOnly,
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

import { GET, POST } from "@/app/api/documents/route";

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
// Subida sin análisis
// ---------------------------------------------------------------------------

describe("POST /api/documents — subida simple", () => {
  it("✅ sube un PDF y responde 201 con el documento persistido", async () => {
    const file = createFile({ name: "factura-marzo.pdf" });

    const res = await POST(buildUploadRequest(file));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document).toBeDefined();
    expect(body.document.filename).toBe("factura-marzo.pdf");
    expect(body.document.mime_type).toBe("application/pdf");
    expect(body.document.analysis_status).toBe("pending");
    expect(body.document.document_type).toBeNull();

    expect(db.docs).toHaveLength(1);
    expect(db.docs[0].filename).toBe("factura-marzo.pdf");
    expect(db.docs[0].data.toString()).toBe(PDF_CONTENT);
    expect(db.docs[0].size_bytes).toBe(String(Buffer.byteLength(PDF_CONTENT)));
  });

  it("✅ sube una imagen PNG correctamente", async () => {
    const file = createFile({ name: "ticket.png", type: "image/png", content: "PNG" });

    const res = await POST(buildUploadRequest(file));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.mime_type).toBe("image/png");
    expect(db.docs).toHaveLength(1);
  });

  it("✅ no persiste nada cuando no se pide análisis", async () => {
    const file = createFile();

    await POST(buildUploadRequest(file));

    expect(visionMock).not.toHaveBeenCalled();
    expect(db.docs[0].analysis_status).toBe("pending");
    expect(db.docs[0].extracted_data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Subida con auto-análisis (?analyze=true)
// ---------------------------------------------------------------------------

describe("POST /api/documents?analyze=true — auto-análisis", () => {
  it("✅ sube un PDF COMPLETO: guarda la extracción validada y marca 'completed'", async () => {
    visionMock.mockResolvedValue(validFactura);
    const file = createFile({ name: "factura.pdf" });

    const res = await POST(buildUploadRequest(file, { analyze: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(visionMock).toHaveBeenCalledTimes(1);
    expect(body.document.analysis_status).toBe("completed");
    expect(body.document.document_type).toBe("factura");
    expect(body.document.analysis_error).toBeNull();
    expect(body.document.extracted_data).toBeDefined();

    // Estado persistido
    expect(db.docs[0].analysis_status).toBe("completed");
    expect(db.docs[0].document_type).toBe("factura");
    expect(db.docs[0].extracted_data).toMatchObject({
      tipo_documento: "factura",
      confianza: 0.97,
    });
  });

  it("❌ sube un PDF INCOMPLETO: marca 'failed' y NO guarda datos inválidos", async () => {
    // El LLM no logra leer el número de factura → el esquema Zod lo rechaza.
    visionMock.mockResolvedValue(facturaWithoutNumero);
    const file = createFile({ name: "factura-incompleta.pdf" });

    const res = await POST(buildUploadRequest(file, { analyze: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.analysis_status).toBe("failed");
    expect(body.document.analysis_error).toContain("Errores de validación");
    expect(body.document.analysis_error).toContain("numero_factura");
    expect(body.document.document_type).toBeNull();

    // El documento queda guardado, pero sin extracción persistida
    expect(db.docs).toHaveLength(1);
    expect(db.docs[0].analysis_status).toBe("failed");
    expect(db.docs[0].extracted_data).toBeNull();
    expect(db.docs[0].analysis_error).toContain("numero_factura");
  });

  it("❌ sube un PDF CORRUPTO: el error del servicio de visión se persiste", async () => {
    visionMock.mockRejectedValue(
      new Error("No se recibió respuesta estructurada del modelo de visión."),
    );
    const file = createFile({ name: "roto.pdf" });

    const res = await POST(buildUploadRequest(file, { analyze: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.analysis_status).toBe("failed");
    expect(body.document.analysis_error).toContain("No se recibió respuesta estructurada");

    expect(db.docs[0].analysis_status).toBe("failed");
    expect(db.docs[0].analysis_error).toContain("No se recibió respuesta estructurada");
  });

  it("✅ propaga la clave de OpenRouter del header al servicio de visión", async () => {
    visionMock.mockResolvedValue(validFactura);
    const file = createFile();

    await POST(
      buildUploadRequest(file, {
        analyze: true,
        headers: { "x-openrouter-api-key": "sk-test-123" },
      }),
    );

    expect(visionMock).toHaveBeenCalledTimes(1);
    const [, mimeType, apiKey] = visionMock.mock.calls[0];
    expect(mimeType).toBe("application/pdf");
    expect(apiKey).toBe("sk-test-123");
  });

  it("❌ sube un PDF INCOMPLETO: falla si la fecha no existe en el calendario (30 de febrero)", async () => {
    visionMock.mockResolvedValue(facturaFechaImpossible);
    const file = createFile({ name: "factura-fecha-invalida.pdf" });

    const res = await POST(buildUploadRequest(file, { analyze: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.analysis_status).toBe("failed");
    expect(body.document.analysis_error).toContain("Fecha inválida (fecha no existe en el calendario)");
    expect(db.docs[0].analysis_status).toBe("failed");
  });

  it("❌ sube un PDF INCOMPLETO: falla si fecha_vencimiento es anterior a fecha_emision", async () => {
    visionMock.mockResolvedValue(facturaVencimientoAnterior);
    const file = createFile({ name: "factura-vencimiento-anterior.pdf" });

    const res = await POST(buildUploadRequest(file, { analyze: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.analysis_status).toBe("failed");
    expect(body.document.analysis_error).toContain("La fecha de vencimiento no puede ser anterior a la fecha de emisión");
    expect(db.docs[0].analysis_status).toBe("failed");
  });

  it("❌ sube un PDF INCOMPLETO: falla si subtotal + impuestos no es igual al total", async () => {
    visionMock.mockResolvedValue(facturaIncoherenciaTotal);
    const file = createFile({ name: "factura-incoherente.pdf" });

    const res = await POST(buildUploadRequest(file, { analyze: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.analysis_status).toBe("failed");
    expect(body.document.analysis_error).toContain("Incoherencia numérica");
    expect(body.document.analysis_error).toContain("subtotal");
    expect(db.docs[0].analysis_status).toBe("failed");
  });

  it("✅ sube un PDF exitoso de RECIBO (subtotal + impuesto + propina = total)", async () => {
    visionMock.mockResolvedValue(validRecibo);
    const file = createFile({ name: "ticket-compra.pdf" });

    const res = await POST(buildUploadRequest(file, { analyze: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.analysis_status).toBe("completed");
    expect(body.document.document_type).toBe("recibo");
    expect(body.document.analysis_error).toBeNull();
    expect(db.docs[0].analysis_status).toBe("completed");
    expect(db.docs[0].document_type).toBe("recibo");
  });

  it("❌ sube un PDF INCOMPLETO de RECIBO: falla si no incluye establecimiento o incoherencia de total", async () => {
    visionMock.mockResolvedValue(reciboSinEstablecimiento);
    const file = createFile({ name: "recibo-sin-establecimiento.pdf" });

    const res = await POST(buildUploadRequest(file, { analyze: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.analysis_status).toBe("failed");
    expect(body.document.analysis_error).toContain("establecimiento");
    expect(db.docs[0].analysis_status).toBe("failed");
  });

  it("❌ sube un PDF INCOMPLETO de RECIBO: falla si subtotal + propina + impuesto ≠ total", async () => {
    visionMock.mockResolvedValue(reciboIncoherenciaTotal);
    const file = createFile({ name: "recibo-incoherente.pdf" });

    const res = await POST(buildUploadRequest(file, { analyze: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.analysis_status).toBe("failed");
    expect(body.document.analysis_error).toContain("Incoherencia numérica");
    expect(db.docs[0].analysis_status).toBe("failed");
  });

  it("✅ sube un PDF exitoso de CONTRATO (mínimo 2 partes y vigencia válida)", async () => {
    visionMock.mockResolvedValue(validContrato);
    const file = createFile({ name: "contrato-servicios.pdf" });

    const res = await POST(buildUploadRequest(file, { analyze: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.analysis_status).toBe("completed");
    expect(body.document.document_type).toBe("contrato");
    expect(db.docs[0].analysis_status).toBe("completed");
  });

  it("❌ sube un PDF INCOMPLETO de CONTRATO: falla si no tiene al menos 2 partes", async () => {
    visionMock.mockResolvedValue(contratoUnaParteOnly);
    const file = createFile({ name: "contrato-incompleto.pdf" });

    const res = await POST(buildUploadRequest(file, { analyze: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.document.analysis_status).toBe("failed");
    expect(body.document.analysis_error).toContain("partes");
    expect(db.docs[0].analysis_status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// Validaciones de la subida
// ---------------------------------------------------------------------------

describe("POST /api/documents — validaciones", () => {
  it("❌ rechaza la subida sin archivo → 400", async () => {
    const res = await POST(buildUploadRequest(null));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("No se proporcionó ningún archivo");
    expect(db.docs).toHaveLength(0);
  });

  it("❌ rechaza un tipo de archivo no admitido (text/plain) → 415", async () => {
    const file = createFile({ name: "notas.txt", type: "text/plain", content: "hola" });

    const res = await POST(buildUploadRequest(file));
    const body = await res.json();

    expect(res.status).toBe(415);
    expect(body.error).toContain("Tipo de archivo no admitido");
    expect(db.docs).toHaveLength(0);
  });

  it("❌ devuelve 500 cuando la base de datos falla", async () => {
    queryMock.mockRejectedValue(new Error("ECONNREFUSED 5432"));

    const res = await POST(buildUploadRequest(createFile()));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("ECONNREFUSED");
  });
});

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

describe("GET /api/documents", () => {
  it("✅ lista los documentos guardados", async () => {
    db.seed({ filename: "a.pdf", document_type: "factura", analysis_status: "completed" });
    db.seed({ filename: "b.pdf", document_type: "contrato", analysis_status: "pending" });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.documents).toHaveLength(2);
    expect(body.documents[0].filename).toBe("a.pdf");
    expect(body.documents[1].filename).toBe("b.pdf");
  });

  it("✅ devuelve una lista vacía cuando no hay documentos", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.documents).toEqual([]);
  });

  it("❌ devuelve 500 cuando la base de datos falla", async () => {
    queryMock.mockRejectedValue(new Error("connection terminated"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("connection terminated");
  });
});
