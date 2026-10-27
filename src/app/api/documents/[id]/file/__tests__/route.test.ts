/**
 * Tests para GET /api/documents/[id]/file (vista previa del archivo).
 *
 * Casos cubiertos:
 *  ✅ Sirve un PDF con el Content-Type correcto (previsualización inline)
 *  ✅ Sirve una imagen PNG
 *  ✅ El cuerpo de la respuesta coincide byte a byte con el archivo guardado
 *  ❌ Documento inexistente → 404
 *  ❌ Error de base de datos → 500
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeDb, PDF_CONTENT, type FakeDb } from "@/app/api/__tests__/helpers";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  ensureSchema: vi.fn(async () => undefined),
  pool: { query: queryMock },
}));

import { GET } from "@/app/api/documents/[id]/file/route";

let db: FakeDb;

beforeEach(() => {
  vi.clearAllMocks();
  db = createFakeDb();
  queryMock.mockImplementation((sql: string, params: unknown[] = []) =>
    db.query(sql, params),
  );
});

const request = () => new Request("http://localhost:3000/api/documents/doc-1/file");

describe("GET /api/documents/[id]/file", () => {
  it("✅ sirve un PDF con el Content-Type correcto", async () => {
    const doc = db.seed({
      filename: "factura marzo.pdf",
      mime_type: "application/pdf",
      data: Buffer.from(PDF_CONTENT),
    });

    const res = await GET(request(), {
      params: Promise.resolve({ id: doc.id }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("inline");
    expect(res.headers.get("content-disposition")).toContain(
      encodeURIComponent("factura marzo.pdf"),
    );
  });

  it("✅ el cuerpo devuelto coincide byte a byte con el archivo guardado", async () => {
    const doc = db.seed({
      mime_type: "application/pdf",
      data: Buffer.from(PDF_CONTENT),
    });

    const res = await GET(request(), {
      params: Promise.resolve({ id: doc.id }),
    });
    const body = Buffer.from(await res.arrayBuffer());

    expect(body.toString()).toBe(PDF_CONTENT);
  });

  it("✅ sirve una imagen PNG", async () => {
    const doc = db.seed({
      filename: "ticket.png",
      mime_type: "image/png",
      data: Buffer.from("PNG-BYTES"),
    });

    const res = await GET(request(), {
      params: Promise.resolve({ id: doc.id }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("❌ responde 404 cuando el documento no existe", async () => {
    const res = await GET(request(), {
      params: Promise.resolve({ id: "no-existe" }),
    });

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("❌ devuelve 500 cuando la base de datos falla", async () => {
    queryMock.mockRejectedValue(new Error("connection terminated"));

    const res = await GET(request(), {
      params: Promise.resolve({ id: "doc-1" }),
    });

    expect(res.status).toBe(500);
    expect(await res.text()).toContain("connection terminated");
  });
});
