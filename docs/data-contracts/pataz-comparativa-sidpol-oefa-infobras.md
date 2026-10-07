# Data contract — Pataz, La Libertad: comparativa provincial minería × SIDPOL × OEFA × INFOBRAS

- Origen: extensión del caso LA VICTORIA/Ongón (`docs/data-contracts/caso-la-victoria-ongon-pataz.md`)
  a los 13 distritos de la provincia de Pataz, cruzando por primera vez el cruce
  comunidades∩minero/forestal con datos de SIDPOL/MININTER (`seguridad_ciudadana`).
- Verificado en vivo contra Neon producción el 2026-10-06: `geo_intersections`
  (`community_mining_coverage`), `seguridad_ciudadana` (`police_reports`),
  `infracciones_ambientales` (OEFA), `infobras` (`public_works`).
- Owner: ninguna app específica — registro de un **caso/análisis**, no un conector nuevo. Las
  bases consultadas ya tienen su propio data contract (ver
  `docs/data-contracts/comunidades-cruce-minero-forestal.md` para `community_mining_coverage`).

## Estado: VERIFICADO EN VIVO — ANÁLISIS COMPARATIVO, NO CONECTOR NUEVO

## Los 13 distritos reales de Pataz

Confirmado contra el conteo de `police_reports` (13 `ubigeo` distintos con `provincia ILIKE
'PATAZ'`): Buldibuyo, Chillía, Huancaspata, Huaylillas, Huayo, Ongón, Parcoy, Pataz (distrito),
Pías, Santiago de Challas, Taurija, Tayabamba, Urpay.

```sql
SELECT COUNT(DISTINCT ubigeo) FILTER (WHERE provincia ILIKE 'PATAZ') AS ubigeos_pataz
FROM police_reports;
-- 13
```

## Tabla comparativa completa

| Distrito | Cobertura minera real (ST_Union) | Derechos | Denuncias SIDPOL 2018–jul.2026 | Extorsión | Infracc. OEFA | Obras INFOBRAS sin ejecución |
|---|---|---|---|---|---|---|
| **Ongón** | **83.1%** (1 comunidad, 739 km²) | **197** | **17** | **0** | **0** | 18 obras / S/53.6M (88% de su propio presupuesto) |
| Chillía | 86.1% (7 comunidades) | 39 | 314 | 1 | 0 | 29 / S/51.3M |
| Buldibuyo | 86.1% (1) | 14 | 102 | 0 | 1* | 27 / S/6.0M |
| Taurija | 83.0% (2) | 14 | 42 | 1 | 1* | 5 / S/2.9M |
| Huancaspata | 82.5% (3) | 8 | 42 | 0 | 0 | 13 / S/37.7M |
| Parcoy | 56.0% (7) | 10 | 1,832 | **43** | 2–3* | 55 / S/64.8M |
| Pataz (distrito) | 47.2% (4) | 46 | 1,873 | **50** | 5 | 8 / S/24.8M |
| Pías | 26.9% (4) | 34 | 21 | 0 | 1* | 10 / S/35.1M |
| Huayo | 25.7% (1) | 2 | 18 | 1 | 0 | 12 / S/21.9M |
| Tayabamba | sin comunidad cruzada | — | 1,583 | 29 | 0 | 57 / S/1.69B** |
| Huaylillas | sin comunidad cruzada | — | 55 | 2 | 8 (S/400) | 9 / S/134M** |
| Urpay | sin comunidad cruzada | — | 24 | 0 | 0 | 10 / S/0.4M |
| Santiago de Challas | sin comunidad cruzada | — | 7 | 0 | 0 | 0 |

