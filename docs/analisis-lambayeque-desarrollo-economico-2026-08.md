# Análisis — Lambayeque: desarrollo económico productivo (2026-08)

Segundo memo Lambayeque — ángulo **inversión pública productiva** (agro, comercio, turismo, pesca),
alineado a [`docs/analisis-la-libertad-desarrollo-economico-2026-08.md`](analisis-la-libertad-desarrollo-economico-2026-08.md).

## Resumen ejecutivo

| Preflight | Estado |
|---|---|
| Invierte.pe (radar-inversiones) | ⏸ PENDIENTE_INGESTA |
| INFOBRAS obras productivas | ⏸ PENDIENTE_INGESTA |
| ceplan-geo proyectos `ip_pry*` | 🟡 Spike — universo sectorial pequeño |
| **Global** | **🟡 PARCIAL** |

**Hipótesis a verificar tras ingesta:** en La Libertad solo **4.6%** del costo de cartera activa
está en funciones productivas directas (AGROPECUARIA, COMERCIO, TURISMO, PESCA) — Lambayeque,
con mayor peso agroexportador en el discurso regional, podría mostrar participación distinta, pero
eso requiere corrida Invierte, no inferencia.

---

## 1. Definición operativa de "productivo"

Misma regla que La Libertad: funciones Invierte `AGROPECUARIA`, `COMERCIO`, `TURISMO`, `PESCA`,
`AGRARIA`. No mide impacto económico total — solo etiqueta funcional del gasto de inversión.

---

## 2. Cartera de inversión — pendiente

```bash
cd apps/radar-inversiones/api
INVIERTE_DEPARTAMENTOS=LAMBAYEQUE npm run ingest:invierte:full
```

Tabla a completar:

| Corte | Proyectos | Costo actualizado |
|---|---|---|
| Cartera activa Lambayeque | — | — |
| Solo funciones productivas | — | — |
| % del total | — | — |

**Referencia La Libertad (2026-08-20):** 112 / 1,612 proyectos (6.9%), S/ 455.9M / S/ 9,903.9M (4.6%).

---

## 3. Concentración provincial — pendiente

Lambayeque tiene 3 provincias (Chiclayo, Lambayeque, Ferreñafe). Tras ingesta, cruzar:

- `radar-inversiones` por `provincia` + función productiva
- `infobras` obras con `nombre_obra ILIKE '%RIEGO%'` o sector agrario

**Expectativa contextual:** Chiclayo concentra servicios y logística; Ferreñafe y Lambayeque
provincia aportan volumen agrícola — validar con datos, no asumir.

---

## 4. Capas geo CEPLAN — proyectos sectoriales (spike)

Spike AL2-01 identificó capas `ip_pry*` con atributo `departamen`:

| Capa | Features nacionales | Relevancia Lambayeque |
|---|---|---|
| `ip_prysecagr` | 28 | Agro — cruce potencial por nombre dept |
| `ip_pryturx` | 3 | Turismo |
| `ip_pryedux` | 5 | Educación (no productivo) |

**Decisión:** `MVP_ACOTADO` — no sustituye Invierte.pe (ver
[`docs/spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md`](spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md)).

---

## 5. Plan–Budget Alignment (PBA v1)

Con MEF ingerido, usar:

```bash
curl "http://localhost:4004/api/indicators/plan-budget-alignment?departamento=LAMBAYEQUE&anio=2026"
```

Dimensiones esperadas con mayor peso en costa norte: **Agro y riego**, **Infraestructura vial**,
**Salud y nutrición** — mapeo heurístico v1, no certificación PEI.

---

## 6. Caveats

- Sin Invierte ingerido, **no** afirmar participación productiva % para Lambayeque.
- Contexto agroexportador (espárrago, arándano) es sectorial público — no confundir con fila MEF.
- Comparar siempre con disclaimer de año fiscal y completitud de cartera.

## Reproducibilidad

- Memo brechas: [`docs/analisis-lambayeque-2026-08.md`](analisis-lambayeque-2026-08.md)
- PBA contract: [`docs/data-contracts/ceplan-plan-budget-alignment-v1.md`](data-contracts/ceplan-plan-budget-alignment-v1.md)
