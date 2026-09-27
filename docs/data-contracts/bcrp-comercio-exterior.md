# Data contract — BCRP: Comercio Exterior (Exportaciones/Importaciones)

- Fuente oficial: BCRP — Banco Central de Reserva del Perú (BCRPData)
- URL base API: https://estadisticas.bcrp.gob.pe/estadisticas/series/api
- Portal de exploración: https://estadisticas.bcrp.gob.pe/estadisticas/series/mensuales/exportaciones-e-importaciones
- Documentación oficial: https://estadisticas.bcrp.gob.pe/estadisticas/series/ayuda/api
- Owner del conector: `bcrp-comercio-exterior` (app 12)
- Confirmado en vivo el 2026-08-22; **implementado el 2026-08-27** (`apps/bcrp-comercio-exterior/api`).

## Estado: IMPLEMENTADO (agregado nacional) — desagregado departamental no ingerido

**Actualización 2026-08-22 (segunda pasada, re-verificación de frescura):** el bloqueante
original (series `RD38*` estancadas en 2022-2023) se confirmó real, pero **no aplica a toda
la fuente**. El BCRP también publica una serie separada de **comercio exterior agregado
nacional** (`PN38714BM`-`PN38723BM`, 10 series, "Balanza comercial - valores FOB M-BPM6")
que sí está al día: rango Ene-1996/Ene-2012 a **Jun-2026**, última actualización
**13-08-2026**. Validado en vivo con llamada real a
`.../api/PN38714BM-PN38718BM-PN38723BM/json/2026-1/2026-6`: JSON válido, 3 series
(Exportaciones, Importaciones, Balanza Comercial), valores verosímiles (jun-2026:
exportaciones USD 8,906.35M, importaciones USD 5,737.45M, balanza USD 3,168.90M). **No hace
falta buscar otra fuente** — el desagregado departamental (`RD38*`) parece discontinuado,
pero el agregado nacional del mismo BCRP es viable para construir hoy.

A diferencia de todas las demás fuentes del proyecto (MEF, OECE, Invierte.pe, INFOBRAS,
CEPLAN, SUNAT, RNP), el BCRP expone una **API REST pública real, documentada, sin sesión ni
autenticación**, con salida JSON directa — es el conector más simple de construir de todos
si se decide avanzar. La razón por la que sigue como candidato y no como app construida no es
de acceso sino de **vigencia del dato**: las series de comercio exterior por departamento
están estancadas desde 2022-2023 (ver "Cautela principal" abajo), mientras que otras series
del mismo BCRP (macro nacional: IPC, tipo de cambio, PBI) sí están al día a 2026.

---

## Método de acceso

### Sintaxis de la API

```
GET https://estadisticas.bcrp.gob.pe/estadisticas/series/api/{códigos}/{formato}/{periodo_inicial}/{periodo_final}/{idioma}
```

- `{códigos}`: uno o más códigos de serie separados por guion, **máximo 10 por request**.
  Todas las series de un mismo request deben compartir frecuencia (si se mezclan, se usa la
  frecuencia de la primera).
- `{formato}`: `json` (recomendado), también `csv`, `xml`, `xls`, `txt`, `html`.
- `{periodo_inicial}` / `{periodo_final}`: formato depende de la frecuencia de la serie (ej.
  `2020-1`/`2023-12` para series mensuales).
- `{idioma}`: `esp` (default) o `ing`.
- Sin autenticación, sin API key, sin rate limit documentado (no confirmado en vivo; no se
  probó volumen).

### Validado en vivo (2026-08-22)

Dos llamadas reales, ambas devolvieron JSON válido:

1. `GET .../api/PN01271PM/json/2026-1/2026-6` — IPC Lima Metropolitana (var% mensual).
   Respuesta con estructura `config.series[].name`, `periods[].name`, `periods[].values[]`.
   Datos hasta jun-2026 (fuente al día).
2. `GET .../api/RD38085BM/json/2020-1/2023-12` — Exportaciones por departamento (Amazonas,
   FOB millones US$). Respuesta válida, título de serie confirmado
   ("Exportaciones por Departamento (Valores FOB en millones US$) - Amazonas"), valores
   verosímiles (ej. Ene.2020: 0.94, Dic.2022: 6.17).

### Estructura de respuesta JSON (confirmada)

```json
{
  "config": {
    "title": "string",
    "series": [{ "name": "string", "dec": "string" }]
  },
  "periods": [
    { "name": "Ene.2020", "values": ["0.94"] }
  ]
}
```

---

## Series relevantes para comercio exterior (confirmadas por título, vía portal de exploración)

### Exportaciones por departamento (Valores FOB, millones US$, mensual)
- Códigos `RD38085BM` a `RD38111BM` — 27 series, una por departamento peruano.
- Ejemplo: `RD38085BM` = Amazonas.

