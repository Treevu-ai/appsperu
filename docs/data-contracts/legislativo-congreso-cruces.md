# Data contract — Cruce de proyectos de ley con obras públicas (INFOBRAS)

**App:** `legislativo-congreso` · **Fase:** 3, ticket LEG-04 · **Estado:** implementado y verificado contra Postgres real

## Alcance

Cruce keyword-based entre los proyectos de ley del Congreso y las obras públicas
de INFOBRAS. **Sin IA y sin embeddings**: `matchScore` es una heurística léxica.

> Un `matchScore` alto **no** prueba que el proyecto de ley cause esa obra.
> Solo prueba que comparten palabras. Ningún tool debe presentar el cruce como
> causalidad.

## Dependencias

| Base | Variable | Qué aporta |
|---|---|---|
| `legislativo_congreso` | `DATABASE_URL` | `legislativo_congreso_proyectos` (per_par_id, pley_num, titulo…) |
| `infobras` | `INFOBRAS_DATABASE_URL` | `public_works` (nombre_obra, departamento, costos, paralización…) |

Sin `INFOBRAS_DATABASE_URL` la API responde **503, no cero**. Un `total: 0` con
503 ausente significa "no hay obras que matcheen"; con 503 significa "no se pudo
consultar". La distinción es deliberada y se aplica **antes** del fast path de
"el periodo no trae proyectos con keywords": un periodo vacío con INFOBRAS
inaccesible responde 503, no `200` con `total: 0`.

## Endpoints

```
GET /api/cruces/proyectos-infobras
    ?departamento=LA LIBERTAD   default LA LIBERTAD
    &periodo=2026               per_par_id, default 2026
    &umbral_score=0.5           0.0-1.0, default 0.5
    &matched_minimo=2           mínimo de keywords coincidentes, default 2
    &limit=200 &offset=0        limit máx 1000

GET /api/cruces/proyectos-infobras/{periodo}/{numero}
    ?departamento=LA LIBERTAD&umbral_score=0.5&matched_minimo=2
```

Herramienta MCP: `legislativo_congreso_cruces_infobras` y
`legislativo_congreso_cruce_infobras_proyecto`.

### Respuesta

```json
{
  "total": 2, "limit": 200, "offset": 0, "periodo": 2026,
  "hasMore": false,
  "resultados": [
    { "proyecto": { "perParId": 2026, "pleyNum": 1001, "titulo": "..." },
      "obra": { "codigoInfobras": "OBR-001", "nombreObra": "...", "montoViable": 1500000.5 },
      "matchScore": 0.5714, "matchedKeywords": ["construccion","obras","publicas","saneamiento"] }
  ],
  "fuente": { "dataset": "...", "nota": "..." }
}
```

### No hay `truncated`

El campo se eliminó junto con el tope que lo justificaba. Antes la query pedía
`LIMIT 501` y cortaba en 500, y `truncated: true` avisaba de ese corte; el
problema era que el corte era **por `codigo_infobras`, no por relevancia**, así
que en un departamento de 10,134 obras el cruce consistía en las 500 de código
más bajo: sesgado, no solo incompleto.

Ahora se puntúa el conjunto completo y se pagina sobre él con orden total
estable (score desc, luego `pley_num`, luego `codigo_infobras`), de modo que
`total` es el conteo real y dos páginas consecutivas no se solapan ni repiten.
Solo se hidratan los objetos de la página pedida.

## Cómo se calcula el score

1. `extractKeywords(titulo)`: minúsculas, sin diacríticos, sin stopwords, sin
   números puros, sin palabras de <3 caracteres, deduplicado.
2. Las obras del departamento se leen una vez y sus nombres se tokenizan en un
   **índice invertido** (token normalizado → lista de obras), sin límite de
   candidatas.
3. Cada proyecto se puntúa recorriendo solo los postings de sus keywords.
4. Filtros: `matchScore = keywords_coincidentes / keywords_del_título` contra
   `umbral_score`, **y** `keywords_coincidentes >= matched_minimo`.
5. `matchScore` se reporta; el IDF se calcula en el índice pero hoy solo como
   diagnóstico interno, no altera el score.

### Coincidencia por token completo

La coincidencia es por token, no por subcadena. Los tokens se singularizan por
sufijo (`saneamientos` → `saneamiento`), nunca por prefijo.

Con subcadena, `"crea"` matcheaba `"CREACION"` y la ley *"que crea la Universidad
Nacional de Ciencias de la Salud"* puntuaba **0.40** contra *"CREACION DE LOS
SERVICIOS DE SALUD"*. Medido sobre la ingesta real: el token exacto elimina
23,078 cruces de 74,945 (31%) y **no introduce ninguno nuevo** — es subconjunto
estricto, solo se va el ruido.

Tolerar plurales ampliando el prefijo se descartó: reintroduce el artefacto
("crea" vuelve a matchear "CREACION") y sube los cruces de 51,867 a 67,763.

### Tokens administrativos excluidos del índice

