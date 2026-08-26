# Release checklist — CEPLAN × ALSOL Fase 2 (AL2-35)

**Fecha:** 2026-08-26  
**Rama:** `cursor/ceplan-fase2-prd-backlog-f938`  
**PR:** [#26](https://github.com/Treevu-ai/appsperu/pull/26)

## Alcance Fase 2 (Sprints 6–10)

| Sprint | Entregables | Estado |
|---|---|---|
| 6 | Spike geo, matriz cobertura, contratos API/PBA, tests piloto | ✅ |
| 7 | Crossref territorial ceplan-estrategico ↔ ceplan-geo | ✅ |
| 8 | SEG, Execution Efficiency, PBA + CLI + MCP | ✅ |
| 9 | Memos Lambayeque + Piura (6 docs) | ✅ |
| 10 | Memos Cajamarca + Cusco + índice 5 regiones | ✅ |

## Tests automatizados

```bash
cd apps/ceplan-estrategico/api && npm test && npm run build
cd apps/ceplan-geo/api && npm test
cd mcp-server && npm test
```

| App | Tests | Build |
|---|---|---|
| ceplan-estrategico | 39 | ✅ tsc |
| ceplan-geo | 29 | — |
| mcp-server | 12 | — |

## Endpoints nuevos (ceplan-estrategico)

- `GET /api/crossref/territorial?departamento=`
- `GET /api/indicators/seg`
- `GET /api/indicators/execution-efficiency`
- `GET /api/indicators/plan-budget-alignment`

## Endpoints nuevos (ceplan-geo)

- `GET /api/territories/summary?departamento=`

## MCP

**60 tools** total (+5 desde inicio Fase 2: 2 territorial + 3 indicadores).

## Documentación

- [x] PRD y backlog Fase 2
- [x] Data contracts: crossref territorial, PBA v1
- [x] ADR-0005 actualizado
- [x] 10 memos regionales + plantilla + índice
- [x] `conectores.md`, `ESTADO.md` actualizados
- [x] Validaciones por sprint (crossref, memos)

## Regresión La Libertad

- [x] ceplan-geo: 83 distritos LL sin cambio en expectativas piloto
- [x] Tests existentes pasan
- [x] Memos LL previos no modificados (`analisis-la-libertad-2026-08.md`)

## Pendiente post-merge (operativo, no bloqueante)

- [ ] AL2-03: corridas MEF+INFOBRAS+Invierte para 4 deptos fuera de LL
- [ ] AL2-06: ingesta `cb_redhidricaprinx` si se prioriza capa hidráulica
- [ ] Completar celdas del índice comparativo con datos dept

## Puerta Fase 2

**Lista para review** — código, tests, docs y memos publicados. Cobertura de ingesta departamental
fuera de La Libertad queda como trabajo operativo documentado, no como bloqueante de merge.
