/**
 * Vision LLM Extraction Service
 * Uses OpenRouter with DeepSeek V4.1 Flash (multimodal vision + OCR) to detect
 * document types (factura, recibo, contrato, otro) and extract structured JSON data.
 *
 * API reference: https://openrouter.ai/docs
 * Model: deepseek/deepseek-v4.1-flash
 */

export type DocumentClassification = "factura" | "recibo" | "contrato" | "otro";

export interface InvoiceData {
  numero_factura?: string | null;
  serie?: string | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  moneda?: string | null;
  emisor?: {
    nombre?: string | null;
    identificacion_fiscal?: string | null;
    direccion?: string | null;
    telefono?: string | null;
    email?: string | null;
  };
  receptor?: {
    nombre?: string | null;
    identificacion_fiscal?: string | null;
    direccion?: string | null;
    email?: string | null;
  };
  items?: Array<{
    descripcion: string;
    cantidad?: number | null;
    precio_unitario?: number | null;
    descuento?: number | null;
    subtotal?: number | null;
  }>;
  subtotal?: number | null;
  impuestos?: {
    tipo?: string | null;
    tasa_porcentaje?: number | null;
    monto?: number | null;
  };
  descuento_total?: number | null;
  total?: number | null;
  metodo_pago?: string | null;
  condiciones_pago?: string | null;
}

export interface ReceiptData {
  numero_recibo?: string | null;
  establecimiento?: string | null;
  identificacion_fiscal?: string | null;
  direccion?: string | null;
  fecha_hora?: string | null;
  items?: Array<{
    nombre: string;
    cantidad?: number | null;
    precio?: number | null;
  }>;
  subtotal?: number | null;
  propina?: number | null;
  impuesto?: number | null;
  total?: number | null;
  metodo_pago?: string | null;
  ultimos_4_digitos_tarjeta?: string | null;
  numero_autorizacion?: string | null;
}

export interface ContractData {
  titulo?: string | null;
  tipo_contrato?: string | null;
  fecha_firma?: string | null;
  lugar_firma?: string | null;
  vigencia?: {
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
    duracion?: string | null;
    renovacion_automatica?: boolean | null;
  };
  partes?: Array<{
    nombre: string;
    rol: string;
    identificacion?: string | null;
    representante_legal?: string | null;
    domicilio?: string | null;
  }>;
  objeto_del_contrato?: string | null;
  contraprestacion_economica?: {
    monto?: number | null;
    moneda?: string | null;
    forma_pago?: string | null;
  };
  clausulas_clave?: Array<{
    numero?: string | null;
    titulo: string;
    resumen: string;
  }>;
  penalidades_o_recision?: string | null;
  jurisdiccion_o_ley_aplicable?: string | null;
  firmas_detectadas?: Array<{
    nombre: string;
    firmado: boolean;
  }>;
}

export interface OtherDocData {
  descripcion?: string | null;
  tema_principal?: string | null;
}

