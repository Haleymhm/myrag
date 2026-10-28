/**
 * Tests for ReciboSchema
 *
 * Covers:
 *  ✅ Happy path — recibo completo y coherente
 *  ❌ Sin establecimiento (campo obligatorio)
 *  ❌ Sin fecha_hora (campo obligatorio)
 *  ❌ últimos_4_digitos_tarjeta con letras
 *  ❌ últimos_4_digitos_tarjeta con 3 dígitos (longitud incorrecta)
 *  ❌ Incoherencia numérica: subtotal + propina + impuesto ≠ total
 *  ❌ Suma precio×cantidad de ítems ≠ subtotal
 *  ✅ Recibo sin ítems de precio (solo nombres)
 *  ✅ Sin propina ni impuesto — subtotal = total
 */

import { describe, it, expect } from "vitest";
import { safeParseVisionResult } from "@/lib/schemas";
import {
  validRecibo,
  reciboSinEstablecimiento,
  reciboIncoherenciaTotal,
  reciboDigitosInvalidos,
  reciboItemsNoSuman,
} from "./fixtures";

describe("ReciboSchema", () => {
  // -------------------------------------------------------------------------
  // Happy paths
  // -------------------------------------------------------------------------

  it("✅ acepta recibo completo y coherente", () => {
    const result = safeParseVisionResult(validRecibo);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tipo_documento).toBe("recibo");
      expect(result.data.datos_extraidos.recibo?.total).toBe(4350);
    }
  });

  it("✅ acepta recibo sin propina ni impuesto (subtotal = total)", () => {
    const data = {
      tipo_documento: "recibo",
      confianza: 0.9,
      resumen: "Ticket de kiosco.",
      datos_extraidos: {
        recibo: {
          establecimiento: "Kiosco El Sol",
          fecha_hora: "2024-05-01",
          items: [{ nombre: "Gaseosa 500ml" }],
          subtotal: 500,
          total: 500,
        },
      },
    };
    const result = safeParseVisionResult(data);
    expect(result.success).toBe(true);
  });

  it("✅ acepta recibo con ítems sin precio (solo nombres)", () => {
    const data = {
      tipo_documento: "recibo",
      confianza: 0.85,
      resumen: "Ticket de farmacia.",
      datos_extraidos: {
        recibo: {
          establecimiento: "Farmacia Central",
          fecha_hora: "2024-04-10T10:00:00",
          items: [
            { nombre: "Ibuprofeno 400mg" },
            { nombre: "Vendas elásticas" },
          ],
        },
      },
    };
    const result = safeParseVisionResult(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Campos obligatorios
  // -------------------------------------------------------------------------

  it("❌ rechaza recibo sin establecimiento", () => {
    const result = safeParseVisionResult(reciboSinEstablecimiento);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some((e) => e.includes("establecimiento"));
      expect(hasError).toBe(true);
    }
  });

  it("❌ rechaza recibo sin fecha_hora", () => {
    const data = {
      ...validRecibo,
      datos_extraidos: {
        recibo: {
          ...validRecibo.datos_extraidos.recibo!,
          fecha_hora: undefined,
        },
      },
    };
    const result = safeParseVisionResult(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some((e) => e.includes("fecha_hora"));
      expect(hasError).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Validación de tarjeta
  // -------------------------------------------------------------------------

  it("❌ rechaza ultimos_4_digitos_tarjeta con letras (AB12)", () => {
    const result = safeParseVisionResult(reciboDigitosInvalidos);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some((e) =>
        e.includes("4 dígitos"),
      );
      expect(hasError).toBe(true);
    }
  });

  it("❌ rechaza ultimos_4_digitos_tarjeta con longitud distinta de 4 (123)", () => {
    const data = {
      ...validRecibo,
      datos_extraidos: {
        recibo: {
          ...validRecibo.datos_extraidos.recibo!,
          ultimos_4_digitos_tarjeta: "123",
        },
      },
    };
    const result = safeParseVisionResult(data);
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Coherencia numérica
  // -------------------------------------------------------------------------

  it("❌ rechaza cuando subtotal + propina + impuesto ≠ total", () => {
    const result = safeParseVisionResult(reciboIncoherenciaTotal);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some(
        (e) => e.includes("total") && e.includes("Incoherencia"),
      );
      expect(hasError).toBe(true);
    }
  });

  it("❌ rechaza cuando la suma precio×cantidad de ítems ≠ subtotal", () => {
    const result = safeParseVisionResult(reciboItemsNoSuman);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some((e) => e.includes("subtotal"));
      expect(hasError).toBe(true);
    }
  });
});
