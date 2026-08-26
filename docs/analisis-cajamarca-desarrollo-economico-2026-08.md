# Análisis — Cajamarca: desarrollo económico productivo y minería (2026-08)

Memo dual AL2-30 — **desarrollo económico** + **sector focal minería/agro sierra**, Cajamarca.

## Resumen ejecutivo

| Preflight | Estado |
|---|---|
| Invierte / INFOBRAS / MEF | ⏸ PENDIENTE_INGESTA |
| ceplan-geo `ap_proyecminerox` | 🟡 275 features nacionales (spike) |
| **Global** | **🟡 PARCIAL** |

---

## Parte A — Desarrollo económico productivo

### A.1 Definición y tabla pendiente

Funciones productivas Invierte: AGROPECUARIA, COMERCIO, TURISMO, PESCA, AGRARIA.

| Corte | Proyectos | Costo actualizado |
|---|---|---|
| Cartera activa Cajamarca | — | — |
| Funciones productivas | — | — |
| % del total | — | — |

**Referencia La Libertad (2026-08-20):** 4.6% del costo de cartera en funciones productivas directas.

### A.2 Hipótesis Cajamarca

La participación **productiva directa** puede ser **menor** que el peso real de la economía regional
si la minería se clasifica en funciones distintas (energía, ambiente, transporte) o financia vía
mecanismos fuera de cartera Invierte activa.

### A.3 PBA departamental

```bash
curl "http://localhost:4004/api/indicators/plan-budget-alignment?departamento=CAJAMARCA&anio=2026"
```

Dimensiones v1 esperadas: **Desarrollo económico**, **Ambiente**, **Infraestructura vial**, **Institucional**.

---

## Parte B — Sector focal: minería y agro sierra

### B.1 Minería (capa geo + Invierte)

Spike AL2-01: `ap_proyecminerox` — 275 puntos nacionales, geometría Point, **sin CUI** — contexto
espacial exploratorio, no cruce con `radar-inversiones`.

Post-ingesta Invierte, buscar:

```sql
SELECT COUNT(*), SUM(costo_actualizado)
FROM investments
WHERE departamento = 'CAJAMARCA'
  AND (nombre ILIKE '%MINER%' OR funcion ILIKE '%MINER%')
  AND estado NOT ILIKE '%cerrado%';
```

### B.2 Agro sierra (INFOBRAS + Invierte)

Provincias a contrastar: Cajamarca, Chota, Cutervo, Jaén, San Ignacio (cadena productiva distinta
a costa norte).

```sql
SELECT provincia, COUNT(*), AVG(avance_fisico_real_pct)
FROM public_works
WHERE departamento = 'CAJAMARCA'
  AND (nombre_obra ILIKE '%RIEGO%' OR nombre_obra ILIKE '%AGR%')
GROUP BY provincia;
```

### B.3 Red hídrica

`cb_redhidricaprinx` (1,744 tramos) — filtro `iddpto=06` post-ingesta MVP; relevante para riego
sierra, no para minería.

---

## Caveats

- No equiparar `ap_proyecminerox` con inversión minera total del departamento.
- Agro sierra ≠ agroexportación costera (Lambayeque/Piura) — no comparar sin ajuste sectorial.
- Proxy SEG requiere MEF+INFOBRAS.

## Reproducibilidad

- Memo brechas: [`docs/analisis-cajamarca-2026-08.md`](analisis-cajamarca-2026-08.md)
- Spike geo: [`docs/spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md`](spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md)