export interface VisionExtractionResult {
  tipo_documento: DocumentClassification;
  confianza: number;
  resumen: string;
  idioma?: string;
  datos_extraidos: {
    factura?: InvoiceData;
    recibo?: ReceiptData;
    contrato?: ContractData;
    otro?: OtherDocData;
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible JSON Schema for structured output (OpenRouter format)
// Uses additionalProperties: false to enable strict mode on supporting models.
// ---------------------------------------------------------------------------
const DOCUMENT_SCHEMA = {
  type: "object",
  properties: {
    tipo_documento: {
      type: "string",
      enum: ["factura", "recibo", "contrato", "otro"],
      description: "Clasificación estricta del documento",
    },
    confianza: {
      type: "number",
      description: "Nivel de confianza en la clasificación entre 0.0 y 1.0",
    },
    resumen: {
      type: "string",
      description:
        "Resumen ejecutivo en español de 1 a 3 oraciones sobre el contenido y objeto del documento",
    },
    idioma: {
      type: "string",
      description: "Código de idioma ISO (ej. 'es', 'en')",
    },
    datos_extraidos: {
      type: "object",
      properties: {
        factura: {
          type: "object",
          properties: {
            numero_factura: { type: "string" },
            serie: { type: "string" },
            fecha_emision: { type: "string" },
            fecha_vencimiento: { type: "string" },
            moneda: { type: "string" },
            emisor: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                identificacion_fiscal: { type: "string" },
                direccion: { type: "string" },
                telefono: { type: "string" },
                email: { type: "string" },
              },
              additionalProperties: false,
            },
            receptor: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                identificacion_fiscal: { type: "string" },
                direccion: { type: "string" },
                email: { type: "string" },
              },
              additionalProperties: false,
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  descripcion: { type: "string" },
                  cantidad: { type: "number" },
                  precio_unitario: { type: "number" },
                  descuento: { type: "number" },
                  subtotal: { type: "number" },
                },
                required: ["descripcion"],
                additionalProperties: false,
              },
            },
            subtotal: { type: "number" },
            impuestos: {
              type: "object",
              properties: {
                tipo: { type: "string" },
                tasa_porcentaje: { type: "number" },
                monto: { type: "number" },
              },
              additionalProperties: false,
            },
            descuento_total: { type: "number" },
            total: { type: "number" },
            metodo_pago: { type: "string" },
            condiciones_pago: { type: "string" },
          },
          additionalProperties: false,
        },
        recibo: {
          type: "object",
          properties: {
            numero_recibo: { type: "string" },
            establecimiento: { type: "string" },
            identificacion_fiscal: { type: "string" },
            direccion: { type: "string" },
            fecha_hora: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nombre: { type: "string" },
                  cantidad: { type: "number" },
                  precio: { type: "number" },
                },
                required: ["nombre"],
                additionalProperties: false,
              },
            },
            subtotal: { type: "number" },
            propina: { type: "number" },
            impuesto: { type: "number" },
            total: { type: "number" },
            metodo_pago: { type: "string" },
            ultimos_4_digitos_tarjeta: { type: "string" },
            numero_autorizacion: { type: "string" },
          },
          additionalProperties: false,
        },
        contrato: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            tipo_contrato: { type: "string" },
            fecha_firma: { type: "string" },
            lugar_firma: { type: "string" },
            vigencia: {
              type: "object",
              properties: {
                fecha_inicio: { type: "string" },
                fecha_fin: { type: "string" },
                duracion: { type: "string" },
                renovacion_automatica: { type: "boolean" },
              },
              additionalProperties: false,
            },
            partes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nombre: { type: "string" },
                  rol: { type: "string" },
                  identificacion: { type: "string" },
                  representante_legal: { type: "string" },
                  domicilio: { type: "string" },
                },
                required: ["nombre", "rol"],
                additionalProperties: false,
              },
            },
            objeto_del_contrato: { type: "string" },
            contraprestacion_economica: {
              type: "object",
              properties: {
                monto: { type: "number" },
                moneda: { type: "string" },
                forma_pago: { type: "string" },
              },
              additionalProperties: false,
            },
            clausulas_clave: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  numero: { type: "string" },
                  titulo: { type: "string" },
                  resumen: { type: "string" },
                },
                required: ["titulo", "resumen"],
                additionalProperties: false,
              },
            },
            penalidades_o_recision: { type: "string" },
            jurisdiccion_o_ley_aplicable: { type: "string" },
            firmas_detectadas: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nombre: { type: "string" },
                  firmado: { type: "boolean" },
                },
                required: ["nombre", "firmado"],
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
        otro: {
          type: "object",
          properties: {
            descripcion: { type: "string" },
            tema_principal: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  required: ["tipo_documento", "confianza", "resumen", "datos_extraidos"],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Model used for vision analysis via OpenRouter
// ---------------------------------------------------------------------------
const OPENROUTER_MODEL = "deepseek/deepseek-v4.1-flash";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// ---------------------------------------------------------------------------
// Helpers to build the multimodal content part for images vs PDFs.
// OpenRouter uses the `type: "file"` block for PDFs and `type: "image_url"`
// for raster images (PNG, JPEG, WEBP, GIF).
// ---------------------------------------------------------------------------
function buildMediaPart(
  base64Data: string,
  mimeType: string,
  filename: string,
): Record<string, unknown> {
  if (mimeType === "application/pdf") {
    // OpenRouter PDF block — works even for scanned/image-based PDFs via
    // the model's built-in file-parser fallback.
    return {
      type: "file",
      file: {
        filename,
        file_data: `data:application/pdf;base64,${base64Data}`,
      },
    };
  }

  // Standard multimodal image block (PNG, JPEG, WEBP, GIF)
  return {
    type: "image_url",
    image_url: {
      url: `data:${mimeType};base64,${base64Data}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------
export async function analyzeDocumentWithVision(
  fileBuffer: Buffer,
  mimeType: string,
  customApiKey?: string,
): Promise<VisionExtractionResult> {
  const apiKey =
    customApiKey ||
    process.env.OPENROUTER_API_KEY ||
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Clave API no encontrada. Configura OPENROUTER_API_KEY en .env.local o ingrésala en la interfaz.",
    );
  }

  const base64Data = fileBuffer.toString("base64");

  const prompt = `
Eres un sistema de visión artificial experto en análisis documental con capacidades OCR avanzadas.
Examina detenidamente el documento provisto (imagen o PDF), leyendo todo el texto visible con precisión.

Instrucciones:
1. Detecta si el documento corresponde a una 'factura', un 'recibo' (ticket de compra, recibo de pago) o un 'contrato' (acuerdo de voluntades, arrendamiento, prestación de servicios, laboral, etc.). Si no corresponde a ninguno, márcalo como 'otro'.
2. Extrae todos los datos relevantes en formato JSON estructurado según el esquema especificado.
3. Si un dato no está presente en el documento, establécelo como null. No inventes campos no observables.
4. Genera un resumen ejecutivo claro en español explicando de qué trata el documento y sus montos o partes más importantes.
`.trim();

  // Derive a safe filename for the file block (used by OpenRouter for PDF routing)
  const ext = mimeType === "application/pdf" ? "pdf"
    : mimeType === "image/png" ? "png"
    : mimeType === "image/jpeg" ? "jpg"
    : mimeType === "image/webp" ? "webp"
    : "img";
  const filename = `document.${ext}`;

  const mediaPart = buildMediaPart(base64Data, mimeType, filename);

  const requestBody = {
    model: OPENROUTER_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          mediaPart,
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "document_extraction",
        strict: true,
        schema: DOCUMENT_SCHEMA,
      },
    },
    temperature: 0.1,
    // Ensures OpenRouter only routes to providers that support structured output + vision
    provider: {
      require_parameters: true,
    },
  };

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // Recommended OpenRouter headers for attribution / rate-limit management
      "HTTP-Referer": "https://github.com/extracto",
      "X-Title": "Extracto Document Analysis",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `OpenRouter API error (${response.status}): ${response.statusText}`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      // Keep original message if not JSON
    }
    throw new Error(message);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;

  if (!rawText) {
    throw new Error("No se recibió respuesta estructurada del modelo de visión.");
  }

  try {
    // Strip markdown code fences if present (e.g. ```json ... ```)
    const cleanedText = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed: VisionExtractionResult = JSON.parse(cleanedText);
    return parsed;
  } catch (err) {
    throw new Error(
      `Fallo al parsear el JSON extraído por el LLM: ${(err as Error).message}`,
    );
  }
}
