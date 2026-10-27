import { NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import { analyzeDocumentWithVision } from "@/lib/vision";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await ensureSchema();

    let apiKeyFromClient: string | undefined;
    const headerKey = request.headers.get("x-gemini-api-key");
    if (headerKey) {
      apiKeyFromClient = headerKey;
    } else {
      try {
        const body = await request.json();
        if (body?.apiKey) apiKeyFromClient = body.apiKey;
      } catch {
        // Body is optional
      }
    }

    // Retrieve the document data
    const { rows } = await pool.query<{
      id: string;
      filename: string;
      mime_type: string;
      data: Buffer;
    }>("SELECT id, filename, mime_type, data FROM documents WHERE id = $1", [id]);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: `Documento con ID ${id} no encontrado.` },
        { status: 404 },
      );
    }

    const doc = rows[0];

    // Mark as processing
    await pool.query(
      "UPDATE documents SET analysis_status = 'processing', analysis_error = NULL WHERE id = $1",
      [id],
    );

    try {
      // Analyze with Vision LLM (Gemini 3.8 Flash)
      const extraction = await analyzeDocumentWithVision(
        doc.data,
        doc.mime_type,
        apiKeyFromClient,
      );

      // Save structured extraction and detected document type
      const updateResult = await pool.query(
        `UPDATE documents
            SET document_type = $1,
                extracted_data = $2,
                analysis_status = 'completed',
                analysis_error = NULL,
                analyzed_at = NOW()
          WHERE id = $3
      RETURNING id, filename, mime_type, size_bytes, created_at,
                document_type, extracted_data, analysis_status, analysis_error, analyzed_at`,
        [extraction.tipo_documento, JSON.stringify(extraction), id],
      );

      return NextResponse.json({
        success: true,
        document: updateResult.rows[0],
        extraction,
      });
    } catch (analysisErr) {
      const errorMessage = (analysisErr as Error).message;
      await pool.query(
        "UPDATE documents SET analysis_status = 'failed', analysis_error = $1 WHERE id = $2",
        [errorMessage, id],
      );
      return NextResponse.json(
        { error: errorMessage },
        { status: 422 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}

