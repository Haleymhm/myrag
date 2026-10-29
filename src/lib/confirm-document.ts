/**
 * Document Confirmation & Vectorization Service
 *
 * Validates the structured data against Zod schemas, then:
 * 1. Inserts the relational records into the respective PostgreSQL tables
 *    (facturas + factura_items, recibos + recibo_items, contratos + contrato_partes + contrato_clausulas).
 * 2. Extracts all semantic textual fragments (titles, names, addresses, items, clauses, summary).
 * 3. Generates 1536-dimensional embeddings for each fragment.
 * 4. Inserts the vectors into pgvector `document_chunks (document_id, content, embedding)`.
 * 5. Marks the document as confirmed.
 */

import { pool, ensureSchema, type DocumentRow } from "@/lib/db";
import { safeParseVisionResult, type VisionResultData } from "@/lib/schemas";
import {
  extractDocumentTexts,
  getEmbedding,
  vectorToPgLiteral,
} from "@/lib/embeddings";

export interface ConfirmationResult {
  success: boolean;
  documentId: string;
  documentType: string;
  structuredRecordsInserted: number;
  chunksVectorized: number;
  warnings: string[];
}

export async function confirmAndVectorizeDocument(
  documentId: string,
  apiKey?: string,
): Promise<ConfirmationResult> {
  await ensureSchema();

  // 1. Fetch document
  const { rows: docRows } = await pool.query<DocumentRow>(
    `SELECT id, filename, mime_type, document_type, extracted_data, analysis_status
       FROM documents
      WHERE id = $1`,
    [documentId],
  );

  if (docRows.length === 0) {
    throw new Error(`Documento no encontrado: ${documentId}`);
  }

  const doc = docRows[0];
  if (!doc.extracted_data) {
    throw new Error(
      "El documento no tiene datos extraídos estructurados para confirmar.",
    );
  }

  // 2. Validate against Zod schemas
  const validation = safeParseVisionResult(doc.extracted_data);
  if (!validation.success) {
    throw new Error(
      `Los datos no cumplen las reglas de validación: ${validation.errors.join(" | ")}`,
    );
  }

  const validData: VisionResultData = validation.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Clean any prior confirmed records for idempotency
    await client.query("DELETE FROM facturas WHERE document_id = $1", [documentId]);
    await client.query("DELETE FROM recibos WHERE document_id = $1", [documentId]);
    await client.query("DELETE FROM contratos WHERE document_id = $1", [documentId]);
    await client.query("DELETE FROM document_chunks WHERE document_id = $1", [documentId]);

    let structuredRecordsInserted = 0;

    // 3. Persist into PostgreSQL relational tables
    if (validData.tipo_documento === "factura" && validData.datos_extraidos.factura) {
      const f = validData.datos_extraidos.factura;
      const { rows: facturaRows } = await client.query<{ id: string }>(
        `INSERT INTO facturas (
          document_id, numero_factura, serie, fecha_emision, fecha_vencimiento, moneda,
          emisor_nombre, emisor_identificacion_fiscal, emisor_direccion, emisor_telefono, emisor_email,
          receptor_nombre, receptor_identificacion_fiscal, receptor_direccion, receptor_email,
          subtotal, impuesto_tipo, impuesto_tasa, impuesto_monto, descuento_total, total,
          metodo_pago, condiciones_pago
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21,
          $22, $23
        ) RETURNING id`,
        [
          documentId,
          f.numero_factura,
          f.serie ?? null,
          f.fecha_emision,
          f.fecha_vencimiento ?? null,
          f.moneda ?? null,
          f.emisor?.nombre ?? null,
          f.emisor?.identificacion_fiscal ?? null,
          f.emisor?.direccion ?? null,
          f.emisor?.telefono ?? null,
          f.emisor?.email ?? null,
          f.receptor?.nombre ?? null,
          f.receptor?.identificacion_fiscal ?? null,
          f.receptor?.direccion ?? null,
          f.receptor?.email ?? null,
          f.subtotal ?? null,
          f.impuestos?.tipo ?? null,
          f.impuestos?.tasa_porcentaje ?? null,
          f.impuestos?.monto ?? null,
          f.descuento_total ?? null,
          f.total ?? null,
          f.metodo_pago ?? null,
          f.condiciones_pago ?? null,
        ],
      );
      structuredRecordsInserted += 1;

      const facturaId = facturaRows[0].id;
      if (f.items && f.items.length > 0) {
        for (const item of f.items) {
          await client.query(
            `INSERT INTO factura_items (
              factura_id, descripcion, cantidad, precio_unitario, descuento, subtotal
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              facturaId,
              item.descripcion,
              item.cantidad ?? null,
              item.precio_unitario ?? null,
              item.descuento ?? null,
              item.subtotal ?? null,
            ],
          );
          structuredRecordsInserted += 1;
        }
      }
    } else if (validData.tipo_documento === "recibo" && validData.datos_extraidos.recibo) {
      const r = validData.datos_extraidos.recibo;
      const { rows: reciboRows } = await client.query<{ id: string }>(
        `INSERT INTO recibos (
          document_id, establecimiento, numero_recibo, identificacion_fiscal, direccion,
          fecha_hora, subtotal, propina, impuesto, total, metodo_pago,
          ultimos_4_digitos_tarjeta, numero_autorizacion
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11,
          $12, $13
        ) RETURNING id`,
        [
          documentId,
          r.establecimiento,
          r.numero_recibo ?? null,
          r.identificacion_fiscal ?? null,
          r.direccion ?? null,
          r.fecha_hora,
          r.subtotal ?? null,
          r.propina ?? null,
          r.impuesto ?? null,
          r.total ?? null,
          r.metodo_pago ?? null,
          r.ultimos_4_digitos_tarjeta ?? null,
          r.numero_autorizacion ?? null,
        ],
      );
      structuredRecordsInserted += 1;

      const reciboId = reciboRows[0].id;
      if (r.items && r.items.length > 0) {
        for (const item of r.items) {
          await client.query(
            `INSERT INTO recibo_items (recibo_id, nombre, cantidad, precio)
             VALUES ($1, $2, $3, $4)`,
            [reciboId, item.nombre, item.cantidad ?? null, item.precio ?? null],
          );
          structuredRecordsInserted += 1;
        }
      }
    } else if (validData.tipo_documento === "contrato" && validData.datos_extraidos.contrato) {
      const c = validData.datos_extraidos.contrato;
      const { rows: contratoRows } = await client.query<{ id: string }>(
        `INSERT INTO contratos (
          document_id, titulo, tipo_contrato, fecha_firma, lugar_firma,
          vigencia_inicio, vigencia_fin, vigencia_duracion, renovacion_automatica,
          objeto_del_contrato, monto_contraprestacion, moneda, forma_pago,
          penalidades_o_recision, jurisdiccion
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15
        ) RETURNING id`,
        [
          documentId,
          c.titulo,
          c.tipo_contrato,
          c.fecha_firma ?? null,
          c.lugar_firma ?? null,
          c.vigencia?.fecha_inicio ?? null,
          c.vigencia?.fecha_fin ?? null,
          c.vigencia?.duracion ?? null,
          c.vigencia?.renovacion_automatica ?? null,
          c.objeto_del_contrato ?? null,
          c.contraprestacion_economica?.monto ?? null,
          c.contraprestacion_economica?.moneda ?? null,
          c.contraprestacion_economica?.forma_pago ?? null,
          c.penalidades_o_recision ?? null,
          c.jurisdiccion_o_ley_aplicable ?? null,
        ],
      );
      structuredRecordsInserted += 1;

      const contratoId = contratoRows[0].id;
      if (c.partes && c.partes.length > 0) {
        for (const parte of c.partes) {
          await client.query(
            `INSERT INTO contrato_partes (
              contrato_id, nombre, rol, identificacion, representante_legal, domicilio
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              contratoId,
              parte.nombre,
              parte.rol,
              parte.identificacion ?? null,
              parte.representante_legal ?? null,
              parte.domicilio ?? null,
            ],
          );
          structuredRecordsInserted += 1;
        }
      }

      if (c.clausulas_clave && c.clausulas_clave.length > 0) {
        for (const cl of c.clausulas_clave) {
          await client.query(
            `INSERT INTO contrato_clausulas (contrato_id, numero, titulo, resumen)
             VALUES ($1, $2, $3, $4)`,
            [contratoId, cl.numero ?? null, cl.titulo, cl.resumen],
          );
          structuredRecordsInserted += 1;
        }
      }
    }

    // 4. Extract text fragments & convert to embeddings
    const textChunks = extractDocumentTexts(validData);
    let chunksVectorized = 0;

    for (const chunk of textChunks) {
      const embedding = await getEmbedding(chunk.content, apiKey);
      const pgLiteral = vectorToPgLiteral(embedding);

      await client.query(
        `INSERT INTO document_chunks (document_id, content, embedding)
         VALUES ($1, $2, $3::vector)`,
        [documentId, chunk.content, pgLiteral],
      );
      chunksVectorized += 1;
    }

    // 5. Update document confirmation status
    await client.query(
      `UPDATE documents
          SET is_confirmed = true,
              confirmed_at = NOW()
        WHERE id = $1`,
      [documentId],
    );

    await client.query("COMMIT");

    return {
      success: true,
      documentId,
      documentType: validData.tipo_documento,
      structuredRecordsInserted,
      chunksVectorized,
      warnings: validation.warnings,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

