# Data contract — caso verificado: comunidad LA VICTORIA (Ongón, Pataz, La Libertad)

- Origen: análisis ad-hoc de sesión (2026-10-07), explorando estadísticas complementarias sobre
  el cruce comunidades∩minero/forestal (`docs/data-contracts/comunidades-cruce-minero-forestal.md`)
  con foco en La Libertad.
- Verificado en vivo contra Neon producción (`geo_intersections`, `infracciones_ambientales`,
  `infobras`) — todas las cifras de este documento son resultado directo de las queries SQL
  citadas, no estimaciones.
- Owner: ninguna app específica — este documento registra un **caso**, no un conector nuevo.
  Las tablas consultadas (`rural_communities`, `community_mining_coverage`,
  `community_mining_intersections`) ya están documentadas en
  `docs/data-contracts/comunidades-cruce-minero-forestal.md`; `infracciones_ambientales` y
  `infobras` son bases de otras apps del catálogo (OEFA, INFOBRAS).

## Estado: VERIFICADO EN VIVO — CASO PUNTUAL, NO CONECTOR NUEVO

## Identidad de la comunidad

Hay **dos comunidades homónimas** "LA VICTORIA" en la provincia de Pataz — este documento se
refiere exclusivamente a la de **Ongón** (no a la de Sartimbamba).

```sql
SELECT objectid, nombre, departamento, provincia, distrito, area_km2, source_batch_id, updated_at
FROM rural_communities WHERE nombre ILIKE '%LA VICTORIA%' AND departamento='LA LIBERTAD';
```

```json
[
  {"objectid": 2176, "nombre": "LA VICTORIA", "departamento": "LA LIBERTAD", "provincia": "PATAZ", "distrito": "ONGON", "area_km2": "739.036505409747", "source_batch_id": "1"},
  {"objectid": 2007, "nombre": "LA VICTORIA", "departamento": "LA LIBERTAD", "provincia": "PATAZ", "distrito": "SARTIMBAMBA", "area_km2": "98.8218055752994", "source_batch_id": "1"}
]
```

Caso de este documento: `capa='comunidades_campesinas'`, `objectid=2176`, distrito **Ongón**,
739.04 km². Geometría verificada antes de usar el caso (no es un artefacto de datos):

```sql
SELECT ST_IsValid(geometry), ST_NumGeometries(geometry)
FROM rural_communities WHERE capa='comunidades_campesinas' AND objectid=2176;
-- {"geom_valida": true, "num_shells": 1}
```

## Cobertura real minera: 83.1%

Fuente: `community_mining_coverage` (migración 008, método `ST_Union` — ver
`docs/data-contracts/comunidades-cruce-minero-forestal.md` para por qué sumar
`community_overlap_pct` por par sobrestima).

```sql
SELECT community_nombre, community_provincia, community_distrito, community_area_km2,
       pct_cobertura, num_derechos
FROM community_mining_coverage
WHERE community_departamento='LA LIBERTAD' AND community_area_km2>=5
ORDER BY pct_cobertura DESC;
```

Fila de LA VICTORIA/Ongón: `pct_cobertura=83.1`, `num_derechos=197`.

## Desglose por tipo de titular — firma de fragmentación minera

```sql
SELECT
  CASE
    WHEN mining_titular ILIKE 'S.M.R.L.%' THEN 'SMRL'
    WHEN mining_titular ~* '(S\.A\.C\.|S\.A\.A\.|S\.A\.$|E\.I\.R\.L\.|S\.R\.L\.)' THEN 'Empresa formal'
    ELSE 'Persona natural'
  END AS tipo_titular,
  COUNT(DISTINCT mining_titular) AS num_titulares,
  COUNT(DISTINCT mining_codigou) AS num_derechos,
  ROUND(SUM(intersection_area_km2)::numeric,1) AS area_km2_aprox
FROM community_mining_intersections
WHERE community_capa='comunidades_campesinas' AND community_objectid=2176
GROUP BY tipo_titular ORDER BY num_derechos DESC;
```

