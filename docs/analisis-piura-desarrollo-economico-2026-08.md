# Análisis — Piura: desarrollo económico productivo (2026-08)

Segundo memo Piura — inversión pública en funciones productivas, alineado al marco La Libertad
([`docs/analisis-la-libertad-desarrollo-economico-2026-08.md`](analisis-la-libertad-desarrollo-economico-2026-08.md)).

## Resumen ejecutivo

| Preflight | Estado |
|---|---|
| radar-inversiones | ⏸ PENDIENTE_INGESTA |
| infobras | ⏸ PENDIENTE_INGESTA |
| ceplan-geo `ip_pry*` | 🟡 MVP_ACOTADO |
| **Global** | **🟡 PARCIAL** |

**Hipótesis:** Piura puede mostrar mayor peso relativo de **AGROPECUARIA** y **PESCA** en
cartera Invierte que La Libertad (4.6% productivo agregado), dada vocación costera — **requiere
verificación** post-ingesta.

---

## 1. Cartera productiva — pendiente

```bash
INVIERTE_DEPARTAMENTOS=PIURA npm run ingest:invierte:full
```

| Corte | Proyectos | Costo actualizado |
|---|---|---|
| Cartera activa Piura | — | — |
| Funciones productivas | — | — |
| % del total | — | — |

---

## 2. Provincias a contrastar

Piura tiene 8 provincias (Piura, Sullana, Paita, Talara, Sechura, Ayabaca, Huancabamba, Morropón).
Tras ingesta, priorizar:

- **Costa** (Piura, Sullana, Paita, Talara, Sechura) — agroexportación, pesca, energía
- **Sierra** (Ayabaca, Huancabamba, Morropón) — riego y conectividad vial

---

## 3. Minería vs agro (capa geo)

Spike identificó `ap_proyecminerox` (275 features) — contexto distinto a agro. No mezclar con
`ip_prysecagr` en narrativa productiva sin filtrar sector.

---

## 4. PBA departamental

```bash
curl "http://localhost:4004/api/indicators/plan-budget-alignment?departamento=PIURA&anio=2026"
```

Dimensiones v1 esperadas con peso: **Agro y riego**, **Desarrollo económico**, **Infraestructura vial**.

---

## 5. Comparación piloto (cuando haya datos)

| Departamento | % productivo cartera (ref.) | Fuente |
|---|---|---|
| La Libertad | 4.6% costo | Verificado 2026-08-20 |
| Lambayeque | — | Pendiente |
| Piura | — | Pendiente |

---

## 6. Caveats

- Minería puede dominar inversión en Talara sin ser "productivo agro" — desagregar por función.
- Muestra Invierte parcial histórica en LL — replicar estándar de completitud antes de comparar.

## Reproducibilidad

- Memo brechas: [`docs/analisis-piura-2026-08.md`](analisis-piura-2026-08.md)
