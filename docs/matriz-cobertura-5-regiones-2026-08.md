# Matriz de cobertura territorial — 5 regiones ALSOL (AL2-02)

**Fecha:** 2026-08-26  
**Alcance:** LA LIBERTAD, LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO  
**Leyenda:** ✅ verificado en corrida documentada · 🟡 parcial / CLI listo sin corrida terminal · ⏸ pendiente corrida · N/A no aplica territorialmente

## Resumen ejecutivo

| Departamento | UBIGEO | Distritos (ceplan-geo) | Estado global |
|---|---:|---:|---|
| LA LIBERTAD | 13 | 83 | ✅ Referencia — validación 2026-08-26 |
| LAMBAYEQUE | 14 | 38 | ✅ MEF + Invierte verificados 2026-08-26 |
| PIURA | 20 | 65 | ✅ MEF + Invierte verificados 2026-08-26 |
| CAJAMARCA | 06 | 127 | 🟡 Invierte OK; MEF parcial (re-ingesta) |
| CUSCO | 08 | 112 | 🟡 Invierte OK; MEF en corrida |

**ceplan-geo** tiene cobertura **nacional** de distritos (1,874); los cinco departamentos piloto suman **425 distritos** verificables vía SQL.

## Matriz app × departamento

| App / Fuente | LA LIBERTAD | LAMBAYEQUE | PIURA | CAJAMARCA | CUSCO | Notas |
|---|---|---|---|---|---|---|
| **ceplan-geo** (distritos WFS) | ✅ 83 | ✅ 38 | ✅ 65 | ✅ 127 | ✅ 112 | Ingesta nacional; dept verificado en `cobertura:geoserver` |
| **radar-ejecucion** (MEF) | ✅ offsets LL | ✅ scan | ✅ scan | 🟡 parcial | 🟡 corrida | `ingest:mef:pilot` — scan por chunks 25 MB |
| **radar-inversiones** (Invierte) | ✅ full | ✅ full | ✅ full | ✅ full | ✅ full | Corrida `ingest:invierte:full` 2026-08-26 |
| **infobras** | ✅ ~10k obras | ⏸ | ⏸ | ⏸ | ⏸ | XLSX nacional; timeout red en cloud agent |
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
| ≥ 2 deptos nuevos con MEF+INFOBRAS | ⏸ requiere entorno local con Docker + acceso fuentes |
| La Libertad sin regresión | ✅ baseline 2026-08-26 |

**Nota:** Las corridas de ingesta pesada (MEF, INFOBRAS XLSX) deben ejecutarse en entorno local con Docker; este documento fija el plan y comandos; las celdas ⏸ se actualizan al cerrar cada corrida.
