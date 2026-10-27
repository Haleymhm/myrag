import { Pool } from "pg";

const connectionString =
  process.env.POSTGRES_URL ??
  "postgresql://postgres:postgres@localhost:5432/extracto";

const globalForDb = globalThis as unknown as { extractoPool?: Pool };

export const pool =
  globalForDb.extractoPool ??
  new Pool({
    connectionString,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.extractoPool = pool;
}

let schemaReady: Promise<void> | null = null;

/**
 * Creates the pgvector extension and the base tables on first use, so the app
 * works even when the Docker init script has not run yet.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = initSchema().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function initSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        filename    text NOT NULL,
        mime_type   text NOT NULL,
        size_bytes  bigint NOT NULL,
        data        bytea NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Schema migration for vision analysis and structured extraction
    await client.query(`
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type text;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_data jsonb;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS analysis_status text DEFAULT 'pending';
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS analysis_error text;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        content     text NOT NULL,
        embedding   vector(1536),
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
         ON document_chunks USING hnsw (embedding vector_cosine_ops)`,
    );
  } finally {
    client.release();
  }
}

export type DocumentType = "factura" | "recibo" | "contrato" | "otro";

export type AnalysisStatus = "pending" | "processing" | "completed" | "failed";

export type DocumentRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  created_at: string;
  document_type?: DocumentType | null;
  extracted_data?: Record<string, unknown> | null;
  analysis_status?: AnalysisStatus | null;
  analysis_error?: string | null;
  analyzed_at?: string | null;
};
