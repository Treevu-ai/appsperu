# Matriz de cobertura territorial — La Libertad ALSOL (AL2-02)

**Fecha:** 2026-08-26  
**Alcance:** LA LIBERTAD (único departamento en scope del proyecto)  
**Leyenda:** ✅ verificado en corrida documentada · 🟡 parcial / CLI listo sin corrida terminal · ⏸ pendiente corrida · N/A no aplica territorialmente

> **Nota de alcance (2026-08-26):** el sprint se redujo a La Libertad. Lambayeque, Piura, Cajamarca y Cusco quedan fuera de scope; sus memos de análisis se conservan como histórico en `docs/analisis-{depto}-2026-08.md` pero no se actualizan.

## Resumen ejecutivo

| Departamento | UBIGEO | Distritos (ceplan-geo) | Estado global |
|---|---:|---:|---|
| LA LIBERTAD | 13 | 83 | ✅ MEF re-corrida 2026-08-26 (16/16 + meta GN) |

## Matriz app × departamento

| App / Fuente | LA LIBERTAD | Notas |
|---|---|---|
| **ceplan-geo** (distritos WFS) | ✅ 83 | Ingesta nacional; dept verificado en `cobertura:geoserver` |
| **radar-ejecucion** (MEF) | ✅ re-corrida | `ingest:mef:pilot` — 0 seccionesSinDatos LL (26-08 22:34 UTC, 2ª corrida) |
| **radar-inversiones** (Invierte) | ✅ full | Corrida `ingest:invierte:full` 2026-08-26 |
| **infobras** | ✅ 10,134 obras | Ingesta local completa confirmada 2026-08-26 (178,638 obras totales en BD, 10,134 en La Libertad) |
| **compras-publicas** (OECE) | 🟡 ventana 10 págs | `OECE_DEPARTAMENTOS` admite LA LIBERTAD; no corrida terminal nacional |
| **ceplan-estrategico** | N/A | Indicadores nacionales GN/GR — sin llave departamental |
| **identidad-fiscal** | ✅ 106,918 contribuyentes | Padrón RUC nacional (SUNAT); certificado en `territorial_coverage` 2026-08-27 vía `coverage:identidad-fiscal` |
| **proveedores-sancionados** | ✅ nacional | Fuente nacional |
| **salud-institucional** | ✅ score LL | Default histórico LL; requiere capas mínimas por dept |

## Comandos de preflight (AL2-03)

```bash
# 1. Geo — nacional (incluye La Libertad en reporte)
cd apps/ceplan-geo/api && npm run cobertura:geoserver

# 2. MEF
cd apps/radar-ejecucion/api
MEF_DEPARTAMENTO=LA_LIBERTAD npm run ingest:mef

# 3. INFOBRAS
cd apps/infobras/api
npm run ingest:infobras

# 4. Invierte — corrida completa
cd apps/radar-inversiones/api
INVIERTE_DEPARTAMENTOS=LA_LIBERTAD npm run ingest:invierte:full

# 5. Cobertura terminal (radar-ejecucion)
cd apps/radar-ejecucion/api
npm run cobertura:territorial -- --jurisdiccion LA_LIBERTAD
```

## Puerta Sprint 6

| Criterio | Estado |
|---|---|
| Matriz publicada | ✅ este documento |
| Spike geo cerrado | ✅ `docs/spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md` |
| La Libertad — MEF+INFOBRAS+Invierte | ✅ los tres verificados 2026-08-26 |
| La Libertad sin regresión | ✅ baseline 2026-08-26 |

**Nota:** MEF re-corrida 2026-08-26 22:34 UTC (2ª corrida) confirma 0 `seccionesSinDatos` para La Libertad. INFOBRAS ingestado localmente y verificado por SQL: 10,134 obras para La Libertad (26-08-2026).
