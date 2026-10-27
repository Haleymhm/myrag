import { pool } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { rows } = await pool.query<{
      filename: string;
      mime_type: string;
      data: Buffer;
    }>("SELECT filename, mime_type, data FROM documents WHERE id = $1", [id]);

    if (rows.length === 0) {
      return new Response("Not found", { status: 404 });
    }

    const row = rows[0];
    const body = new Uint8Array(row.data);

    return new Response(body, {
      headers: {
        "Content-Type": row.mime_type,
        "Content-Disposition": `inline; filename="${encodeURIComponent(row.filename)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return new Response((error as Error).message, { status: 500 });
  }
}
