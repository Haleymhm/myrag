/**
 * Tests for the top-level VisionResultSchema and safeParseVisionResult helper.
 *
 * Covers:
 *  ✅ Resultado válido — factura completa
 *  ✅ Resultado válido — recibo completo
 *  ✅ Resultado válido — contrato completo
 *  ✅ Resultado válido — tipo "otro"
 *  ⚠️  Warning de confianza baja (< 60 %) sin rechazar el documento
 *  ❌ tipo_documento no coincide con el sub-objeto presente
 *  ❌ confianza fuera de rango (> 1.0)
 *  ❌ Código de idioma de 3 letras (ISO 639-1 requiere 2)
 *  ❌ resumen vacío
 *  ❌ Payload completamente vacío
 *  ❌ Payload null / undefined
 */

import { describe, it, expect } from "vitest";
import { safeParseVisionResult } from "@/lib/schemas";
import {
  validFactura,
  validRecibo,
  validContrato,
  validOtro,
  otroSinDescripcion,
  resultConfianzaBaja,
  resultTipoMismatch,
  resultIdioma3Chars,
  resultConfianzaFueraRango,
} from "./fixtures";

describe("VisionResultSchema (top-level)", () => {
  // -------------------------------------------------------------------------
  // Happy paths — un caso por tipo de documento
  // -------------------------------------------------------------------------

  it("✅ acepta resultado válido tipo 'factura'", () => {
    const result = safeParseVisionResult(validFactura);
    expect(result.success).toBe(true);
  });

  it("✅ acepta resultado válido tipo 'recibo'", () => {
    const result = safeParseVisionResult(validRecibo);
    expect(result.success).toBe(true);
  });

  it("✅ acepta resultado válido tipo 'contrato'", () => {
    const result = safeParseVisionResult(validContrato);
    expect(result.success).toBe(true);
  });

  it("✅ acepta resultado válido tipo 'otro'", () => {
    const result = safeParseVisionResult(validOtro);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.datos_extraidos.otro?.descripcion).toBeTruthy();
    }
  });

  // -------------------------------------------------------------------------
  // Warnings no bloqueantes
  // -------------------------------------------------------------------------

  it("⚠️  emite warning de confianza baja pero no rechaza el documento", () => {
    const result = safeParseVisionResult(resultConfianzaBaja);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toMatch(/confianza baja/i);
    }
  });

  it("⚠️  resultado con confianza exacta de 0.6 no genera warning", () => {
    const data = { ...validFactura, confianza: 0.6 };
    const result = safeParseVisionResult(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.warnings).toHaveLength(0);
    }
  });

  // -------------------------------------------------------------------------
  // Mismatch tipo ↔ sub-objeto
  // -------------------------------------------------------------------------

  it("❌ rechaza cuando tipo_documento='factura' pero datos_extraidos.factura está ausente", () => {
    const result = safeParseVisionResult(resultTipoMismatch);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some(
        (e) => e.includes("factura") && e.includes("vacío"),
      );
      expect(hasError).toBe(true);
    }
  });

  it("❌ rechaza cuando tipo_documento='otro' pero datos_extraidos.otro está ausente", () => {
    const data = {
      tipo_documento: "otro",
      confianza: 0.8,
      resumen: "Documento desconocido.",
      datos_extraidos: {
        factura: validFactura.datos_extraidos.factura,
      },
    };
    const result = safeParseVisionResult(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some(
        (e) => e.includes("otro") && e.includes("vacío"),
      );
      expect(hasError).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Validación de campos del resultado
  // -------------------------------------------------------------------------

  it("❌ rechaza confianza > 1.0", () => {
    const result = safeParseVisionResult(resultConfianzaFueraRango);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some((e) => e.includes("confianza"));
      expect(hasError).toBe(true);
    }
  });

  it("❌ rechaza confianza negativa", () => {
    const data = { ...validFactura, confianza: -0.1 };
    const result = safeParseVisionResult(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some((e) => e.includes("confianza"));
      expect(hasError).toBe(true);
    }
  });

  it("❌ rechaza código de idioma de 3 caracteres ('spa')", () => {
    const result = safeParseVisionResult(resultIdioma3Chars);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some((e) => e.includes("idioma"));
      expect(hasError).toBe(true);
    }
  });

  it("❌ rechaza resumen vacío", () => {
    const data = { ...validFactura, resumen: "" };
    const result = safeParseVisionResult(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some((e) => e.includes("resumen"));
      expect(hasError).toBe(true);
    }
  });

  it("❌ rechaza tipo_documento con valor fuera del enum", () => {
    const data = { ...validFactura, tipo_documento: "boleta" as never };
    const result = safeParseVisionResult(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some((e) =>
        e.includes("tipo_documento"),
      );
      expect(hasError).toBe(true);
    }
  });

  it("❌ rechaza tipo 'otro' con descripcion vacía", () => {
    const result = safeParseVisionResult(otroSinDescripcion);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasError = result.errors.some((e) => e.includes("descripcion"));
      expect(hasError).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Edge cases de payload
  // -------------------------------------------------------------------------

  it("❌ rechaza payload completamente vacío {}", () => {
    const result = safeParseVisionResult({});
    expect(result.success).toBe(false);
  });

  it("❌ rechaza payload null", () => {
    const result = safeParseVisionResult(null);
    expect(result.success).toBe(false);
  });

  it("❌ rechaza payload undefined", () => {
    const result = safeParseVisionResult(undefined);
    expect(result.success).toBe(false);
  });

  it("❌ rechaza payload string (no objeto)", () => {
    const result = safeParseVisionResult("esto no es un JSON");
    expect(result.success).toBe(false);
  });
});
