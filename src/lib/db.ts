import { Pool } from "pg";

const connectionString =
  process.env.POSTGRES_URL ??
  "postgresql://postgres:postgres@localhost:5432/extracto";

const globalForDb = globalThis as unknown as { extractoPool?: Pool };

function createDbPool(rawUrl: string): Pool {
  const isLocal =
    rawUrl.includes("localhost") ||
    rawUrl.includes("127.0.0.1") ||
    rawUrl.includes("::1");

  if (isLocal) {
    return new Pool({ connectionString: rawUrl, max: 10 });
  }

  // Para bases de datos remotas (Supabase, Neon, AWS RDS, etc.):
  // Se elimina el parámetro `sslmode` del query string para evitar que pg-connection-string
  // fuerce verificación estricta de CA (verify-full) y se habilita rejectUnauthorized: false
  // para permitir certificados autofirmados / cadenas intermedias de proveedores cloud.
  let cleanUrl = rawUrl;
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.delete("sslmode");
    cleanUrl = parsed.toString();
  } catch {
    // Si no es un URL estándar, se usa como está
  }

  return new Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });
}

export const pool = globalForDb.extractoPool ?? createDbPool(connectionString);

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
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_confirmed boolean DEFAULT false;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
    `);

    // Tablas para almacenamiento estructurado en PostgreSQL
    await client.query(`
      CREATE TABLE IF NOT EXISTS facturas (
        id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id                 uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        numero_factura              text NOT NULL,
        serie                       text,
        fecha_emision               date NOT NULL,
        fecha_vencimiento           date,
        moneda                      text,
        emisor_nombre               text,
        emisor_identificacion_fiscal text,
        emisor_direccion            text,
        emisor_telefono             text,
        emisor_email                text,
        receptor_nombre             text,
        receptor_identificacion_fiscal text,
        receptor_direccion          text,
        receptor_email              text,
        subtotal                    numeric(14,2),
        impuesto_tipo               text,
        impuesto_tasa               numeric(5,2),
        impuesto_monto              numeric(14,2),
        descuento_total             numeric(14,2),
        total                       numeric(14,2),
        metodo_pago                 text,
        condiciones_pago            text,
        created_at                  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_facturas_document UNIQUE (document_id)
      );

      CREATE TABLE IF NOT EXISTS factura_items (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        factura_id      uuid NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
        descripcion     text NOT NULL,
        cantidad        numeric(12,3),
        precio_unitario numeric(14,2),
        descuento       numeric(14,2),
        subtotal        numeric(14,2)
      );

      CREATE TABLE IF NOT EXISTS recibos (
        id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id               uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        establecimiento           text NOT NULL,
        numero_recibo             text,
        identificacion_fiscal     text,
        direccion                 text,
        fecha_hora                timestamptz NOT NULL,
        subtotal                  numeric(14,2),
        propina                   numeric(14,2),
        impuesto                  numeric(14,2),
        total                     numeric(14,2),
        metodo_pago               text,
        ultimos_4_digitos_tarjeta text,
        numero_autorizacion       text,
        created_at                timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_recibos_document UNIQUE (document_id)
      );

      CREATE TABLE IF NOT EXISTS recibo_items (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        recibo_id   uuid NOT NULL REFERENCES recibos(id) ON DELETE CASCADE,
        nombre      text NOT NULL,
        cantidad    numeric(12,3),
        precio      numeric(14,2)
      );

      CREATE TABLE IF NOT EXISTS contratos (
        id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id                 uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        titulo                      text NOT NULL,
        tipo_contrato               text NOT NULL,
        fecha_firma                 date,
        lugar_firma                 text,
        vigencia_inicio             date,
        vigencia_fin                date,
        vigencia_duracion           text,
        renovacion_automatica       boolean,
        objeto_del_contrato         text,
        monto_contraprestacion      numeric(14,2),
        moneda                      text,
        forma_pago                  text,
        penalidades_o_recision      text,
        jurisdiccion                text,
        created_at                  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_contratos_document UNIQUE (document_id)
      );

      CREATE TABLE IF NOT EXISTS contrato_partes (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contrato_id         uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
        nombre              text NOT NULL,
        rol                 text NOT NULL,
        identificacion      text,
        representante_legal text,
        domicilio           text
      );

      CREATE TABLE IF NOT EXISTS contrato_clausulas (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
        numero      text,
        titulo      text NOT NULL,
        resumen     text NOT NULL
      );
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
  is_confirmed?: boolean | null;
  confirmed_at?: string | null;
};
