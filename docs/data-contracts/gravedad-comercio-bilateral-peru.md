# Data contract — Panel de gravedad del comercio bilateral peruano

> No es un conector nuevo: es un análisis derivado que cruza tablas ya
> ingeridas por [`bcrp-comercio-exterior`](../conectores.md#bcrp-comercio-exterior).
> No agrega ninguna fuente externa nueva ni tabla en Neon.

Investigación en vivo: 2026-10-18. Código y datos completos en
[`investigaciones/gravedad-comercio-bilateral-peru/`](../../investigaciones/gravedad-comercio-bilateral-peru/).

## Por qué existe este documento

El panel de análisis (`data/raw/panel_bilateral_peru_2015_2024.json`) es un
JOIN de 5 tablas con convenciones de código distintas entre sí (códigos
numéricos CEPII en `baci_flujos`, ISO3 en `geodist_diadas` y
`gravity_acuerdos`, ISO3 en `wdi_indicadores`). Este documento fija esas
convenciones para que el panel se pueda regenerar o extender sin repetir el
trabajo de depuración ya hecho (ver sección "Trampas encontradas").

## Tablas de origen (Neon, `bcrp_comercio_exterior`)

| Tabla | Columnas usadas | Clave | Convención de país |
|---|---|---|---|
| `baci_flujos` | `anio, exportador, importador, hs6, valor_miles_usd` | `(anio, exportador, importador, hs6, vintage)` | Código numérico CEPII (Perú = 604) |
| `baci_paises` | `country_code, country_name, iso3` | `(country_code, vintage)` | Código numérico CEPII → ISO3 |
| `wdi_indicadores` | `pais_iso3, indicador_codigo, anio, valor` | — | ISO3 (Banco Mundial) |
| `geodist_diadas` | `iso_o, iso_d, dist, contig, comlang_off, colony, comcol` | `(iso_o, iso_d)` | ISO3 (CEPII GeoDist) |
| `gravity_acuerdos` | `anio, iso3_o, iso3_d, fta_wto, rta_coverage` | `(anio, country_id_o, country_id_d, vintage)` | ISO3 (CEPII Gravity) |

**Todo el panel se vincula por ISO3**, no por el código numérico CEPII de
BACI — por eso `baci_flujos` pasa siempre por `baci_paises` antes de unirse
a cualquier otra tabla.

## Dos paneles espejo: exportaciones e importaciones

`data/raw/panel_bilateral_peru_2015_2024.json` (exportaciones,
`exportador=604`) y `data/raw/panel_bilateral_peru_importaciones_2015_2024.json`
(importaciones, `importador=604`) comparten exactamente el mismo esquema y
universo de socios — solo cambia qué lado del flujo de `baci_flujos` se
agrega. El join con `baci_paises` también cambia de lado: para
importaciones se une por `exportador` (el país que le vende a Perú), no por
`importador`.

## Esquema del panel final (`data/raw/panel_bilateral_peru_2015_2024.json`)

| Campo | Tipo | Origen | Notas |
|---|---|---|---|
| `anio` | int | `generate_series(2015,2024)` | Panel balanceado: todo socio tiene una fila por año, exista o no comercio |
| `socio_iso3` | text | `geodist_diadas.iso_d` | Universo de socios = todo ISO3 con distancia conocida desde Perú (224 códigos) |
| `socio_nombre` | text | `baci_paises.country_name` | `DISTINCT ON (iso3)` — **ver trampa #1** |
| `exporta_usd_total` | numeric | `SUM(baci_flujos.valor_miles_usd) * 1000`, todos los HS6 | `0` (no `NULL`) si no hay fila en BACI ese año |
| `exporta_usd_sin_commodities` | numeric | ídem, excluyendo HS26/HS71/HS27 | Ver sección "Filtro de commodities" |
| `gdp_socio` | numeric | `wdi_indicadores`, `NY.GDP.MKTP.CD` | `NULL` si el Banco Mundial no publica PBI para ese país-año (ej. Corea del Norte) |
| `dist` | numeric | `geodist_diadas.dist` | Distancia ponderada por población, en km |
| `contig, comlang_off, colony, comcol` | int (0/1) | `geodist_diadas` | Dummies CEPII |
| `tiene_acuerdo` | int (0/1) | `gravity_acuerdos` | `1` si `fta_wto` o `rta_coverage` no es NULL para ese par-año |

## Convenciones y decisiones de diseño

### Ceros reales, no datos faltantes

La ausencia de una fila en `baci_flujos` para un par (año, socio) significa
**cero comercio ese año**, no dato faltante. El panel se construye con un
`CROSS JOIN` de años × socios y `COALESCE(..., 0)` sobre el valor
exportado — a propósito, para que PPML explote esta información (ver
Santos Silva & Tenreyro, 2006, en `paper/`). No usar `exporta_usd_total = 0`
como señal de "sin datos": sí hay datos, es un cero genuino.

### Filtro de commodities (HS26, HS71, HS27)

`exporta_usd_sin_commodities` excluye los capítulos arancelarios:

- **HS26** — minerales y concentrados (ej. cobre sin refinar)
- **HS71** — perlas, piedras y metales preciosos (ej. oro semi-manufacturado)
- **HS27** — combustibles minerales (petróleo, gas natural licuado, carbón)

Juntos son ~56% del valor exportado total de Perú en 2015-2024. El filtro
se aplica a **todas** las exportaciones, no solo a países específicos — ver
`paper/` sección 4.3 para la justificación completa (no es cherry-picking
por país).

### Lista de hubs de reexportación

`HUBS_REEXPORTACION` en `scripts/estimar_gravedad.py` = `NLD, BEL, SGP, HKG,
PAN, ARE`. Es una lista fija, tomada de la literatura de comercio
(Róterdam-Amberes-Singapur-Hong Kong-Panamá-Dubái), **no derivada de los
residuos de este dataset** — ver `paper/` sección 4.4. Si se extiende este
análisis, esta lista no debe ajustarse para "mejorar" el resultado; cualquier
cambio debe justificarse de forma independiente del ajuste del modelo.

## Trampas encontradas (para no repetirlas)

1. **`baci_paises` tiene códigos CEPII duplicados por ISO3.** `BEL`, `DEU` y
   `SDN` tienen 2 `country_code` cada uno (divisiones históricas). Un `LEFT
   JOIN` directo contra `baci_paises` por `iso3` duplica filas. Solución:
   `SELECT DISTINCT ON (iso3) iso3, country_name FROM baci_paises WHERE
   vintage='202601' ORDER BY iso3, country_code` antes de unir.
2. **`geodist_diadas` trae una fila `PER-PER`** (distancia interna, no cero).
   Si no se excluye explícitamente (`iso_d <> 'PER'`), Perú aparece como su
   propio "socio" con exportación cero, contaminando el universo de socios.
3. **El PBI/población de Perú (reportador) no se incluye como regresor.** No
   varía entre socios dentro de un mismo año — es perfectamente colineal con
   los efectos fijos de año de cualquier modelo que se estime sobre este
   panel (matriz de diseño rank-deficient si se incluye).

## Cómo reproducir

```bash
cd investigaciones/gravedad-comercio-bilateral-peru
python scripts/estimar_gravedad.py        # reestima las 3 especificaciones
jupyter nbconvert --to notebook --execute --inplace notebook/gravedad_comercio_peru.ipynb
```

La extracción SQL completa (el `CROSS JOIN` + los 5 `LEFT JOIN`) está
documentada como comentario en `scripts/estimar_gravedad.py` y en la
primera celda de código del notebook.
