# Data contract — MINAM (Generación anual de residuos sólidos domiciliarios y municipales)

> Ficha técnica del conector: [`docs/conectores.md#residuos-solidos`](../conectores.md#residuos-solidos).
> Fase 0 + construcción el mismo día (2026-09-06), con foco en La Libertad.

## Fuente confirmada

- **Descarga directa real**: `https://www.datosabiertos.gob.pe/sites/default/files/1.%20Dataset%20Generaci%C3%B3n%20anual%20de%20residuos%20s%C3%B3lidos%20domiciliarios%20y%20municipales.csv`
  — confirmado 2026-09-06, 1.32 MB, CSV `;`-delimitado, **UTF-8**.
- Datos alimentados por SIGERSOL (Sistema de Información para la Gestión de Residuos Sólidos),
  reportados anualmente por municipalidades provinciales/distritales al MINAM.

## Schema real confirmado (18 columnas)

```
FECHA_CORTE, UBIGEO, ANIO, DEPARTAMENTO, PROVINCIA, DISTRITO, REGION_NATURAL,
TIPO_MUNICIPALIDAD, POB_TOTAL_INEI, POB_URBANA_INEI, POB_RURAL_INEI,
CLASIFICACION_MUNICIPAL_MEF, GENERACION_PER_CAPITA_DOM, GENERACION_DOM_URBANA_TDIA,
"GENERACION_DOM URBANA_TANIO" (espacio en vez de guion bajo — literal así en la fuente),
GENERACION_MUN_TANIO, GENERACION_MUN_TDIA, GENERACION_PER_CAPITA_MUNICIPAL
```

- **11,310 filas nacionales**, **serie histórica 2019-2024** (6 años) — a diferencia de la
  mayoría de fuentes recientes del catálogo (snapshot único), este dataset permite ver
  evolución temporal por distrito.
- **`(UBIGEO, ANIO)` es clave única confirmada** (0 colisiones en 11,310 filas) — más simple que
  el hash de contenido que requirieron RUIAS/PVD.
- **`UBIGEO` pierde el cero inicial para departamentos 01-09** en la fuente (ej. Amazonas trae
  `"10101"`, no `"010101"`) — mismo problema ya documentado en `seguridad-ciudadana`/SIDPOL. Se
  reconstruye a 6 dígitos con padding en la normalización. **La Libertad (departamento 13) nunca
  tiene este problema** (confirmado: `130101`, `130102`... ya vienen con 6 dígitos).
- **`FECHA_CORTE` en formato `DDMMAAAA`** (ej. `"18122025"` = 18 de diciembre de 2025) — **no es
  el mismo formato `AAAAMMDD`** que usan RUIAS/PVD; confirmado porque los primeros 4 dígitos no
  forman un año válido. Hay que decodificar con cuidado de no asumir el formato de otros
  conectores recientes.
- Números con punto decimal (no coma, a diferencia de RUIAS).
- Sin dato de persona natural: población agregada por distrito, generación agregada — ningún
  campo de nombre/identidad.

## Cobertura real para La Libertad (verificado en vivo, 2026-09-06)

**500 filas** (todas las combinaciones distrito×año, 2019-2024), 12 provincias representadas.

## Pendiente / limitaciones conocidas

1. Diccionario de datos (`.xlsx`) no decodificado — las columnas ya son suficientemente
   auto-descriptivas.
2. `CLASIFICACION_MUNICIPAL_MEF` (valores observados: `A`, `F`, ...) no decodificada a su
   significado — se ingiere tal cual.
