# Data contract — Aduanas-SUNAT (Consulta por Importador/Exportador, FOB)

> Ficha técnica del conector: [`docs/conectores.md#identidad-fiscal`](../conectores.md#identidad-fiscal)

Investigación en vivo: 2026-09-19.

## Por qué existe esta fuente

Se necesitaba volumen/valor exportado por cooperativa en el último año. `directorio base.xlsx`
(archivo del usuario) trae FOB USD y kilos para 2025, pero solo para las cooperativas que
aparecen ahí (586 de 596) y un único año. Se buscó una fuente oficial, consultable por RUC, para
mantener esto actualizado sin depender de archivos externos.

## Fuente

- `http://www.aduanet.gob.pe/cl-ad-itconsultadwh/ieITS01Alias`
- **Solo HTTP, no HTTPS** — el dominio no sirve TLS en este endpoint.
- **A diferencia de `*.sunat.gob.pe` (ficha_ruc, ruc_consulta_masiva), este dominio NO está
  bloqueado para fetch directo desde este entorno de desarrollo** — confirmado en vivo con `curl`
  simple, sin necesidad de navegador ni sesión previa.
- Consulta por querystring GET-like (aunque el form real es POST, `curl`/`fetch` con GET y los
  mismos parámetros funciona igual — probablemente el JSP no valida el verbo HTTP).

## Parámetros de la consulta

```
accion=buscarListadoImpoExpo
CG_consulta=1
indOCE=false
vig001278=F
strMenu=-
CG_tipo=4          # 4 = búsqueda por RUC (vs. por nombre)
CG_Codigo=<RUC>
CG_DNombre=        # vacío cuando se busca por RUC
CG_Aduana=999      # 999 = todas las aduanas
CG_Ano=<año-1992>  # ver "Anomalía real" abajo
CG_Mes=00          # 00 = todo el año
CG_regimen=40      # 40 = exportación definitiva
```

## Anomalía real encontrada — el parámetro de año no es el año calendario

El campo `CG_Ano` del formulario **no** es el año real: hay que restarle 1992. Confirmado
probando varios valores contra resultados conocidos:

| `CG_Ano` enviado | Año real mostrado |
|---|---|
| 26 | 2018 |
| 33 | 2025 |
| 34 | 2026 |

Fórmula: `CG_Ano = añoReal - 1992`. No se investigó el origen de ese offset (probablemente el
sistema legado empezó a operar en 1992 y el dropdown del formulario HTML usa índices relativos,
no el año en sí) — el conector (`exportaciones-fob-connector.ts`) ya aplica esta conversión, no
hay que hacerlo a mano.

Un valor de `CG_Ano` equivocado no da error — devuelve una página válida con
"No se encontraron registros..." (0 filas) o, peor, un año real absurdo (`CG_Ano=2025` literal
dio "TODO EL AÑO 4017"). Si un año nuevo devuelve 0 filas para un RUC que sí debería tener datos,
sospechar primero del offset antes de asumir que el RUC no exportó ese año.

## Schema real confirmado

Tabla HTML con estas columnas visibles: LISTAR DUAS (link), EXPORTADOR, MES (texto en español +
año, ej. "Agosto 2025"), AGENTE, ADUANA, PAÍS, FOB $.

El link "LISTAR" de cada fila llama a `jsDetalleDUA(codRegimen, tipNroDoc, codAduana, codAgente,
codMes, codAnio, codPais)` — estos códigos (numéricos para aduana/agente/mes/año, ISO-2 para país)
son más confiables que parsear el texto visible (nombre de mes en español, texto con relleno de
espacios/bytes nulos) y son los que usa el parser
(`exportaciones-fob-normalize.ts::parseExportacionesFobHtml`).

- **Encoding**: `windows-1252` — se decodifica como `latin1` en el conector (mismo criterio que el
  resto del catálogo para fuentes SUNAT/Aduanas).
- **Campos de texto vienen rellenados con bytes nulos** (`\x00`) hasta un ancho fijo — se limpian
  en el parser.
- **La granularidad real es mes × aduana × agente de aduana × país** — si una cooperativa exportó
  el mismo mes a través de dos DUA distintos al mismo país por la misma aduana/agente, ambos se
  suman en una sola fila (confirmado: no se ve un FOB por DUA individual a este nivel).
- **NO trae kilos ni peso.** Entrar al detalle de un DUA específico (clic en "LISTAR") solo
  muestra Aduana/Año/N° DUA/Fecha de embarque/Canal — tampoco trae peso. Esa granularidad no está
  disponible en este endpoint público.

## Verificado en vivo (2026-09-19)

RUC `20404057805` (ACOPAGRO): 15 filas en 2025 (`CG_Ano=33`), 3 filas en 2026 parcial
(`CG_Ano=34`) — importadas con éxito, 18/18 filas, 0 rechazadas. RUC `20132489824` (Chancamayo):
0 filas en 2025 y 2026 (no exportó, o no encaja en régimen 40 en ese período) — resultado válido,
no error.

## Pendiente / fuera de alcance de este contrato

1. **No se investigó paginación** — la respuesta trajo hasta 32 filas en un solo request sin
   paginar (ACOPAGRO, todo 2018). No se confirmó qué pasa con un exportador de mucho mayor volumen
   (cientos de filas/año) — podría requerir manejar `formPaginacion`/`tamanioPagina`/`pagina`, no
   implementado.
2. **No se investigó rate limiting del lado del servidor** — el conector aplica 400ms de espera
   entre requests por precaución propia, no porque se haya confirmado un límite real.
3. **Kilos/peso no disponible** — para eso, usar los datos ya cargados desde `directorio
   base.xlsx` (`cooperativas-base-extra.json`, campo `Exportación 2025 Kilos (Base)`) o una fuente
   paga (Veritrade, Datamyne).