### Importaciones por aduana (mensual)
- Códigos `RD38112BM` a `RD38136BM` — 25 series, una por aduana.
- Ejemplo: `RD38112BM` = Tumbes.

### Exportaciones por grupo de producto, dentro de cada departamento (mensual)
- 17 series por departamento (rangos contiguos, ej. `RD38137BM`-`RD38153BM` para Amazonas,
  `RD38375BM`-`RD38391BM` para Lima).
- Desagregación por serie: tradicionales (pesca, agrícola, minería, petróleo/gas) y no
  tradicionales (agropecuario, pesquero, textil, químico, etc.), más "otros" y total.

### Comercio exterior agregado nacional — Balanza comercial FOB (mensual, CONFIRMADO FRESCO)

Página: https://estadisticas.bcrp.gob.pe/estadisticas/series/mensuales/balanza-comercial-mill-usd-m-bpm6

| Código | Serie | Rango | Última actualización |
|---|---|---|---|
| `PN38714BM` | Exportaciones | Ene-1996 a Jun-2026 | 13-08-2026 |
| `PN38715BM` | Exportaciones — Productos Tradicionales | Ene-2012 a Jun-2026 | 13-08-2026 |
| `PN38716BM` | Exportaciones — Productos no Tradicionales | Ene-2012 a Jun-2026 | 13-08-2026 |
| `PN38717BM` | Exportaciones — Otros | Ene-2012 a Jun-2026 | 13-08-2026 |
| `PN38718BM` | Importaciones | Ene-1996 a Jun-2026 | 13-08-2026 |
| `PN38719BM` | Importaciones — Bienes de Consumo | Ene-2012 a Jun-2026 | 13-08-2026 |
| `PN38720BM` | Importaciones — Insumos | Ene-2012 a Jun-2026 | 13-08-2026 |
| `PN38721BM` | Importaciones — Bienes de Capital | Ene-2012 a Jun-2026 | 13-08-2026 |
| `PN38722BM` | Importaciones — Otros Bienes | Ene-2012 a Jun-2026 | 13-08-2026 |
| `PN38723BM` | Balanza Comercial | Ene-2012 a Jun-2026 | 13-08-2026 |

Todas en millones US$, todas de frecuencia mensual (caben las 10 en un solo request, bajo el
límite de 10 series por llamada). Sin desagregación territorial ni por producto/partida —
solo el agregado nacional.

---

## Cautela principal — frescura del dato (resuelta para el agregado nacional)

**Las series de comercio exterior por departamento (`RD38*`) terminan en Dic-2022 o
Dic-2023**, con fecha de "última actualización" del portal fechada 18-11-2024 — llevan
~2 años sin refrescarse. Re-verificado en vivo el 2026-08-22 con una query a rango
2023-2026: `periods` vino **vacío**, confirmando que no hay dato posterior a lo ya
observado (no fue un límite del rango consultado la primera vez). **No se confirmó la
causa exacta** (desagregado departamental discontinuado vs. simplemente no
re-publicado) — si en el futuro se quisiera el nivel territorial, re-verificar de nuevo
antes de asumir que sigue congelado.

**El agregado nacional (`PN38714BM`-`PN38723BM`) no tiene este problema** — confirmado
al día hasta jun-2026 (ver arriba). La recomendación de esta ficha es construir sobre el
agregado nacional, no sobre el desagregado departamental.

---

## Granularidad — por qué esta fuente no encaja en el patrón de cruce actual

Todas las apps existentes cruzan por `entity_code`/RUC/CUI (match exacto) o por nombre de
entidad (matcher difuso) — un registro representa una entidad de gobierno, un proveedor, una
obra o un proyecto específico. El BCRP **no publica comercio exterior por empresa, RUC ni
partida arancelaria** — el agregado nacional (`PN38714BM`+, la vía fresca y recomendada) es
un solo número por mes, sin ningún desagregado que cruzar. El desagregado por departamento
(`RD38*`, congelado, no recomendado) sí sería cruzable por `ubigeo`/`departamento` contra
`territories`, pero solo si se decide igualmente ingerirlo pese a estar obsoleto.

Esto lo hace estructuralmente parecido a `ceplan-estrategico` (indicadores agregados, sin
per-entidad ni territorio) más que a `compras-publicas` o `infobras` (registros
transaccionales individuales) — un indicador de contexto macro nacional, no un radar
territorial ni transaccional.

---

## Entidades del modelo canónico (propuesta, no implementada)

### `trade_indicators`
- `id`: UUID
- `series_code`: VARCHAR — código BCRP (ej. `RD38085BM`)
- `series_title`: TEXT — título tal cual lo devuelve la API
- `ubigeo_departamento`: VARCHAR — FK lógica a `territories.departamento`, derivado del
  título de la serie (no viene como campo estructurado — requiere parseo del nombre)
- `category`: VARCHAR — `exportacion_fob` | `importacion` | `producto_tradicional` |
  `producto_no_tradicional`
