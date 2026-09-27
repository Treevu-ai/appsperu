# Brief Técnico — Conectores de Transporte Rastro

**Versión:** 1.0
**Fecha:** 2026-09-24
**Autor:** Mavis / Ricardo
**Estado:** Para revisión de equipo de ingeniería

---

## Resumen ejecutivo

Se construyeron 4 conectores Python que extraen datos de transporte del Estado peruano desde fuentes sin API pública: un catálogo CKAN del PNDA (4,647 datasets), reportes dinámicos de OSITRAN (51 reportes en 9 secciones), datos abiertos de la ATU Lima/Callao (5 categorías), y capas geoespaciales del Geoserver del MTC (10 capas). Los datos se descargan a `cache/` como evidencia cruda y se integran en las apps existentes de appsperu. Tres de los 4 conectores requieren validación desde una IP peruana; el PNDA funciona desde cualquier red.

---

## Estado de cada conector

| Conector | Fuente | Datos que entrega | Validado | IP peruana |
|---|---|---|---|---|
| `pnda_transporte.py` | datosabiertos.gob.pe | Catálogo 4,647 datasets, descarga recursos (CSV/XLS/GEOJSON) | ✅ `--limit 5` OK | No |
| `ositran_data.py` | datos.ositran.gob.pe | 51 reportes: tráfico, pasajeros, carga, recaudación, reclamos, inversiones | ⚠️ `--list-codes` OK, descarga pendiente | Sí |
| `atu_transporte.py` | systems.protransporte.gob.pe | Metropolitano, corredores, regular, especial, ferroviario (XLS) | ⚠️ `--list` OK, descarga pendiente | Sí |
| `mtc_geoserver.py` | mtcgeo2.mtc.gob.pe:8080 | 10 capas: red vial, terminales, aeropuertos, puertos, peajes 2024-25 | ⚠️ Solo --list (bloqueado) | Sí |

---

## Arquitectura de integración

```
tools/scrapers/scripts/
│
├── pnda_transporte.py
│   └── cache/pnda_transporte/
│       ├── datasets_{date}.json          ← catálogo completo
│       └── resources/{resource_id}/      ← archivos crudos descargados
│                                           → ingestion por app destino
│
├── ositran_data.py
│   └── cache/ositran_data/
│       └── reports_{date}.json           ← 51 reportes descargados
│           → apps/infraestructura-mtc/
│               └── src/ingest/ositran-connector.ts
│
├── atu_transporte.py
│   └── cache/atu_transporte/
│       └── {categoria}/                  ← XLS por categoría
│           → apps/radar-inversiones/ (o extensión)
│
└── mtc_geoserver.py
    └── cache/mtc_geoserver/
        └── {layer}_{date}.geojson        ← capas geoespaciales
            → apps/ceplan-geo/
                └── src/ingest/ingest-infrastructure.ts  (extendido)
```

---

## Gaps cubiertos vs. datos existentes

| Lo que NO existía antes | Qué lo resuelve |
|---|---|
| Tráfico vehicular por carretera (IMD, recaudación, ejes) | OSITRAN códigos 7-21 |
| Pasajeros y carga por aeropuerto | OSITRAN códigos 1-6 |
| Movimiento portuario (naves, contenedores, carga USD) | OSITRAN códigos 36, 49-51 |
| Red vial con geometría de corredor (no solo puntos) | MTC Geoserver red vial nacional/departamental/vecinal |
| Peajes con datos de flujo trimestral 2024-25 | MTC Geoserver `peajes_2024_2025` |
| Metropolitano, corredores, ferroviario Lima/Callao | ATU (5 categorías) |
| Catálogo indexado de todos los datasets de transporte del Estado | PNDA (4,647 datasets filtrados por transporte) |

---

## Riesgos operativos

### OSITRAN
- **Headers dinámicos**: los reportes JSP generan headers desde el HTML — si OSITRAN cambia la estructura, las columnas cambian sin aviso. El diseño usa `JSONB` para absorber cambios de schema sin romper la ingesta.
- **rowspan/colspan**: las celdas que abarcan múltiples filas/columnas no se parsean — se pierden.
- **Sin paginación**: si el reporte tiene más filas que las visibles, solo se captura la primera página.
- **Timeout de 20s**: tablas JSP que tardan más fallan silenciosamente.

### ATU
- **openpyxl/xlrd obligatorios**: si no están instalados, los XLS se guardan como binario sin datos y el error aparece en el reporte de calidad, no como excepción.
- **Primera fila como header**: si el XLS tiene filas de metadata antes de los datos, esas filas se cargan como columnas.

### MTC Geoserver
- **IP-restringido**: el servidor no responde desde redes externas. Si el equipo está fuera de Perú, todos los intentos dan "connection refused".
- **Datos base de 2015-2018**: la red vial, aeropuertos y puertos son inventarios estáticos de esos años — no reflejan cambios recientes.
- **~230k features la red vial**: la red vial completa supera los 100 MB en GeoJSON — descargar en chunks de 5,000.

### PNDA
- **Sin SLA de actualización**: cada organización publica cuando quiere. No hay forma de saber si un dataset cambió sin descargarlo completo.
- **Rate limit**: el portal CKAN puede limitar requests — el conector tiene backoff, pero un scan completo de 4,647 datasets puede tardar 30+ minutos.

