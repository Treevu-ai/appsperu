# Data contract — CENARES (Seguimiento de Distribución de Medicamentos)

> Ficha técnica del conector: [`docs/conectores.md#servicios-salud`](../conectores.md#servicios-salud)

Investigación en vivo: 2026-09-19.

## Fuente

- `datosabiertos.gob.pe` (Plataforma Nacional de Datos Abiertos), dataset
  `seguimiento-de-distribución-de-medicamentos-del-centro-nacional-de-abastecimiento-en-0`,
  publicado por CENARES (Centro Nacional de Abastecimiento de Recursos Estratégicos en Salud,
  MINSA).
- Resuelto vía `package_show` de CKAN (`@appsperu/ckan-client`, mismo cliente que RENIPRESS) — un
  único recurso CSV, sin fecha en el nombre del archivo (a diferencia de RENIPRESS, que sí la
  trae y obliga a elegir "el más reciente" entre varios).
- Requiere `User-Agent` de navegador real — el WAF (CloudWAF) de `datosabiertos.gob.pe` devuelve
  HTTP 418 sin él (mismo hallazgo ya documentado para RENIPRESS/INFOMIDIS, ADR-0018/ADR-0021).

## Cómo se llegó a esto

Investigación exploratoria sobre "disponibilidad de medicamentos en hospitales públicos" — se
evaluaron 3 fuentes: el Observatorio de Disponibilidad de SISMED (descartado, ver
`sismed-observatorio-disponibilidad.md`), el Observatorio de Precios de DIGEMID (es sobre precio,
no stock — no ingerido), y este dataset de CENARES, que sí resultó automatizable sin fricción.

## Schema real confirmado — 18 columnas

```
ESTRATEGIA;META;CODMEF;DESTINO;CODIGOSISMED;CODIGOSIGA;ITEM;CANTIDAD;NROCD;OBSERVACION;
REFERENCIA;FECHACREACION;SITUACION;PENDIENTE;NROPECOSA;FECHAPECOSA;ESTADODESPACHO;REFRIGERADO
```

- **Encoding Latin-1**, no UTF-8 — confirmado en vivo (tildes/Ñ corrompen bajo lectura UTF-8
  ingenua). Distinto de RENIPRESS (UTF-8 con BOM) pese a ser el mismo portal — no asumir encoding
  uniforme entre datasets de `datosabiertos.gob.pe`.
- **`DESTINO`** es el establecimiento/entidad receptora en texto libre (ej. `"GOB. REG. DE LA
  LIBERTAD - SALUD JULCAN"`, `"REGION LA LIBERTAD-SALUD SANCHEZ CARRION"`) — sin UBIGEO ni código
  estructurado. Cruzar contra `ipress` (RENIPRESS) requeriría matching difuso, no exacto.
- **`FECHACREACION`/`FECHAPECOSA`**: `dd/mm/aaaa`, muchas veces vacías (`FECHAPECOSA` casi siempre
  vacía en la muestra real — consistente con que la mayoría de filas nunca llegó a generar PECOSA,
  ver anomalía abajo).
- **`CANTIDAD`**: numérica, entera en la práctica pero se guarda como `NUMERIC` por seguridad (no
  se descartó que algún ítem use decimales, ej. insumos fraccionables).

## Anomalía real encontrada — parseo naive corrompe 120 filas

Antes de construir el conector, se probó extraer conteos con `awk -F';'` directo sobre el CSV
crudo (sin parser CSV real) para explorar la distribución de `SITUACION`. Resultado del `awk`
naive: una categoría espuria de 120 filas con el valor completo
`" LA LIBERTAD , ANCASH, AMAZONAS , LAMBAYEQUE-PRIORIZAR DE URGENCIA)"` en la columna que debía
ser `SITUACION` — texto que en realidad pertenece a `OBSERVACION` de esas filas, con `;` (y
probablemente comas dentro de comillas) que el split naive no respeta.

Con `csv-parse` real (`relax_column_count: true`, respeta comillas), esas 120 filas se clasifican
correctamente: el conteo real de `SITUACION = 'ELABORANDO PECOSA'` sube de 50,284 (conteo naive)
a **50,404** (conteo real, verificado en la tabla ya ingerida). **Lección para cualquier
exploración rápida con `awk`/`grep` sobre un CSV con campos de texto libre: usar solo para
verificación aproximada, nunca como fuente de verdad de un conteo — el parser real puede diferir.**

## Anomalía real encontrada — el dataset documenta gestión interna, no entrega confirmada

Distribución real de `SITUACION` (59,039 filas, verificado post-ingesta):

| Situación | Filas | % |
|---|---|---|
| ELABORANDO PECOSA | 50,404 | 85.4% |
| (vacío) | 8,146 | 13.8% |
| ENVIADO A ALMACEN | 335 | 0.6% |
| DEVUELTO A MONITOREO | 134 | 0.2% |
| ELABORANDO CUADRO | 20 | 0.03% |

**"ELABORANDO PECOSA"** es un estado de trámite interno (preparando la orden de salida de
almacén, PECOSA = Pedido Comprobante de Salida), no una entrega confirmada al establecimiento.
Solo el 0.6% de las filas llegó al estado "ENVIADO A ALMACEN". **Implicación real: este dataset
mide el flujo de gestión/trámite de CENARES, no la disponibilidad final en el establecimiento de
salud** — no usarlo para afirmar "se entregaron X medicamentos a Y hospital" sin filtrar
explícitamente por `SITUACION` y comunicar esa limitación.

## Pendiente / fuera de alcance de este conector

1. **Sin cruce con `ipress`** — `destino` es texto libre, no hay UBIGEO ni código de
   establecimiento en este dataset. Un cruce futuro sería fuzzy-match por nombre, no exacto.
2. **Sin verificar si hay una versión más reciente del dataset en otro dataset/portal** — el
   propio dataset dice cubrir "durante del 2024" en su descripción; no se investigó si CENARES
   publica cortes posteriores (2025-2026) en un dataset separado.
3. **`CODMEF`/`CODIGOSISMED`/`CODIGOSIGA`** se ingieren tal cual como texto — no se validaron
   contra ningún catálogo de códigos MEF/SISMED/SIGA real (fuera de alcance de esta primera
   ingesta).
