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
consultar". La distinción es deliberada.

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
(`legislativo_congreso/001_init.sql`, `infobras/001`–`005`) y datos de prueba.
No mocks.

| Caso | Resultado |
|---|---|
| Las 22 columnas de `public_works` y las 8 de `legislativo_congreso_proyectos` existen | ✅ contrastadas contra `information_schema` |
| `ILIKE %obras públicas%` encuentra "Construcción de obras públicas" | ✅ `matchScore 0.571`, `matchedKeywords` con 4 keywords |
| Filtro `departamento` (mayúsculas) | ✅ `LA LIBERTAD`→OBR-001/002, `LIMA`→OBR-004, sin cruce cruzado |
| `periodo` parametrizado (antes hardcodeado 2026) | ✅ 2026→1001/1002, 2025→2001 |
| `NUMERIC` de Postgres viene como string y se convierte | ✅ `montoViable 1500000.5`, `avanceFisicoRealPct 45.5` |
| `truncated` con 523 obras | ✅ `truncated: true`, exactamente 500 cruces |
| Sin `INFOBRAS_DATABASE_URL` | ✅ **503** en ambos endpoints |
| 400 departameto vacío / 404 proyecto inexistente | ✅ |
| Paginación `limit=1` | ✅ `total 2`, `hasMore true` |

**Lo que NO cubre esta verificación:** los datos eran sintéticos. Falta correr
las ingestas reales (14,868 proyectos del Congreso + XLSX nacional de INFOBRAS)
para confirmar volumen, tiempo de respuesta y `truncated` con las 25 regiones
reales. El ticket sigue sin ese evidencia.

## Límites conocidos

- `departamento` se compara contra el valor canónico uppercase del catálogo
  peruano. El alias de fuente `"P C DEL CALLAO"` se resuelve en la ingesta, no
  en esta query: pasarlo devuelve 0 cruces sin error.
- La paginación es en memoria sobre un conjunto acotado a 500 obras candidatas.
- El score no distingue "puente" de "construcción de puente": es substring.