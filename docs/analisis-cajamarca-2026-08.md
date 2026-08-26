# Análisis — Cajamarca: brechas y competitividad (2026-08)

Memo ALSOL Fase 2 para **Cajamarca** (UBIGEO `06`), plantilla
[`docs/plantilla-memo-regional-alsol-v1.md`](plantilla-memo-regional-alsol-v1.md).

## Resumen ejecutivo

| Dimensión | Estado preflight | Hallazgo principal |
|---|---|---|
| Territorio (ceplan-geo) | ✅ COMPLETA_VERIFICADA | **127 distritos** (el mayor del piloto); 3 aeropuertos; 0 puertos |
| Ejecución MEF | 🟡 PARCIAL_INGESTA | Scan cloud incompleto; usar `ingest:mef:pilot:ejecutora` en local |
| Obras INFOBRAS | ⏸ PENDIENTE_INGESTA | Timeout red cloud agent |
| Inversiones Invierte | ✅ COMPLETA_VERIFICADA | 8,710 proyectos; 44.9% sobrecosto; 4.9% cartera productiva |
| Marco CEPLAN | ✅ NACIONAL | GN/GR agregado |
| **Preflight global** | **🟡 PARCIAL** | Geo + marco nacional |

**Lectura preliminar:** Cajamarca es el departamento piloto con **mayor fragmentación municipal**
(127 distritos) y economía mixta **minería + agro sierra**. La gobernanza local dispersa suele
correlacionar con mayor heterogeneidad de ejecución — hipótesis a validar tras ingesta MEF.

---

## 1. Preflight territorial

| Fuente | Estado | Evidencia |
|---|---|---|
| ceplan-geo | ✅ | 127 distritos (2026-08-26) |
| radar-ejecucion | ⏸ | `MEF_DEPARTAMENTO=CAJAMARCA npm run ingest:mef` |
| infobras | ⏸ | `INFOBRAS_DEPARTAMENTOS=CAJAMARCA npm run ingest:infobras` |
| radar-inversiones | ✅ | 8,710 proyectos; corrida full 2026-08-26 |

```sql
SELECT departamento, COUNT(*) FROM territories WHERE departamento = 'CAJAMARCA';
-- 127
```

---

## 2. Ejecución presupuestal — pendiente

| Nivel | PIM | Devengado | Avance % |
|---|---|---|---|
| Gobierno Regional Cajamarca | — | — | — |
| Gobiernos Locales (127 distritos) | — | — | — |

**Referencia La Libertad (2026-08-18):** GR 49.2%, GL 39.9% (84 municipios).

---

## 3. Obras públicas — pendiente

Referencia La Libertad: 2.5% paralizadas (10,134 obras).

---

## 4. Inversiones (verificado 2026-08-26)

- **8,710** proyectos activos en Cajamarca.
- **44.9%** con sobrecosto.
- Cartera productiva directa: **4.9%** (429 proyectos).

Referencia La Libertad: 39.4% sobrecosto; 7.5% cartera productiva.

---

## 5. Marco estratégico CEPLAN (nacional)

| Nivel | CUMP02 | CUMP03 | SEG (pp) |
|---|---|---|---|
| GN | 76.6% | 95.0% | 18.4 |
| GR | 73.7% | 95.1% | 21.4 |

`GET /api/crossref/territorial?departamento=CAJAMARCA`

---

## 6. Contexto geo (verificado)

| Métrica | Cajamarca | La Libertad | Cusco |
|---|---|---|---|
| Distritos | **127** | 83 | 112 |
| Aeropuertos | **3** | 7 | 27 |
| Puertos | **0** | 1 | 1 |

Cajamarca es **interior andino** sin puerto en capa CEPLAN — coherente con economía no marítima.

```bash
curl "http://localhost:4005/api/territories/summary?departamento=CAJAMARCA"
```

---

## 7. Competitividad — marco contextual

- **Minería:** Yanacocha y otros megaproyectos — inversión minera puede dominar función MEF/Invierte
  sin aparecer como "productivo agro" en clasificación funcional.
- **Agro sierra:** lácteos, café, granos en provincias altoandinas.
- **Fragmentación:** 127 distritos implica alta carga de capacidad municipal vs Lambayeque (38).

---

## 8. Indicadores derivados

```bash
npm run indicators:regional -- --departamento=CAJAMARCA
```

Proxy SEG: ⏸ null hasta MEF+INFOBRAS.

---

## 9. Caveats

1. Preflight **PARCIAL** — no publicar ejecución dept sin AL2-03.
2. Minería ≠ agro en narrativa PBA — desagregar por función MEF post-ingesta.
3. 127 distritos: promedios municipales pueden ocultar outliers (réplica análisis Bolívar en LL).

## Reproducibilidad

- Índice 5 regiones: [`docs/indice-analisis-5-regiones-2026-08.md`](indice-analisis-5-regiones-2026-08.md)
- Desarrollo económico + minería/agro: [`docs/analisis-cajamarca-desarrollo-economico-2026-08.md`](analisis-cajamarca-desarrollo-economico-2026-08.md)
