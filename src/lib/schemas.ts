/**
 * Zod validation schemas for each document type extracted by the Vision LLM.
 *
 * Validation rules applied:
 *  - Dates: ISO-8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
 *  - Numeric coherence: subtotal + impuesto ≈ total (±0.02 tolerance for rounding)
 *  - Required fields: declared via .min(1) on strings and non-optional object keys
 *  - Confidence: 0.0 – 1.0
 *
 * Usage:
 *   import { VisionResultSchema, safeParseVisionResult } from "@/lib/schemas";
 *   const result = safeParseVisionResult(rawLLMOutput);
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * Accepts ISO-8601 date strings like 2024-05-20 or 2024-05-20T14:30:00.
 * Uses strict calendar validation: 2024-02-30 is rejected because
 * Date.parse() silently rolls over to March in V8, so we re-parse the
 * date and compare the resulting day/month against the declared values.
 */
const isoDate = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?)?$/,
    "Formato de fecha inválido — se espera YYYY-MM-DD o ISO-8601",
  )
  .refine(
    (val) => {
      const ms = Date.parse(val);
      if (isNaN(ms)) return false;
      // Strict day/month check: parse the declared YYYY-MM-DD components and
      // verify the constructed Date lands on the same calendar day (UTC).
      const [yearStr, monthStr, dayStr] = val.split("T")[0].split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10); // 1-based
      const day = parseInt(dayStr, 10);
      const d = new Date(Date.UTC(year, month - 1, day));
      return (
        d.getUTCFullYear() === year &&
        d.getUTCMonth() + 1 === month &&
        d.getUTCDate() === day
      );
    },
    { message: "Fecha inválida (fecha no existe en el calendario)" },
  );

/** Nullable, optional ISO date — used for most document date fields. */
const optionalDate = isoDate.nullable().optional();

/** Non-empty trimmed string. */
const requiredStr = z.string().trim().min(1, "Campo obligatorio");

/** Nullable optional non-empty string — most extracted text fields. */
const optionalStr = z.string().trim().nullable().optional();

/** Positive monetary amount or zero. */
const amount = z.number().nonnegative("Los montos no pueden ser negativos");

/** Nullable optional amount. */
const optionalAmount = amount.nullable().optional();

// ---------------------------------------------------------------------------
// Monetary coherence helper
// ---------------------------------------------------------------------------

/**
 * Tolerance (in absolute units) accepted between computed and declared total.
 * Accounts for rounding differences that OCR/LLM may introduce.
 */
const TOLERANCE = 0.02;

function withinTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

// ---------------------------------------------------------------------------
// 1. Factura (Invoice)
// ---------------------------------------------------------------------------

const InvoiceItemSchema = z.object({
  descripcion: requiredStr.describe("Descripción del ítem"),
  cantidad: optionalAmount,
  precio_unitario: optionalAmount,
  descuento: optionalAmount,
  subtotal: optionalAmount,
});

const EmisorSchema = z.object({
  nombre: optionalStr,
  identificacion_fiscal: optionalStr,
  direccion: optionalStr,
  telefono: optionalStr,
  email: z.string().trim().email("Email del emisor inválido").nullable().optional(),
});

const ReceptorSchema = z.object({
  nombre: optionalStr,
  identificacion_fiscal: optionalStr,
  direccion: optionalStr,
  email: z.string().trim().email("Email del receptor inválido").nullable().optional(),
});

const ImpuestosSchema = z.object({
  tipo: optionalStr,
  tasa_porcentaje: z
    .number()
    .min(0, "La tasa de impuesto no puede ser negativa")
    .max(100, "La tasa de impuesto no puede superar 100 %")
    .nullable()
    .optional(),
  monto: optionalAmount,
});

