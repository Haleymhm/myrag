# Extracto 📄🔍

> **Consola y pipeline RAG de alta fidelidad para ingesta, extracción estructurada con Visión LLM, validación Zod y búsqueda semántica en PostgreSQL + PGVector.**

Extracto es un espacio de trabajo documental centralizado para procesar facturas, recibos, contratos y documentos no estructurados (PDFs e imágenes), transformándolos en datos estructurados relacionales y fragmentos vectorizados de alta precisión consultables en lenguaje natural.

---

## 🚀 Características Principales

- **Ingesta Multimodal Directa**: Carga por arrastrar y soltar o selector de archivos compatible con PDF, PNG, JPEG, WEBP y GIF.
- **Visión Artificial con LLM**: Extracción estructurada y OCR mediante modelos multimodales de última generación (*DeepSeek V4.1 Flash* vía OpenRouter / OpenAI API).
- **Validación Estricta con Zod**:
  - Validación de fechas de calendario ISO estrictas (incluyendo años bisiestos y rangos lógicos).
  - Verificación matemática obligatoria: `Subtotal + Impuestos = Total` (con tolerancia por redondeo de centavos).
  - Esquemas tipados específicos para **Facturas**, **Recibos**, **Contratos** y documentos generales (**Otro**).
- **Persistencia Dual en PostgreSQL**:
  - **Tablas Relacionales**: Almacenamiento estructurado en `facturas`, `recibos`, `contratos` y sus tablas secundarias de ítems, partes y cláusulas.
  - **PGVector (`vector(1536)`)**: Textos clave (títulos, nombres, direcciones, resúmenes) convertidos a embeddings e indexados con **HNSW** (`vector_cosine_ops`).
- **Chat Semántico RAG con Enrutamiento Híbrido**:
  - **Búsqueda Vectorial**: Recuperación de fragmentos por similitud de coseno citando de forma obligatoria el documento y archivo original.
  - **Motor de Consultas Analíticas (Text-to-SQL)**: Detección inteligente de preguntas numéricas o de cálculos (sumas, totales por emisor, conteo de facturas) ejecutadas mediante consultas SQL directas sobre las tablas relacionales para garantizar 100% de precisión matemática.
