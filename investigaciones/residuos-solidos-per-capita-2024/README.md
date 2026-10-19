# Residuos sólidos per cápita y capacidad económica distrital (corte 2024)

Propuesta de investigación: **corte transversal nacional de los 1.891 distritos del Perú (año 2024)** para medir cómo se distribuye la generación de residuos sólidos per cápita y qué relación guarda con la actividad económica formal local (empresas MTPE), la inversión pública acumulada (Invierte.pe) y la capacidad fiscal del municipio (clasificación MEF).

Ver [`propuesta/`](propuesta/) para el documento completo. **Estado al 2026-10-19**: diagnóstico, extracción (`scripts/extraer_datos.py`) y análisis completo (`scripts/analisar.py`, resultados en [`results/`](results/)) — ver `results/resumen_ejecutivo.md`. Pendiente solo: confirmar unidades MINAM y diccionario MEF antes de publicar.

## Preguntas

1. ¿Cómo se distribuye la generación de residuos domiciliarios per cápita por distrito en 2024 — cuánta desigualdad territorial hay entre el percentil 10 y el 90?
2. ¿Se explica esa variación por actividad económica formal (empresas por distrito), inversión pública acumulada, urbanización y capacidad fiscal del municipio (MEF A–G)?
3. ¿Qué distritos concentran **alta generación con baja capacidad municipal** — el cruce donde el costo de gestión recae sobre municipalidades con menos recursos?

Ángulo de interés público económico: la generación per cápita funciona como proxy de consumo material; cruzarla con la capacidad MEF permite priorizar territorios donde la presión de gasto ambiental/sanitario recae en municipios de menor capacidad fiscal.

## Diagnóstico de datos (verificado en vivo 2026-10-19)

| Base | Tabla | Cobertura | Estado |
|---|---|---|---|
| `residuos_solidos` | `residuos_solidos_municipales` | 11.310 filas = **1.891 ubigeos × 6 años (2019–2024)**, 25 departamentos | ✅ panel completo, 0 nulos en variables clave, 0 rechazadas |
| `residuos_solidos` | lote de ingesta | 1 lote, 11.310 registros, `fetched_at` **2026-09-30** (fuente con `FECHA_CORTE` 2025-12-18) | ✅ frescura OK |
| `actividad_empresarial` | `empresas_privadas_distrito` | 18.120 filas, **1.510 ubigeos**, solo **2025** (mensual, 4,59 M empresas) | ⚠️ 1.508/1.891 cruce directo (80%), 383 distritos sin dato |
| `radar_inversiones` | `investments` | 150.042 proyectos, 149.896 con ubigeo, 2.026 ubigeos distintos, registros hasta 2026-10-12 | ✅ agrega por distrito |
| `programas_sociales` | `cobertura_social` | 1.893 filas, un solo corte **2026-04-30** | ✅ cruza 1.891/1.891 (2 ubigeos huérfanos) |
| `radar_ejecucion` | `entities` + `budget_execution` | 84 gobiernos locales (solo La Libertad), 2026 | ❌ no sirve como variable nacional |

Estadísticos de control (año 2024, n=1.891): `generacion_percapita_dom` min 0,20 · **P10 0,33** · mediana 0,45 · **P90 0,65** · p95 0,70 · máx 0,80 · media 0,479 (unidades por confirmar, ver huecos); media `generacion_percapita_mun` 0,684. Todas las filas tienen población, clasificación MEF y región natural.

**Nota de revisión (2026-10-19):** la serie completa 2019–2024 llega a 2,00 en 2019–2020, mientras 2024 está acotado a 0,20–0,80 → 2024 es el año más limpio (refuerza la elección del corte) y los extremos históricos obligan a winsorización en los ejercicios de robustez. Los top de 2024 (0,80) son distritos pequeños de Ancásh/Apurímac (588–2.741 hab) → el control por `log(población)` es necesario, no decorativo.

## Estructura

```
propuesta/     # documento de propuesta (.md; .docx pendiente de generar)
data/raw/      # 4 CSV extraídos (16.739 filas) + README de cobertura y huecos
scripts/       # diagnostico.sql · extraer_datos.py (extracción) · analisar.py (análisis)
results/       # tablas CSV/MD, 4 figuras PNG y resumen_ejecutivo.md
```

## Resultados principales (2026-10-19)

Ver `results/resumen_ejecutivo.md` y `results/tabla_04_regresiones.md` (7 especificaciones, EE cluster por departamento, n=1.508 casos completos):

1. **Desigualdad territorial moderada**: P90 (0,65) / P10 (0,33) = 1,97; mediana 0,45, media 0,479.
2. **Capacidad MEF asociada pero no monótona**: vs clase A, las clases B, D, E, F, G tienen generación per cápita significativamente menor (F −0,134***); C es la única superior (+0,050***, la clase con más empresas formales).
3. **Empresas formales**: elasticidad positiva y estable, +0,017 a +0,025 en las 7 especificaciones (significativa); **inversión pública acumulada: nunca significativa** (honest null).
4. **Priorización**: índice 50% generación + 50% baja capacidad MEF → top 30 en `results/top30_priorizacion.csv` (30/30 en clases F/G); 5 primeros: MOLLEPAMPA (Apurímac), CAIRASCO (Cusco), VICHAYA (Cusco), JACAS GRANDE (Junín), PUÑOS (Huánuco).

## Huecos y riesgos conocidos

1. **Unidades sin confirmar**: el diccionario `.xlsx` de MINAM no se ha decodificado; `GENERACION_PER_CAPITA_DOM` se asume kg/hab/día (rango 0,20–0,80 compatible con la literatura). Confirmar antes de publicar cifras.
2. **`CLASIFICACION_MUNICIPAL_MEF` no decodificada** (valores A–G) en el data contract; hay que anexar la correspondencia oficial MEF antes de interpretar "capacidad".
3. **Desfase de años**: residuos 2024 vs empresas 2025 vs programas sociales corte 2026-04-30. Se usa empresas 2025 como proxy de actividad reciente; documentarlo, no presentar como simultáneo.
4. **383 distritos sin registro en MTPE** (posibles ceros formales vs cobertura parcial): tratar como *missing*, no como cero, hasta verificar.
5. **Calidad MTPE**: 2 ubigeos huérfanos (`000401`, `160109`) y columna `distrito` ingesta como `"[object Object]"` → usar nombres de distrito desde `residuos_solidos`.
6. **Sin dato de cobertura de recolección/tratamiento** (SINAN): el estudio mide *generación*, no servicio prestado. No afirmar brechas de cobertura.
7. **Ingesta manual** (sin scheduler): re-correr `npm run ingest:residuos` si aparece año 2025 en la fuente.
8. **`avance_ejecucion` de Invierte.pe con 167 valores fuera de rango** (escala 0–100 esperada): la extracción filtra `BETWEEN 0 AND 100`; no usar sin limpiar.

## Próximos pasos

1. ~~Extraer a `data/raw/`~~ ✅ hecho (2026-10-19).
2. ~~Correr descriptivos, percentiles y regresión robusta~~ ✅ hecho (2026-10-19).
3. Confirmar unidades MINAM y diccionario MEF (bloqueantes para publicar cifras).
4. Generar `.docx` de la propuesta y versión pulida del resumen ejecutivo (2–3 páginas).
