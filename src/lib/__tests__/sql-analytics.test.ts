import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isCalculationQuery,
  isSafeReadOnlyQuery,
  executeAnalyticalCalculation,
} from "@/lib/sql-analytics";
import { answerWithSemanticSearch } from "@/lib/semantic-search";

const { queryMock, ensureSchemaMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  ensureSchemaMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({
  ensureSchema: ensureSchemaMock,
  pool: {
    query: queryMock,
  },
}));

describe("SQL Analytics & Calculation Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isCalculationQuery", () => {
    it("✅ identifica preguntas numéricas, sumas, totales y conteos", () => {
      expect(isCalculationQuery("¿Cuánto es el total de mis facturas?")).toBe(true);
      expect(isCalculationQuery("Suma el monto de todos los recibos")).toBe(true);
      expect(isCalculationQuery("¿Cuál es el promedio de gastos?")).toBe(true);
      expect(isCalculationQuery("¿Cuántas facturas tengo registradas?")).toBe(true);
      expect(isCalculationQuery("¿Cuál es la factura con mayor importe?")).toBe(true);
      expect(isCalculationQuery("¿Cuánto pagué en impuestos o IVA?")).toBe(true);
    });

    it("✅ no marca preguntas cualitativas o semánticas", () => {
      expect(isCalculationQuery("¿Quién es el representante legal de Tech S.A.?")).toBe(false);
      expect(isCalculationQuery("¿De qué trata el contrato de software?")).toBe(false);
      expect(isCalculationQuery("¿Cuál es la dirección fiscal del emisor?")).toBe(false);
      expect(isCalculationQuery("Explícame las cláusulas de rescisión")).toBe(false);
    });
  });

  describe("isSafeReadOnlyQuery", () => {
    it("✅ permite consultas SELECT legítimas sobre tablas de la app", () => {
      expect(
        isSafeReadOnlyQuery(
          "SELECT SUM(total) FROM facturas JOIN documents ON documents.id = facturas.document_id",
        ),
      ).toBe(true);
      expect(
        isSafeReadOnlyQuery("SELECT establecimiento, total FROM recibos WHERE total > 100"),
      ).toBe(true);
    });

    it("❌ bloquea consultas mutables o peligrosas (INSERT, DROP, DELETE, etc.)", () => {
      expect(isSafeReadOnlyQuery("DROP TABLE facturas")).toBe(false);
      expect(isSafeReadOnlyQuery("DELETE FROM facturas WHERE id = 1")).toBe(false);
      expect(isSafeReadOnlyQuery("UPDATE facturas SET total = 0")).toBe(false);
      expect(isSafeReadOnlyQuery("INSERT INTO facturas VALUES (1)")).toBe(false);
      expect(isSafeReadOnlyQuery("SELECT * FROM facturas; DROP TABLE documents")).toBe(false);
    });
  });

  describe("executeAnalyticalCalculation", () => {
    it("✅ calcula la suma de facturas con SQL exacto y cita los documentos de origen", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            factura_id: "f-1",
            numero_factura: "F-001",
            emisor_nombre: "Acme S.A.",
            total: "1210.00",
            subtotal: "1000.00",
            impuesto_monto: "210.00",
            moneda: "USD",
            doc_id: "doc-1",
            filename: "factura-acme.pdf",
            doc_type: "factura",
          },
          {
            factura_id: "f-2",
            numero_factura: "F-002",
            emisor_nombre: "Beta Corp",
            total: "500.00",
            subtotal: "400.00",
            impuesto_monto: "100.00",
            moneda: "USD",
            doc_id: "doc-2",
            filename: "factura-beta.pdf",
            doc_type: "factura",
          },
        ],
      });

      const result = await executeAnalyticalCalculation("¿Cuánto es el total de mis facturas?");

      expect(result).not.toBeNull();
      expect(result?.answer).toContain("1.710,00 USD");
      expect(result?.answer).toContain("[factura-acme.pdf]");
      expect(result?.answer).toContain("[factura-beta.pdf]");
      expect(result?.sources).toHaveLength(2);
      expect(result?.sources[0].filename).toBe("factura-acme.pdf");
      expect(result?.sources[0].similarity).toBe(1.0);
    });

    it("✅ calcula la suma de recibos con SQL exacto y cita los documentos de origen", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            recibo_id: "r-1",
            establecimiento: "Jumbo",
            total: "4350.00",
            subtotal: "4000.00",
            propina: "0.00",
            impuesto: "350.00",
            doc_id: "doc-3",
            filename: "ticket-jumbo.pdf",
            doc_type: "recibo",
          },
        ],
      });

      const result = await executeAnalyticalCalculation("Suma total de mis recibos");

      expect(result).not.toBeNull();
      expect(result?.answer).toContain("4.350,00");
      expect(result?.answer).toContain("[ticket-jumbo.pdf]");
      expect(result?.sources[0].filename).toBe("ticket-jumbo.pdf");
    });
  });

  describe("Enrutamiento inteligente en answerWithSemanticSearch", () => {
    it("✅ enruta preguntas de cálculo a SQL en lugar de usar embeddings de PGVector", async () => {
      // Mock para la consulta SQL de facturas
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            factura_id: "f-1",
            numero_factura: "F-001",
            emisor_nombre: "Acme",
            total: "1210.00",
            subtotal: "1000.00",
            impuesto_monto: "210.00",
            moneda: "USD",
            doc_id: "d-1",
            filename: "factura.pdf",
            doc_type: "factura",
          },
        ],
      });

      const result = await answerWithSemanticSearch("¿Cuál es la suma total de mis facturas?");

      expect(result.isSqlCalculation).toBe(true);
      expect(result.answer).toContain("1.210,00 USD");
      expect(result.sources[0].filename).toBe("factura.pdf");
      // La consulta SQL fue sobre la tabla facturas, NO se usó el operador <=> de embeddings
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain("FROM facturas f");
      expect(sql).not.toContain("<=>");
    });

    it("✅ enruta preguntas cualitativas a búsqueda por embeddings (pgvector <=>)", async () => {
      // Mock para búsqueda vectorial
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            chunk_id: "c-1",
            document_id: "d-1",
            content: "Cláusula 1: Confidencialidad estricta entre las partes.",
            similarity: 0.95,
            filename: "contrato.pdf",
            document_type: "contrato",
          },
        ],
      });

      const result = await answerWithSemanticSearch("¿Qué dice la cláusula de confidencialidad?");

      expect(result.isSqlCalculation).toBe(false);
      expect(result.sources[0].filename).toBe("contrato.pdf");
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain("<=>");
    });
  });
});

