# PRD-004 · Índice de Vulnerabilidad Portuaria
**Versión:** 1.0 · **Fecha:** 2026-09-26 · **Estado:** Propuesto (pendiente ingest XLSX y solicitud APN)
**Autor:** Ricardo · **Alcance:** RASTRO / Treevu · **Prioridad:** 4/4

---

## 1. Objetivo del producto

Construir un índice compuesto de vulnerabilidad portuaria que permita rankear los 507 terminales y embarcaderos del Perú según su exposición a riesgos de lavado, contrabando y tráfico ilegal. El índice combina el inventario del MTC (ya disponible en RASTRO) con los volúmenes de carga que se obtengan de la APN. El producto sirve a analistas de seguridad, SUNAT/Aduanas y investigadores de crimen transnacional.

---

## 2. Estado actual

### Lo que existe

- **Connector `infraestructura-mtc`** ya ingesta desde PNDA:
  - 507 terminales portuarios, 4 snapshots (2022–2025)
  - Campos: código, nombre, ámbito, tipo, alcance, uso, tráfico categórico, estado conservación, titularidad, administrador, concesión, lat/lon, fecha_corte
  - Sin scheduler, ingest manual
- **Tests existentes:** 16 tests (11 normalize + 5 API) en `__tests__/`
- **Catalog tools:** 3 tools en catalog.ts (terminales, aeródromos, peajes)

### Lo que falta (gap crítico)

| Dato | Fuente | Frescura | Formato |
|---|---|---|---|
| Volúmenes TM por terminal/año/tipo_carga | APN XLSX `CARGAS_2010_2017.xlsx` | **2017** (8 años desactualizado) | XLSX |
| Movimiento mensual de naves | APN CSV programaciones 2023 | 2023 | CSV |
| Accidentes/derrames/incidentes portuarios | APN XLSX 2008-2017 | 2017 | XLSX |

### Pirámide de factibilidad para volúmenes

```
1. MAS FACTIBLE ──► Bajar XLSX CARGAS_2010_2017
                     URL: datosabiertos.gob.pe/sites/default/files/CARGAS_2010_2017.xlsx
                     Dataset ID: ba073cf0-59c7-4cc4-a212-ef00627594c3
                     Cobertura: 2010-2017, probable granularidad: puerto × año × tipo × TM
                     Acción: descargar + inspeccionar columnas + documentar

2. ──────────────────► Solicitar al APN vía Ley 27806 (Transparencia)
                     Plazo: 10 días hábiles
                     Pedir: anuarios portuarios 2018-2025 con TM por terminal/año/tipo
                     Riesgo: lentitud o respuesta parcial

3. ──────────────────► Scrapear portal APN (apn.gob.pe)
                     Riesgo: estructura JS/dinámica, robots.txt, cambios de URL
                     Requiere: Playwright

4. MENOS FACTIBLE ──► SUNAT/Aduanas: declaraciones por puerto
                     Demasiado granular, sin API pública
```

---

## 3. Arquitectura propuesta

### Paso 0 — Ingest del XLSX histórico (inmediato)

Inspeccionar y cargar el XLSX `CARGAS_2010_2017.xlsx` en la BD:

```sql
-- Estructura esperada (pendiente confirmar al abrir)
CREATE TABLE cargas_portuarias_historico (
  id               SERIAL PRIMARY KEY,
  terminal         TEXT,
  departamento     TEXT,
  tipo_carga       TEXT,
  unidad           TEXT,          -- 'TM' esperado
  anio             INT,
  volumen          NUMERIC,
  source_file      TEXT,
  source_sheet     TEXT,
  ingestion_date   DATE
);
```

### Paso 1 — Índice de Vulnerabilidad v1 (sin volúmenes actuales)

Índice compuesto sobre el inventario MTC existente:

```
VULNERABILIDAD = f(
  estado_conservacion,   -- peso 25%
  es_concesionado,      -- peso 20%
  tipo_alcance,         -- peso 15%
  ambito,               -- peso 10%
  tiene_geolocalizacion -- peso 10%
)
```

Con datos del CSV MTC 2025, sin necesidad de volúmenes APN.

### Paso 2 — Índice v2 (con XLSX histórico)

Al tener TM por terminal, el índice se enriquece con:

```
VULNERABILIDAD = f(
  ... /* componentes v1 */,
  volumen_historico_TM,     -- peso 20% (más tráfico = más exposición)
  variacion_volumen_3anios  -- peso 10% (terminales en crecimiento acelerado)
)
```

### Paso 3 — Índice v3 (con datos APN actuales)

Cuando se obtengan los anuarios 2018-2025 de la APN, reemplazar la componente de volumen histórico con datos frescos.

---

## 4. Modelo de datos

```sql
CREATE TABLE indice_vulnerabilidad_portuaria (
  codigo_puerto   TEXT,
  nombre_terminal TEXT,
  departamento    TEXT,
  ambito          TEXT,          -- 'MARITIMO' | 'FLUVIAL' | 'LACUSTRE'
  es_concesionado BOOLEAN,
  estado_conservacion TEXT,
  score_vulnerabilidad NUMERIC,  -- 0-100
  componentes             JSONB, -- {estado: 25, concesion: 20, ...}
  fuente_datos           TEXT,  -- 'MTC_2025' | 'MTC+CARGAS_2017' | 'MTC+APN_2024'
  actualizado_en         DATE,
  PRIMARY KEY (codigo_puerto, fuente_datos)
);
```

---

## 5. API propuesta

| Endpoint | Descripción |
|---|---|
| `GET /api/terminales/vulnerabilidad` | Ranking de vulnerabilidad, filtros (departamento, ámbito, fuente) |
| `GET /api/terminales/vulnerabilidad/:codigo` | Detalle del índice para un terminal |
| `GET /api/terminales/cargas` | Datos históricos de volumes (XLSX ingestado) |
| `GET /api/terminales/inventario` | Catálogo completo MTC con score |

---

## 6. Scope

### In
- Ingest y análisis del XLSX `CARGAS_2010_2017.xlsx`
- Conector para el XLSX (script de carga)
- Tabla `cargas_portuarias_historico`
- Índice v1 (inventario MTC) + v2 (con XLSX histórico)
- Endpoint `/api/terminales/vulnerabilidad`
- Solicitud Ley 27806 a la APN
- Tests del nuevo endpoint

### Out
- Scraper del portal APN (fase 2)
- Índice v3 con datos APN actuales (fase 2)
- Dashboard geoespacial interactivo (fase 2)
- Integración con datos de Aduanas (fase 3)
