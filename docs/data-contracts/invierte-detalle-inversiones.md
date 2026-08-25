# Data contract — MEF: Detalle de inversiones (Invierte.pe / Banco de Inversiones)

> Ficha técnica del conector: [`docs/conectores.md#radar-inversiones`](../conectores.md#radar-inversiones)

- Fuente: Plataforma Nacional de Datos Abiertos — `www.datosabiertos.gob.pe/dataset/detalle-de-inversiones`
  (nota: sin `www.` el dominio no resuelve — mismo patrón que otras fuentes de este proyecto).
- Confirmado en vivo el 2026-08-17.

## Estado: CONFIRMADO

Igual que el presupuesto: **no hay API real**, es descarga de archivo. A diferencia del
presupuesto, el archivo es manejable.

- Archivo: `https://fs.datosabiertos.mef.gob.pe/datastorefiles/DETALLE_INVERSIONES.csv`
- Tamaño: **246MB** (confirmado vía HEAD request) — vs 6-10GB de los archivos de presupuesto.
- Cobertura: 2001–2026, nacional.
- 68 columnas, **una fila por inversión** (CUI) — no requiere agregación como el presupuesto.

## Columnas usadas (de 68 totales — ver `Detalle_Inversiones_Diccionario.csv` para el resto)

| Columna | Tipo | Uso |
|---|---|---|
| `CODIGO_UNICO` | Numérico | CUI — clave primaria natural |
| `NOMBRE_INVERSION` | Carácter | Nombre del proyecto |
| `SEC_EJEC` | Carácter | **Coincide con la clave usada en `radar-ejecucion.entities`** — cruce exacto implementado en `GET /api/crossref` |
| `NOMBRE_UEP` | Carácter | Unidad Ejecutora Presupuestal |
| `ESTADO` / `SITUACION` | Carácter | Estado y situación de la inversión |
| `MONTO_VIABLE` | Numérico | Monto viable original |
| `COSTO_ACTUALIZADO` | Numérico | Costo actualizado — comparar con `MONTO_VIABLE` es la señal defendible que el documento fuente menciona explícitamente ("costo actualizado superior al costo inicial") |
| `DEPARTAMENTO` / `PROVINCIA` / `DISTRITO` / `UBIGEO` | Carácter | **Vienen directos**, a diferencia del presupuesto — no hace falta reconstruir el ubigeo |
| `FUNCION`, `TIPO_INVERSION` | Carácter | Clasificación |
| `FECHA_REGISTRO`, `FECHA_VIABILIDAD` | Fecha | |

## Fila de muestra real (recortada)

```
NIVEL=GL, SECTOR=GOBIERNOS LOCALES, ENTIDAD=MUNICIPALIDAD DISTRITAL DE OLLANTAYTAMBO,
CODIGO_UNICO=2716769, SEC_EJEC=300790, ESTADO=ACTIVO, SITUACION=VIABLE,
MONTO_VIABLE=1853953.5, DEPARTAMENTO=CUSCO, PROVINCIA=URUBAMBA, DISTRITO=OLLANTAYTAMBO
```

## Cautelas

- Mismo patrón de ingesta que el presupuesto (Range requests acotados, `isPartial: true`
  siempre) — ver `mef-connector.ts` de `radar-ejecucion` como referencia. No se conoce el
  orden interno del archivo (no se investigó si está ordenado por departamento); puede
  requerir sondeo de offsets igual que se hizo con el presupuesto y compras públicas.
- No confirmado: si un mismo CUI puede aparecer más de una vez en el archivo completo
  (ej. actualizaciones históricas). El conector trata duplicados dentro de un mismo lote
  como rechazo explícito, no como sobrescritura silenciosa.

## Refresco controlado de La Libertad — 2026-08-24

Se consultó `HEAD` al archivo y se confirmó `Content-Length: 246,344,022`,
`Accept-Ranges: bytes`, `Content-Type: text/csv` y `Last-Modified: Sun, 23 Aug 2026
18:31:51 GMT`.

La actualización local recorrió cinco rangos contiguos (`0–246,344,021`), cada uno
normalizado y filtrado por `DEPARTAMENTO = LA LIBERTAD`. Los cinco rangos nuevos
aceptaron 7,971 filas sin rechazos; la tabla materializada terminó con **7,978 CUI
únicos** de La Libertad (incluye el lote local preexistente).

El campo `isPartial` se conserva por lote, porque cada lote es una solicitud Range.
La corrida conjunta cubrió todos los bytes anunciados por el servidor, pero esto no
autoriza afirmar una certificación independiente del universo administrativo externo:
describe la cobertura del archivo que el MEF expuso en esa fecha.
