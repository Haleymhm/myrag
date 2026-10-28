/**
 * Tests para el cliente de visión (analyzeDocumentWithVision).
 *
 * Casos cubiertos:
 *  ✅ Construye el bloque multimodal correcto para un PDF (type: "file")
 *  ✅ Construye el bloque multimodal correcto para una imagen (type: "image_url")
 *  ✅ Envía la API key del cliente en la cabecera Authorization
 *  ✅ Usa la API key del entorno cuando el cliente no aporta ninguna
 *  ✅ Limpia los ```json de la respuesta del modelo
 *  ❌ Sin ninguna API key → error explícito
 *  ❌ OpenRouter responde con error (4xx/5xx) → propaga el mensaje
 *  ❌ Respuesta sin contenido → error
 *  ❌ Contenido que no es JSON válido → error de parseo
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { analyzeDocumentWithVision } from "@/lib/vision";
import { validFactura } from "./fixtures";

const fetchMock = vi.fn();

const originalEnvKey = process.env.OPENROUTER_API_KEY;
const originalPublicEnvKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;

function mockOpenRouter(content: string) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalEnvKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalEnvKey;
  if (originalPublicEnvKey === undefined)
    delete process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
  else process.env.NEXT_PUBLIC_OPENROUTER_API_KEY = originalPublicEnvKey;
});

describe("analyzeDocumentWithVision — construction de la petición", () => {
  it("✅ envía un PDF como bloque 'file' en base64", async () => {
    mockOpenRouter(JSON.stringify(validFactura));
    const pdf = Buffer.from("%PDF-1.7\ncontenido");

    await analyzeDocumentWithVision(pdf, "application/pdf", "sk-test");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");

    const body = JSON.parse(init.body as string);
    const mediaPart = body.messages[0].content[1];
    expect(mediaPart.type).toBe("file");
    expect(mediaPart.file.filename).toBe("document.pdf");
    expect(mediaPart.file.file_data).toBe(
      `data:application/pdf;base64,${pdf.toString("base64")}`,
    );
  });

  it("✅ envía una imagen como bloque 'image_url' en base64", async () => {
    mockOpenRouter(JSON.stringify(validFactura));
    const png = Buffer.from("PNG-BYTES");

    await analyzeDocumentWithVision(png, "image/png", "sk-test");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const mediaPart = body.messages[0].content[1];
    expect(mediaPart.type).toBe("image_url");
    expect(mediaPart.image_url.url).toBe(
      `data:image/png;base64,${png.toString("base64")}`,
    );
  });

  it("✅ envía la API key del cliente en la cabecera Authorization", async () => {
    mockOpenRouter(JSON.stringify(validFactura));

    await analyzeDocumentWithVision(Buffer.from("x"), "image/jpeg", "sk-cliente");

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-cliente");
  });

  it("✅ usa la API key del entorno cuando el cliente no aporta ninguna", async () => {
    process.env.OPENROUTER_API_KEY = "sk-entorno";
    mockOpenRouter(JSON.stringify(validFactura));

    await analyzeDocumentWithVision(Buffer.from("x"), "image/jpeg");

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-entorno");
  });

  it("✅ limpia los bloques de código markdown de la respuesta", async () => {
    mockOpenRouter("```json\n" + JSON.stringify(validFactura) + "\n```");

    const result = await analyzeDocumentWithVision(
      Buffer.from("x"),
      "application/pdf",
      "sk-test",
    );

    expect(result.tipo_documento).toBe("factura");
    expect(result.confianza).toBe(0.97);
  });
});

describe("analyzeDocumentWithVision — errores", () => {
  it("❌ falla explícitamente cuando no hay ninguna API key configurada", async () => {
    await expect(
      analyzeDocumentWithVision(Buffer.from("x"), "application/pdf"),
    ).rejects.toThrow(/Clave API no encontrada/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("❌ propaga el mensaje de error de OpenRouter", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () =>
        JSON.stringify({ error: { message: "No valid API key provided" } }),
    });

    await expect(
      analyzeDocumentWithVision(Buffer.from("x"), "application/pdf", "sk-mala"),
    ).rejects.toThrow("No valid API key provided");
  });

  it("❌ falla cuando la respuesta del modelo viene vacía", async () => {
    mockOpenRouter("");

    await expect(
      analyzeDocumentWithVision(Buffer.from("x"), "application/pdf", "sk-test"),
    ).rejects.toThrow(/No se recibió respuesta estructurada/);
  });

  it("❌ falla cuando el contenido devuelto no es JSON válido", async () => {
    mockOpenRouter("esto no es un JSON {");

    await expect(
      analyzeDocumentWithVision(Buffer.from("x"), "application/pdf", "sk-test"),
    ).rejects.toThrow(/Fallo al parsear el JSON/);
  });
});