```json
[
  {"tipo_titular": "Persona natural", "num_titulares": "73", "num_derechos": "117", "area_km2_aprox": "401.6"},
  {"tipo_titular": "Empresa formal", "num_titulares": "31", "num_derechos": "60", "area_km2_aprox": "192.9"},
  {"tipo_titular": "SMRL", "num_titulares": "15", "num_derechos": "20", "area_km2_aprox": "92.7"}
]
```

**70% de los 197 derechos** (117 + 20, personas naturales + SMRL) están en manos de titulares
individuales o pequeñas sociedades, no de grandes empresas — la nota al pie importante: la
clasificación "Empresa formal"/"SMRL"/"Persona natural" es heurística por patrón de texto en
`mining_titular` (sufijos societarios), no un campo categórico de la fuente INGEMMET.

Nota de consistencia interna (verificada sin reconectar a Neon): la suma bruta de áreas de
intersección por par (401.6 + 192.9 + 92.7 = 687.2 km²) es **mayor** que la cobertura real por
`ST_Union` (83.1% de 739.04 km² ≈ 614.3 km²) — exactamente el patrón de sobreestimación por
solapamiento entre concesiones distintas que motivó la migración 008.

## Estado de los derechos: 100% titulados, ninguno en trámite

```sql
SELECT mining_estado, COUNT(DISTINCT mining_codigou)
FROM community_mining_intersections
WHERE community_capa='comunidades_campesinas' AND community_objectid=2176
GROUP BY mining_estado;
-- [{"mining_estado": "T", "count": "197"}]
```

## Patrón geométrico: cuadrícula minera estándar, 100% contenida

```sql
SELECT mining_codigou, mining_concesion, mining_titular, mining_estado, mining_sustancia,
  mining_area_km2, intersection_area_km2, mining_overlap_pct
FROM community_mining_intersections
WHERE community_capa='comunidades_campesinas' AND community_objectid=2176
ORDER BY intersection_area_km2 DESC LIMIT 15;
```

Las filas muestran `mining_area_km2` ≈ 9.99-10.00 (la cuadrícula minera estándar del código de
minería peruano, 1,000 ha) con `mining_overlap_pct=100.0` — cada concesión individual está
completamente contenida dentro del territorio comunal, no solo tocándolo en el borde. Ejemplos
reales: `RAFAELLA 2019 II` (COMPAÑIA MINERA PODEROSA S.A.), `CHIMBOYA 3` (MINERA AURIFERA
RETAMAS S.A.), más 13 concesiones de personas naturales/SMRL en la misma muestra.

## Contraste OEFA: 0 infracciones en Ongón, sí en otros distritos de Pataz

```sql
SELECT COUNT(*) FROM infracciones_ambientales
WHERE distrito ILIKE '%ongon%' OR distrito ILIKE '%ongón%';
-- [{"count": "0"}]
```

Contraste — sanciones reales confirmadas en OTROS distritos de la misma provincia Pataz
(`departamento='La Libertad'`, nótese minúscula/mayúscula distinta a `rural_communities`):

```sql
SELECT nombre_administrado, distrito, provincia, detalle_infraccion, cantidad_multa, fecha_rd
FROM infracciones_ambientales
WHERE departamento='La Libertad' AND provincia ILIKE '%pataz%'
ORDER BY fecha_rd DESC;
```

Ejemplos reales: CIA MINERA PODEROSA S A (distrito Pataz, multa S/11.27, 2020-02-28),
COMPAÑIA MINERA CARAVELI S.A.C. (distrito Huaylillas, multa S/2.01, 2021-03-31), MINERA
AURIFERA RETAMAS S.A. / MARSA (distritos Buldibuyo/Parcoy/Pias, 2018-11-22). Tanto Poderosa
como Retamas **sí tienen derechos mineros dentro de LA VICTORIA/Ongón** (ver sección anterior)
pero sus sanciones OEFA registradas caen en otros distritos de la misma provincia — la
fiscalización opera en la zona, simplemente no hay registro en Ongón específicamente.