export const FacturaSchema = z
  .object({
    // Required fields for a valid invoice
    numero_factura: requiredStr.describe("Número de factura obligatorio"),
    fecha_emision: isoDate.describe("Fecha de emisión obligatoria"),

    // Optional fields
    serie: optionalStr,
    fecha_vencimiento: optionalDate,
    moneda: optionalStr,
    emisor: EmisorSchema.optional(),
    receptor: ReceptorSchema.optional(),
    items: z.array(InvoiceItemSchema).min(1, "Una factura debe tener al menos un ítem").optional(),
    subtotal: optionalAmount,
    impuestos: ImpuestosSchema.optional(),
    descuento_total: optionalAmount,
    total: optionalAmount,
    metodo_pago: optionalStr,
    condiciones_pago: optionalStr,
  })
  .superRefine((data, ctx) => {
    // Rule: fecha_vencimiento must be ≥ fecha_emision when both are present
    if (data.fecha_vencimiento && data.fecha_emision) {
      if (new Date(data.fecha_vencimiento) < new Date(data.fecha_emision)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fecha_vencimiento"],
          message: "La fecha de vencimiento no puede ser anterior a la fecha de emisión",
        });
      }
    }

    // Rule: subtotal + impuesto.monto ≈ total (when all three are present)
    const { subtotal, impuestos, descuento_total, total } = data;
    if (
      subtotal != null &&
      total != null
    ) {
      const impuestoMonto = impuestos?.monto ?? 0;
      const descuento = descuento_total ?? 0;
      const computed = subtotal + impuestoMonto - descuento;
      if (!withinTolerance(computed, total)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["total"],
          message: `Incoherencia numérica: subtotal (${subtotal}) + impuesto (${impuestoMonto}) − descuento (${descuento}) = ${computed.toFixed(2)}, pero total declarado es ${total}`,
        });
      }
    }

    // Rule: item subtotals must sum close to invoice subtotal when all are present
    if (data.items && data.subtotal != null) {
      const itemsWithSubtotal = data.items.filter((i) => i.subtotal != null);
      if (itemsWithSubtotal.length === data.items.length) {
        const itemsSum = itemsWithSubtotal.reduce((acc, i) => acc + (i.subtotal ?? 0), 0);
        if (!withinTolerance(itemsSum, data.subtotal)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["subtotal"],
            message: `La suma de subtotales de ítems (${itemsSum.toFixed(2)}) difiere del subtotal declarado (${data.subtotal})`,
          });
        }
      }
    }
  });

export type FacturaData = z.infer<typeof FacturaSchema>;

// ---------------------------------------------------------------------------
// 2. Recibo (Receipt / Ticket)
// ---------------------------------------------------------------------------

const ReceiptItemSchema = z.object({
  nombre: requiredStr.describe("Nombre del producto/servicio obligatorio"),
  cantidad: optionalAmount,
  precio: optionalAmount,
});

export const ReciboSchema = z
  .object({
    // Required fields for a valid receipt
    establecimiento: requiredStr.describe("Nombre del establecimiento obligatorio"),
    fecha_hora: isoDate.describe("Fecha y hora del recibo obligatorias"),

    // Optional fields
    numero_recibo: optionalStr,
    identificacion_fiscal: optionalStr,
    direccion: optionalStr,
    items: z.array(ReceiptItemSchema).min(1, "Un recibo debe tener al menos un ítem").optional(),
    subtotal: optionalAmount,
    propina: optionalAmount,
    impuesto: optionalAmount,
    total: optionalAmount,
    metodo_pago: optionalStr,
    ultimos_4_digitos_tarjeta: z
      .string()
      .trim()
      .regex(/^\d{4}$/, "Deben ser exactamente 4 dígitos")
      .nullable()
      .optional(),
    numero_autorizacion: optionalStr,
  })
  .superRefine((data, ctx) => {
    // Rule: subtotal + propina + impuesto ≈ total
    const { subtotal, propina, impuesto, total } = data;
    if (subtotal != null && total != null) {
      const computed = subtotal + (propina ?? 0) + (impuesto ?? 0);
      if (!withinTolerance(computed, total)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["total"],
          message: `Incoherencia numérica: subtotal (${subtotal}) + propina (${propina ?? 0}) + impuesto (${impuesto ?? 0}) = ${computed.toFixed(2)}, pero total declarado es ${total}`,
        });
      }
    }

    // Rule: sum of item prices × cantidad ≈ subtotal (when fully filled)
    if (data.items && data.subtotal != null) {
      const fullyPriced = data.items.filter((i) => i.precio != null && i.cantidad != null);
      if (fullyPriced.length === data.items.length && fullyPriced.length > 0) {
        const itemsSum = fullyPriced.reduce(
          (acc, i) => acc + (i.precio ?? 0) * (i.cantidad ?? 1),
          0,
        );
        if (!withinTolerance(itemsSum, data.subtotal)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["subtotal"],
            message: `La suma de ítems (${itemsSum.toFixed(2)}) difiere del subtotal declarado (${data.subtotal})`,
          });
        }
      }
    }
  });

