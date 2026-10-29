-- Runs automatically the first time the Postgres container is created.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename        text NOT NULL,
  mime_type       text NOT NULL,
  size_bytes      bigint NOT NULL,
  data            bytea NOT NULL,
  document_type   text,
  extracted_data  jsonb,
  analysis_status text DEFAULT 'pending',
  analysis_error  text,
  analyzed_at     timestamptz,
  is_confirmed    boolean DEFAULT false,
  confirmed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Tablas relacionales para datos estructurados extraídos
CREATE TABLE IF NOT EXISTS facturas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id                 uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE UNIQUE,
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
  created_at                  timestamptz NOT NULL DEFAULT now()
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
  document_id               uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE UNIQUE,
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
  created_at                timestamptz NOT NULL DEFAULT now()
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
  document_id                 uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE UNIQUE,
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
  created_at                  timestamptz NOT NULL DEFAULT now()
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

CREATE TABLE IF NOT EXISTS document_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content     text NOT NULL,
  embedding   vector(1536),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
  ON document_chunks (document_id);
