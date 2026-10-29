/**
 * Embeddings & Text Extraction Service for PG Vector
 *
 * Extracts semantic text chunks from structured document data (titles, names,
 * addresses, descriptions, clauses, totals) and generates 1536-dimensional
 * embeddings compatible with pgvector (vector(1536)).
 */

import type { VisionResultData } from "@/lib/schemas";

export interface TextChunk {
  content: string;
  source: string; // e.g. "resumen", "emisor", "item", "clausula"
}

/**
 * Extracts all relevant semantic texts from the structured document
 * (titles, parties/names, addresses, line items, clauses, summary, totals).
 */
export function extractDocumentTexts(data: VisionResultData): TextChunk[] {
  const chunks: TextChunk[] = [];

  // 1. Executive summary
  if (data.resumen?.trim()) {
    chunks.push({
      content: `Resumen ejecutivo: ${data.resumen.trim()}`,
      source: "resumen",
    });
  }

  // 2. Factura-specific texts
  if (data.tipo_documento === "factura" && data.datos_extraidos.factura) {
    const f = data.datos_extraidos.factura;

    const header = [
      `Factura: ${f.numero_factura}`,
      f.serie ? `Serie: ${f.serie}` : null,
      f.fecha_emision ? `Fecha de emisión: ${f.fecha_emision}` : null,
      f.fecha_vencimiento ? `Fecha de vencimiento: ${f.fecha_vencimiento}` : null,
      f.moneda ? `Moneda: ${f.moneda}` : null,
      f.total != null ? `Total: ${f.total}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    chunks.push({ content: header, source: "cabecera" });

    // Emisor (Nombre, Identificación fiscal, Dirección, Contacto)
    if (f.emisor) {
      const emisorParts = [
        f.emisor.nombre ? `Emisor: ${f.emisor.nombre}` : null,
        f.emisor.identificacion_fiscal
          ? `Identificación fiscal: ${f.emisor.identificacion_fiscal}`
          : null,
        f.emisor.direccion ? `Dirección emisor: ${f.emisor.direccion}` : null,
        f.emisor.telefono ? `Teléfono: ${f.emisor.telefono}` : null,
        f.emisor.email ? `Email: ${f.emisor.email}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      if (emisorParts) {
        chunks.push({ content: emisorParts, source: "emisor" });
      }
    }

    // Receptor (Nombre, Identificación fiscal, Dirección)
    if (f.receptor) {
      const receptorParts = [
        f.receptor.nombre ? `Receptor / Cliente: ${f.receptor.nombre}` : null,
        f.receptor.identificacion_fiscal
          ? `Identificación fiscal: ${f.receptor.identificacion_fiscal}`
          : null,
        f.receptor.direccion ? `Dirección receptor: ${f.receptor.direccion}` : null,
        f.receptor.email ? `Email: ${f.receptor.email}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      if (receptorParts) {
        chunks.push({ content: receptorParts, source: "receptor" });
      }
    }

    // Items / Productos o Servicios
    if (f.items && f.items.length > 0) {
      for (const item of f.items) {
        const itemText = [
          `Ítem factura: ${item.descripcion}`,
          item.cantidad != null ? `Cantidad: ${item.cantidad}` : null,
          item.precio_unitario != null ? `Precio unitario: ${item.precio_unitario}` : null,
          item.subtotal != null ? `Subtotal: ${item.subtotal}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        chunks.push({ content: itemText, source: "item" });
      }
    }

    // Totales, Impuestos y Métodos de pago
    const totalesParts = [
      f.subtotal != null ? `Subtotal: ${f.subtotal}` : null,
      f.impuestos?.monto != null
        ? `Impuestos (${f.impuestos.tipo || "IVA"} ${f.impuestos.tasa_porcentaje ?? ""}%): ${f.impuestos.monto}`
        : null,
      f.descuento_total != null ? `Descuento: ${f.descuento_total}` : null,
      f.total != null ? `Total final: ${f.total}` : null,
      f.metodo_pago ? `Método de pago: ${f.metodo_pago}` : null,
      f.condiciones_pago ? `Condiciones de pago: ${f.condiciones_pago}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    if (totalesParts) {
      chunks.push({ content: totalesParts, source: "totales" });
    }
  }

  // 3. Recibo-specific texts
  if (data.tipo_documento === "recibo" && data.datos_extraidos.recibo) {
    const r = data.datos_extraidos.recibo;

    const cabeceraRecibo = [
      `Recibo / Ticket: ${r.establecimiento}`,
      r.numero_recibo ? `N.°: ${r.numero_recibo}` : null,
      r.fecha_hora ? `Fecha y hora: ${r.fecha_hora}` : null,
      r.direccion ? `Dirección establecimiento: ${r.direccion}` : null,
      r.identificacion_fiscal ? `Identificación fiscal: ${r.identificacion_fiscal}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    chunks.push({ content: cabeceraRecibo, source: "establecimiento" });

    if (r.items && r.items.length > 0) {
      for (const item of r.items) {
        const itemDesc = [
          `Producto/Servicio: ${item.nombre}`,
          item.cantidad != null ? `Cantidad: ${item.cantidad}` : null,
          item.precio != null ? `Precio: ${item.precio}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        chunks.push({ content: itemDesc, source: "item" });
      }
    }

    const montosRecibo = [
      r.subtotal != null ? `Subtotal: ${r.subtotal}` : null,
      r.propina != null ? `Propina: ${r.propina}` : null,
      r.impuesto != null ? `Impuesto: ${r.impuesto}` : null,
      r.total != null ? `Total: ${r.total}` : null,
      r.metodo_pago ? `Método de pago: ${r.metodo_pago}` : null,
      r.ultimos_4_digitos_tarjeta ? `Tarjeta terminada en: ${r.ultimos_4_digitos_tarjeta}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    if (montosRecibo) {
      chunks.push({ content: montosRecibo, source: "totales" });
    }
  }

  // 4. Contrato-specific texts
  if (data.tipo_documento === "contrato" && data.datos_extraidos.contrato) {
    const c = data.datos_extraidos.contrato;

    chunks.push({
      content: `Contrato: ${c.titulo} | Tipo: ${c.tipo_contrato}${c.fecha_firma ? ` | Fecha firma: ${c.fecha_firma}` : ""}${c.lugar_firma ? ` | Lugar: ${c.lugar_firma}` : ""}`,
      source: "titulo",
    });

    if (c.vigencia) {
      const vigenciaText = [
        c.vigencia.fecha_inicio ? `Vigencia inicio: ${c.vigencia.fecha_inicio}` : null,
        c.vigencia.fecha_fin ? `Vigencia fin: ${c.vigencia.fecha_fin}` : null,
        c.vigencia.duracion ? `Duración: ${c.vigencia.duracion}` : null,
        c.vigencia.renovacion_automatica != null
          ? `Renovación automática: ${c.vigencia.renovacion_automatica ? "Sí" : "No"}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ");

      if (vigenciaText) {
        chunks.push({ content: vigenciaText, source: "vigencia" });
      }
    }

    if (c.partes && c.partes.length > 0) {
      for (const p of c.partes) {
        const parteText = [
          `Parte del contrato: ${p.nombre}`,
          `Rol: ${p.rol}`,
          p.identificacion ? `Identificación: ${p.identificacion}` : null,
          p.representante_legal ? `Representante legal: ${p.representante_legal}` : null,
          p.domicilio ? `Domicilio: ${p.domicilio}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        chunks.push({ content: parteText, source: "parte" });
      }
    }

    if (c.objeto_del_contrato?.trim()) {
      chunks.push({
        content: `Objeto del contrato: ${c.objeto_del_contrato.trim()}`,
        source: "objeto",
      });
    }

    if (c.contraprestacion_economica) {
      const pago = [
        c.contraprestacion_economica.monto != null
          ? `Monto: ${c.contraprestacion_economica.monto}`
          : null,
        c.contraprestacion_economica.moneda ? `Moneda: ${c.contraprestacion_economica.moneda}` : null,
        c.contraprestacion_economica.forma_pago
          ? `Forma de pago: ${c.contraprestacion_economica.forma_pago}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ");

      if (pago) {
        chunks.push({ content: `Contraprestación económica: ${pago}`, source: "pago" });
      }
    }

    if (c.clausulas_clave && c.clausulas_clave.length > 0) {
      for (const cl of c.clausulas_clave) {
        chunks.push({
          content: `Cláusula ${cl.numero ? cl.numero + " - " : ""}${cl.titulo}: ${cl.resumen}`,
          source: "clausula",
        });
      }
    }

    if (c.jurisdiccion_o_ley_aplicable?.trim()) {
      chunks.push({
        content: `Jurisdicción y ley aplicable: ${c.jurisdiccion_o_ley_aplicable.trim()}`,
        source: "jurisdiccion",
      });
    }
  }

  // 5. Otro-specific texts
  if (data.tipo_documento === "otro" && data.datos_extraidos.otro) {
    const o = data.datos_extraidos.otro;
    chunks.push({
      content: `Documento general: ${o.descripcion}${o.tema_principal ? ` | Tema: ${o.tema_principal}` : ""}`,
      source: "otro",
    });
  }

  return chunks;
}

/**
 * Dimension expected by pgvector table (vector(1536)).
 */
export const EMBEDDING_DIMENSION = 1536;

/**
 * Deterministic pseudo-embedding generator of 1536 dimensions.
 * Uses L2-normalized token hashed distributions. Ensures tests and environments
 * without an active paid API key run instantly and deterministically.
 */
export function generateLocalEmbedding(text: string, dimension: number = EMBEDDING_DIMENSION): number[] {
  const vec = new Float64Array(dimension);
  const normalized = text.toLowerCase().normalize("NFKD");

  // Hash character n-grams and tokens to distribute energy across 1536 dimensions
  const words = normalized.split(/\s+/).filter(Boolean);
  for (let wIdx = 0; wIdx < words.length; wIdx++) {
    const word = words[wIdx];
    let hash = 0x811c9dc5;
    for (let i = 0; i < word.length; i++) {
      hash ^= word.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
      const dim = Math.abs(hash) % dimension;
      vec[dim] += (wIdx + 1) / (word.length + 1);
    }
  }

  // Character 3-grams
  for (let i = 0; i < normalized.length - 2; i++) {
    const code =
      normalized.charCodeAt(i) * 31 * 31 +
      normalized.charCodeAt(i + 1) * 31 +
      normalized.charCodeAt(i + 2);
    const dim = Math.abs(code) % dimension;
    vec[dim] += 0.5;
  }

  // L2-normalize
  let sumSq = 0;
  for (let i = 0; i < dimension; i++) {
    sumSq += vec[i] * vec[i];
  }

  const norm = Math.sqrt(sumSq) || 1;
  const result: number[] = new Array(dimension);
  for (let i = 0; i < dimension; i++) {
    result[i] = Number((vec[i] / norm).toFixed(6));
  }

  return result;
}

/**
 * Generates a 1536-dimensional embedding vector for a given text.
 * If an OpenAI or OpenRouter embedding API key is available, calls the API;
 * otherwise uses the deterministic 1536-dim generator.
 */
export async function getEmbedding(text: string, apiKey?: string): Promise<number[]> {
  const key =
    apiKey ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY;

  if (key && (process.env.OPENAI_API_KEY || key.startsWith("sk-proj-") || key.startsWith("sk-live-"))) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text.slice(0, 8000),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const dataVec = json.data?.[0]?.embedding;
        if (Array.isArray(dataVec) && dataVec.length === EMBEDDING_DIMENSION) {
          return dataVec;
        }
      }
    } catch {
      // Fallback to local on network or auth errors
    }
  }

  return generateLocalEmbedding(text, EMBEDDING_DIMENSION);
}

/**
 * Converts a float array into Postgres vector syntax string literal: '[0.01,0.02,...]'
 */
export function vectorToPgLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

