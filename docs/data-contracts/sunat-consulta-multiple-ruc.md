# Data contract — SUNAT (Consulta Múltiple de RUC)

> Ficha técnica del conector: [`docs/conectores.md#identidad-fiscal`](../conectores.md#identidad-fiscal)

Investigación en vivo: 2026-09-18.

## Por qué existe esta fuente además de la ficha individual y el padrón reducido

El padrón reducido (`contribuyentes`, 2.3M filas) trae solo 8 campos. La ficha individual
(`ficha_ruc`) trae muchos más campos pero exige un token de reCAPTCHA v3 validado en servidor —
confirmado que bloquea el IP de origen tras un intento fallido (ver
`docs/data-contracts/sunat-ficha-ruc.md`).

Buscando una alternativa se encontró un **tercer servicio oficial de SUNAT**, la "Consulta
Múltiple de RUC", vinculada desde `gob.pe/13397-consultar-el-estado-de-hasta-100-numeros-de-ruc`.
Probada en vivo con 2 RUC reales (ACOPAGRO, Chancamayo): **funciona sin reCAPTCHA, sin captcha de
ningún tipo visible**, y trae 23 campos por RUC — más que el padrón reducido, casi tantos como la
ficha individual (le faltan representantes legales, comprobantes electrónicos y PLE, pero suma
campos que ninguna de las otras dos fuentes tiene: Buen Contribuyente, Agentes de
Retención/Percepción IGV).

## Fuente

- Formulario: `https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsmulruc/jrmS00Alias`
- Hasta **10 RUC por ingreso manual** (un campo de texto + botón "Añadir", repetido) o **hasta
  100 RUC por archivo .txt subido** (un RUC por línea, comprimido en .zip según la página de
  `gob.pe`, aunque en la prueba real el .txt plano sin comprimir también fue aceptado por la
  variante de ingreso manual — la variante de archivo no se probó todavía, ver pendientes).
- Al enviar, genera un **.zip descargable** (nombre tipo `RM<timestamp>.zip`) con un único .txt
  delimitado por `|`, **encoding Latin-1** (igual que el padrón reducido — confirmado: "Ñ"/"°"
  llegan corruptos bajo lectura UTF-8 ingenua).
- El formulario tiene un campo oculto (token, no reCAPTCHA) — protección CSRF estándar, no
  bloqueante para un flujo de navegador normal.

## Anomalía real encontrada — este sandbox de desarrollo está bloqueado para todo el dominio

Se intentó automatizar esta fuente con una conexión HTTP directa (`curl`) desde el mismo entorno
de desarrollo que ya había sido bloqueado por SUNAT tras la prueba fallida contra la ficha
individual (ver `sunat-ficha-ruc.md`). Resultado: **`net::ERR_CONNECTION_RESET` contra
`e-consultaruc.sunat.gob.pe` en cualquier endpoint de ese dominio**, no solo el de la ficha
individual — confirma que el bloqueo es a nivel de dominio/origen para este entorno, no específico
de un endpoint. La consulta múltiple **sí funcionó sin problema vía navegador real** (misma
distinción que ya se documentó: sesión de usuario real vs. entorno de desarrollo/automatización).

**Implicación:** no se pudo verificar en este entorno si un conector `fetch()` puro (sin
navegador) funcionaría contra este endpoint desde un origen "limpio" (no bloqueado). El código de
importación (`ruc-consulta-masiva-import.ts`) asume que el archivo `.txt` ya fue descargado por
fuera (vía navegador) — no intenta automatizar la descarga en sí.

## Schema real confirmado — 23 columnas (+ 1 columna vacía final por el `|` de cierre)

```
NumeroRuc|Nombre-RazonSocial|Tipo de Contribuyente|Profesion u Oficio|Nombre Comercial|
Condicion del Contribuyente|Estado del Contribuyente|Fecha de Inscripcion|
Fecha de Inicio de Actividades|Departamento|Provincia|Distrito|Direccion|Telefono|Fax|
Actividad de Comercio Exterior|Principal-CIIU|Secundario 1-CIIU|Secundario 2-CIIU|
Afecto Nuevo RUS|Buen Contribuyente|Agente de Retencion|Agente de Percepcion VtaInt|
Agente de Percepcion ComLiq|
```

- `-` es el sentinela de campo vacío (igual convención que el resto del catálogo).
- `Actividad de Comercio Exterior` viene como texto libre con relleno de espacios (`"IMPORTADOR/EXPORTADOR" `
  con ~100 espacios de padding en la muestra real) — se hace `trim()` en el parser.
- CIIU viene como **descripción en texto**, no como código numérico (a diferencia de la ficha
  individual, que sí trae el código CIIU de 4 dígitos junto a la descripción) — no hay forma de
  cruzar por código exacto contra esta fuente, solo por texto.

## Verificado en vivo (2026-09-18)

RUC `20404057805` (ACOPAGRO) y `20132489824` (Chancamayo) — ambos coinciden en identidad (razón
social, ubicación) con lo ya conocido de otras fuentes. Importados con éxito: `2/2 aceptados, 0
rechazados`.

## Pendiente / fuera de alcance de este contrato

1. **No se probó la variante de archivo (hasta 100 RUC de una sola vez)** — solo el ingreso
   manual (hasta 10). Antes de usarla para las 596 cooperativas en batches de 100, hay que
   confirmar en vivo el formato exacto que espera (extensión, si debe ir comprimido en .zip como
   dice la página de `gob.pe` o basta el .txt plano, y el nombre del campo del formulario para el
   `multipart/form-data`).
2. **No se determinó si esta fuente también tiene protección anti-abuso más allá del token CSRF**
   (por ejemplo, límite de consultas por sesión) — solo se probaron 2 RUC en una sola sesión, no
   se estresó con volumen.
3. **CIIU en texto, no en código** — si se necesita cruzar por código CIIU exacto contra otra
   fuente, esta tabla no sirve para eso; usar `ficha_ruc_actividades` (que sí trae el código).
