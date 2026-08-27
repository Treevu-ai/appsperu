# Índice comparativo — La Libertad ALSOL (Fase 2)

**Fecha de corte:** 2026-08-26  
**Alcance:** LA LIBERTAD (único departamento en scope del proyecto)  
**PRD:** [`docs/PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md`](PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md)  
**Ticket:** AL2-33

> **Nota de alcance (2026-08-26):** el sprint se redujo a La Libertad. Lambayeque, Piura, Cajamarca y Cusco quedan fuera de scope; sus memos se conservan como histórico pero no se actualizan.

## Resumen ejecutivo

| Departamento | UBIGEO | Preflight | Memo brechas | Memos sectoriales |
|---|---|---|---|---|
| LA LIBERTAD | 13 | ✅ Referencia | [`analisis-la-libertad-2026-08.md`](analisis-la-libertad-2026-08.md) | desarrollo económico, turismo |

---

## Métricas verificables — La Libertad

| Métrica | La Libertad | Fuente / nota |
|---|---:|---|
| **Distritos (geo)** | 83 | ceplan-geo ✅ 2026-08-26 |
| **Aeropuertos (geo)** | 7 | `ST_Within` infra |
| **Puertos (geo)** | 1 | idem |
| **Ejecución GR %** | **49.2** | MEF re-corrida 2026-08-26 (0 seccionesSinDatos) |
| **Ejecución GL %** | **41.2** | idem |
| **Obras paralizadas %** | **2.5** | INFOBRAS: ingesta local verificada 2026-08-26 (10,134 obras) |
| **Proyectos sobrecosto %** | **39.4** | Invierte full 2026-08-26 |
| **SEG nacional GR (pp)** | 21.4 | CEPLAN GN/GR — indicador nacional |
| **% cartera productiva** | **7.5** | Invierte, funciones agro/comercio/turismo/pesca |

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

## Caveat

| Departamento | Caveat principal |
|---|---|
| La Libertad | Única región en scope; MEF+INFOBRAS+Invierte verificados en memos 2026-08 |

---

## Documentación relacionada

- Plantilla: [`docs/plantilla-memo-regional-alsol-v1.md`](plantilla-memo-regional-alsol-v1.md)
- Matriz cobertura: [`docs/matriz-cobertura-5-regiones-2026-08.md`](matriz-cobertura-5-regiones-2026-08.md)
- Release Fase 2: [`docs/validacion-fase2-release-checklist-2026-08.md`](validacion-fase2-release-checklist-2026-08.md)
