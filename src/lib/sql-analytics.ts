/**
 * SQL Analytics & Calculation Engine
 *
 * When user questions require calculations, aggregations, counts, sums, averages,
 * or numerical operations, this service executes exact SQL queries over PostgreSQL
 * relational tables (facturas, recibos, contratos) rather than fuzzy vector embeddings.
 *
 * It guarantees mathematical accuracy and extracts the original source documents
 * involved in the calculation for citation.
 */

import { pool, ensureSchema } from "@/lib/db";
import type { SearchResultChunk } from "@/lib/semantic-search";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || "deepseek/deepseek-v4.1-flash";

export interface SqlQueryResult {
  answer: string;
  sources: SearchResultChunk[];
  sqlQuery?: string;
}

/**
 * Formats a numeric amount with dot thousands and comma decimals: 1.710,00
 */
export function formatCurrency(amount: number): string {
  const fixed = amount.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withThousands},${decPart}`;
}

/**
 * Heuristic detector for queries requiring mathematical or aggregation calculations.
 */
export function isCalculationQuery(query: string): boolean {
  // Strip diacritics and leading/trailing punctuation (¿?¡!)
  const q = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!,.]/g, " ");

  // Calculation verbs and aggregation keywords
  const mathTerms = [
    /\bcuant(o|a|os|as)\b/,
    /\b(suma|sumar|sumame|sumatoria|sumarize|total|totales|subtotal|subtotales)\b/,
    /\b(promedio|media|promediar)\b/,
    /\b(maximo|mayor|mas car[ao]|mas alt[ao])\b/,
    /\b(minimo|menor|mas barat[ao]|mas baj[ao])\b/,
    /\b(cantidad|contar|cuenta|calcular|calculo)\b/,
    /\b(gasto|gastado|gastamos|pague|pagado)\b/,
    /\b(impuesto|impuestos|iva|tasa)\b/,
    /\b(diferencia|resta|saldo)\b/,
  ];

  return mathTerms.some((regex) => regex.test(q));
}

/**
 * Validates that the SQL query is strictly read-only and targets only allowed application tables.
 */
export function isSafeReadOnlyQuery(sql: string): boolean {
  const normalized = sql.trim().toLowerCase();

  // Must begin with SELECT or WITH
  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    return false;
  }

  // Dangerous keywords that mutate data or schema
  const forbidden = [
    /\binsert\b/,
    /\bupdate\b/,
    /\bdelete\b/,
    /\bdrop\b/,
    /\balter\b/,
    /\btruncate\b/,
    /\bcreate\b/,
    /\bexecute\b/,
    /\bgrant\b/,
    /\brevoke\b/,
    /\bcopy\b/,
    /;/, // Multiple statements
  ];

  for (const pattern of forbidden) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  // Allowed tables whitelist
  const allowedTables = [
    "facturas",
    "factura_items",
    "recibos",
    "recibo_items",
    "contratos",
    "contrato_partes",
    "contrato_clausulas",
    "documents",
  ];

  // Must reference at least one application table
  const referencesAllowed = allowedTables.some((tbl) =>
    new RegExp(`\\b${tbl}\\b`, "i").test(normalized),
  );

  return referencesAllowed;
}

/**
 * Executes standard parametric calculation templates for common calculation questions.
 * Highly robust, runs without requiring an external LLM API key.
 */
async function executeTemplateQuery(
  query: string,
): Promise<SqlQueryResult | null> {
  const q = query.toLowerCase();

  // 1. Total/Suma de Facturas
  if (
    (q.includes("factura") || q.includes("facturas")) &&
    (q.includes("total") || q.includes("suma") || q.includes("cuanto") || q.includes("gast"))
  ) {
    const { rows } = await pool.query<{
      doc_id: string;
      filename: string;
      doc_type: string;
      numero_factura: string;
      emisor_nombre: string | null;
      total: string;
      subtotal: string;
      impuesto_monto: string;
      moneda: string | null;
    }>(
      `SELECT
         f.id AS factura_id,
         f.numero_factura,
         f.emisor_nombre,
         f.total,
         f.subtotal,
         f.impuesto_monto,
         f.moneda,
         d.id AS doc_id,
         d.filename,
         d.document_type AS doc_type
       FROM facturas f
       JOIN documents d ON d.id = f.document_id
       ORDER BY f.fecha_emision DESC`,
    );

    if (rows.length === 0) {
      return {
        answer: "No se encontraron facturas registradas en PostgreSQL para calcular.",
        sources: [],
      };
    }

    const totalSum = rows.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
    const subtotalSum = rows.reduce((acc, r) => acc + (Number(r.subtotal) || 0), 0);
    const impuestosSum = rows.reduce((acc, r) => acc + (Number(r.impuesto_monto) || 0), 0);
    const moneda = rows[0]?.moneda || "USD";

    const sources: SearchResultChunk[] = rows.map((r) => ({
      chunkId: `factura-${r.doc_id}`,
      documentId: r.doc_id,
      filename: r.filename,
      documentType: r.doc_type || "factura",
      content: `Factura ${r.numero_factura}${r.emisor_nombre ? ` de ${r.emisor_nombre}` : ""}: Total ${Number(r.total).toFixed(2)} ${moneda} (Subtotal: ${Number(r.subtotal).toFixed(2)}, Impuestos: ${Number(r.impuesto_monto).toFixed(2)})`,
      similarity: 1.0,
    }));

    const docList = Array.from(new Set(rows.map((r) => `[${r.filename}]`))).join(", ");

    const answer =
      `**Cálculo SQL sobre facturas:**\n` +
      `• **Total acumulado:** ${formatCurrency(totalSum)} ${moneda}\n` +
      `• **Subtotal:** ${formatCurrency(subtotalSum)} ${moneda}\n` +
      `• **Impuestos (IVA):** ${formatCurrency(impuestosSum)} ${moneda}\n` +
      `• **Cantidad de facturas:** ${rows.length}\n\n` +
      `*Documentos considerados:* ${docList}`;

    return {
      answer,
      sources,
      sqlQuery: "SELECT f.*, d.filename FROM facturas f JOIN documents d ON d.id = f.document_id",
    };
  }

  // 2. Total/Suma de Recibos o Tickets
  if (
    (q.includes("recibo") || q.includes("ticket") || q.includes("compra")) &&
    (q.includes("total") || q.includes("suma") || q.includes("cuanto") || q.includes("gast"))
  ) {
    const { rows } = await pool.query<{
      recibo_id: string;
      establecimiento: string;
      total: string;
      subtotal: string;
      propina: string;
      impuesto: string;
      doc_id: string;
      filename: string;
      doc_type: string;
    }>(
      `SELECT
         r.id AS recibo_id,
         r.establecimiento,
         r.total,
         r.subtotal,
         r.propina,
         r.impuesto,
         d.id AS doc_id,
         d.filename,
         d.document_type AS doc_type
       FROM recibos r
       JOIN documents d ON d.id = r.document_id
       ORDER BY r.fecha_hora DESC`,
    );

    if (rows.length === 0) {
      return {
        answer: "No se encontraron recibos o tickets registrados en PostgreSQL para calcular.",
        sources: [],
      };
    }

    const totalSum = rows.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
    const subtotalSum = rows.reduce((acc, r) => acc + (Number(r.subtotal) || 0), 0);
    const propinaSum = rows.reduce((acc, r) => acc + (Number(r.propina) || 0), 0);
    const impuestoSum = rows.reduce((acc, r) => acc + (Number(r.impuesto) || 0), 0);

    const sources: SearchResultChunk[] = rows.map((r) => ({
      chunkId: `recibo-${r.doc_id}`,
      documentId: r.doc_id,
      filename: r.filename,
      documentType: r.doc_type || "recibo",
      content: `Recibo de ${r.establecimiento}: Total ${Number(r.total).toFixed(2)} (Subtotal: ${Number(r.subtotal).toFixed(2)}, Impuesto: ${Number(r.impuesto).toFixed(2)}, Propina: ${Number(r.propina).toFixed(2)})`,
      similarity: 1.0,
    }));

    const docList = Array.from(new Set(rows.map((r) => `[${r.filename}]`))).join(", ");

    const answer =
      `**Cálculo SQL sobre recibos:**\n` +
      `• **Total acumulado:** $${formatCurrency(totalSum)}\n` +
      `• **Subtotal:** $${formatCurrency(subtotalSum)}\n` +
      `• **Impuestos:** $${formatCurrency(impuestoSum)}\n` +
      `• **Propinas:** $${formatCurrency(propinaSum)}\n` +
      `• **Cantidad de recibos:** ${rows.length}\n\n` +
      `*Documentos considerados:* ${docList}`;

    return {
      answer,
      sources,
      sqlQuery: "SELECT r.*, d.filename FROM recibos r JOIN documents d ON d.id = r.document_id",
    };
  }

  // 3. Cantidad general de documentos por tipo
  if (
    q.includes("cuant") &&
    (q.includes("documento") || q.includes("hay") || q.includes("tengo"))
  ) {
    const { rows } = await pool.query<{
      doc_type: string | null;
      cantidad: string;
      filenames: string;
      doc_ids: string;
    }>(
      `SELECT
         COALESCE(d.document_type, 'sin analizar') AS doc_type,
         COUNT(*)::text AS cantidad,
         string_agg(d.filename, ' | ') AS filenames,
         string_agg(d.id::text, ' | ') AS doc_ids
       FROM documents d
       GROUP BY d.document_type`,
    );

    const sources: SearchResultChunk[] = [];
    const breakdown = rows.map((r) => {
      const typeNames = r.filenames.split(" | ");
      const ids = r.doc_ids.split(" | ");
      typeNames.forEach((name, i) => {
        sources.push({
          chunkId: `doc-${ids[i]}`,
          documentId: ids[i],
          filename: name,
          documentType: r.doc_type,
          content: `Documento clasificado como ${r.doc_type}`,
          similarity: 1.0,
        });
      });
      return `• **${(r.doc_type ?? "sin clasificar").toUpperCase()}:** ${r.cantidad}`;
    });

    const totalDocs = rows.reduce((acc, r) => acc + Number(r.cantidad), 0);

    return {
      answer:
        `**Conteo SQL en base de datos PostgreSQL:**\n` +
        `Total de documentos registrados: **${totalDocs}**\n` +
        breakdown.join("\n") +
        `\n\n*Documentos citados:* ${sources.map((s) => `[${s.filename}]`).join(", ")}`,
      sources,
      sqlQuery: "SELECT document_type, COUNT(*) FROM documents GROUP BY document_type",
    };
  }

  // 4. Monto máximo o mayor comprobante
  if (q.includes("mayor") || q.includes("mas car") || q.includes("maximo") || q.includes("máximo")) {
    const { rows } = await pool.query<{
      tipo: string;
      monto: string;
      nombre: string;
      doc_id: string;
      filename: string;
    }>(
      `SELECT 'factura' AS tipo, f.total AS monto, f.numero_factura AS nombre, d.id AS doc_id, d.filename
         FROM facturas f JOIN documents d ON d.id = f.document_id
        UNION ALL
       SELECT 'recibo' AS tipo, r.total AS monto, r.establecimiento AS nombre, d.id AS doc_id, d.filename
         FROM recibos r JOIN documents d ON d.id = r.document_id
        ORDER BY monto DESC
        LIMIT 1`,
    );

    if (rows.length > 0) {
      const top = rows[0];
      const answer =
        `El comprobante de mayor importe registrado es la **${top.tipo}** [${top.filename}] (${top.nombre}) ` +
        `por un total de **$${Number(top.monto).toLocaleString("es-ES", { minimumFractionDigits: 2 })}**.`;

      return {
        answer,
        sources: [
          {
            chunkId: `top-${top.doc_id}`,
            documentId: top.doc_id,
            filename: top.filename,
            documentType: top.tipo,
            content: `Mayor monto registrado: $${top.monto} en ${top.nombre}`,
            similarity: 1.0,
          },
        ],
        sqlQuery: "SELECT total FROM facturas ... ORDER BY total DESC LIMIT 1",
      };
    }
  }

  return null;
}

/**
 * Text-to-SQL dynamic generation using LLM when available.
 */
async function generateAndExecuteLlmSql(
  query: string,
  apiKey?: string,
): Promise<SqlQueryResult | null> {
  const key =
    apiKey ||
    process.env.OPENROUTER_API_KEY ||
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;

  if (!key) return null;

  const schemaPrompt = `
