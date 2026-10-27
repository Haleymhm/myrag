/**
 * Shared test fixtures — realistic LLM output payloads for each document type.
 * Each fixture has a "valid" (happy-path) variant and several "broken" variants
 * that exercise specific validation rules.
 */

import type { VisionResultData } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// FACTURA fixtures
// ---------------------------------------------------------------------------

export const validFactura: VisionResultData = {
  tipo_documento: "factura",
  confianza: 0.97,
  resumen: "Factura N.° F-2024-001 emitida por Acme S.A. a cliente por servicios de consultoría por un total de $1.210,00 (IVA 21 % incluido).",
  idioma: "es",
  datos_extraidos: {
    factura: {
      numero_factura: "F-2024-001",
      serie: "A",
      fecha_emision: "2024-03-15",
      fecha_vencimiento: "2024-04-15",
      moneda: "USD",
      emisor: {
        nombre: "Acme S.A.",
        identificacion_fiscal: "30-12345678-9",
        direccion: "Av. Corrientes 1234, CABA",
        telefono: "+54 11 4000-0000",
        email: "facturacion@acme.com",
      },
      receptor: {
        nombre: "Cliente S.R.L.",
        identificacion_fiscal: "30-98765432-1",
        direccion: "Belgrano 500, Rosario",
        email: "pagos@cliente.com",
      },
      items: [
        { descripcion: "Consultoría técnica — 10 h", cantidad: 10, precio_unitario: 100, descuento: 0, subtotal: 1000 },
      ],
      subtotal: 1000,
      impuestos: { tipo: "IVA", tasa_porcentaje: 21, monto: 210 },
      descuento_total: 0,
      total: 1210,
      metodo_pago: "Transferencia bancaria",
      condiciones_pago: "30 días netos",
    },
  },
};

/** Factura sin número — campo obligatorio faltante */
export const facturaWithoutNumero: VisionResultData = {
  ...validFactura,
  datos_extraidos: {
    factura: {
      ...validFactura.datos_extraidos.factura!,
      numero_factura: "",
    },
  },
};

/** Factura sin fecha de emisión */
export const facturaWithoutFechaEmision: unknown = {
  ...validFactura,
  datos_extraidos: {
    factura: {
      ...validFactura.datos_extraidos.factura!,
      fecha_emision: undefined,
    },
  },
};

/** Fecha de vencimiento anterior a la de emisión */
export const facturaVencimientoAnterior: VisionResultData = {
  ...validFactura,
  datos_extraidos: {
    factura: {
      ...validFactura.datos_extraidos.factura!,
      fecha_emision: "2024-03-15",
      fecha_vencimiento: "2024-02-01", // ANTES de emisión
    },
  },
};

/** subtotal + impuesto ≠ total (incoherencia numérica) */
export const facturaIncoherenciaTotal: VisionResultData = {
  ...validFactura,
  datos_extraidos: {
    factura: {
      ...validFactura.datos_extraidos.factura!,
      subtotal: 1000,
      impuestos: { tipo: "IVA", tasa_porcentaje: 21, monto: 210 },
      total: 999, // ← debería ser 1210
    },
  },
};

/** Suma de ítems difiere del subtotal */
export const facturaItemsNoSuman: VisionResultData = {
  ...validFactura,
  datos_extraidos: {
    factura: {
      ...validFactura.datos_extraidos.factura!,
      items: [
        { descripcion: "Servicio A", cantidad: 1, precio_unitario: 500, subtotal: 500 },
        { descripcion: "Servicio B", cantidad: 1, precio_unitario: 300, subtotal: 300 },
      ],
      subtotal: 1000, // ← sum of items = 800, declared = 1000
    },
  },
};

/** Email del emisor con formato inválido */
export const facturaEmailInvalido: VisionResultData = {
  ...validFactura,
  datos_extraidos: {
    factura: {
      ...validFactura.datos_extraidos.factura!,
      emisor: {
        ...validFactura.datos_extraidos.factura!.emisor!,
        email: "no-es-un-email",
      },
    },
  },
};