- `period`: DATE — mes/año del dato (`periods[].name`, ej. "Ene.2020")
- `value`: NUMERIC — millones US$
- `frequency`: VARCHAR — `mensual` (todas las series confirmadas son mensuales)
- `ingested_at`: TIMESTAMPTZ

### `raw_bcrp_batches`
- `id`: SERIAL
- `series_codes`: VARCHAR — códigos solicitados en el request (hasta 10, separados por guion)
- `period_start` / `period_end`: VARCHAR
- `checksum`: TEXT — SHA256 del payload
- `payload`: JSONB — respuesta cruda de la API
- `ingested_at`: TIMESTAMPTZ

---

## Cruces con otras apps (propuesta, no implementada)

### Agregado nacional (`PN38714BM`+, vía recomendada)
- **Sin cruce por entidad ni territorio** — es un indicador macro de contexto (una serie de
  tiempo nacional), no un registro cruzable 1:1. Su uso natural sería como serie de
  referencia junto a los indicadores de `ceplan-estrategico` (mismo tipo de dato: agregado,
  sin per-entidad), no como `crossref` contra `radar-ejecucion`/`compras-publicas`.

### Desagregado departamental (`RD38*`, congelado, no recomendado)
- **Cruce por**: `ubigeo_departamento` — mismo catálogo de `territories` derivado del CSV
  del MEF.
- **Propósito**: contexto de comercio exterior por región, junto a ejecución presupuestal y
  capas geoespaciales de infraestructura (puertos, aeropuertos — relevante para corredores
  logísticos de exportación).
- **Matcher**: exacto por nombre de departamento (no hay código UBIGEO en las series del
  BCRP, solo el nombre en el título — requeriría normalización de texto).
- Solo relevante si en el futuro se re-verifica que el desagregado departamental volvió a
  publicarse.

### Con `radar-inversiones`
- Sin cruce evidente — las inversiones públicas (`SEC_EJEC`) no tienen relación directa con
  series agregadas de comercio exterior privado.

---

## Estrategia de ingesta recomendada (si se decide avanzar)

1. **Re-verificar frescura en vivo** — confirmar si `RD38*` sigue estancado en 2022-2023 o si
   hay códigos más recientes no descubiertos en esta exploración (el buscador de series no se
   pudo consultar programáticamente).
2. **Confirmar códigos de series macro nacionales** (exportaciones/importaciones FOB totales,
   balanza comercial) — pendiente, no se extrajo el código exacto.
3. Si la frescura y los códigos se confirman: conector simple, un script que pagina de a 10
   códigos de serie por request (27 departamentos + 25 aduanas + 17×25 productos por
   departamento supera holgadamente 10, así que sí requiere paginación por lotes, similar en
   espíritu a la paginación de `oece-connector.ts` pero sin necesidad de manejar cursor — son
   rangos de códigos conocidos de antemano).
4. Guardar cada lote crudo en `raw_bcrp_batches` antes de normalizar (mismo patrón que el
   resto del proyecto).

---

## Cautelas generales

1. **Frescura del desagregado departamental sin confirmar** — ver "Cautela principal" arriba,
   es el bloqueante principal antes de construir.
2. **Sin código UBIGEO en las series** — el departamento viene solo como texto en el título
   de la serie, requiere parseo/normalización para cruzar con `territories`.
3. **Máximo 10 series por request** — con ~27+25+425 series relevantes, la ingesta completa
   requeriría cientos de requests secuenciales (sin rate limit documentado, pero tampoco
   confirmado que soporte alta concurrencia).
4. **Rate limiting no documentado** — no se probó volumen en esta exploración; implementar
   backoff conservador si se construye.
5. **Sin API key/autenticación** — a diferencia de fuentes con reverse engineering de sesión
   (RNP, MEF), este es el único caso del proyecto con API pública documentada de verdad.

---

## MVP recomendado

Sí es viable construir, acotado al agregado nacional:

1. **Ingerir solo `PN38714BM`-`PN38723BM`** (10 series, un solo request — cabe bajo el
   límite de 10 por llamada) — exportaciones/importaciones totales y por categoría, balanza
   comercial, mensual, Ene-1996/2012 a la fecha.
2. **No ingerir `RD38*`** (desagregado departamental) salvo que se re-verifique que volvió a
   publicarse — hoy agregaría datos obsoletos (2022-2023) presentados como si fueran
   actuales, lo que sería peor que no tenerlos.
3. Tratarlo como indicador de contexto macro (mismo espíritu que `ceplan-estrategico`), no
   como app con cruces `entity_code` — sin Postgres propio necesariamente, podría vivir como
   un endpoint simple que consulta la API del BCRP al vuelo (similar en filosofía a
   `salud-institucional`, que tampoco tiene base propia), o como tabla mínima
   `trade_indicators` si se prefiere cachear localmente.
