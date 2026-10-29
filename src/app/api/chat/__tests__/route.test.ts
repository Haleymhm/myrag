import { describe, it, expect, beforeEach, vi } from "vitest";

const { searchMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
}));

vi.mock("@/lib/semantic-search", () => ({
  answerWithSemanticSearch: searchMock,
}));

import { POST } from "@/app/api/chat/route";

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("✅ responde 200 con la respuesta y las fuentes citadas del documento original", async () => {
    searchMock.mockResolvedValueOnce({
      answer: "La factura de Acme S.A. tiene un total de $1.210 [factura-acme.pdf].",
      sources: [
        {
          chunkId: "c-1",
          documentId: "doc-1",
          filename: "factura-acme.pdf",
          documentType: "factura",
          content: "Factura F-2024-001 | Total: 1210",
          similarity: 0.95,
        },
      ],
    });

    const request = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "¿Cuánto es la factura de Acme?" }),
    });

    const res = await POST(request);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.answer).toContain("[factura-acme.pdf]");
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].filename).toBe("factura-acme.pdf");
    expect(body.sources[0].similarity).toBe(0.95);
  });

  it("❌ rechaza si el mensaje está vacío → 400", async () => {
    const request = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   " }),
    });

    const res = await POST(request);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("message");
    expect(searchMock).not.toHaveBeenCalled();
  });
});

