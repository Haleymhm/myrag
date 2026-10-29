import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  searchSimilarChunks,
  generateRagAnswer,
  answerWithSemanticSearch,
  type SearchResultChunk,
} from "@/lib/semantic-search";

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

describe("Semantic Search & RAG Chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchSimilarChunks", () => {
    it("✅ realiza consulta de similitud de coseno en pgvector y devuelve los fragmentos más cercanos", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            chunk_id: "chk-1",
            document_id: "doc-1",
            content: "Factura N.° F-2024-001 | Emisor: Acme S.A. | Total final: 1210",
            similarity: 0.94,
            filename: "factura-acme.pdf",
            document_type: "factura",
          },
          {
            chunk_id: "chk-2",
            document_id: "doc-2",
            content: "Dirección emisor: Av. Corrientes 1234, CABA",
            similarity: 0.88,
            filename: "factura-acme.pdf",
            document_type: "factura",
          },
        ],
      });

      const chunks = await searchSimilarChunks("¿Cuánto pagué a Acme?");

      expect(chunks).toHaveLength(2);
      expect(chunks[0].filename).toBe("factura-acme.pdf");
      expect(chunks[0].similarity).toBe(0.94);
      expect(chunks[0].content).toContain("Acme S.A.");
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [sql, params] = queryMock.mock.calls[0];
      expect(sql).toContain("c.embedding <=> $1::vector");
      expect(params?.[0]).toMatch(/^\[.+\]$/); // Vector literal
    });

    it("✅ filtra resultados cuya similitud esté por debajo del umbral", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            chunk_id: "chk-low",
            document_id: "doc-3",
            content: "Texto no relacionado",
            similarity: 0.05,
            filename: "otro.pdf",
            document_type: "otro",
          },
        ],
      });

      const chunks = await searchSimilarChunks("consulta", { threshold: 0.2 });
      expect(chunks).toHaveLength(0);
    });
  });

  describe("generateRagAnswer", () => {
    const mockSources: SearchResultChunk[] = [
      {
        chunkId: "chk-1",
        documentId: "doc-1",
        filename: "factura-acme.pdf",
        documentType: "factura",
        content: "Emisor: Acme S.A. | Total: $1.210 | Subtotal: $1.000 | IVA: $210",
        similarity: 0.92,
      },
      {
        chunkId: "chk-2",
        documentId: "doc-2",
        filename: "recibo-jumbo.pdf",
        documentType: "recibo",
        content: "Establecimiento: Supermercado Jumbo | Total: $4.350",
        similarity: 0.85,
      },
    ];

    it("✅ cita explícitamente el origen de los documentos en la respuesta", async () => {
      const answer = await generateRagAnswer("¿Qué facturas o recibos tengo?", mockSources);

      expect(answer).toBeDefined();
      // Debe citar los documentos originales
      expect(answer).toContain("factura-acme.pdf");
      expect(answer).toContain("recibo-jumbo.pdf");
    });

    it("✅ informa adecuadamente si no se encontraron documentos", async () => {
      const answer = await generateRagAnswer("consulta", []);
      expect(answer).toContain("No he encontrado información relevante en los documentos confirmados");
    });
  });

  describe("answerWithSemanticSearch", () => {
    it("✅ integra búsqueda y generación citando fuentes", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            chunk_id: "c-1",
            document_id: "d-1",
            content: "Contrato de Prestación de Servicios | Parte: Tech S.A.",
            similarity: 0.91,
            filename: "contrato-tech.pdf",
            document_type: "contrato",
          },
        ],
      });

      const res = await answerWithSemanticSearch("¿Con quién es el contrato?");
      expect(res.sources).toHaveLength(1);
      expect(res.sources[0].filename).toBe("contrato-tech.pdf");
      expect(res.answer).toContain("contrato-tech.pdf");
    });
  });
});

