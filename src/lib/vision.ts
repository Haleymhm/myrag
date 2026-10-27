/**
 * Vision LLM Extraction Service
 * Uses Google Gemini (gemini-3.8-flash) with multimodal vision capabilities
 * to detect document types (factura, recibo, contrato, otro) and extract structured JSON data.
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

const DOCUMENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    tipo_documento: {
      type: "STRING",
      enum: ["factura", "recibo", "contrato", "otro"],
      description: "Clasificación estricta del documento",
    },
    confianza: {
      type: "NUMBER",
      description: "Nivel de confianza en la clasificación entre 0.0 y 1.0",
    },
    resumen: {
      type: "STRING",
      description: "Resumen ejecutivo en español de 1 a 3 oraciones sobre el contenido y objeto del documento",
    },
    idioma: {
      type: "STRING",
      description: "Código de idioma ISO (ej. 'es', 'en')",
    },
    datos_extraidos: {
      type: "OBJECT",
      properties: {
        factura: {
          type: "OBJECT",
          properties: {
            numero_factura: { type: "STRING" },
            serie: { type: "STRING" },
            fecha_emision: { type: "STRING" },
            fecha_vencimiento: { type: "STRING" },
            moneda: { type: "STRING" },
            emisor: {
              type: "OBJECT",
              properties: {
                nombre: { type: "STRING" },
                identificacion_fiscal: { type: "STRING" },
                direccion: { type: "STRING" },
                telefono: { type: "STRING" },
                email: { type: "STRING" },
              },
            },
            receptor: {
              type: "OBJECT",
              properties: {
                nombre: { type: "STRING" },
                identificacion_fiscal: { type: "STRING" },
                direccion: { type: "STRING" },
                email: { type: "STRING" },
              },
            },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  descripcion: { type: "STRING" },
                  cantidad: { type: "NUMBER" },
                  precio_unitario: { type: "NUMBER" },
                  descuento: { type: "NUMBER" },
                  subtotal: { type: "NUMBER" },
                },
                required: ["descripcion"],
              },
            },
            subtotal: { type: "NUMBER" },
            impuestos: {
              type: "OBJECT",
              properties: {
                tipo: { type: "STRING" },
                tasa_porcentaje: { type: "NUMBER" },
                monto: { type: "NUMBER" },
              },
            },
            descuento_total: { type: "NUMBER" },
            total: { type: "NUMBER" },
            metodo_pago: { type: "STRING" },
            condiciones_pago: { type: "STRING" },
          },
        },
        recibo: {
          type: "OBJECT",
          properties: {
            numero_recibo: { type: "STRING" },
            establecimiento: { type: "STRING" },
            identificacion_fiscal: { type: "STRING" },
            direccion: { type: "STRING" },
            fecha_hora: { type: "STRING" },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  nombre: { type: "STRING" },
                  cantidad: { type: "NUMBER" },
                  precio: { type: "NUMBER" },
                },
                required: ["nombre"],
              },
            },
            subtotal: { type: "NUMBER" },
            propina: { type: "NUMBER" },
            impuesto: { type: "NUMBER" },
            total: { type: "NUMBER" },
            metodo_pago: { type: "STRING" },
            ultimos_4_digitos_tarjeta: { type: "STRING" },
            numero_autorizacion: { type: "STRING" },
          },
        },
        contrato: {
          type: "OBJECT",
          properties: {
            titulo: { type: "STRING" },
            tipo_contrato: { type: "STRING" },
            fecha_firma: { type: "STRING" },
            lugar_firma: { type: "STRING" },
            vigencia: {
              type: "OBJECT",
              properties: {
                fecha_inicio: { type: "STRING" },
                fecha_fin: { type: "STRING" },
                duracion: { type: "STRING" },
                renovacion_automatica: { type: "BOOLEAN" },
              },
            },
            partes: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  nombre: { type: "STRING" },
                  rol: { type: "STRING" },
                  identificacion: { type: "STRING" },
                  representante_legal: { type: "STRING" },
                  domicilio: { type: "STRING" },
                },
                required: ["nombre", "rol"],
              },
            },
            objeto_del_contrato: { type: "STRING" },
            contraprestacion_economica: {
              type: "OBJECT",
              properties: {
                monto: { type: "NUMBER" },
                moneda: { type: "STRING" },
                forma_pago: { type: "STRING" },
              },
            },
            clausulas_clave: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  numero: { type: "STRING" },
                  titulo: { type: "STRING" },
                  resumen: { type: "STRING" },
                },
                required: ["titulo", "resumen"],
              },
            },
            penalidades_o_recision: { type: "STRING" },
            jurisdiccion_o_ley_aplicable: { type: "STRING" },
            firmas_detectadas: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  nombre: { type: "STRING" },
                  firmado: { type: "BOOLEAN" },
                },
                required: ["nombre", "firmado"],
              },
            },
          },
        },
        otro: {
          type: "OBJECT",
          properties: {
            descripcion: { type: "STRING" },
            tema_principal: { type: "STRING" },
          },
        },
      },
    },
  },
  required: ["tipo_documento", "confianza", "resumen", "datos_extraidos"],
};

export async function analyzeDocumentWithVision(
  fileBuffer: Buffer,
  mimeType: string,
  customApiKey?: string,
): Promise<VisionExtractionResult> {
  const apiKey =
    customApiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Clave API no encontrada. Configura GEMINI_API_KEY en .env.local o ingrésala en la interfaz.",
    );
  }

  const base64Data = fileBuffer.toString("base64");

  const prompt = `
Eres un sistema de visión artificial experto en análisis documental.
Examina detenidamente el documento provisto (imagen o PDF).

Instrucciones:
1. Detecta si el documento corresponde a una 'factura', un 'recibo' (ticket de compra, recibo de pago) o un 'contrato' (acuerdo de voluntades, arrendamiento, prestación de servicios, laboral, etc.). Si no corresponde a ninguno, márcalo como 'otro'.
2. Extrae todos los datos relevantes en formato JSON estructurado según el esquema especificado.
3. Si un dato no está presente en el documento, establécelo como null. No inventes campos no observables.
4. Genera un resumen ejecutivo claro en español explicando de qué trata el documento y sus montos o partes más importantes.
`.trim();

  // Model selection per gemini-api-dev skill: gemini-3.8-flash for multimodal vision
  const model = "gemini-3.8-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: DOCUMENT_SCHEMA,
      temperature: 0.1,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `Gemini API error (${response.status}): ${response.statusText}`;
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
  const rawText =
    data.candidates?.[0]?.content?.parts?.[0]?.text;

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