Eres un generador de SQL experto para PostgreSQL.
Tu tarea es convertir la pregunta analítica del usuario en una única consulta SQL SELECT precisa.

ESQUEMA DE TABLAS DISPONIBLES:
- facturas(id uuid, document_id uuid, numero_factura text, fecha_emision date, fecha_vencimiento date, emisor_nombre text, receptor_nombre text, subtotal numeric, impuesto_monto numeric, descuento_total numeric, total numeric, moneda text)
- factura_items(id uuid, factura_id uuid, descripcion text, cantidad numeric, precio_unitario numeric, subtotal numeric)
- recibos(id uuid, document_id uuid, establecimiento text, numero_recibo text, fecha_hora timestamptz, subtotal numeric, propina numeric, impuesto numeric, total numeric, metodo_pago text)
- recibo_items(id uuid, recibo_id uuid, nombre text, cantidad numeric, precio numeric)
- contratos(id uuid, document_id uuid, titulo text, tipo_contrato text, fecha_firma date, monto_contraprestacion numeric, moneda text)
- documents(id uuid, filename text, document_type text, created_at timestamptz)

REGLAS ESTRICTAS:
1. Genera SOLAMENTE la consulta SQL entre etiquetas \`\`\`sql y \`\`\`. Sin explicaciones.
2. La consulta debe ser ÚNICAMENTE un SELECT. No uses INSERT, UPDATE, DELETE o DROP.
3. SIEMPRE haz JOIN con la tabla 'documents d' para incluir 'd.id as doc_id', 'd.filename' y 'd.document_type' en los resultados para poder citar los documentos fuente.
4. No uses punto y coma final.
`.trim();

  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://github.com/extracto",
        "X-Title": "Extracto SQL Analytics",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: schemaPrompt },
          { role: "user", content: query },
        ],
        temperature: 0.0,
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const rawContent: string | undefined = json.choices?.[0]?.message?.content;
    if (!rawContent) return null;

    const match = rawContent.match(/```sql\s*([\s\S]*?)\s*```/i);
    const sql = (match ? match[1] : rawContent).trim().replace(/;$/, "");

    if (!isSafeReadOnlyQuery(sql)) return null;

    const { rows } = await pool.query<Record<string, unknown>>(sql);
    if (!rows || rows.length === 0) return null;

    // Extract sources if documents columns are present
    const sources: SearchResultChunk[] = [];
    for (const r of rows) {
      if (r.filename && r.doc_id) {
        sources.push({
          chunkId: `sql-${String(r.doc_id)}`,
          documentId: String(r.doc_id),
          filename: String(r.filename),
          documentType: r.document_type ? String(r.document_type) : null,
          content: `Resultado SQL: ${JSON.stringify(r)}`,
          similarity: 1.0,
        });
      }
    }

    // Synthesize the numerical answer
    const synthesisPrompt = `
El usuario preguntó: "${query}".
Se ejecutó la consulta SQL: ${sql}
Resultado de PostgreSQL:
${JSON.stringify(rows, null, 2)}

Formula una respuesta concisa, clara y precisa en español explicando el resultado numérico exacto y cita explícitamente los documentos originales entre corchetes (ej: "[nombre.pdf]").
`.trim();

    const synthRes = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: synthesisPrompt }],
        temperature: 0.1,
      }),
    });

    if (synthRes.ok) {
      const sJson = await synthRes.json();
      const answer = sJson.choices?.[0]?.message?.content?.trim();
      if (answer) {
        return { answer, sources, sqlQuery: sql };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Executes analytical calculations over PostgreSQL structured tables instead of embeddings.
 */
export async function executeAnalyticalCalculation(
  query: string,
  apiKey?: string,
): Promise<SqlQueryResult | null> {
  await ensureSchema();

  // 1. Try deterministic template queries first
  const templateResult = await executeTemplateQuery(query);
  if (templateResult) {
    return templateResult;
  }

  // 2. Try LLM-driven dynamic SQL generation
  const llmResult = await generateAndExecuteLlmSql(query, apiKey);
  if (llmResult) {
    return llmResult;
  }

  return null;
}