/** Fecha con formato incorrecto */
export const facturaFechaFormatoMal: unknown = {
  ...validFactura,
  datos_extraidos: {
    factura: {
      ...validFactura.datos_extraidos.factura!,
      fecha_emision: "15/03/2024", // DD/MM/YYYY — no ISO
    },
  },
};

/** Fecha que no existe en el calendario */
export const facturaFechaImpossible: unknown = {
  ...validFactura,
  datos_extraidos: {
    factura: {
      ...validFactura.datos_extraidos.factura!,
      fecha_emision: "2024-02-30", // 30 de febrero no existe
    },
  },
};

// ---------------------------------------------------------------------------
// RECIBO fixtures
// ---------------------------------------------------------------------------

export const validRecibo: VisionResultData = {
  tipo_documento: "recibo",
  confianza: 0.91,
  resumen: "Ticket de supermercado Jumbo por compra de alimentos y bebidas. Total $4.350,00.",
  idioma: "es",
  datos_extraidos: {
    recibo: {
      establecimiento: "Supermercado Jumbo",
      fecha_hora: "2024-03-20T18:30:00",
      numero_recibo: "T-00123",
      items: [
        { nombre: "Leche entera 1L x6", cantidad: 1, precio: 1200 },
        { nombre: "Pan de molde", cantidad: 2, precio: 350 },
        { nombre: "Café molido 500g", cantidad: 1, precio: 2100 },
      ],
      subtotal: 4000,
      propina: 0,
      impuesto: 350,
      total: 4350,
      metodo_pago: "Tarjeta de débito",
      ultimos_4_digitos_tarjeta: "4521",
    },
  },
};

/** Recibo sin establecimiento */
export const reciboSinEstablecimiento: unknown = {
  ...validRecibo,
  datos_extraidos: {
    recibo: {
      ...validRecibo.datos_extraidos.recibo!,
      establecimiento: "",
    },
  },
};

/** Recibo con total incorrecto */
export const reciboIncoherenciaTotal: VisionResultData = {
  ...validRecibo,
  datos_extraidos: {
    recibo: {
      ...validRecibo.datos_extraidos.recibo!,
      subtotal: 4000,
      impuesto: 350,
      propina: 0,
      total: 5000, // ← debería ser 4350
    },
  },
};

/** Últimos 4 dígitos con letras */
export const reciboDigitosInvalidos: unknown = {
  ...validRecibo,
  datos_extraidos: {
    recibo: {
      ...validRecibo.datos_extraidos.recibo!,
      ultimos_4_digitos_tarjeta: "AB12",
    },
  },
};

/** Suma de ítems (precio × cantidad) difiere del subtotal */
export const reciboItemsNoSuman: VisionResultData = {
  ...validRecibo,
  datos_extraidos: {
    recibo: {
      ...validRecibo.datos_extraidos.recibo!,
      items: [
        { nombre: "Leche", cantidad: 2, precio: 100 }, // 200
        { nombre: "Pan", cantidad: 1, precio: 50 },    // 50
      ],
      subtotal: 999, // ← debería ser 250
      impuesto: 0,
      propina: 0,
      total: 999,
    },
  },
};

// ---------------------------------------------------------------------------
// CONTRATO fixtures
// ---------------------------------------------------------------------------

export const validContrato: VisionResultData = {
  tipo_documento: "contrato",
  confianza: 0.88,
  resumen: "Contrato de prestación de servicios de desarrollo de software entre Tech S.A. (proveedor) y Retail Corp. (cliente) por $5.000 USD mensuales durante 12 meses.",
  idioma: "es",
  datos_extraidos: {
    contrato: {
      titulo: "Contrato de Desarrollo de Software",
      tipo_contrato: "Prestación de servicios",
      fecha_firma: "2024-01-10",
      lugar_firma: "Buenos Aires",
      vigencia: {
        fecha_inicio: "2024-02-01",
        fecha_fin: "2025-01-31",
        duracion: "12 meses",
        renovacion_automatica: false,
      },
      partes: [
        { nombre: "Tech S.A.", rol: "Proveedor", identificacion: "30-11111111-1" },
        { nombre: "Retail Corp.", rol: "Cliente", identificacion: "30-22222222-2" },
      ],
      objeto_del_contrato: "Desarrollo y mantenimiento de plataforma e-commerce.",
      contraprestacion_economica: { monto: 5000, moneda: "USD", forma_pago: "Mensual" },
      clausulas_clave: [
        { numero: "1", titulo: "Objeto", resumen: "Desarrollo de la plataforma e-commerce según especificaciones." },
        { numero: "2", titulo: "Confidencialidad", resumen: "Ambas partes mantienen reserva sobre la información intercambiada." },
      ],
      jurisdiccion_o_ley_aplicable: "Ley argentina, jurisdicción ordinaria de CABA",
      firmas_detectadas: [
        { nombre: "Tech S.A.", firmado: true },
        { nombre: "Retail Corp.", firmado: true },
      ],
    },
  },
};