**Lectura honesta**: 0 infracciones no prueba 0 impacto ambiental — puede ser un vacío real de
fiscalización en una zona remota, no necesariamente cumplimiento normativo.

## Contraste INFOBRAS: 88% del monto planificado sin ejecutar

```sql
SELECT estado_ejecucion, COUNT(*), ROUND(SUM(monto_viable)::numeric,0) AS suma_monto_viable
FROM public_works
WHERE departamento ILIKE 'LA LIBERTAD' AND provincia ILIKE 'PATAZ' AND distrito ILIKE '%ONGON%'
GROUP BY estado_ejecucion;
```

```json
[
  {"estado_ejecucion": "En Ejecución", "count": "16", "suma_monto_viable": "2369149"},
  {"estado_ejecucion": "Finalizado", "count": "17", "suma_monto_viable": "4920244"},
  {"estado_ejecucion": "Sin Ejecución", "count": "18", "suma_monto_viable": "53564774"}
]
```

51 obras totales, S/60,854,167 planificados. **18 obras — S/53,564,774 (88% del monto) —
quedaron "Sin Ejecución"**. Todas a cargo de la Municipalidad Distrital de Ongón o la
Municipalidad Provincial de Pataz (gobierno local); ninguna de nivel regional/nacional ni
vinculada a empresa minera. Tipos de obra: trochas carrozables, puentes, locales comunales,
agua potable y letrinas, locales educativos — infraestructura básica, no proyectos de gran
envergadura.

**Lectura honesta**: una obra "sin ejecución" puede tener causas presupuestales o
administrativas ajenas a la presión minera — esta cifra no prueba una relación causal con el
hallazgo minero, solo describe el estado real de la inversión pública planificada en el mismo
distrito.

## Limitaciones explícitas

- Un derecho minero titulado vigente **no implica explotación activa** in situ — el dato
  describe el registro formal, no verifica actividad extractiva real sobre el terreno.
- No se cruzó con expedientes de servidumbre minera ni consulta previa — no hay forma, con las
  fuentes actuales del proyecto, de confirmar si la comunidad dio su consentimiento para estos
  197 derechos.
- La clasificación persona natural / empresa formal / SMRL es heurística (patrón de texto en el
  nombre del titular), no un campo categórico de INGEMMET.
- `infracciones_ambientales.departamento` usa capitalización distinta (`'La Libertad'`) a
  `rural_communities.departamento` (`'LA LIBERTAD'`) — cualquier query futura contra esa tabla
  debe usar `ILIKE` o normalizar explícitamente, no asumir mayúsculas.

## Extensión a los 13 distritos de la provincia

Este caso se extendió a una comparativa provincial completa, cruzando además SIDPOL/MININTER
(denuncias policiales, extorsión) — ver
`docs/data-contracts/pataz-comparativa-sidpol-oefa-infobras.md` para la tabla de los 13
distritos, la serie temporal de extorsión 2018–2026 y los hallazgos de calidad de datos
adicionales (distritos de Cusco mal etiquetados como Pataz en INFOBRAS, homónimo de Sartimbamba).

## Pendiente

- Este documento registra el caso puntual verificado en sesión. Si se decide publicar o
  reutilizar estas cifras fuera de esta sesión, considerar automatizar la clasificación de
  titulares (hoy heurística ad-hoc) como una vista o columna reutilizable si se vuelve a
  necesitar para otros casos similares.
- No se investigó si existen más comunidades con el mismo patrón (>150 derechos, mayoría
  persona natural/SMRL) fuera de La Libertad — este caso se eligió por ser el de mayor
  `num_derechos` detectado al explorar La Libertad específicamente, no por una búsqueda
  exhaustiva nacional.
