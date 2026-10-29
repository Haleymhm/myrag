import { NextResponse } from "next/server";
import { answerWithSemanticSearch, type ChatMessage } from "@/lib/semantic-search";

export async function POST(request: Request) {
  try {
    const clientApiKey =
      request.headers.get("x-openrouter-api-key") ??
      request.headers.get("x-openai-api-key") ??
      undefined;

    const body = await request.json().catch(() => ({}));
    const message = body?.message;
    const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];
    const apiKey = body?.apiKey || clientApiKey;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "El campo 'message' es obligatorio y no puede estar vacío." },
        { status: 400 },
      );
    }

    const result = await answerWithSemanticSearch(message.trim(), history, apiKey);

    return NextResponse.json({
      success: true,
      answer: result.answer,
      sources: result.sources,
    });
  } catch (error) {
    const msg = (error as Error).message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