\* OEFA registra algunas infracciones con distrito múltiple en el campo origen (ej. "Parcoy,
Pías", "Buldibuyo, Parcoy, Pías") — no atribuible a un solo distrito, se cuenta en ambos. Total
provincial real de infracciones OEFA (sin deduplicar multi-distrito): 19.

\*\* Montos dominados por 1-2 proyectos de gran escala, no comparables al gasto municipal de
Ongón — ver sección siguiente.

## Queries fuente

**Cobertura minera por distrito** (`geo_intersections`):
```sql
SELECT community_distrito, COUNT(*) AS comunidades_afectadas,
       ROUND(AVG(pct_cobertura)::numeric,1) AS pct_cobertura_promedio,
       SUM(num_derechos) AS total_derechos
FROM community_mining_coverage
WHERE community_provincia ILIKE 'PATAZ' AND community_departamento ILIKE '%LIBERTAD%'
GROUP BY community_distrito ORDER BY pct_cobertura_promedio DESC;
```

**Denuncias SIDPOL por distrito** (`seguridad_ciudadana`):
```sql
SELECT distrito, modalidad, SUM(cantidad) AS total, MIN(anio) AS desde, MAX(anio) AS hasta
FROM police_reports
WHERE provincia ILIKE 'PATAZ'
GROUP BY distrito, modalidad ORDER BY distrito, total DESC;
```

**Serie temporal de extorsión provincial** (`seguridad_ciudadana`):
```sql
SELECT anio, SUM(cantidad) AS total_extorsion
FROM police_reports
WHERE provincia ILIKE 'PATAZ' AND modalidad ILIKE 'Extorsi%'
GROUP BY anio ORDER BY anio;
```

```json
[{"anio":2018,"total_extorsion":"1"},{"anio":2019,"total_extorsion":"6"},
 {"anio":2020,"total_extorsion":"3"},{"anio":2021,"total_extorsion":"4"},
 {"anio":2022,"total_extorsion":"10"},{"anio":2023,"total_extorsion":"7"},
 {"anio":2024,"total_extorsion":"25"},{"anio":2025,"total_extorsion":"40"},
 {"anio":2026,"total_extorsion":"31"}]
```

La extorsión provincial creció de 1 denuncia (2018) a 40 (2025) — 2026 es corte parcial (hasta
julio, dataset `DATASET_Denuncias_Policiales_Ene 2018 a Julio 2026.csv`), así que su ritmo anual
real probablemente iguala o supera a 2025, no lo subestima.

**OEFA por distrito** (`infracciones_ambientales`):
```sql
SELECT distrito, COUNT(*) AS infracciones, ROUND(SUM(cantidad_multa)::numeric,2) AS multa_total
FROM infracciones_ambientales
WHERE departamento ILIKE 'La Libertad' AND provincia ILIKE '%pataz%'
GROUP BY distrito ORDER BY infracciones DESC;
```

**INFOBRAS por distrito** (`infobras`, excluyendo 2 distritos mal geocodificados — ver
limitaciones):
```sql
SELECT
  CASE WHEN distrito='TURPAY' THEN 'URPAY' ELSE distrito END AS distrito,
  COUNT(*) AS obras_totales,
  SUM(CASE WHEN estado_ejecucion='Sin Ejecución' THEN 1 ELSE 0 END) AS obras_sin_ejecucion,
  ROUND(SUM(monto_viable)::numeric,0) AS monto_viable_total,
  ROUND(SUM(monto_viable) FILTER (WHERE estado_ejecucion='Sin Ejecución')::numeric,0) AS monto_sin_ejecucion
FROM public_works
WHERE departamento ILIKE 'LA LIBERTAD' AND provincia ILIKE 'PATAZ'
  AND distrito NOT IN ('ANDAHUAYLILLAS','CCARHUAYO')
GROUP BY 1 ORDER BY 1;
```

## Por qué el monto de Tayabamba y Huaylillas no es comparable

De los S/1.69B "sin ejecución" en Tayabamba, **S/1.55B corresponden a una sola carretera
PROVIAS** ("Chagual–Tayabamba–Puente Huacrachuco") contada dos veces en la fuente, una fila por
tramo (`monto_viable=777,276,149` en ambas). Verificado:

```sql
SELECT nombre_obra, entidad_nombre, monto_viable, estado_ejecucion
FROM public_works
WHERE departamento ILIKE 'LA LIBERTAD' AND provincia ILIKE 'PATAZ' AND distrito='TAYABAMBA'
  AND estado_ejecucion='Sin Ejecución' AND monto_viable IS NOT NULL
ORDER BY monto_viable DESC LIMIT 2;
-- ambas filas: "REHABILITACION Y MEJORAMIENTO DE LA CARRETERA CHAGUAL TAYABAMBA..." (dos tramos),
-- PROVIAS NACIONAL, monto_viable=777276149.00
```

Huaylillas (S/134M de S/146.5M total) tiene el mismo patrón con un proyecto eléctrico nacional de
HIDRANDINA ("Mejoramiento de alimentadores en media tensión"), no verificado en detalle en esta
sesión pero con la misma firma (monto desproporcionado para 29 obras totales). **El % de obras,
no el monto absoluto, es la métrica comparable entre distritos** para estos dos casos.

## Hallazgo de calidad de datos: provincia "PATAZ" con distritos de otro departamento

`public_works` tiene 5 filas con `departamento='LA LIBERTAD'`, `provincia='PATAZ'`, pero
`distrito` igual a **ANDAHUAYLILLAS** o **CCARHUAYO** — ambos son distritos reales de la
provincia de Quispicanchi, **Cusco**, no de Pataz:

```sql
SELECT departamento, provincia, distrito, COUNT(*) FROM public_works
WHERE distrito IN ('ANDAHUAYLILLAS','CCARHUAYO') AND departamento ILIKE 'LA LIBERTAD'
GROUP BY departamento, provincia, distrito;
-- LA LIBERTAD | PATAZ | ANDAHUAYLILLAS | 2
-- LA LIBERTAD | PATAZ | CCARHUAYO      | 3
```

Error de geocodificación en la fuente INFOBRAS (la tabla ya tiene una columna
`distrito_sospechoso` para este tipo de caso, pero estas 5 filas no quedaron marcadas como
tales). Se excluyeron de la tabla comparativa de este documento. También se detectó la variante
`TURPAY` (vs. `URPAY`, el nombre real) con 2 filas — se fusionó en la agregación.

## Hallazgo de calidad de datos: comunidad "LA VICTORIA" homónima con provincia mal asignada

`rural_communities` tiene una comunidad "LA VICTORIA" con `provincia='PATAZ'`,
`distrito='SARTIMBAMBA'` (objectid=2007) — pero Sartimbamba es en realidad distrito de la
provincia de **Sánchez Carrión**, no de Pataz. No es la misma comunidad que el caso ancla de este
análisis (objectid=2176, distrito Ongón real). Se excluyó de la tabla comparativa por este error
de geocodificación en la fuente, no por decisión analítica — ver también
`docs/data-contracts/caso-la-victoria-ongon-pataz.md` sección "Identidad de la comunidad".

## Lectura honesta (no forzar una sola interpretación causal)

Ongón es el único distrito con fragmentación minera extrema (197 derechos, la cifra más alta de
la provincia) que simultáneamente tiene la menor actividad policial de cualquier tipo (17
denuncias en 8 años, 0 extorsión) y cero fiscalización OEFA. El 94% de las 130 denuncias de
extorsión de toda la provincia (122 de 130) se concentra en los 3 distritos de minería formal
grande (Pataz, Parcoy, Tayabamba) — exactamente donde la fragmentación minera en comunidades es
menor.

El patrón es compatible con dos lecturas opuestas, y ninguna se sostiene sola con estos datos:

1. **Ongón como vacío de presencia estatal total**: ni crimen reportado ni fiscalización ni
   ejecución de obra, porque no hay registro de nada ahí — no necesariamente "tranquilo".
2. **Minería mayoritariamente informal/atomizada en Ongón** (70% de los 197 derechos en manos de
   personas naturales o SMRL, ver caso ancla), sin los conflictos violentos que sí afectan a la
   minería formal grande y concentrada de Pataz/Parcoy/Tayabamba — blanco de extorsión
   justamente por ser grande, formal y rentable.

0 infracciones OEFA no prueba 0 impacto ambiental — puede ser vacío de fiscalización en zona
remota, no cumplimiento normativo real.

## Limitaciones explícitas

- `comisarias_auditadas` (seguridad-ciudadana) está completamente vacía a nivel nacional — no se
  pudo usar como proxy de presencia física de la PNP en cada distrito.
- `pnp_equipamiento_seace` no tiene columna geográfica — no sirve para desagregar por distrito.
- No se investigó causalidad entre fragmentación minera y ausencia de denuncias — ver "Lectura
  honesta" arriba.
- El corte SIDPOL 2026 es parcial (hasta julio) — cualquier comparación año a año con 2026 debe
  anualizarse o excluirse, no compararse directo contra años completos.
- Montos INFOBRAS de Tayabamba y Huaylillas no son comparables al resto por los outliers de
  proyectos nacionales (ver sección dedicada arriba).

## Entregables de este análisis

- Tabla comparativa visual publicada como Artifact (sesión 2026-10-06), no versionada en el
  repo — este documento es la versión persistida y citable.
- Copy de LinkedIn basado en estas cifras, entregado en chat (sesión 2026-10-06), no publicado.

## Pendiente

- No se investigó si existe el mismo patrón "alta fragmentación minera + vacío estatal total" en
  otras provincias mineras del país — este análisis se limitó a Pataz por ser la extensión
  natural del caso Ongón ya documentado.
- El outlier de Huaylillas (proyecto eléctrico HIDRANDINA) no se verificó con el mismo detalle
  que el de Tayabamba (carretera PROVIAS) — pendiente si se reutiliza esta cifra.