export type ReciboData = z.infer<typeof ReciboSchema>;

// ---------------------------------------------------------------------------
// 3. Contrato (Contract)
// ---------------------------------------------------------------------------

const ParteSchema = z.object({
  nombre: requiredStr.describe("Nombre de la parte obligatorio"),
  rol: requiredStr.describe("Rol de la parte obligatorio"),
  identificacion: optionalStr,
  representante_legal: optionalStr,
  domicilio: optionalStr,
});

const VigenciaSchema = z
  .object({
    fecha_inicio: optionalDate,
    fecha_fin: optionalDate,
    duracion: optionalStr,
    renovacion_automatica: z.boolean().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.fecha_inicio && data.fecha_fin) {
      if (new Date(data.fecha_fin) < new Date(data.fecha_inicio)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fecha_fin"],
          message: "La fecha de fin de vigencia no puede ser anterior a la fecha de inicio",
        });
      }
    }
  });

const ClausulaSchema = z.object({
  numero: optionalStr,
  titulo: requiredStr.describe("Título de la cláusula obligatorio"),
  resumen: requiredStr.describe("Resumen de la cláusula obligatorio"),
});

const FirmaSchema = z.object({
  nombre: requiredStr,
  firmado: z.boolean(),
});

const ContraprestacionSchema = z.object({
  monto: optionalAmount,
  moneda: optionalStr,
  forma_pago: optionalStr,
});

export const ContratoSchema = z
  .object({
    // Required fields for a valid contract
    titulo: requiredStr.describe("Título del contrato obligatorio"),
    tipo_contrato: requiredStr.describe("Tipo de contrato obligatorio"),

    // At least 2 parties required for a valid contract
    partes: z
      .array(ParteSchema)
      .min(2, "Un contrato requiere al menos dos partes (emisor y receptor)")
      .describe("Partes del contrato"),

    // Optional fields
    fecha_firma: optionalDate,
    lugar_firma: optionalStr,
    vigencia: VigenciaSchema.optional(),
    objeto_del_contrato: optionalStr,
    contraprestacion_economica: ContraprestacionSchema.optional(),
    clausulas_clave: z.array(ClausulaSchema).optional(),
    penalidades_o_recision: optionalStr,
    jurisdiccion_o_ley_aplicable: optionalStr,
    firmas_detectadas: z.array(FirmaSchema).optional(),
  })
  .superRefine((data, ctx) => {
    // Rule: if all parties are present as signatories, at least one must have signed
    if (data.firmas_detectadas && data.firmas_detectadas.length > 0) {
      const anySignedFlag = data.firmas_detectadas.some((f) => f.firmado);
      if (!anySignedFlag) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["firmas_detectadas"],
          message:
            "Advertencia: ninguna firma detectada está marcada como firmada (el contrato puede estar incompleto)",
        });
      }
    }

    // Rule: roles in partes must be unique (no two parties with the exact same role)
    const roles = data.partes.map((p) => p.rol.trim().toLowerCase());
    const uniqueRoles = new Set(roles);
    if (uniqueRoles.size !== roles.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["partes"],
        message: "Existen dos o más partes con el mismo rol — verifique los datos extraídos",
      });
    }
  });

export type ContratoData = z.infer<typeof ContratoSchema>;

// ---------------------------------------------------------------------------
// 4. Otro (Generic document)
// ---------------------------------------------------------------------------

export const OtroSchema = z.object({
  descripcion: requiredStr.describe("Descripción del documento obligatoria"),
  tema_principal: optionalStr,
});

export type OtroData = z.infer<typeof OtroSchema>;

// ---------------------------------------------------------------------------
// 5. Top-level VisionExtractionResult schema
// ---------------------------------------------------------------------------

