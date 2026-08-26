# Spike CG-25 / AL2-01 — Capas hidráulica y proyectos (GeoServer CEPLAN)

**Fecha:** 2026-08-26  
**Comando:** `cd apps/ceplan-geo/api && npm run spike:layers`  
**Fuente:** `https://geo.ceplan.gob.pe/geoserver/geoceplan/wfs` (GetCapabilities + GetFeature)

## Hallazgo principal: nombres documentados ≠ nombres en vivo

| Nombre en docs v1 | Estado en GeoServer | Capa(s) real(es) |
|---|---|---|
| `geoceplan:cb_redhidrica` | **No existe** (HTTP 400) | `cb_redhidricax`, `cb_redhidricaprinx` |
| `geoceplan:cb_proyectos` | **No existe** (HTTP 400) | Familia `ip_pry*` (por sector) + `ap_proyecminerox` |

GetCapabilities lista **83 capas** en el workspace `geoceplan`.

## Resultados medidos

### Red hídrica

| Capa | Features | 1ª página (500) | Geometría | Decisión |
|---|---:|---:|---|---|
| `cb_redhidricax` | **345,634** | 767 ms | MultiLineString | **POSPONER** |
| `cb_redhidricaprinx` | **1,744** | 1,368 ms | MultiLineString | **AUTOMATIZABLE** |

Atributos útiles en `cb_redhidricaprinx`: `nombre_ca`, `categoria`, `long_km`, `codigo_rh`, `iddpto`, `idprov`.

Estimación ingesta completa `cb_redhidricax`: ~692 páginas × ~0.5 s ≈ **6+ min** solo en red, sin PostGIS — volumen excesivo para MVP.

### Proyectos

No hay capa única nacional. Candidatos sectoriales:

| Capa | Features | Geometría | CUI/SNIP | Decisión |
|---|---:|---|---|---|
| `ip_pryedux` | 5 | null (tabla) | `codigounic`, `codsnip` | AUTOMATIZABLE |
| `ip_pryturx` | 3 | Point | sí | AUTOMATIZABLE |
| `ip_prysecagr` | 28 | Point | sí | AUTOMATIZABLE |
| `ap_proyecminerox` | 275 | Point | no (minería) | AUTOMATIZABLE (contexto distinto) |

Las capas `ip_pry*` incluyen `departamen`, `provincia`, `distrito`, `latitud`, `longitud` — **cruce potencial con UBIGEO** más rico que INFOBRAS, pero universo pequeño y sectorial (no reemplaza `radar-inversiones`).

Existen **18 capas `ip_pry*`** adicionales en el catálogo; ingesta Fase 2b podría sumarlas si Sprint 7–8 lo requieren.

## Decisiones de producto (AL2-06)

| Entregable | Decisión | Sprint |
|---|---|---|
| `cb_redhidricax` (nacional completa) | **POSPONER** | — |
| `cb_redhidricaprinx` | **INGESTA MVP** — `ingest:hydro-principal` | 6 opcional / 7 |
| Capas `ip_pry*` prioritarias (edu, tur, agro) | **MVP_ACOTADO** — spike de valor vs `radar-inversiones` antes de automatizar | 7+ |
| `cb_proyectos` como nombre único | **Retirar de docs** — reemplazar por familia `ip_pry*` | 6 |

## Riesgos

- `cb_redhidricaprinx` tarda ~1.3 s por página de 500 — aceptable (4 páginas total).
- Proyectos CEPLAN geo son muestra sectorial mínima (5+3+28 features en 3 capas probadas) — no sustituyen Invierte.pe.
- Nombres de capa pueden cambiar; `npm run ingest:discovery` debe alertar drift.

## Próximos pasos

1. Actualizar `docs/data-contracts/ceplan-geo.md` con nombres verificados.
2. Implementar ingesta opcional de `cb_redhidricaprinx` si Fase 2 requiere contexto hídrico.
3. Evaluar cruce `ip_pry*` ↔ `radar-inversiones` por `codsnip` en Sprint 7+.
