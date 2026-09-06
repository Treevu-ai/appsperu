# Data contract — MEF: Inversiones desactivadas (Invierte.pe / Banco de Inversiones)

> Ficha técnica del conector: [`docs/conectores.md#radar-inversiones`](../conectores.md#radar-inversiones)

- Fuente: Plataforma Nacional de Datos Abiertos —
  `www.datosabiertos.gob.pe/dataset/inversiones-desactivadas`.
- Confirmado en vivo el 2026-09-06.

## Estado: CONFIRMADO

Hallazgo del 2026-09-06: `radar-inversiones` solo ingería `DETALLE_INVERSIONES.csv`
(inversiones `ACTIVO`), sin saber que el MEF publica la mitad desactivada del Banco de
Inversiones como dataset separado. Una muestra amplia de `DETALLE_INVERSIONES.csv` (~27%
del archivo, tres rangos distintos) nunca mostró un `ESTADO` distinto de `ACTIVO`, lo que
llevó a investigar la normativa: la Resolución Directoral N° 001-2019-EF/63.01 y su Anexo
"Criterios para la desactivación de inversiones en el Banco de Inversiones" (jul. 2021)
confirman que existe un estado oficial de desactivación, y que el primer supuesto (numeral
3.1.a) es exactamente *"el proyecto de inversión que se encuentra en fase de Formulación y
que no obtuvo la declaratoria de viabilidad"* — el caso de "declarado no viable" que
`DETALLE_INVERSIONES.csv` nunca expone.

- Archivo: `https://fs.datosabiertos.mef.gob.pe/datastorefiles/INVERSIONES_DESACTIVADAS.csv`
- Tamaño: **~280MB** (más grande que el archivo activo, 246MB) — confirmado vía HEAD.
- Cobertura: histórica, nacional (registros desde el SNIP original).
- Una fila por inversión desactivada.

## Diferencias de esquema con `DETALLE_INVERSIONES.csv` (activo)

**No son el mismo esquema.** Nombres de columna distintos para lo que sería el mismo campo,
y una columna que directamente no existe:

| Columna en `DETALLE_INVERSIONES.csv` (activo) | Columna equivalente aquí | Nota |
|---|---|---|
| `CODIGO_SNIP` | `COD_SNIP` | Nombre distinto, mismo dato |
| `NOMBRE_UEP` | `NOM_UEP` | Nombre distinto, mismo dato |
| `SEC_EJEC` | **no existe** | Una inversión desactivada nunca llegó a tener código de ejecución presupuestal — no es un dato faltante, es estructural. El cruce por `sec_ejec` contra `radar-ejecucion.entities` no aplica a este dataset. |

## Columnas usadas

| Columna | Tipo | Uso |
|---|---|---|
| `CODIGO_UNICO` | Numérico | CUI — puede venir vacío en registros pre-Invierte.pe (proyectos SNIP que nunca llegaron a tener CUI); esas filas se rechazan explícitamente, no se persisten con clave sintética. |
| `NOMBRE_INVERSION` | Carácter | Nombre del proyecto |
| `ESTADO` | Carácter | Ej. `"DESACTIVADO PERMANENTE"` — confirmado en vivo. El MEF **no publica un código de motivo por fila**; los ~15 supuestos del Anexo RD N°001-2019-EF/63.01 explican por qué se desactiva una inversión en general, pero no se puede atribuir un supuesto específico a una fila sin inferencia — Rastro no hace esa inferencia. |
| `SITUACION` | Carácter | Conserva el estado que tenía la inversión **al momento de desactivarse** (`VIABLE`, `EN FORMULACION`, etc.) — no es su estado final, es una foto del pasado. |
| `NUM_HABITANTES_BENEF` | Numérico | Mismo campo oficial que en el archivo activo (ver `invierte-detalle-inversiones.md`). |
| resto | — | Mismos campos y semántica que `DETALLE_INVERSIONES.csv` (`MONTO_VIABLE`, `DEPARTAMENTO`/`PROVINCIA`/`DISTRITO`/`UBIGEO`, `FUNCION`, `TIPO_INVERSION`, `FECHA_REGISTRO`, `FECHA_VIABILIDAD` — estas dos con el mismo sufijo de hora que el archivo activo). |

## Fila de muestra real (recortada)

```
NIVEL=GN, ENTIDAD=MINISTERIO PUBLICO, CODIGO_UNICO=(vacío), COD_SNIP=93,
ESTADO=DESACTIVADO PERMANENTE, SITUACION=VIABLE, DEPARTAMENTO=-MUL.DEP-,
NUM_HABITANTES_BENEF=1
```

## Cautelas

- Mismo patrón de ingesta por Range que el archivo activo — ver
  `invierte-desactivadas-connector.ts`. `isPartial: true` siempre en una corrida acotada.
- Una corrida completa (`run-invierte-desactivadas-full.ts`) para La Libertad, 2026-09-06:
  20,774 filas aceptadas, 1,243 rechazadas (todas por `CODIGO_UNICO` ausente — registros
  SNIP pre-CUI, no un error de parseo).
- No se cruza automáticamente contra `investments` (activas): un CUI no debería aparecer en
  ambas tablas a la vez, pero eso no está verificado — no se afirma sin comprobarlo.
