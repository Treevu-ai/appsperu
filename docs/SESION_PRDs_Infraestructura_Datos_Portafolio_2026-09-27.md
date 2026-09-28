# Sesión — PRDs de infraestructura de datos para el portafolio (series OR-, WH-, EV-)

Fecha de ejecución: 2026-09-27 (America/Lima).

## Propósito

Revisar en local los dos proyectos base del portafolio (**cli-market** y **Rastro/appsperu**),
definir 3 ideas de expansión de infraestructura de datos relevantes para negocio y Estado, y
materializarlas como **PRD + TICKETS + BACKLOG por idea (9 documentos), sin implementar código**.

Este documento registra decisiones y estado para retomar la sesión. No convierte propuestas en
compromisos de fecha ni de owner, y no convierte los datos citados en conclusiones oficiales.

## Revisión de contexto (verificado en local, 2026-09-27)

### cli-market (ecosistema `cli-market-*`)

- `cli-market-backend`/`cli-market-world`: ingestión (scrapers + FastAPI), 82 retailers en 9 países,
  Postgres en Fly.io; `cli-market-index`: refinería semántica (Entity Resolution + Golden Records
  `prod_`, normalizadores de unidad/marca); `cli-market-core`: 46 indicadores (`market_indicators`),
  spread, basket, billing, MCP; `cli-market` raíz: plantilla Mistral Workflows (no es el producto).
- Historial y alertas ya existen: `price_snapshots_schema.py`, `stock_history_schema.py`,
  `collect_prices.py`, `routers/alerts.py` con tests de email/webhook.

### Rastro (`appsperu`)

- **62** conectores `apps/*/api/src/ingest/*-connector.ts` — **0 con scheduler** (decisión de diseño,
  ADR-0016); **56/62** escriben raw batches con checksum; **8** apps con `routes/meta*.ts` de frescura.
- **>50** data contracts en `docs/data-contracts/` (documentación, no chequeo ejecutable).
- **40** `docker-compose.yml` (Postgres 16 en `127.0.0.1:5432`, red `appsperu_shared`); DBs no
  alcanzables desde runners cloud (bloqueo clave de ADR-0016).
- MCP con 2 meta-tools (`rastro_buscar_tools`/`rastro_llamar`) sobre el catálogo; chequeo CI
  `scripts/check-connectors-documented.sh` (CX-06) como plantilla de chequeos nuevos.

## Decisiones de la sesión

1. **Alcance aprobado por el usuario:** las 3 ideas, cada una con su PRD + TICKETS + BACKLOG.
2. **Ubicación:** `appsperu/docs/` con la convención existente (`*_v1.md`), aunque 2 de las 3 ideas
   son transversales a cli-market — se documentan en el hub de docs de Rastro.
3. **Series de tickets nuevas:** **OR-** (Orquestación), **WH-** (Warehouse), **EV-** (Eventos) —
   verificadas sin colisión contra AE-/AL2-/AL3-/CG-/CT-/CX-/DQ-/GORE-/GOV-/IF-/IR-/OE-/PN-/PS-/
   PV-/RF-/RUC-/SC-/SGR-/SI-/SS-.
4. **Relaciones entre PRDs:** EV-06 espera el dato de frescura de OR-03 (sustituir advertencia
   estática del MCP) y comparte canal con OR-07; WH-07 hereda honestidad de frescura; la ejecución
   programada del warehouse queda sujeta al ADR de OR-01.
5. **Sin implementación:** no hay código, ramas ni PRs asociados a esta sesión.

## Documentos creados (9)

| Idea | PRD | TICKETS | BACKLOG |
|---|---|---|---|
| 1. Orquestación y frescura (serie **OR-**, 8 tickets, 3 sprints) | [`PRD_Orquestacion_y_Frescura_de_Ingesta_v1.md`](PRD_Orquestacion_y_Frescura_de_Ingesta_v1.md) | [`TICKETS_Orquestacion_y_Frescura_de_Ingesta_v1.md`](TICKETS_Orquestacion_y_Frescura_de_Ingesta_v1.md) | [`BACKLOG_Orquestacion_y_Frescura_de_Ingesta_v1.md`](BACKLOG_Orquestacion_y_Frescura_de_Ingesta_v1.md) |
| 2. Warehouse + métricas (serie **WH-**, 7 tickets, 4 sprints) | [`PRD_Warehouse_Analitico_y_Capa_de_Metricas_v1.md`](PRD_Warehouse_Analitico_y_Capa_de_Metricas_v1.md) | [`TICKETS_Warehouse_Analitico_y_Capa_de_Metricas_v1.md`](TICKETS_Warehouse_Analitico_y_Capa_de_Metricas_v1.md) | [`BACKLOG_Warehouse_Analitico_y_Capa_de_Metricas_v1.md`](BACKLOG_Warehouse_Analitico_y_Capa_de_Metricas_v1.md) |
| 3. Detección de cambios y alertas (serie **EV-**, 7 tickets, 3 sprints) | [`PRD_Deteccion_de_Cambios_y_Alertas_v1.md`](PRD_Deteccion_de_Cambios_y_Alertas_v1.md) | [`TICKETS_Deteccion_de_Cambios_y_Alertas_v1.md`](TICKETS_Deteccion_de_Cambios_y_Alertas_v1.md) | [`BACKLOG_Deteccion_de_Cambios_y_Alertas_v1.md`](BACKLOG_Deteccion_de_Cambios_y_Alertas_v1.md) |

Cada PRD sigue la estructura §1–§10 (Decisión → DoD); cada TICKETS usa Épicas con Historia /
Contexto verificado en código / Criterios de aceptación; cada BACKLOG tiene resumen de sprints,
secuencia estratégica y **puerta de salida verificable** por sprint. Todos los tickets en
⬜ Pendiente (sin owner ni fecha, igual que los PRDs existentes del repo).

## Pendientes para mañana (2026-09-28)

1. Revisar prioridades, estimaciones y orden de los 3 BACKLOGS con el usuario (única revisión humana pendiente antes de operar).
2. Decidir por dónde empezar: recomendación de la sesión — **OR Sprint 1** (menor esfuerzo, alta credibilidad) o **WH-01** (mayor valor comercial si se prioriza el índice precios↔contratación).
3. Opcional: convertir los BACKLOGS en issues/repo boards respetando la numeración de serie.
4. Verificar supuestos abiertos antes de citar externamente (ver advertencias).

## Advertencias y supuestos

- **Discrepancia documental detectada:** `mcp-server/README.md` habla de "38 apps / 209 tools" y
  `package.json` del monorepo de "27 apps / 142 tools" — números de momentos distintos; reconciliar
  antes de citarlos fuera del repo.
- `docs/ESTADO.md` (referenciado en el README raíz) **no existe**; el estado real vive en
  [`HISTORIAL_ESTADO.md`](HISTORIAL_ESTADO.md) — este sesion doc se allí enlazó.
- Conteos (62 conectores, 8 meta apps, 40 compose, >50 data contracts) medidos por lectura estática
  de archivos el 2026-09-27; pueden desactualizarse con cada PR.
- Los criterios de aceptación citan cifras reales verificadas (p. ej. one-paper PRODUCE:
  S/ 208,104,679 PIM / S/ 128,209,085.25 devengado) — no las reutilizar sin re-confirmar el corte.
