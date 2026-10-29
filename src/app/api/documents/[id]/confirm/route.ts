import { NextResponse } from "next/server";
import { confirmAndVectorizeDocument } from "@/lib/confirm-document";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    let apiKey: string | undefined;
    const headerKey =
      request.headers.get("x-openrouter-api-key") ??
      request.headers.get("x-openai-api-key");

    if (headerKey) {
      apiKey = headerKey;
    } else {
      try {
        const body = await request.json();
        if (body?.apiKey) apiKey = body.apiKey;
      } catch {
        // Optional body
      }
    }

    const result = await confirmAndVectorizeDocument(id, apiKey);

    return NextResponse.json({
      success: true,
      message: "Documento confirmado con éxito: datos estructurados guardados en PostgreSQL y embeddings en PG Vector.",
      result,
    });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("no encontrado")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("no cumplen las reglas de validación") || msg.includes("no tiene datos extraídos")) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

