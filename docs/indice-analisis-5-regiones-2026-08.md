# Índice comparativo — 5 regiones ALSOL (Fase 2)

**Fecha de corte:** 2026-08-26  
**Alcance:** LA LIBERTAD, LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO  
**PRD:** [`docs/PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md`](PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md)  
**Ticket:** AL2-33

## Resumen ejecutivo

| Departamento | UBIGEO | Preflight | Memo brechas | Memos sectoriales |
|---|---|---|---|---|
| LA LIBERTAD | 13 | ✅ Referencia | [`analisis-la-libertad-2026-08.md`](analisis-la-libertad-2026-08.md) | desarrollo económico, turismo |
| LAMBAYEQUE | 14 | 🟡 PARCIAL | [`analisis-lambayeque-2026-08.md`](analisis-lambayeque-2026-08.md) | productivo, agro |
| PIURA | 20 | 🟡 PARCIAL | [`analisis-piura-2026-08.md`](analisis-piura-2026-08.md) | productivo, agro/hidráulica |
| CAJAMARCA | 06 | 🟡 PARCIAL | [`analisis-cajamarca-2026-08.md`](analisis-cajamarca-2026-08.md) | minería/agro |
| CUSCO | 08 | 🟡 PARCIAL | [`analisis-cusco-2026-08.md`](analisis-cusco-2026-08.md) | turismo/productivo |

---

## Tabla comparativa — métricas verificables

| Métrica | La Libertad | Lambayeque | Piura | Cajamarca | Cusco | Fuente / nota |
|---|---:|---:|---:|---:|---:|---|
| **Distritos (geo)** | 83 | 38 | 65 | 127 | 112 | ceplan-geo ✅ 2026-08-26 |
| **Aeropuertos (geo)** | 7 | 1 | 3 | 3 | **27** | `ST_Within` infra |
| **Puertos (geo)** | 1 | 1 | 0 | 0 | 1 | idem |
| **Ejecución GR %** | **49.2** | **52.9** | **55.7** | — | — | MEF 2026-08-26 |
| **Ejecución GL %** | **41.2** | **42.6** | **44.5** | — | — | idem |
| **Obras paralizadas %** | **2.5** | — | — | — | — | INFOBRAS, solo LL (corrida local) |
| **Proyectos sobrecosto %** | **39.4** | **41.9** | **49.5** | **44.9** | **55.4** | Invierte full 2026-08-26 |
| **SEG nacional GR (pp)** | 21.4 | 21.4 | 21.4 | 21.4 | 21.4 | CEPLAN GN/GR — mismo para todos |
| **SEG proxy dept (pp)** | — | null | null | null | null | Requiere MEF+INFOBRAS dept |
| **% cartera productiva** | **7.5** | **7.2** | **9.1** | **4.9** | **10.9** | Invierte, funciones agro/comercio/turismo/pesca |

Celdas `—` = pendiente corrida terminal AL2-03. Celdas `null` = proxy no calculable sin datos.

---

## Contexto geo — lectura comparativa

```text
Distritos:     Cajamarca (127) > Cusco (112) > La Libertad (83) > Piura (65) > Lambayeque (38)
Aeropuertos:   Cusco (27) >> La Libertad (7) > Piura/Cajamarca (3) > Lambayeque (1)
Puertos:       Costa norte (LL, LAM) vs Piura/Cajamarca (0) vs Cusco (1)
```

**Cusco** destaca en aeropuertos dispersos (aeródromos altoandinos). **Cajamarca** tiene la mayor
fragmentación municipal. **Lambayeque** es el departamento piloto más compacto en distritos.

---

## Marco CEPLAN nacional (referencia común)

| Indicador | GN | GR |
|---|---|---|
| CUMP02 (físico %) | 76.6 | 73.7 |
| CUMP03 (presupuestal %) | 95.0 | 95.1 |
| SEG (pp) | 18.4 | 21.4 |
| Execution Efficiency | 0.806 | 0.775 |

No usar estas cifras como desempeño departamental — ver `GET /api/crossref/territorial`.

---

## APIs Fase 2 (reproducibilidad)

| Endpoint | App |
|---|---|
| `GET /api/crossref/territorial?departamento=` | ceplan-estrategico |
| `GET /api/territories/summary?departamento=` | ceplan-geo |
| `GET /api/indicators/seg` | ceplan-estrategico |
| `GET /api/indicators/execution-efficiency` | ceplan-estrategico |
| `GET /api/indicators/plan-budget-alignment` | ceplan-estrategico |
| `npm run indicators:regional -- --departamento=` | CLI consolidado |

---

## Caveats por región

| Departamento | Caveat principal |
|---|---|
| La Libertad | Única región con MEF+INFOBRAS+Invierte verificados en memos 2026-08 |
| Lambayeque | Agroexportación costera — esperar peso agro en PBA post-ingesta |
| Piura | El Niño / hidráulica — segmentar paralización climática vs gestión |
| Cajamarca | Minería domina narrativa económica; no confundir con % productivo Invierte |
| Cusco | 27 aeropuertos ≠ hub turístico; turismo estacional distorsiona ejecución anual |

---

## Comandos para completar el índice

```bash
# Por cada departamento nuevo:
MEF_DEPARTAMENTO={DEPTO} npm run ingest:mef          # radar-ejecucion
INFOBRAS_DEPARTAMENTOS={DEPTO} npm run ingest:infobras
INVIERTE_DEPARTAMENTOS={DEPTO} npm run ingest:invierte:full
npm run indicators:regional -- --departamento={DEPTO}
```

Actualizar esta tabla al cerrar AL2-03 en entorno con Docker.

---

## Documentación relacionada

- Plantilla: [`docs/plantilla-memo-regional-alsol-v1.md`](plantilla-memo-regional-alsol-v1.md)
- Matriz cobertura: [`docs/matriz-cobertura-5-regiones-2026-08.md`](matriz-cobertura-5-regiones-2026-08.md)
- Release Fase 2: [`docs/validacion-fase2-release-checklist-2026-08.md`](validacion-fase2-release-checklist-2026-08.md)
