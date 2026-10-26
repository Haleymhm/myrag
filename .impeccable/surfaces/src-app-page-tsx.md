---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

# Surface Brief: Extracto Document Workbench

- **Target**: src/app/page.tsx
- **Mode**: operate
- **Audience**: Profesionales de IA y analistas técnicos que ingieren y estructuran documentos para RAG.
- **Job**: Subir documentos rápidamente (drag & drop o selector), monitorear el estado de persistencia en PostgreSQL, explorar el corpus existente con búsqueda y filtros, e inspeccionar cualquier documento en detalle sin abandonar la pantalla.
- **Constraints**: 100% de compatibilidad con endpoints /api/documents y /api/documents/[id]/file. Respetar soporte modo claro/oscuro y Next.js 16.

## Direction contract

THESIS: Consola documental minimalista de alta precisión que reemplaza la vista genérica de una sola columna por un workspace operativo fluido con métricas en tiempo real, barra de herramientas con filtrado instantáneo, vistas conmutables (grid visual vs. tabla densa) e inspector lateral deslizable.
OWN-WORLD: Paleta sobria y profunda en carbón/zinc (#09090b, #18181b, #27272a, #fafafa), acentos esmeralda de conectividad (#10b981), bordes capilares sutiles (1px hairline borders), tipografía Geist sans + Geist mono tabular impecable.
STORY: El usuario ve el pulso del sistema (estado de base de datos y volumen de corpus), arrastra archivos con confirmación táctil inmediata, visualiza su procesamiento en cola con progreso individual y explora o audita cualquier documento en el visor inspector lateral.
FIRST VIEWPORT: Encabezado compacto con marca "EXTRACTO", chip de estado de conexión en vivo y contadores clave (docs, almacenamiento). Debajo, zona de subida conmutada/expandible con drag & drop; barra de filtros (búsqueda, tipo, vista grid/tabla) y listado del corpus con tarjetas interactivas e inspector lateral.
FORM: Canon (Estándar de la Categoría SaaS Minimalista de Alta Precisión), seed:7554fc5ade413022.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
