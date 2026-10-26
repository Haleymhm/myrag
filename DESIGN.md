---
name: Extracto
description: Consola documental minimalista de alta precisión para ingesta e indexación RAG con PostgreSQL y pgvector.
colors:
  primary: "#18181b"
  neutral-bg: "#fafafa"
  neutral-surface: "#ffffff"
  neutral-surface-dark: "#09090b"
  border-subtle: "#e4e4e7"
  border-subtle-dark: "#27272a"
  text-muted: "#71717a"
  emerald-active: "#10b981"
  red-badge: "#ef4444"
  blue-badge: "#3b82f6"
typography:
  display:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  mono:
    fontFamily: "var(--font-geist-mono), ui-monospace, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
---

# Design System: Extracto

## Overview

**Creative North Star: "The Precision Monolith"**

Extracto es un espacio de trabajo de instrumentación técnica para ingesta y gestión de corpus documental. Su diseño adopta la estética SaaS Minimalista Clásica (en la estirpe de Linear, Vercel y Raycast): una arquitectura monocromática sobria, jerarquías nítidas, contrastes controlados y micro-interacciones táctiles sin ruidos ni ornamentaciones superfluas.

El sistema balancea alta densidad de datos y ergonomía visual mediante un shell de mando superior con telemetría en tiempo real, una zona de ingesta por arrastre con retroalimentación inmediata, y un explorador dual (cuadrícula visual de previsualización y tabla técnica densa) respaldado por un panel inspector lateral que evita perder el contexto de trabajo.

