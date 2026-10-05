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
    &umbral_score=0.3           0.0-1.0, default 0.3
    &limit=200 &offset=0        limit máx 1000

GET /api/cruces/proyectos-infobras/{periodo}/{numero}
    ?departamento=LA LIBERTAD&umbral_score=0.3
```

Herramienta MCP: `legislativo_congreso_cruces_infobras` y
`legislativo_congreso_cruce_infobras_proyecto`.

### Respuesta

```json
{
  "total": 2, "limit": 200, "offset": 0, "periodo": 2026,
  "hasMore": false, "truncated": false,
  "resultados": [
    { "proyecto": { "perParId": 2026, "pleyNum": 1001, "titulo": "..." },
      "obra": { "codigoInfobras": "OBR-001", "nombreObra": "...", "montoViable": 1500000.5 },
      "matchScore": 0.5714, "matchedKeywords": ["construccion","obras","publicas","saneamiento"] }
  ],
  "fuente": { "dataset": "...", "nota": "..." }
}
```

### `truncated`

La query a INFOBRAS pide `LIMIT 501` y corta en 500. Si un departamento tiene
más de 500 obras candidatas, `truncated: true` lo declara. **Ausencia de dato ≠
cero**: un `truncated: true` con `total: 0` significa "el departamento excedió el
tope y ninguna de las 500 obras alcanzaba el umbral", no "no hay obras".

El 404 del endpoint de un proyecto concreto también incluye `truncated` en el
cuerpo. Antes no lo hacía, y con datos reales eso convertía un truncamiento en
un cero indistinguible: el proyecto 14849 devolvía 0 cruces con 501 candidatas
agotadas, y el cliente no tenía forma de saber que el tope se había tocado.


## Cómo se calcula el score

1. `extractKeywords(titulo)`: minúsculas, sin diacríticos, sin stopwords, sin
   números puros, sin palabras de <3 caracteres, deduplicado.
2. Una **única** query a INFOBRAS por departamento con `nombre_obra ILIKE %kw%`
   OR por cada keyword (no una query por proyecto).
3. `matchScore = keywords_coincidentes / keywords_del_título`.

`matchedKeywords` pasa por la misma normalización que el score. Sin eso, una obra
con acentos puntúa > 0 y reporta `matchedKeywords: []` — contradicción que ya
ocurrió y está cubierta por test.

## Verificación en vivo (2026-10-04)

Postgres 16 real con las **migraciones reales** de ambas apps aplicadas
(`legislativo_congreso/001_init.sql`, `infobras/001`–`005`). Dos corridas: una
con datos de prueba, otra con las **ingestas reales** completas.

### Corrida con datos de prueba

| Caso | Resultado |
|---|---|
| Las 22 columnas de `public_works` y las 8 de `legislativo_congreso_proyectos` existen | ✅ contrastadas contra `information_schema` |
| Acentos en `nombre_obra` | ✅ la obra "Construcción de obras públicas" entra como candidata y puntúa `matchScore 0.571` con 4 keywords. **No** porque la query mande `%públicas%`: `extractKeywords` quita los diacríticos, así que el patrón real es `%publicas%`, y `ILIKE` es sensible a acentos. La obra entra por `%obras%`; recién en el scoring en memoria se normalizan ambos lados |
| Filtro `departamento` (mayúsculas) | ✅ `LA LIBERTAD`→OBR-001/002, `LIMA`→OBR-004, sin cruce cruzado |
| `periodo` parametrizado (antes hardcodeado 2026) | ✅ 2026→1001/1002, 2025→2001 |
| `NUMERIC` de Postgres viene como string y se convierte | ✅ `montoViable 1500000.5`, `avanceFisicoRealPct 45.5` |
| `truncated` con 523 obras | ✅ `truncated: true`, exactamente 500 cruces |
| Sin `INFOBRAS_DATABASE_URL` | ✅ **503** en ambos endpoints |
| 400 departamento vacío / 404 proyecto inexistente | ✅ |
| Paginación `limit=1` | ✅ `total 2`, `hasMore true` |

### Corrida con ingesta real

| Fuente | Resultado |
|---|---|
| Congreso (`api.congreso.gob.pe/spley-portal-service`) | 14,870 filas, **0 rechazadas** (6 de 2026 + 14,864 de 2021) |
| INFOBRAS (XLSX de Contraloría) | 191,180 leídas → **178,616 aceptadas**, 12,218 `skippedOtherDepartamento`, 346 rechazadas, `isPartial: false` |

La ingesta de INFOBRAS se corrió sobre el XLSX local `DataSet-Obras-Publicas
16-08-2026.xlsx` (54.7 MB). El corte temporal es **2026-08-16**, no la fecha de
esta verificación; el nombre y checksum quedan en `raw_infobras_batches`.

## Rendimiento real (defecto abierto)

El cruce por departamento es inviable a escala nacional. Medido:

| Consulta | Tiempo | Cruces | `truncated` |
|---|---|---|---|
| `LA LIBERTAD` periodo 2021 (14,864 proyectos) | **75,613 ms** | 39,670 | `true` |
| `LIMA` periodo 2021 | **58,318 ms** | 47,898 | `true` |
| `CALLAO` periodo 2021 | 57,610 ms | 61,971 | `true` |
| `LA LIBERTAD` periodo 2026 (6 proyectos) | 360 ms | 14 | `true` |
| Un proyecto concreto | 513 ms | 0 | `true` |

Causa medida, no supuesta. Los 14,864 títulos del periodo 2021 producen **12,888
keywords únicas**, y cada una entra como un `OR` de `ILIKE`:

- La **query** con 12,888 `OR ILIKE` tarda **17,228 ms**. El `EXPLAIN` muestra
  `Bitmap Index Scan` sobre `departamento` (10,134 filas) y después un `Filter`
  que descarta 9,702: no hay índice trigram, así que cada `ILIKE '%kw%'` es un
  barrido de la partición del departamento. Un solo `ILIKE` aislado ya cuesta
  119 ms; el `COUNT` por departamento, 11 ms.
- Los ~58 s restantes son el scoring en memoria: 14,864 proyectos × 500
  candidatas ≈ **7.4 M** llamadas a `calculateMatchScore`.

La estrategia de una sola query evita el N+1 y el test lo cubre, pero no escala
con el número de keywords. Sin índice trigram, límite de keywords, o
precomputado, el endpoint no es usable por HTTP en un periodo completo.

## Límites conocidos

- **El tope de 500 candidatas no es un caso borde: es el caso normal.**
  `LA LIBERTAD` tiene 10,134 obras reales, así que `truncated: true` es la
  respuesta habitual en cualquier departamento mediano, y 500 candidatas son
  ~5% de su obras. El tope está sin calibrar contra el volumen real.
- `departamento` se compara contra el valor canónico uppercase del catálogo
  peruano. El alias de fuente `"P C DEL CALLAO"` se resuelve en la ingesta, no
  en esta query: pasarlo devuelve 0 cruces **sin error** y `truncated: false`
  (medido: 0 cruces en 6,403 ms, frente a 61,971 cruces de `CALLAO`). Un 0 sin
  error y sin `truncated` es indistinguible de "ese departamento no tiene obras".
- La paginación es en memoria sobre un conjunto acotado a 500 obras candidatas,
  pero el array completo de cruces se materializa antes de paginar: `CALLAO`
  2021 construye 61,971 objetos para devolver 200.
- **La recuperación de candidatas no es insensible a acentos.** La query manda
  keywords ya normalizadas sin diacrítico (`%publicas%`), y `ILIKE` es sensible a
  acentos en Postgres: una obra cuyo `nombre_obra` solo difiera del título en la
  acentuación no entra como candidata aunque el scoring en memoria la habría
  empatado. Hoy la entrada la rescued keywords sin acento comunes (`obras`,
  `saneamiento`), pero un título cuyas keywords sean todas variantes acentuadas
  de las de la obra puede quedarse sin candidatas y devolver `total: 0`.
- **La degradación se declara antes que el fast path.** El pool de INFOBRAS se
  resuelve antes de evaluar si el periodo tiene proyectos con keywords, en los
  dos endpoints y en los dos handlers MCP. Sin eso, un periodo vacío con
  `INFOBRAS_DATABASE_URL` ausente devolvía `200` con `total: 0`, que es el estado
  que este contrato declara imposible.
- El score no distingue "puente" de "construcción de puente": es substring.
