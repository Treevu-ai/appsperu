# Matriz de cobertura territorial — 5 regiones ALSOL (AL2-02)

**Fecha:** 2026-08-26  
**Alcance:** LA LIBERTAD, LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO  
**Leyenda:** ✅ verificado en corrida documentada · 🟡 parcial / CLI listo sin corrida terminal · ⏸ pendiente corrida · N/A no aplica territorialmente

## Resumen ejecutivo

| Departamento | UBIGEO | Distritos (ceplan-geo) | Estado global |
|---|---:|---:|---|
| LA LIBERTAD | 13 | 83 | ✅ MEF re-corrida 2026-08-26 (16/16 + meta GN) |
| LAMBAYEQUE | 14 | 38 | ✅ MEF re-corrida 2026-08-26 (16/16 + meta GN) |
| PIURA | 20 | 65 | ✅ MEF re-corrida 2026-08-26 (16/16 + meta GN) |
| CAJAMARCA | 06 | 127 | 🟡 Invierte OK; MEF parcial (re-ingesta local) |
| CUSCO | 08 | 112 | 🟡 Invierte OK; MEF parcial (re-ingesta local) |

**ceplan-geo** tiene cobertura **nacional** de distritos (1,874); los cinco departamentos piloto suman **425 distritos** verificables vía SQL.

## Matriz app × departamento

| App / Fuente | LA LIBERTAD | LAMBAYEQUE | PIURA | CAJAMARCA | CUSCO | Notas |
|---|---|---|---|---|---|---|
| **ceplan-geo** (distritos WFS) | ✅ 83 | ✅ 38 | ✅ 65 | ✅ 127 | ✅ 112 | Ingesta nacional; dept verificado en `cobertura:geoserver` |
| **radar-ejecucion** (MEF) | ✅ re-corrida | ✅ re-corrida | ✅ re-corrida | 🟡 parcial | 🟡 parcial | `ingest:mef:pilot` — 0 seccionesSinDatos LL/LAM/PIU (26-08 22:34 UTC, 2ª corrida) |
| **radar-inversiones** (Invierte) | ✅ full | ✅ full | ✅ full | ✅ full | ✅ full | Corrida `ingest:invierte:full` 2026-08-26 |
| **infobras** | ⏸ egress | ⏸ egress | ⏸ egress | ⏸ egress | ⏸ egress | Cloud agent: timeout a `infobras.contraloria.gob.pe` (curl 28 tras 6 intentos, 26-08 22:38 UTC) |
| **compras-publicas** (OECE) | 🟡 ventana 10 págs | 🟡 | 🟡 | 🟡 | 🟡 | `OECE_DEPARTAMENTOS` admite las 5; no corrida terminal nacional |
| **ceplan-estrategico** | N/A | N/A | N/A | N/A | N/A | Indicadores nacionales GN/GR — sin llave departamental |
| **identidad-fiscal** | ✅ nacional | ✅ | ✅ | ✅ | ✅ | Padrón RUC nacional; cruce territorial vía compras/ejecución |
| **proveedores-sancionados** | ✅ nacional | ✅ | ✅ | ✅ | ✅ | Fuente nacional |
| **salud-institucional** | ✅ score LL | ⏸ | ⏸ | ⏸ | ⏸ | Default histórico LL; requiere capas mínimas por dept |

## Comandos de preflight (AL2-03)

```bash
# 1. Geo — nacional (incluye los 5 deptos en reporte)
cd apps/ceplan-geo/api && npm run cobertura:geoserver

# 2. MEF — por departamento (validar offsets antes de cada región nueva)
cd apps/radar-ejecucion/api
MEF_DEPARTAMENTO=LAMBAYEQUE npm run ingest:mef

# 3. INFOBRAS — multirregional
cd apps/infobras/api
INFOBRAS_DEPARTAMENTOS=LAMBAYEQUE,PIURA,CAJAMARCA,CUSCO npm run ingest:infobras

# 4. Invierte — corrida completa por departamento
cd apps/radar-inversiones/api
INVIERTE_DEPARTAMENTOS=LAMBAYEQUE npm run ingest:invierte:full

# 5. Cobertura terminal (radar-ejecucion)
cd apps/radar-ejecucion/api
npm run cobertura:territorial -- --jurisdiccion LAMBAYEQUE
```

## Puerta Sprint 6

| Criterio | Estado |
|---|---|
| Matriz publicada | ✅ este documento |
| Spike geo cerrado | ✅ `docs/spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md` |
| ≥ 2 deptos nuevos con MEF+INFOBRAS | 🟡 MEF OK (LAM/PIU); INFOBRAS bloqueado egress cloud |
| La Libertad sin regresión | ✅ baseline 2026-08-26 |

**Nota:** MEF re-corrida 2026-08-26 22:34 UTC (2ª corrida) confirma 0 `seccionesSinDatos` para La Libertad, Lambayeque y Piura. INFOBRAS requiere corrida local: el cloud agent no alcanza `infobras.contraloria.gob.pe` (curl 28 tras 6 intentos, ~5 min).