---

## Tickets de ingeniería

### TX-01 — Validar y primer dump de OSITRAN [Alta]
```
Estado: bloqueante para TX-02
Estimación: 2-4h desde red peruana
Pasos:
  1. python -m tools.scrapers.scripts.ositran_data --download-all
  2. Revisar cache/ositran_data/reports_*.json — confirmar filas por reporte
  3. Identificar los 3-5 reportes más estables (headers que no cambiaron)
  4. Pasar resultados a equipo de infraestructura-mtc
```

### TX-02 — Integración OSITRAN → infraestructura-mtc [Alta]
```
Estado: depende de TX-01
Estimación: 3-5 días
Entregables:
  1. Migration: 002_ositran.sql (tablas + índices)
  2. Conector: src/ingest/ositran-connector.ts
  3. Endpoints API: GET /api/ositran/{section}, GET /api/ositran/{section}/resumen
  4. Join con tablas existentes: aerodromos, puertos, peajes
Doc de diseño: docs/arquitectura/ositran-integracion-infraestructura-mtc.md
```

### TX-03 — Validar MTC Geoserver desde IP peruana [Alta]
```
Estado: bloqueante para TX-04
Estimación: 1-2h desde red peruana
Pasos:
  1. python -m tools.scrapers.scripts.mtc_geoserver --list
  2. Si responde: python -m tools.scrapers.scripts.mtc_geoserver --layer terminal_terrestre
  3. Confirmar schema de atributos descargando una capa pequeña
  4. Reportar: ¿qué capas responden? ¿cuántos features?
```

### TX-04 — Integración MTC Geoserver → ceplan-geo [Alta]
```
Estado: depende de TX-03
Estimación: 4-6 días
Entregables:
  1. Migration: 012_mtc_geoserver_infrastructure.sql (geometry_type como generated column)
  2. Extender src/ingest/ingest-infrastructure.ts con ingestFromCache()
  3. Endpoints API: GET /api/infrastructure (extendido), GET /api/infrastructure/vial,
     GET /api/infrastructure/cruce (cruce con INFOBRAS por geometría)
  4. Índices espaciales GIST
Doc de diseño: docs/arquitectura/mtc-geoserver-integracion-ceplan-geo.md
```

### TX-05 — Validar ATU e integrar [Media]
```
Estimación: 2-3 días
Pasos:
  1. python -m tools.scrapers.scripts.atu_transporte --download
  2. Verificar openpyxl/xlrd instalados
  3. Decidir app destino: ¿radar-inversiones o extensión de infraestructura-mtc?
  4. Schema + conector + endpoints
```

### TX-06 — PNDA full scan [Baja]
```
Estimación: 30 min (corrida única)
Nota: puede dejarse corriendo en background overnight
python -m tools.scrapers.scripts.pnda_transporte --limit 4647
O en tranches: --limit 200 por sesión para no saturar rate limit
```

---

## Métricas de éxito

| Métrica | Target | Cómo medir |
|---|---|---|
| OSITRAN: reportes con datos | ≥80% de los 51 reportes con >0 filas | `rows_count > 0` en `ositran_scrape_results` |
| OSITRAN: columnas consistentes | ≤3 cambios de header por mes | Comparar `columnas_jsonb` entre corridas |
| MTC Geoserver: features descargados | todas las 10 capas >0 features | `download_results.features_count` |
| ATU: archivos parseados | ≥80% de archivos con >10 filas de datos | `files.rows_extracted > 10` |
| PNDA: datasets con recurso descargado | ≥500 de los ~300 de transporte | `resources` con `size > 0` |
| Tiempos de ingesta | OSITRAN <15 min para 51 reportes, MTC <10 min para 10 capas | Logs de corrida |

---

## Dependencias técnicas

| Dependencia | Estado | Acción |
|---|---|---|
| Chromium (Playwright) | ✅ Instalado | Verificar con `python -c "from playwright.sync_api import sync_playwright; print('OK')"` |
| openpyxl | ⚠️ Verificar | `pip show openpyxl` o `python -c "import openpyxl"` |
| xlrd | ⚠️ Verificar | `python -c "import xlrd"` |
| Python 3.11+ | ✅ Confirmado | — |
| PostGIS | ✅ Requiere en ceplan-geo | — |
| Rate limit CKAN (PNDA) | 15 req/s | El conector tiene backoff configurado |

---

## Docs de soporte

| Documento | Ubicación |
|---|---|
| Data contract PNDA | `docs/data-contracts/transporte-pending/pnda_transporte.md` |
| Data contract OSITRAN | `docs/data-contracts/transporte-pending/ositran_data.md` |
| Data contract ATU | `docs/data-contracts/transporte-pending/atu_transporte.md` |
| Data contract MTC Geoserver | `docs/data-contracts/transporte-pending/mtc_geoserver.md` |
| Diseño OSITRAN → infraestructura-mtc | `docs/arquitectura/ositran-integracion-infraestructura-mtc.md` |
| Diseño MTC Geoserver → ceplan-geo | `docs/arquitectura/mtc-geoserver-integracion-ceplan-geo.md` |
