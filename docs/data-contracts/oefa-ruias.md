# Data contract — OEFA (Registro Único de Infractores Ambientales Sancionados, RUIAS)

> Ficha técnica del conector: [`docs/conectores.md#infracciones-ambientales`](../conectores.md#infracciones-ambientales).
> Fase 0 + construcción el mismo día (2026-09-06), con foco explícito en La Libertad.

## Fuente confirmada

- **Descarga directa real**: `https://www.datosabiertos.gob.pe/sites/default/files/1a_Registro%20%C3%9Anico%20de%20Infractores%20Ambientales%20Sancionados.csv`
  — confirmado 2026-09-06, 11.5 MB, CSV `;`-delimitado, **UTF-8** (no Latin-1/cp850 como otros
  conectores recientes).
- Diccionario real disponible en el mismo dataset (`.xlsx`), no decodificado en esta pasada —
  los nombres de columna ya son auto-descriptivos.
- **La página del dataset en `datosabiertos.gob.pe` no expone los enlaces via `package_show`**
  (devuelve `result: []` para el slug derivado de la URL) — se resolvió leyendo el HTML crudo de
  la página del dataset y decodificando entidades HTML si las hubiera (no hicieron falta acá,
  a diferencia de MINEDU).

## Schema real confirmado (27 columnas)

```
TIPO_DOC, ID_DOC_ADMINISTRADO, NOMBRE_ADMINISTRADO, NOMBRE_UNIDAD_FISCALIZABLE,
SUBSECTOR_ECONOMICO, DEPARTAMENTO, PROVINCIA, DISTRITO, NRO_EXPEDIENTE, NRO_RD, FECHA_RD,
FECHA_INICIO_SUP, FECHA_FIN_SUP, NRO_RD_MULTA, FECHA_RD_MULTA, DETALLE_INFRACCION,
NORMA_TIPIFICADORA, TIPO_SANCION, TIPO_INFRACCION, MEDIDA_DICTADA, TIPO_RECURSO_IMPUGNATIVO,
ACTO_RESUELVE, FECHA_ACTO, CANTIDAD_MULTA, CANTIDAD_INFRACCIONES, MULTA_EXPEDIENTE, FECHA_CORTE
```

- **14,937 filas nacional** (verificado con parseo real, respetando comillas — un conteo naive
  por salto de línea da 20,645 porque `DETALLE_INFRACCION` contiene texto libre con saltos de
  línea/puntos y comas dentro de comillas).
- **`TIPO_DOC`**: `R.U.C.` (empresa), `D.N.I.` (persona natural — confirmado que sí aparece,
  ej. mineros artesanales sancionados), `OTROS`.
- **Valores vacíos representados como `-`** (no como celda vacía) — el normalizador debe tratar
  `"-"` como `null`, no solo cadena vacía.
- **Números con coma decimal** en `CANTIDAD_MULTA`/`MULTA_EXPEDIENTE` (ej. `"20389,79"`) — hay
  que convertir coma→punto antes de `Number()`.
- **Fechas como enteros `AAAAMMDD`** (ej. `20230518`), no texto con separadores.
- **`DISTRITO` (y a veces `PROVINCIA`) pueden traer varios valores separados por coma en una
  sola celda** (ej. `"Angasmarca, Angasmarca, Mollebamba"`) — una infracción puede abarcar más
  de un distrito. Se ingiere el valor completo tal cual (sin partir), documentado como
  limitación — partir requeriría decidir si duplicar la fila por cada distrito, fuera de
  alcance de esta versión.

## Decisión de PII

`NOMBRE_ADMINISTRADO` se ingiere sin cambios — mismo fundamento legal que
`proveedores-sancionados` (Ley 27806, registro de sanción con efecto público por diseño del
propio OEFA). `ID_DOC_ADMINISTRADO` se **enmascara cuando `TIPO_DOC = 'D.N.I.'`** (últimos 3
dígitos visibles, mismo patrón ya usado en `perfilprov-conformacion`/cruce por DNI de
`proveedores-sancionados`) — para `R.U.C.`/`OTROS` se ingiere completo (identificador de
entidad, no de persona).

## Cobertura real para La Libertad (verificado en vivo, 2026-09-06)

**610 sanciones**, 12 provincias con al menos una sanción, 59 combinaciones de distrito (nota:
incluye combinaciones multi-distrito de la celda original, no 59 distritos únicos limpios).
Por subsector: Minería 248, Industria 152, Hidrocarburos 128, Agricultura 45, Residuos Sólidos
18, Pesquería 8, Electricidad 6, Consultoras Ambientales 5.

## Pendiente / limitaciones conocidas

1. `PROVINCIA`/`DISTRITO` con acentos inconsistentes en algunas filas no verificado a fondo
   (a diferencia de MTC, donde sí se confirmó la duplicación "VIRU"/"VIRÚ").
2. Diccionario de datos (`.xlsx`) no decodificado — las columnas ya son suficientemente
   auto-descriptivas para esta primera versión.
3. Frecuencia real de actualización de la fuente no confirmada más allá de `FECHA_CORTE` (dato
   observado: `20240430` en la corrida de verificación) — el conector siempre descarga el
   recurso "actual" del dataset, sin resolver por fecha.