export const VisionResultSchema = z
  .object({
    tipo_documento: z.enum(["factura", "recibo", "contrato", "otro"]),
    confianza: z
      .number()
      .min(0, "La confianza no puede ser negativa")
      .max(1, "La confianza no puede superar 1.0"),
    resumen: requiredStr.describe("Resumen ejecutivo obligatorio"),
    idioma: z.string().trim().length(2, "El código de idioma debe tener 2 caracteres (ISO 639-1)").optional(),
    datos_extraidos: z.object({
      factura: FacturaSchema.optional(),
      recibo: ReciboSchema.optional(),
      contrato: ContratoSchema.optional(),
      otro: OtroSchema.optional(),
    }),
  })
  .superRefine((data, ctx) => {
    const { tipo_documento, datos_extraidos } = data;

    // Rule: the populated sub-object must match tipo_documento
    if (tipo_documento === "factura" && !datos_extraidos.factura) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["datos_extraidos", "factura"],
        message: "El tipo de documento es 'factura' pero datos_extraidos.factura está vacío",
      });
    }
    if (tipo_documento === "recibo" && !datos_extraidos.recibo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["datos_extraidos", "recibo"],
        message: "El tipo de documento es 'recibo' pero datos_extraidos.recibo está vacío",
      });
    }
    if (tipo_documento === "contrato" && !datos_extraidos.contrato) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["datos_extraidos", "contrato"],
        message: "El tipo de documento es 'contrato' pero datos_extraidos.contrato está vacío",
      });
    }
    if (tipo_documento === "otro" && !datos_extraidos.otro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["datos_extraidos", "otro"],
        message: "El tipo de documento es 'otro' pero datos_extraidos.otro está vacío",
      });
    }
  });

export type VisionResultData = z.infer<typeof VisionResultSchema>;

// ---------------------------------------------------------------------------
// 6. Convenience parse helpers
// ---------------------------------------------------------------------------

export interface ValidationSuccess<T> {
  success: true;
  data: T;
  warnings: string[];
}

export interface ValidationFailure {
  success: false;
  errors: string[];
  warnings: string[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validates a raw Vision LLM output against the full VisionResultSchema.
 *
 * Returns a typed result with:
 *  - `success: true`  + parsed `data` when valid
 *  - `success: false` + human-readable `errors` when invalid
 *  - `warnings`       always present — informational issues (e.g. low confidence)
 *
 * @example
 * const result = safeParseVisionResult(extraction);
 * if (!result.success) console.error(result.errors);
 */
export function safeParseVisionResult(
  raw: unknown,
): ValidationResult<VisionResultData> {
  const parsed = VisionResultSchema.safeParse(raw);
  const warnings: string[] = [];

  // Collect soft warnings independently of schema errors
  if (typeof raw === "object" && raw !== null && "confianza" in raw) {
    const confianza = (raw as Record<string, unknown>).confianza;
    if (typeof confianza === "number" && confianza < 0.6) {
      warnings.push(
        `Confianza baja (${(confianza * 100).toFixed(0)}%) — los datos extraídos podrían requerir revisión manual`,
      );
    }
  }

  if (!parsed.success) {
    const errors = parsed.error.issues.map(
      (issue) =>
        `[${issue.path.join(".") || "raíz"}] ${issue.message}`,
    );
    return { success: false, errors, warnings };
  }

  return { success: true, data: parsed.data, warnings };
}

/**
 * Validates only the factura sub-object directly (useful in unit tests or
 * when the caller already knows the document type).
 */
export function safeParseFactura(raw: unknown): ValidationResult<FacturaData> {
  const parsed = FacturaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((i) => `[${i.path.join(".")}] ${i.message}`),
      warnings: [],
    };
  }
  return { success: true, data: parsed.data, warnings: [] };
}

/** Validates only the recibo sub-object. */
export function safeParseRecibo(raw: unknown): ValidationResult<ReciboData> {
  const parsed = ReciboSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((i) => `[${i.path.join(".")}] ${i.message}`),
      warnings: [],
    };
  }
  return { success: true, data: parsed.data, warnings: [] };
}

/** Validates only the contrato sub-object. */
export function safeParseContrato(raw: unknown): ValidationResult<ContratoData> {
  const parsed = ContratoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((i) => `[${i.path.join(".")}] ${i.message}`),
      warnings: [],
    };
  }
  return { success: true, data: parsed.data, warnings: [] };
}
