# Data contract — SUNAT (Ficha individual de RUC)

> Ficha técnica del conector: [`docs/conectores.md#identidad-fiscal`](../conectores.md#identidad-fiscal)

Investigación en vivo: 2026-09-18.

## Reemplaza al Directorio Nacional de Cooperativas (PRODUCE)

Este contrato reemplaza a `docs/data-contracts/produce-cooperativas.md` (eliminado). El directorio
de PRODUCE quedó desactualizado: RUC `20129156083` (COOP AGRARIA CAFET VALLE RIO APURIMAC) traía
como gerente a "Zamalloa Bravo, Hernán" en PRODUCE, mientras que SUNAT registra a **Ochoa Rua
Timoteo** como Gerente General desde el 23/02/2023 — decisión del usuario del proyecto,
2026-09-18: usar la ficha individual de SUNAT como fuente de verdad para representante legal y
demás datos de la cooperativa, no PRODUCE.

## Fuente

- `https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp` (formulario
  de búsqueda por RUC).
- Resultado en `https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/jcrS00Alias`.
- Sub-consulta "Representante(s) Legal(es)": mismo dominio, botón dentro del resultado.

## Anomalía real encontrada — reCAPTCHA v3 server-side, sin conector `fetch()` posible

El formulario de búsqueda carga `sunatrecaptcha3.js` (Google reCAPTCHA v3, invisible) y un campo
oculto `token` en el POST hacia `jcrS00Alias`. Se probó en vivo si el backend realmente valida ese
token (no solo lo pide en el HTML):

```
POST jcrS00Alias
accion=consPorRuc&razSoc=&nroRuc=20404057805&nrodoc=&token=&contexto=ti-it&modo=1&rbtnTipo=1
```

Respuesta: página de error del servidor ("Surgieron problemas al procesar la consulta por número
de ruc"), no un resultado. Inmediatamente después, **el mismo IP de origen quedó bloqueado**
(`net::ERR_CONNECTION_RESET`) específicamente contra `e-consultaruc.sunat.gob.pe` — confirmado que
`sunat.gob.pe` raíz y otros dominios seguían respondiendo normal desde el mismo origen, así que no
fue una falla de red general, fue un bloqueo dirigido a ese subdominio tras el intento sin token
válido.

**Se probó también con Playwright (Chromium headless) desde el mismo entorno** — mismo resultado,
`net::ERR_CONNECTION_RESET`, confirmando que el bloqueo es por IP/origen, no por el mecanismo de
request usado.

**Conclusión de arquitectura**: no existe un conector automatizado tipo `fetch()`/`unzipper` para
esta fuente, a diferencia de todo el resto del catálogo del proyecto. Las consultas reales que
funcionaron (ver abajo) se hicieron vía navegador real (sesión de Chrome del usuario, no de un
entorno de servidor/sandbox) — canal completamente distinto, no afectado por el bloqueo. La carga
a la base es manual: `npm run import:ficha-ruc -- <archivo.json>` a partir de texto ya extraído por
navegador, ver `ficha-ruc-import.ts`.

## Schema real confirmado — ficha principal

Confirmado en vivo contra 2 RUC reales (`20129156083`, `20404057805`):

```
Número de RUC: <ruc> - <razón social>
Tipo Contribuyente:
Nombre Comercial:
Fecha de Inscripción:              (DD/MM/YYYY)
Fecha de Inicio de Actividades:    (DD/MM/YYYY)
Estado del Contribuyente:
Condición del Contribuyente:
Domicilio Fiscal:
Sistema Emisión de Comprobante:
Actividad Comercio Exterior:       (ej. "EXPORTADOR")
Sistema Contabilidad:
Actividad(es) Económica(s):        Principal - <CIIU> - <descripción>
                                    Secundaria N - <CIIU> - <descripción>  (0 o más)
Comprobantes de Pago c/aut. de impresión (F. 806 u 816):   (lista)
Sistema de Emisión Electrónica:    (lista, cada línea con fecha embebida en texto libre)
Emisor electrónico desde:          (DD/MM/YYYY)
Comprobantes Electrónicos:         (texto libre resumen)
Afiliado al PLE desde:             (DD/MM/YYYY)
Padrones:                          (lista, o "NINGUNO")
```

El texto viene con líneas en blanco insertadas de forma inconsistente entre la etiqueta y su
valor (a veces pegado, a veces con una línea vacía en medio) — el parser (`ficha-ruc-normalize.ts`)
ancla por las etiquetas conocidas y toma todo el texto hasta la siguiente etiqueta, no por posición
fija de línea, precisamente por esta inconsistencia.

## Sub-consulta "Representante(s) Legal(es)" — formato tabular sin delimitador en texto plano

```
Documento Nro. Documento Nombre Cargo Fecha Desde
DNI 28703600 OCHOA RUA TIMOTEO GERENTE GENERAL 23/02/2023
```

`body.innerText` de una tabla HTML pierde los límites de columna — no hay separador fiable entre
"nombre" y "cargo" en texto plano. Se resuelve con una lista cerrada de cargos societarios
conocidos (`GERENTE GENERAL`, `PRESIDENTE`, `APODERADO`, etc. — terminología estándar de RUC/
Registros Públicos peruanos, no inventada) que se usa como sufijo para partir la cadena; si el
texto no termina en ninguno de esos cargos, se conserva completo en `nombre` y `cargo` queda
`NULL` — decisión explícita de no adivinar un corte arbitrario para casos no cubiertos por la
lista.

## Pendiente / fuera de alcance de este contrato

1. **No se consultaron los 139 RUC del universo conocido** (extraído del directorio de PRODUCE
   antes de eliminarlo, ver `src/ingest/cooperativas-ruc-seed.json`) — solo 1 fila real fue
   consultada e importada durante esta investigación (`20129156083`), más una segunda ficha
   principal revisada sin importar (`20404057805`). Cargar el resto requiere repetir la consulta
   por navegador para cada RUC restante.
2. **Sub-secciones no investigadas**: la ficha real expone más botones/links además de
   "Representante(s) Legal(es)" — "Información Histórica", "Deuda Coactiva", "Omisiones
   Tributarias", "Cantidad de Trabajadores y/o Prestadores de Servicio", "Actas Probatorias",
   "Facturas Físicas", "Establecimiento(s) Anexo(s)", "Reactiva Perú: Deuda en cobranza coactiva",
   "Programa de garantías COVID_19: Deuda en cobranza coactiva". Ninguna de estas se probó en vivo
   — no hay schema confirmado para ellas, no se implementó nada al respecto.
3. **El monto exportado y las declaraciones juradas NO están en esta ficha ni en ninguna fuente
   pública** — protegidos por reserva tributaria (Código Tributario, art. 85). La ficha solo
   confirma el estatus binario "EXPORTADOR", nunca un monto.
