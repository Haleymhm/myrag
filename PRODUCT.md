# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Profesionales, investigadores y equipos que gestionan conocimiento propio y documentos técnicos, legales o visuales para alimentar pipelines RAG (Retrieval-Augmented Generation) y consultar información indexada de forma ágil y confiable.

## Product Purpose

Extracto es el espacio de trabajo centralizado para ingesta, inspección y gestión de documentos (PDFs e imágenes) destinados a vectorización y recuperación semántica. El éxito significa transformar una simple subida de archivos en una consola de conocimiento clara, estructurada y eficiente donde cada documento pueda ser explorado, validado y preparado para el motor de vectores.

## Positioning

Un gestor de corpus documental de grado profesional, liviano y transparente sobre PostgreSQL y pgvector, que ofrece control directo sobre los archivos crudos, su metadata y la preparación de chunks sin depender de cajas negras externas.

## Operating Context

- Flujo de trabajo: carga por arrastrar/soltar o explorador de archivos, cola de procesamiento con retroalimentación inmediata, filtrado y búsqueda en el corpus, inspección pormenorizada de cada documento (previsualización, tamaño, formato, timestamp de inserción, estado de la base de datos).
- Entorno de ejecución: aplicación web de escritorio y responsive, conectada a Next.js 16 con PostgreSQL y extensión `vector` activa.

## Capabilities and Constraints

- Carga y visualización de archivos de formato: PDF, PNG, JPEG, WEBP, GIF.
- Backend en Next.js (App Router) con endpoints:
  - `GET /api/documents`: listado ordenado cronológicamente.
  - `POST /api/documents`: carga multipart/form-data con almacenamiento directo en bytea.
  - `GET /api/documents/[id]/file`: streaming inline del binario para previsualización directa.
- Base de datos relacional PostgreSQL con tablas `documents` y `document_chunks` (con vector(1536) y pgvector HNSW).
- Restricción: Compatibilidad 100% con los contratos de API existentes sin regresiones operativas.

## Brand Commitments

- Nombre: Extracto.
- Tono: Preciso, técnico, sobrio, confiable y orientado a la productividad analítica.
- Dirección Visual Elegida: Estándar SaaS Minimalista de Alta Fidelidad (estilo Linear/Vercel/Raycast). Monocromático, fondo oscuro/claro de alto contraste, bordes milimétricos (subtle zinc hairline borders), tipografía Geist sans y mono rigurosa, micro-interacciones suaves, sin adornos o temáticas forzadas.

## Evidence on Hand

- Esquema de base de datos en [db/init.sql](file:///c:/Home/myProjects/myProjects/myrag/db/init.sql).
- Endpoints existentes en [src/app/api/documents/route.ts](file:///c:/Home/myProjects/myProjects/myrag/src/app/api/documents/route.ts) y [src/app/api/documents/[id]/file/route.ts](file:///c:/Home/myProjects/myProjects/myrag/src/app/api/documents/[id]/file/route.ts).
- Vista actual funcional en [src/app/page.tsx](file:///c:/Home/myProjects/myProjects/myrag/src/app/page.tsx).

## Product Principles

1. **Claridad operativa ante todo**: Cada documento y archivo en la cola debe exponer su estado, formato, dimensiones o peso de manera nítida sin fricción.
2. **Inspección sin abandonar el flujo**: Previsualizar y auditar documentos directamente en la interfaz mediante paneles y capas contextuales sin saltos abruptos de ventana.
3. **Respeto a la densidad y el orden**: Organización limpia de datos mediante tablas/listas estructuradas y cuadrículas densas, permitiendo gestionar desde 5 hasta cientos de documentos.
4. **Resiliencia y transparencia de infraestructura**: Estados de carga, sincronización con PostgreSQL y errores del sistema claramente señalizados y recuperables.
