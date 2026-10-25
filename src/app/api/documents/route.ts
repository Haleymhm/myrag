import { NextResponse } from "next/server";
import { ensureSchema, pool, type DocumentRow } from "@/lib/db";

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
      `SELECT id, filename, mime_type, size_bytes, created_at
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
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was provided." }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type || "unknown"}.` },
        { status: 415 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const { rows } = await pool.query<DocumentRow>(
      `INSERT INTO documents (filename, mime_type, size_bytes, data)
       VALUES ($1, $2, $3, $4)
       RETURNING id, filename, mime_type, size_bytes, created_at`,
      [file.name, file.type, bytes.length, bytes],
    );

    return NextResponse.json({ document: rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
