/**
 * Tests for FacturaSchema
 *
 * Covers:
 *  ✅ Happy path — factura completa y coherente
 *  ❌ Campo obligatorio faltante: numero_factura vacío
 *  ❌ Campo obligatorio faltante: fecha_emision ausente
 *  ❌ Fecha con formato incorrecto (DD/MM/YYYY)
 *  ❌ Fecha imposible (30 de febrero)
 *  ❌ fecha_vencimiento anterior a fecha_emision
 *  ❌ Incoherencia numérica: subtotal + impuesto ≠ total
 *  ❌ Suma de ítems ≠ subtotal declarado
 *  ❌ Email del emisor con formato inválido
 *  ✅ Factura con montos opcionales ausentes (sin impuesto, sin total)
 *  ✅ Tolerancia de redondeo aceptada (±0.01)
 */

import { describe, it, expect } from "vitest";
import { FacturaSchema, safeParseVisionResult } from "@/lib/schemas";
import {
  validFactura,
  facturaWithoutNumero,
  facturaWithoutFechaEmision,
  facturaVencimientoAnterior,
  facturaIncoherenciaTotal,
  facturaItemsNoSuman,
  facturaEmailInvalido,
  facturaFechaFormatoMal,
  facturaFechaImpossible,
} from "./fixtures";

// Helper: parse only the factura sub-object
const parseFactura = (raw: unknown) =>
  FacturaSchema.safeParse(raw);

describe("FacturaSchema", () => {
  // -------------------------------------------------------------------------
  // Happy paths
  // -------------------------------------------------------------------------

  it("✅ acepta una factura completa y coherente", () => {
    const result = safeParseVisionResult(validFactura);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tipo_documento).toBe("factura");
      expect(result.data.datos_extraidos.factura?.total).toBe(1210);
    }
  });

  it("✅ acepta factura sin montos opcionales (sin impuesto, sin total)", () => {
    const data = {
      numero_factura: "F-2024-002",
      fecha_emision: "2024-03-15",
      items: [{ descripcion: "Servicio A" }],
    };
    const result = parseFactura(data);
    expect(result.success).toBe(true);
  });

  it("✅ acepta factura con diferencia de redondeo dentro de tolerancia (±0.01)", () => {
    const data = {
      ...validFactura.datos_extraidos.factura!,
      subtotal: 1000,
      impuestos: { tipo: "IVA", tasa_porcentaje: 21, monto: 210 },
      descuento_total: 0,
      total: 1210.01, // 0.01 de diferencia → dentro de TOLERANCE=0.02
    };
    const result = parseFactura(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Campos obligatorios
  // -------------------------------------------------------------------------

  it("❌ rechaza factura con numero_factura vacío", () => {
    const result = safeParseVisionResult(facturaWithoutNumero);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasNumeroError = result.errors.some((e) =>
        e.includes("numero_factura"),
      );
      expect(hasNumeroError).toBe(true);
    }
  });

  it("❌ rechaza factura sin fecha_emision", () => {
    const result = safeParseVisionResult(facturaWithoutFechaEmision);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasFechaError = result.errors.some((e) =>
        e.includes("fecha_emision"),
      );
      expect(hasFechaError).toBe(true);
    }
  });

  it("❌ rechaza email del emisor con formato inválido", () => {
    const result = safeParseVisionResult(facturaEmailInvalido);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasEmailError = result.errors.some(
        (e) => e.includes("email") && e.toLowerCase().includes("inválido"),
      );
      expect(hasEmailError).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Validación de fechas
  // -------------------------------------------------------------------------

  it("❌ rechaza fecha_emision en formato DD/MM/YYYY", () => {
    const result = safeParseVisionResult(facturaFechaFormatoMal);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasFechaError = result.errors.some((e) =>
        e.toLowerCase().includes("fecha"),
      );
      expect(hasFechaError).toBe(true);
    }
  });

  it("❌ rechaza fecha 2024-02-30 (30 de febrero no existe)", () => {
    const result = safeParseVisionResult(facturaFechaImpossible);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasFechaError = result.errors.some((e) =>
        e.toLowerCase().includes("fecha"),
      );
      expect(hasFechaError).toBe(true);
    }
  });

  it("❌ rechaza fecha_vencimiento anterior a fecha_emision", () => {
    const result = safeParseVisionResult(facturaVencimientoAnterior);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasVencError = result.errors.some((e) =>
        e.includes("fecha_vencimiento"),
      );
      expect(hasVencError).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Coherencia numérica
  // -------------------------------------------------------------------------

  it("❌ rechaza cuando subtotal + impuesto ≠ total (fuera de tolerancia)", () => {
    const result = safeParseVisionResult(facturaIncoherenciaTotal);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasTotalError = result.errors.some(
        (e) => e.includes("total") && e.includes("Incoherencia"),
      );
      expect(hasTotalError).toBe(true);
    }
  });

  it("❌ rechaza cuando la suma de ítems difiere del subtotal declarado", () => {
    const result = safeParseVisionResult(facturaItemsNoSuman);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasSubtotalError = result.errors.some(
        (e) => e.includes("subtotal"),
      );
      expect(hasSubtotalError).toBe(true);
    }
  });
});
