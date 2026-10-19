# Data contract — MINAM (Generación anual de residuos sólidos domiciliarios y municipales)

> Ficha técnica del conector: [`docs/conectores.md#residuos-solidos`](../conectores.md#residuos-solidos).
> Fase 0 + construcción el mismo día (2026-09-06), con foco en La Libertad.

## Fuente confirmada

- **Descarga directa real**: `https://www.datosabiertos.gob.pe/sites/default/files/1.%20Dataset%20Generaci%C3%B3n%20anual%20de%20residuos%20s%C3%B3lidos%20domiciliarios%20y%20municipales.csv`
  — confirmado 2026-09-06, 1.32 MB, CSV `;`-delimitado. **Codificación Latin-1/ISO-8859-1, no UTF-8**
  (corregido 2026-10-19: 0 secuencias multibyte UTF-8 en el archivo; `Ñ` aparece como byte crudo `0xD1`
  414 veces — `BAÑOS`, `FERREÑAFE`, `NEPEÑA`, `CONSTITUCIÓN`…). Los departamentos vienen sin tildes
  (`ANCASH`, `JUNIN`), solo distritos/provincias llevan diacríticos.
  **Bug derivado:** `apps/residuos-solidos/api/src/ingest/residuos-connector.ts:97` hace
  `buffer.toString("utf-8")` → los ~440 bytes no-ASCII se pierden como `U+FFFD`; en la base quedan
  **222 filas / 48 nombres de distrito dañados** (`BA?OS`, `PU?OS`, `FERRE?AFE`). Afecta solo
  etiquetas (las claves `UBIGEO` son numéricas); fix de una línea: `toString("latin1")` + re-ingesta.
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

## Diccionario de datos (decodificado 2026-10-19)

Fuente: [Diccionario de Datos (xlsx)](https://www.datosabiertos.gob.pe/sites/default/files/3.%20Formato_DiccionarioDatos_Generaci%C3%B3n%20anual%20de%20residuos%20s%C3%B3lidos%20domiciliarios%20y%20municipales.xlsx)
y [Metadatos (docx)](https://www.datosabiertos.gob.pe/sites/default/files/2.%20Formato_Metadatos_Generaci%C3%B3n%20anual%20de%20residuos%20s%C3%B3lidos%20domiciliarios%20y%20municipales.docx)
del dataset (`b7fa86e4-f7ec-4c2a-95aa-4feade465b3f`, página
[datosabiertos.gob.pe](https://www.datosabiertos.gob.pe/dataset/generaci%C3%B3n-anual-de-residuos-s%C3%B3lidos-domiciliarios-y-municipales-ministerio-del-ambiente)).
Copias en `investigaciones/residuos-solidos-per-capita-2024/data/fuentes-minam/`.

### Unidades por variable (oficial)

| Variable | Unidad oficial |
|---|---|
| `GENERACION_PER_CAPITA_DOM` | **kg/hab/día** |
| `GENERACION_DOM_URBANA_TDIA` | t/día |
| `GENERACION_DOM URBANA_TANIO` | toneladas/año |
| `GENERACION_MUN_TDIA` | t/día |
| `GENERACION_MUN_TANIO` | toneladas/año |
| `GENERACION_PER_CAPITA_MUNICIPAL` | **kg/hab/día** |

Identidades verificadas contra los datos (2019–2024, 11.310 filas):
`PER_CAPITA_DOM ≈ DOM_URBANA_TDIA × 1.000 / POB_URBANA` (89,9% de filas con
diferencia ≤ 0,011) y `..._TANIO ≈ ..._TDIA × 365` (diferencia relativa mediana 0,32%).
Ambas per cápita se calculan sobre **población urbana**, no total.

### `CLASIFICACION_MUNICIPAL_MEF` (oficial, fuente MEF — Programa de Incentivos a la
### Mejora de la Gestión Municipal)

**NO es una medida de capacidad fiscal**: clasifica por **tamaño de ciudad y
población urbana**. Valores (n nacional 2024 entre paréntesis):

- **A** (74): municipalidades pertenecientes a ciudades principales *(provinciales)*
- **B** (122): municipalidades no pertenecientes a ciudades principales *(provinciales)*
- **C** (42): municipalidad de Lima Metropolitana *(distritales)*
- **D** (129): municipalidades pertenecientes a otras ciudades principales *(distritales)*
- **E** (378): no ciudades principales, con **más de 70%** de población urbana
- **F** (509): no ciudades principales, con población urbana **entre 35% y 70%**
- **G** (637): no ciudades principales, con **menos de 35%** de población urbana

Verificado empíricamente: A+B = 196 provincias; C = 42 distritos limeños; urbanidad
mediana por clase C 99,4% · D 88% · E 84% · F 47% · G 15,5% (consistente con los
umbrales 70%/35%). **Consecuencia analítica:** E/F/G son función determinística del
% urbana → las clases MEF y el control `pct_urbana` son colineales por construcción;
interpretar los contrastes MEF como "efectos de urbanización/tamaño", no de capacidad
presupuestaria.

### Otras notas del diccionario/metadatos

- La GPC domiciliaria **proviene de los estudios de caracterización** hechos por las
  municipalidades (SIGERSOL), no de medición continua → explica la fuerte
  cuantización de la serie (p. ej. el pico en 0,45 kg/hab/día).
- Los residuos domiciliarios son ~70% del total municipal según CEPIS (30% no
  domiciliario: comercio, mercados, barrido, etc.).
- Metadatos oficiales: entidad MINAM, fuente Dirección General de Gestión de
  Residuos Sólidos, actualización **anual**, última actualización 2025-12-18,
  cobertura Perú 2019–2024, contacto `msandoval@minam.gob.pe`.

## Pendiente / limitaciones conocidas

1. ~~Diccionario de datos (`.xlsx`) no decodificado~~ → **resuelto 2026-10-19** (arriba).
2. ~~`CLASIFICACION_MUNICIPAL_MEF` no decodificada~~ → **resuelta 2026-10-19**: es la
   clasificación del Programa de Incentivos MEF por tamaño de ciudad y % urbana
   (ver tabla arriba), no capacidad fiscal.