Cada nombre de obra embebe su ubicación ("DEL DISTRITO DE … PROVINCIA …
DEPARTAMENTO …"). Dentro de un departamento no distinguen una obra de otra —la
ubicación ya es el filtro— y matched contra títulos legislativos que también los
mencionan. Se excluyen del índice: `distrito`, `provincia`, `departamento`,
`municipalidad`, `municipal`, `gobierno`, `nivel`, `region`, `provincial`,
`localidad`, `caserio`, `centro`, `poblado`, `comunidad`, `ubicacion`,
`geografico`.

Efecto medido en LA LIBERTAD periodo 2021: **675,856 → 26,693 cruces (96% menos)**.
Ese era el ruido dominante, muy por encima del subcadena.

### `matched_minimo`

La fracción sola no alcanza como filtro: 1 keyword sobre 3 puntúa 0.33 y pasaba el
corte de 0.3. `matched_minimo` (default 2) exige además una cantidad absoluta.
Con los defaults, LA LIBERTAD 2021 pasa de 26,693 a **567 cruces** sobre 1,029
proyectos con al menos un cruce.

### `departamento`

Se canonicaliza contra el catálogo peruano y se **rechaza con 400** lo que no
está en él. Antes pasaba tal cual a la query y devolvía `0` cruces sin error,
idéntico a "ese departamento no tiene obras"; el alias `"P C DEL CALLAO"` del
XLSX de INFOBRAS caía justo ahí. Ahora `"P C DEL CALLAO"` resuelve a `CALLAO`
(verificado: 135 cruces en ambos casos).

## Verificación en vivo (2026-10-04)

Postgres 16 real con las **migraciones reales** de ambas apps aplicadas
(`legislativo_congreso/001_init.sql`, `infobras/001`–`005`), contra las
**ingestas reales** completas.

| Fuente | Resultado |
|---|---|
| Congreso (`api.congreso.gob.pe/spley-portal-service`) | 14,870 filas, **0 rechazadas** (6 de 2026 + 14,864 de 2021) |
| INFOBRAS (XLSX de Contraloría) | 191,180 leídas → **178,616 aceptadas**, 12,218 `skippedOtherDepartamento`, 346 rechazadas, `isPartial: false` |

El XLSX local fue `DataSet-Obras-Publicas 16-08-2026.xlsx` (54.7 MB): el corte
temporal es **2026-08-16**, no la fecha de la verificación. Nombre y checksum
quedan en `raw_infobras_batches`.

### Comportamiento verificado

| Caso | Resultado |
|---|---|
| Las 22 columnas de `public_works` y las 8 de `legislativo_congreso_proyectos` existen | ✅ contrastadas contra `information_schema` |
| `NUMERIC` de Postgres viene como string y se convierte | ✅ `montoViable 1500000.5`, `avanceFisicoRealPct 45.5` |
| Acentos en ambos lados | ✅ obra con y sin acentos puntúa igual; el token se normaliza al indexar |
| Sin coincidencia por subcadena | ✅ `"crea"` no matchea `"CREACION"` en app ni en MCP |
| Filtro `departamento` | ✅ `LA LIBERTAD` y `LIMA` dan totales distintos; sin cruce cruzado |
| Alias `"P C DEL CALLAO"` | ✅ 135 cruces, idéntico a `"CALLAO"` |
| Departamento inexistente | ✅ **400**, sin tocar la BD |
| `periodo` parametrizado | ✅ 2021 y 2026 con resultados distintos |
| Paginación estable | ✅ páginas 1 y 2 sin solape; orden por score, proyecto y obra |
| Sin tope de candidatas | ✅ 1,500 obras que matchean → `total 1500` |
| Sin `INFOBRAS_DATABASE_URL` | ✅ **503** en ambos endpoints, incluso con periodo vacío |
| Paridad MCP ↔ app | ✅ mismo `matchScore` y `matchedKeywords` sobre el mismo corpus |

## Rendimiento real

| Consulta | Antes | Ahora |
|---|---|---|
| `LA LIBERTAD` 2021 (14,864 proyectos × 10,134 obras) | 75,613 ms | **2,606 ms** |
| `LIMA` 2021 | 58,318 ms | **6,941 ms** |
| `CALLAO` 2021 | 57,610 ms | **838 ms** |
| `LA LIBERTAD` 2026 (6 proyectos) | 360 ms | 191 ms |
| Un proyecto concreto | 513 ms | 242 ms |

Causa de la mejora, medida: el índice se construye en **158 ms** y el scoring es
proporcional a las coincidencias reales, no a 12,888 cláusulas `OR ILIKE`
(17,228 ms) ni a 7.4 M de scorings sobre 500 candidatas.

**No hay caché.** El primer request de cada combinación
`(departamento, periodo, umbral, matched_minimo)` paga el coste completo; los
siguientes también, porque cada llamada reconstruye el índice. Es asumible a
2.6 s para el peor caso medido, pero un periodo con muchos más proyectos sí
necesitaría precomputado (`crossref:build`, el patrón que ya usan 3 apps) o
caché por clave.

## Límites conocidos

- **El score sigue siendo léxico.** Un `matchScore` alto prueba que comparten
  tokens, no que el proyecto cause la obra.
- **La granularidad es la del título.** Dos proyectos con títulos casi idénticos
  cruzan contra las mismas obras; no hay desambiguación por entidad, provincia
  ni monto.
- **`matchScore` no pondera por IDF.** Se calcula en el índice pero no altera el
  score, así que una keyword presente en casi todas las obras del departamento
  pesa igual que una rara.
- **La singularización por sufijo es aproximada.** "saneamiento"/"saneamientos"
  convergen, pero no cubre irregulares del español.
- **El primer request paga el índice entero.** Ver "Rendimiento real".
- **La duplicación con `mcp-server` es real.** Su `rootDir: src` impide importar
  la app sin romper el bundle del Worker, igual que con `packages/shared-queries`
  (ADR-0019). `mcp-server/src/__tests__/cruces-paridad.test.ts` es la red: si el
  matcher de un lado cambia y el otro no, el test falla.

