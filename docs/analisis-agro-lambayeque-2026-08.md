# Análisis — Agro y riego: Lambayeque (2026-08)

Memo sector focal Lambayeque — **agroexportación y riego costero**, ticket AL2-25.

## Resumen ejecutivo

| Fuente | Estado | Nota |
|---|---|---|
| ceplan-geo distritos | ✅ 38 distritos | Base territorial |
| ceplan-geo hidráulica `cb_redhidricaprinx` | 🟡 AUTOMATIZABLE (spike) | 1,744 tramos nacionales — ingesta MVP pendiente |
| INFOBRAS obras riego | ⏸ | Requiere ingesta dept |
| Invierte agro/riego | ⏸ | Requiere ingesta dept |
| **Preflight** | **🟡 PARCIAL** | |

---

## 1. Contexto territorial verificado

| Métrica | Lambayeque | La Libertad (ref.) |
|---|---|---|
| Distritos | 38 | 83 |
| Puertos (geo CEPLAN) | 1 | 1 |
| Aeropuertos | 1 | 7 |

Lambayeque es departamento **costero con vocación agroexportadora** (valles de Chiclayo,
Lambayeque, Zaña). La conectividad logística es menor que La Libertad en red aérea pero
comparte dinámica de exportación no tradicional.

---

## 2. Red hídrica — spike geo (nacional, no dept aún)

| Capa | Features | Decisión AL2-01 |
|---|---|---|
| `cb_redhidricax` | 345,634 | POSPONER |
| `cb_redhidricaprinx` | 1,744 | AUTOMATIZABLE |

Atributos útiles: `nombre_ca`, `categoria`, `long_km`, `codigo_rh`, `iddpto`.

**Próximo paso técnico:** `ingest:hydro-principal` + filtro por `iddpto=14` o intersección con
polígonos `territories` — habilita mapa de red principal sin ingesta masiva.

---

## 3. Obras de riego INFOBRAS — pendiente

Tras `INFOBRAS_DEPARTAMENTOS=LAMBAYEQUE npm run ingest:infobras`, replicar análisis La Libertad:

```sql
SELECT provincia,
       COUNT(*) obras,
       COUNT(*) FILTER (WHERE existe_paralizacion) paralizadas,
       ROUND(AVG(avance_fisico_real_pct)::numeric, 1) avance
FROM public_works
WHERE departamento = 'LAMBAYEQUE'
  AND (nombre_obra ILIKE '%RIEGO%' OR nombre_obra ILIKE '%IRRIGAC%')
GROUP BY provincia;
```

**Referencia LL (2026-08-20):** sierra concentra más obras de riego que costa en conteo — contra
intuitivo para narrativa agroexportadora; validar si Lambayeque replica o invierte el patrón.

---

## 4. Inversión en riego (Invierte) — pendiente

Búsqueda post-ingesta:

```sql
SELECT provincia, COUNT(*), SUM(costo_actualizado)
FROM investments
WHERE departamento = 'LAMBAYEQUE'
  AND (nombre ILIKE '%RIEGO%' OR nombre ILIKE '%IRRIGAC%')
  AND estado NOT ILIKE '%cerrado%'
GROUP BY provincia;
```

---

## 5. Cruce territorial CEPLAN

```bash
curl "http://localhost:4004/api/crossref/territorial?departamento=LAMBAYEQUE"
```

Adjunta marco nacional GN/GR + `contextoTerritorial` (38 distritos, infra) — **no** SEG regional CEPLAN.

---

## 6. Riesgos de lectura

1. **Riego mayor** (represas, canales madre) puede financiarse fuera de Invierte activo — mismo
   caveat que Chavimochic en memo La Libertad.
2. Capas geo `ip_prysecagr` (28 features nacionales) son muestra sectorial mínima.
3. No inferir avance físico regional desde promedio nacional CEPLAN (CUMP02).

## Reproducibilidad

- Spike hidráulica: [`docs/spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md`](spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md)
- Memo brechas: [`docs/analisis-lambayeque-2026-08.md`](analisis-lambayeque-2026-08.md)
