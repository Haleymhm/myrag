import { describe, it, expect, beforeEach, vi } from "vitest";

const { confirmMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(),
}));

vi.mock("@/lib/confirm-document", () => ({
  confirmAndVectorizeDocument: confirmMock,
}));

import { POST } from "@/app/api/documents/[id]/confirm/route";

describe("POST /api/documents/[id]/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("✅ confirma el documento y responde 200 con el resumen de la vectorización", async () => {
    confirmMock.mockResolvedValueOnce({
      success: true,
      documentId: "doc-1",
      documentType: "factura",
      structuredRecordsInserted: 3,
      chunksVectorized: 5,
      warnings: [],
    });

    const request = new Request("http://localhost:3000/api/documents/doc-1/confirm", {
      method: "POST",
    });

    const res = await POST(request, { params: Promise.resolve({ id: "doc-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.result.chunksVectorized).toBe(5);
    expect(body.result.structuredRecordsInserted).toBe(3);
  });

  it("❌ responde 404 si el documento no existe", async () => {
    confirmMock.mockRejectedValueOnce(new Error("Documento no encontrado: doc-404"));

    const request = new Request("http://localhost:3000/api/documents/doc-404/confirm", {
      method: "POST",
    });

    const res = await POST(request, { params: Promise.resolve({ id: "doc-404" }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain("no encontrado");
  });

  it("❌ responde 422 si los datos no cumplen la validación de Zod", async () => {
    confirmMock.mockRejectedValueOnce(
      new Error("Los datos no cumplen las reglas de validación: [numero_factura] Campo obligatorio"),
    );

    const request = new Request("http://localhost:3000/api/documents/doc-inv/confirm", {
      method: "POST",
    });

    const res = await POST(request, { params: Promise.resolve({ id: "doc-inv" }) });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toContain("reglas de validación");
  });
});