- **Visor e Inspector Integrado**: Previsualización interactiva de PDFs e imágenes, explorador de JSON estructurado, y telemetría de base de datos en tiempo real.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Framework Web** | [Next.js 16 (App Router)](https://nextjs.org/) & [React 19](https://react.dev/) |
| **Estilos** | [Tailwind CSS v4](https://tailwindcss.com/) & Fuentes Geist Sans / Mono |
| **Base de Datos** | [PostgreSQL](https://www.postgresql.org/) con extensiones `vector` ([pgvector](https://github.com/pgvector/pgvector)) y `pgcrypto` |
| **Conexión DB** | `pg` (node-postgres) con soporte automático para Docker local o Cloud ([Supabase](https://supabase.com/)) |
| **Validación de Datos** | [Zod v4](https://zod.dev/) |
| **Visión e Inteligencia Artificial** | DeepSeek V4.1 Flash vía OpenRouter / OpenAI API |
| **Testing** | [Vitest 3](https://vitest.dev/) (123 tests automatizados) |

---

## 📋 Arquitectura del Pipeline

```mermaid
flowchart TD
    A["Archivo (PDF / Imagen)"] --> B["POST /api/documents"]
    B --> C["Almacenamiento Temporal (documents bytea)"]
    C --> D["Visión LLM (OCR & Clasificación)"]
    D --> E{"Validación Zod"}
    E -- "Inválido / Incompleto" --> F["Estado: analysis_status = 'failed'"]
    E -- "Válido" --> G["Datos Estructurados JSON"]
    G --> H["Confirmar & Vectorizar"]
    H --> I["Tablas Relacionales (facturas, recibos, contratos)"]
    H --> J["Extracción de Textos Clave & Embeddings (1536d)"]
    J --> K["PGVector (document_chunks HNSW)"]
    
    L["Usuario en Chat RAG"] --> M{"¿Consulta Numérica / Cálculo?"}
    M -- "Sí (Sumas, Conteos, Totales)" --> N["SQL Analytics sobre Tablas Relacionales"]
    M -- "No (Semántica, Cláusulas, Emisores)" --> O["Búsqueda por Similitud Coseno en PGVector"]
    N --> P["Respuesta con SQL Badge"]
    O --> Q["Respuesta con Citación de Fuentes y Enlace a Original"]
```

---

## 📦 Instalación y Configuración

### 1. Clonar el Repositorio

```bash
git clone <URL_DEL_REPOSITORIO>
cd myrag
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Configurar Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto a partir del ejemplo:

```bash
cp .env.example .env.local
```

Configura tus credenciales:

```env
# Conexión local con Docker Compose:
POSTGRES_URL="postgresql://postgres:postgres@localhost:5432/extracto"

# O conexión remota (ej. Supabase):
# POSTGRES_URL="postgres://usuario:password@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require"

# API Key de OpenRouter para Visión LLM:
OPENROUTER_API_KEY="sk-or-v1-..."

# (Opcional) API Key de OpenAI para embeddings remotos:
OPENAI_API_KEY="sk-..."
```

> **Nota:** La clave de OpenRouter también puede ingresarse dinámicamente desde el botón **"Configurar API Key"** en la barra superior de la interfaz web.

### 4. Iniciar la Base de Datos con Docker (Opcional para Local)

Si utilizas PostgreSQL localmente:

```bash
docker compose up -d
```

Este comando levantará un contenedor PostgreSQL 16 con la extensión `pgvector` preinstalada y aplicará el esquema inicial de [`db/init.sql`](db/init.sql).

### 5. Iniciar el Servidor de Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 🗄️ Esquema de Base de Datos

### Tablas Principales

- **`documents`**: Almacena el binario del archivo (`bytea`), metadatos (`mime_type`, `size_bytes`), tipo clasificado y resultado crudo del análisis.
- **`facturas` & `factura_items`**: Persistencia normalizada de facturas (número, fechas, emisor, receptor, subtotal, impuestos, total e ítems).
- **`recibos` & `recibo_items`**: Tickets y comprobantes de compra (establecimiento, fecha/hora, total, propina, método de pago e ítems).
- **`contratos`**, **`contrato_partes`** & **`contrato_clausulas`**: Acuerdos legales (título, tipo, partes intervinientes, vigencias, montos y resumen de cláusulas clave).
- **`document_chunks`**: Fragmentos de texto indexados con embeddings vectoriales:
  ```sql
  embedding vector(1536)
  CREATE INDEX document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);
  ```

---

## 🌐 Endpoints de la API

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/documents` | Lista todos los documentos almacenados y su estado de confirmación. |
| `POST` | `/api/documents?analyze=true` | Sube un nuevo archivo (multipart/form-data) con auto-análisis opcional. |
| `GET` | `/api/documents/[id]/file` | Streaming del archivo binario original para previsualización directa. |
| `POST` | `/api/documents/[id]/analyze` | Ejecuta o reintenta el análisis con Visión LLM sobre un documento existente. |
| `POST` | `/api/documents/[id]/confirm` | Valida con Zod, inserta en tablas relacionales y vectoriza en PGVector. |
| `POST` | `/api/chat` | Chat RAG semántico con enrutamiento híbrido (Búsqueda semántica o SQL). |

---

## 🧪 Pruebas Automatizadas

El proyecto cuenta con una suite integral de **123 tests** automatizados con Vitest que validan:
- Esquemas de validación Zod (cálculos matemáticos, fechas y campos requeridos).
- Manejo de documentos incompletos y estados de error.
- Enrutamiento híbrido del chat (consultas analíticas vs. vectoriales).
- Servicios de confirmación y vectorización.
- Endpoints de la API REST.

Para ejecutar los tests:

```bash
# Ejecutar todas las pruebas una vez
npm test

# Modo interactivo en tiempo real
npm run test:watch

# Reporte de cobertura de código
npm run test:coverage
```

---

## 📁 Estructura del Proyecto

```text
myrag/
├── db/
│   └── init.sql                   # Inicialización de tablas y extensiones PostgreSQL/pgvector
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/              # Endpoint del Chat RAG
│   │   │   └── documents/         # Endpoints CRUD, visor binario, análisis y confirmación
│   │   ├── globals.css            # Tokens de diseño y estilos globales de Tailwind CSS
│   │   ├── layout.tsx             # Layout raíz con configuración de fuentes Geist
│   │   └── page.tsx               # Interfaz interactiva completa (Workspace & Chat RAG)
│   └── lib/
│       ├── confirm-document.ts    # Transacción de guardado relacional y vectorización
│       ├── db.ts                  # Pool de conexiones y migraciones automáticas
│       ├── embeddings.ts          # Extractor de textos y generador de embeddings (1536d)
│       ├── schemas.ts             # Esquemas Zod para Factura, Recibo, Contrato y Visión
│       ├── semantic-search.ts     # Búsqueda por similitud de coseno y RAG con citas
│       ├── sql-analytics.ts       # Detección y ejecución de consultas analíticas SQL
│       └── vision.ts              # Cliente multimodal OpenRouter (DeepSeek V4.1 Flash)
├── docker-compose.yml             # Contenedor PostgreSQL 16 con extensión pgvector
├── package.json
└── vitest.config.ts               # Configuración de pruebas unitarias
```

---

## 📄 Licencia

Este proyecto está disponible bajo licencia privada para fines de desarrollo y evaluación técnica.
