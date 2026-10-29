import { NextResponse } from "next/server";
import { ensureSchema, pool, type DocumentRow } from "@/lib/db";
import { analyzeDocumentWithVision } from "@/lib/vision";
import { safeParseVisionResult } from "@/lib/schemas";

const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

export async function GET() {
  try {
    await ensureSchema();
    const { rows } = await pool.query<DocumentRow>(
      `SELECT id, filename, mime_type, size_bytes, created_at,
              document_type, extracted_data, analysis_status, analysis_error, analyzed_at,
              is_confirmed, confirmed_at
         FROM documents
        ORDER BY created_at DESC`,
    );
    return NextResponse.json({ documents: rows });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    const shouldAutoAnalyze = url.searchParams.get("analyze") === "true";
    const clientApiKey =
      request.headers.get("x-openrouter-api-key") ??
      request.headers.get("x-gemini-api-key") ??
      undefined;

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo." }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo de archivo no admitido: ${file.type || "desconocido"}. Solo se admiten PDFs e imágenes.` },
        { status: 415 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const { rows } = await pool.query<DocumentRow>(
      `INSERT INTO documents (filename, mime_type, size_bytes, data, analysis_status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, filename, mime_type, size_bytes, created_at,
                 document_type, extracted_data, analysis_status, analysis_error, analyzed_at`,
      [file.name, file.type, bytes.length, bytes],
    );

    let document = rows[0];

    // Optional auto-analysis on upload
    if (shouldAutoAnalyze) {
      try {
        const extraction = await analyzeDocumentWithVision(bytes, file.type, clientApiKey);

        // Validate the LLM output against Zod schemas — an incomplete document
        // must be flagged instead of being persisted as a successful extraction.
        const validation = safeParseVisionResult(extraction);

        if (!validation.success) {
          const errorSummary = `Errores de validación: ${validation.errors.join(" | ")}`;
          await pool.query(
            "UPDATE documents SET analysis_status = 'failed', analysis_error = $1 WHERE id = $2",
            [errorSummary, document.id],
          );
          document.analysis_status = "failed";
          document.analysis_error = errorSummary;
        } else {
          const updateResult = await pool.query<DocumentRow>(
            `UPDATE documents
                SET document_type = $1,
                    extracted_data = $2,
                    analysis_status = 'completed',
                    analysis_error = NULL,
                    analyzed_at = NOW()
              WHERE id = $3
            RETURNING id, filename, mime_type, size_bytes, created_at,
                      document_type, extracted_data, analysis_status, analysis_error, analyzed_at`,
            [validation.data.tipo_documento, JSON.stringify(validation.data), document.id],
          );
          document = updateResult.rows[0];
        }
      } catch (analysisErr) {
        const msg = (analysisErr as Error).message;
        await pool.query(
          "UPDATE documents SET analysis_status = 'failed', analysis_error = $1 WHERE id = $2",
          [msg, document.id],
        );
        document.analysis_status = "failed";
        document.analysis_error = msg;
      }
    }

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