**Key Characteristics:**
- **Monocromía rigurosa**: Base en zinc/carbón (#09090b / #fafafa) donde el color queda reservado exclusivamente para significado funcional (esmeralda para telemetría conectada, ámbar para advertencias de servicio, rojo/azul para badges de formato PDF/imagen).
- **Tabularidad estricta**: Uso explícito de cifras tabulares (`font-variant-numeric: tabular-nums`) en tamaños de archivo, conteos y timestamps.
- **Micro-interacciones táctiles**: Elevaciones milimétricas al pasar el cursor (-0.5px), transiciones de opacidad y acentos de borde capilar de 1px.
- **Inspección sin fricción**: Panel lateral deslizable para previsualizar y auditar cualquier documento sin abandonar el flujo principal.

## Colors

Paleta sobria de alto contraste, neutra y balanceada para entornos profesionales de ingeniería e investigación.

### Primary
- **Obsidian Zinc** (#18181b en claro / #fafafa en oscuro): Color de acento primario para llamadas de acción clave, selección activa y elementos de marca.

### Neutral
- **Canvas White / Canvas Dark** (#fafafa / #09090b): Fondo base del lienzo.
- **Surface Pure / Surface Panel** (#ffffff / #121215): Superficie de tarjetas y paneles elevados.
- **Border Hairline** (#e4e4e7 / #27272a): Líneas divisorias de 1px y contornos estructurales.
- **Text Primary** (#09090b / #fafafa): Tipografía principal para nombres de archivo y títulos.
- **Text Muted** (#71717a / #a1a1aa): Metadatos, etiquetas secundarias y explicaciones.

### Named Rules
**The Functional Accent Rule.** Los colores cromáticos (esmeralda, rojo, azul, ámbar) nunca se usan como decoración de marca; existen exclusivamente para comunicar estado del sistema o formato del documento.

## Typography

**Display Font:** Geist Sans (fallback: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto)
**Body Font:** Geist Sans
**Label/Mono Font:** Geist Mono (fallback: ui-monospace, Menlo, Monaco, Consolas)

**Character:** Tipografía geométrica y humanista neutral de alta legibilidad en pantallas de alta densidad, emparejada con una fuente monoespaciada para hashes UUID, formatos y cifras tabulares.

### Hierarchy
- **Display** (600, 1.125rem / 18px, line-height 1.25): Título de sección "Corpus Documental" y encabezado de panel inspector.
- **Headline** (600, 0.875rem / 14px, line-height 1.35): Títulos de tarjetas, nombres de archivo y encabezados de tabla.
- **Body** (400, 0.75rem / 12px, line-height 1.5): Texto estándar de botones, inputs y descripciones de estado.
- **Label / Mono** (400, 0.6875rem / 11px, line-height 1.4): UUIDs, conteo de bytes, tipos MIME, atajos de teclado y timestamps.

### Named Rules
**The Tabular Number Rule.** Todo valor numérico que represente peso en bytes, cantidad de documentos o fecha debe renderizarse con `font-variant-numeric: tabular-nums` para garantizar alineación vertical perfecta en listas y tablas.

## Layout

Estructura centralizada con un ancho máximo de lectura y operación de `max-w-7xl` (1280px), centrada con padding horizontal adaptativo (16px a 24px).

- **Shell de navegación superior**: Barra fija (`sticky top-0`) de 56px con desenfoque de fondo sutil (`backdrop-blur-md`), agrupando marca, telemetría y acción primaria de subida.
- **Zona de ingesta superior**: Bloque de arrastre centralizado con bordes discontinuos, que actúa como puerta de entrada al flujo de trabajo.
- **Barra de herramientas de corpus**: Fila adaptable que une búsqueda en tiempo real, filtros de formato por botones segmentados, selector de ordenamiento y conmutador de vista.
- **Vistas conmutables**:
  - *Cuadrícula visual*: 1 a 4 columnas responsivas (`grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`) con aspecto visual proporcional para inspección rápida de carátulas.
  - *Tabla técnica*: Tabla continua con separación fina para alta densidad y revisión ágil por lotes.

## Elevation & Depth

La interfaz opera sobre un modelo de capas tonales planas y bordes de precisión (1px hairline borders).

- **Superficie plana en reposo**: Las tarjetas y contenedores reposan con borde capilar `border-zinc-200 dark:border-zinc-800` y sombra imperceptible (`shadow-xs`).
- **Respuesta a interacción**: En `:hover`, las tarjetas se elevan con `-translate-y-0.5` y proyectan una sombra suave natural (`shadow-md`).
- **Capas flotantes**: El panel inspector lateral y el header sticky utilizan desenfoque de fondo suave (`backdrop-blur-xs` / `backdrop-blur-md`) con sombra profunda (`shadow-2xl`) para separar planos.

### Named Rules
**The No-Colored-Shadow Rule.** Ningún elemento puede proyectar sombras con tinte de color. La profundidad se transmite exclusivamente mediante luminosidad, contraste de superficie y sombras neutrales transparentes.

## Shapes

- **Contenedores principales**: Radio de curvatura de 16px (`rounded-2xl`) para la zona de arrastre, cola de subida y estados vacíos.
- **Tarjetas y paneles de previsualización**: Radio de curvatura de 12px (`rounded-xl`).
- **Botones, inputs y selectores**: Radio de curvatura de 8px (`rounded-lg`).
- **Badges y chips de estado**: Radio de curvatura de 6px (`rounded`) o pill completa (`rounded-full`).

## Components

### Buttons
- **Shape:** Borde redondeado suave (8px, `rounded-lg`).
- **Primary:** Fondo negro (#18181b / #ffffff), texto blanco (#fafafa / #09090b), padding de 6px 14px, tipografía 12px font-medium.
- **Ghost / Subtle:** Fondo transparente, texto zinc (#71717a), transición a fondo zinc suave (`hover:bg-zinc-100 dark:hover:bg-zinc-800`).

### Chips & Badges
- **Formato PDF:** Fondo rojo translúcido (`bg-red-500/10`), borde rojo sutil (`border-red-500/20`), texto rojo vivo (`text-red-600 dark:text-red-400`).
- **Formato Imagen:** Fondo azul translúcido (`bg-blue-500/10`), borde azul sutil (`border-blue-500/20`), texto azul vivo (`text-blue-600 dark:text-blue-400`).
- **Telemetría Conectada:** Indicador esmeralda con halo de pulsación y texto tenue.

### Cards / Containers
- **Corner Style:** 12px de radio (`rounded-xl`).
- **Background:** Blanco puro (#ffffff) o zinc profundo (#0c0c0e).
- **Border:** 1px sólido en `border-zinc-200 dark:border-zinc-800`.
- **Previsualizador integrado:** Marco con fondo mate neutral (#f4f4f5 / #18181b) con `object-contain` centrado.

### Inputs / Fields
- **Style:** Borde de 1px en `border-zinc-200 dark:border-zinc-800`, fondo blanco / zinc oscuro, tipografía 12px.
- **Focus:** Contorno limpio sin anillos de color ruidosos (`focus:border-zinc-400 dark:focus:border-zinc-600`).

### Inspector Drawer
- **Estructura:** Panel deslizable de ancho completo en móvil y hasta 576px (`max-w-xl`) en escritorio, con visor de alta definición, tabla de metadatos de clave-valor y tarjeta explicativa de preparación vectorial RAG.

## Do's and Don'ts

### Do:
- **Do** utilizar Geist Sans y Geist Mono de forma estricta para todo el texto de la aplicación.
- **Do** formatear todos los tamaños de archivo mediante la función uniforme `formatBytes()` (B, KB, MB, GB con un decimal).
- **Do** proveer atajos de teclado intuitivos (`Esc` para cerrar inspectores, `⌘U` / `Ctrl+U` para abrir el explorador de archivos).
- **Do** ofrecer retroalimentación de copiado inmediata ("✓ Copiado") en cada acción de copiado a portapapeles.
- **Do** proveer diagnóstico claro y recuperable ante desconexión de la base de datos PostgreSQL.

### Don't:
- **Don't** utilizar degradados de texto ni efectos de neón o halos de color.
- **Don't** usar etiquetas "kicker" o subtítulos artificiales por encima de los encabezados principales.
- **Don't** usar bordes izquierdos gruesos de color para resaltar alertas o tarjetas.
- **Don't** esconder metadatos clave como el UUID o el tamaño exacto del archivo en la base de datos.
- **Don't** bloquear el flujo de trabajo del usuario con modales invasivos cuando un panel deslizable o una acción en línea es más ergonómica.

