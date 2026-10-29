import { describe, it, expect, beforeEach, vi } from "vitest";
import { confirmAndVectorizeDocument } from "@/lib/confirm-document";
import {
  validFactura,
  validRecibo,
  validContrato,
  facturaWithoutNumero,
  facturaIncoherenciaTotal,
} from "@/lib/__tests__/fixtures";

const { queryMock, connectMock, ensureSchemaMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  connectMock: vi.fn(),
  ensureSchemaMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({
  ensureSchema: ensureSchemaMock,
  pool: {
    query: queryMock,
    connect: connectMock,
  },
}));

describe("confirmAndVectorizeDocument", () => {
  let clientQueryMock: ReturnType<typeof vi.fn>;
  let clientReleaseMock: ReturnType<typeof vi.fn>;
  let executedSql: Array<{ sql: string; params?: unknown[] }>;

  beforeEach(() => {
    vi.clearAllMocks();
    executedSql = [];

    clientQueryMock = vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      executedSql.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      if (sql.includes("INSERT INTO facturas")) {
        return { rows: [{ id: "factura-uuid-1" }] };
      }
      if (sql.includes("INSERT INTO recibos")) {
        return { rows: [{ id: "recibo-uuid-1" }] };
      }
      if (sql.includes("INSERT INTO contratos")) {
        return { rows: [{ id: "contrato-uuid-1" }] };
      }
      return { rows: [] };
    });

    clientReleaseMock = vi.fn();
    connectMock.mockResolvedValue({
      query: clientQueryMock,
      release: clientReleaseMock,
    });
  });

  it("✅ FACTURA: persiste datos estructurados en PostgreSQL y vectoriza textos en PGVector", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "doc-123",
          filename: "factura.pdf",
          document_type: "factura",
          extracted_data: validFactura,
          analysis_status: "completed",
        },
      ],
    });

    const result = await confirmAndVectorizeDocument("doc-123");

    expect(result.success).toBe(true);
    expect(result.documentType).toBe("factura");
    expect(result.structuredRecordsInserted).toBeGreaterThanOrEqual(2); // Factura + ítem(s)
    expect(result.chunksVectorized).toBeGreaterThanOrEqual(3); // Resumen, cabecera, emisor, items, totales

    // Comprobar inicio y fin de transacción
    expect(executedSql.some((c) => c.sql === "BEGIN")).toBe(true);
    expect(executedSql.some((c) => c.sql === "COMMIT")).toBe(true);

    // Comprobar inserción en tabla facturas
    const facturaInsert = executedSql.find((c) => c.sql.startsWith("INSERT INTO facturas"));
    expect(facturaInsert).toBeDefined();
    expect(facturaInsert?.params).toContain("F-2024-001");
    expect(facturaInsert?.params).toContain("Acme S.A.");
    expect(facturaInsert?.params).toContain(1210);

    // Comprobar inserción en tabla factura_items
    const itemInsert = executedSql.find((c) => c.sql.startsWith("INSERT INTO factura_items"));
    expect(itemInsert).toBeDefined();
    expect(itemInsert?.params).toContain("Consultoría técnica — 10 h");

    // Comprobar inserción de chunks y embeddings en document_chunks (PG Vector)
    const vectorInserts = executedSql.filter((c) => c.sql.startsWith("INSERT INTO document_chunks"));
    expect(vectorInserts.length).toBe(result.chunksVectorized);

    // Comprobar que cada embedding tiene formato '[float,float,...]::vector'
    for (const v of vectorInserts) {
      expect(v.params?.[0]).toBe("doc-123");
      expect(typeof v.params?.[1]).toBe("string"); // texto del fragmento
      expect(typeof v.params?.[2]).toBe("string"); // literal de vector
      const vecStr = v.params?.[2] as string;
      expect(vecStr.startsWith("[")).toBe(true);
      expect(vecStr.endsWith("]")).toBe(true);
      const components = vecStr.slice(1, -1).split(",");
      expect(components.length).toBe(1536); // Dimensión pgvector 1536
    }

    // Comprobar actualización de confirmed en documents
    const docUpdate = executedSql.find((c) => c.sql.includes("is_confirmed = true"));
    expect(docUpdate).toBeDefined();
    expect(clientReleaseMock).toHaveBeenCalled();
  });

  it("✅ RECIBO: guarda datos en tablas recibos/recibo_items y vectoriza textos en PGVector", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "doc-recibo",
          filename: "ticket.pdf",
          document_type: "recibo",
          extracted_data: validRecibo,
          analysis_status: "completed",
        },
      ],
    });

    const result = await confirmAndVectorizeDocument("doc-recibo");

    expect(result.success).toBe(true);
    expect(result.documentType).toBe("recibo");

    const reciboInsert = executedSql.find((c) => c.sql.startsWith("INSERT INTO recibos"));
    expect(reciboInsert).toBeDefined();
    expect(reciboInsert?.params).toContain("Supermercado Jumbo");
    expect(reciboInsert?.params).toContain(4350);

    const itemsInserts = executedSql.filter((c) => c.sql.startsWith("INSERT INTO recibo_items"));
    expect(itemsInserts.length).toBe(3);

    const vectorInserts = executedSql.filter((c) => c.sql.startsWith("INSERT INTO document_chunks"));
    expect(vectorInserts.length).toBeGreaterThanOrEqual(2);
  });

  it("✅ CONTRATO: guarda datos en contratos/contrato_partes/contrato_clausulas y vectoriza textos", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "doc-contrato",
          filename: "acuerdo.pdf",
          document_type: "contrato",
          extracted_data: validContrato,
          analysis_status: "completed",
        },
      ],
    });

    const result = await confirmAndVectorizeDocument("doc-contrato");

    expect(result.success).toBe(true);
    expect(result.documentType).toBe("contrato");

    const contratoInsert = executedSql.find((c) => c.sql.startsWith("INSERT INTO contratos"));
    expect(contratoInsert).toBeDefined();
    expect(contratoInsert?.params).toContain("Contrato de Desarrollo de Software");

    const partesInserts = executedSql.filter((c) => c.sql.startsWith("INSERT INTO contrato_partes"));
    expect(partesInserts.length).toBe(2);

    const clausulasInserts = executedSql.filter((c) => c.sql.startsWith("INSERT INTO contrato_clausulas"));
    expect(clausulasInserts.length).toBe(2);

    const vectorInserts = executedSql.filter((c) => c.sql.startsWith("INSERT INTO document_chunks"));
    expect(vectorInserts.length).toBeGreaterThanOrEqual(3);
  });

  it("❌ rechaza confirmación si el documento no existe", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(confirmAndVectorizeDocument("no-existe")).rejects.toThrow(
      "Documento no encontrado",
    );
  });

  it("❌ rechaza confirmación si faltan campos obligatorios en el documento", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "doc-incompleto",
          filename: "factura-sin-numero.pdf",
          document_type: "factura",
          extracted_data: facturaWithoutNumero,
        },
      ],
    });

    await expect(confirmAndVectorizeDocument("doc-incompleto")).rejects.toThrow(
      "Los datos no cumplen las reglas de validación",
    );
  });

  it("❌ rechaza confirmación si hay incoherencia en subtotal + impuestos ≠ total", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "doc-incoherente",
          filename: "factura-error.pdf",
          document_type: "factura",
          extracted_data: facturaIncoherenciaTotal,
        },
      ],
    });

    await expect(confirmAndVectorizeDocument("doc-incoherente")).rejects.toThrow(
      "Incoherencia numérica",
    );
  });
});