/** Contrato con solo 1 parte */
export const contratoUnaParteOnly: unknown = {
  ...validContrato,
  datos_extraidos: {
    contrato: {
      ...validContrato.datos_extraidos.contrato!,
      partes: [{ nombre: "Tech S.A.", rol: "Proveedor" }],
    },
  },
};

/** Fecha de fin anterior a fecha de inicio */
export const contratoFechaFinAnterior: VisionResultData = {
  ...validContrato,
  datos_extraidos: {
    contrato: {
      ...validContrato.datos_extraidos.contrato!,
      vigencia: {
        fecha_inicio: "2024-06-01",
        fecha_fin: "2024-01-01", // ← anterior al inicio
      },
    },
  },
};

/** Roles duplicados entre partes */
export const contratoRolesDuplicados: unknown = {
  ...validContrato,
  datos_extraidos: {
    contrato: {
      ...validContrato.datos_extraidos.contrato!,
      partes: [
        { nombre: "Tech S.A.", rol: "Proveedor" },
        { nombre: "Sys Corp.", rol: "Proveedor" }, // ← mismo rol
      ],
    },
  },
};

/** Ninguna firma marcada como firmada */
export const contratoSinFirmas: VisionResultData = {
  ...validContrato,
  datos_extraidos: {
    contrato: {
      ...validContrato.datos_extraidos.contrato!,
      firmas_detectadas: [
        { nombre: "Tech S.A.", firmado: false },
        { nombre: "Retail Corp.", firmado: false },
      ],
    },
  },
};

/** Sin título */
export const contratoSinTitulo: unknown = {
  ...validContrato,
  datos_extraidos: {
    contrato: {
      ...validContrato.datos_extraidos.contrato!,
      titulo: "",
    },
  },
};

// ---------------------------------------------------------------------------
// OTRO fixtures
// ---------------------------------------------------------------------------

export const validOtro: VisionResultData = {
  tipo_documento: "otro",
  confianza: 0.72,
  resumen: "Documento técnico sobre arquitectura de microservicios.",
  idioma: "es",
  datos_extraidos: {
    otro: {
      descripcion: "Manual técnico de arquitectura de microservicios con diagramas C4.",
      tema_principal: "Arquitectura de software",
    },
  },
};

/** Sin descripción */
export const otroSinDescripcion: unknown = {
  ...validOtro,
  datos_extraidos: {
    otro: { descripcion: "" },
  },
};

// ---------------------------------------------------------------------------
// TOP-LEVEL VisionResult edge cases
// ---------------------------------------------------------------------------

/** Confianza baja — debe pasar validación pero emitir warning */
export const resultConfianzaBaja: VisionResultData = {
  ...validFactura,
  confianza: 0.42,
};

/** tipo_documento = factura pero datos_extraidos.factura ausente */
export const resultTipoMismatch: unknown = {
  tipo_documento: "factura",
  confianza: 0.9,
  resumen: "Un recibo de compra.",
  datos_extraidos: {
    recibo: validRecibo.datos_extraidos.recibo, // ← wrong sub-object
  },
};

/** Código de idioma de 3 letras (inválido) */
export const resultIdioma3Chars: unknown = {
  ...validFactura,
  idioma: "spa", // ← debe ser "es"
};

/** confianza fuera de rango */
export const resultConfianzaFueraRango: unknown = {
  ...validFactura,
  confianza: 1.5,
};
