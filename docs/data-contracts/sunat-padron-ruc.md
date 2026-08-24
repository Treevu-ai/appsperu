# Data contract — SUNAT (Padrón Reducido RUC)

> Ficha técnica del conector: [`docs/conectores.md#identidad-fiscal`](../conectores.md#identidad-fiscal)

Investigación en vivo: 2026-08-20.

## Fuente confirmada

- **Descarga directa (sin login, sin SOL key):**
  `https://www2.sunat.gob.pe/padron_reducido_ruc.zip`
- Página de referencia: `https://orientacion.sunat.gob.pe/padron-reducido-del-ruc-para-descarga`
  y `https://www.sunat.gob.pe/descargaPRR/mrc137_padron_reducido.html`.
- **Se actualiza diariamente**: `Last-Modified` observado 2026-08-20 07:38 UTC contra una
  consulta hecha el mismo día — mejor frecuencia de refresco que MEF/INFOBRAS (que se ingieren
  como snapshot puntual, no diario).
- Headers confirmados: `200 OK`, `Content-Type: application/zip`, `Content-Length: 390,910,816`
  bytes (~373 MB comprimido), `Accept-Ranges: bytes`, servido vía Cloudflare — sin restricción
  de origen ni rate limit observado en la descarga.

## Descarga confirmada (2026-08-20)

- Archivo dentro del ZIP: `padron_reducido_ruc.txt`, **1,566,116,804 bytes (~1.5 GB)
  descomprimido**, un solo archivo.
- **18,342,483 filas** (incluye encabezado).
- **Formato**: texto plano delimitado por `|` (pipe), **encoding ISO-8859-1 / Latin-1** (no
  UTF-8 — los caracteres con tilde vienen como `RAZ�N`, `CONDICI�N`, etc. bajo lectura UTF-8
  ingenua; hay que decodificar explícitamente como Latin-1 en el parser).

## Schema real confirmado — 15 columnas

```
RUC|NOMBRE O RAZÓN SOCIAL|ESTADO DEL CONTRIBUYENTE|CONDICIÓN DE DOMICILIO|UBIGEO|TIPO DE VÍA|
NOMBRE DE VÍA|CÓDIGO DE ZONA|TIPO DE ZONA|NÚMERO|INTERIOR|LOTE|DEPARTAMENTO|MANZANA|KILÓMETRO
```

- `UBIGEO` viene en formato **INEI de 6 dígitos** (ej. `130111`), el mismo formato que ya usa
  `territories.ubigeo` en `radar-ejecucion` — cruza directo, sin geocodificación adicional.
- `ESTADO DEL CONTRIBUYENTE`: valores reales observados (muestra de 100k filas) — `ACTIVO`
  (50.9%), `BAJA DE OFICIO` (40.2%), `BAJA DEFINITIVA` (6.2%), `SUSPENSION TEMPORAL` (1.7%),
  `BAJA MULT.INSCR. Y O` (0.9%), `BAJA PROV. POR OFICI` (0.2%), `ANULACION - ERROR SU` (marginal).
- `CONDICIÓN DE DOMICILIO`: `HABIDO` / `NO HABIDO` / `PENDIENTE` / `NO HALLADO...` (varias
  variantes de "no encontrado").

## Anomalía real encontrada — el campo UBIGEO no está poblado uniformemente

**Primer muestreo (naive, 500k filas del medio del archivo): 0 filas con `UBIGEO` poblado.**
Esto casi descarta la fuente para el caso de uso de geolocalización — pero es un artefacto de
muestreo, no una limitación real del dataset:

- El archivo mezcla personas naturales (RUC empieza con `10`) y personas jurídicas/empresas
  (RUC empieza con `20`, entre otros prefijos). **Para personas naturales, `UBIGEO` y todos los
  campos de dirección vienen vacíos (`-`)** — consistente con no exponer domicilio de personas
  naturales en un padrón público, tiene sentido de privacidad.
- **Para personas jurídicas (RUC-20), `UBIGEO` sí está poblado: 299,639 de 300,000 filas
  muestreadas (99.9%).** Confirmado además con una fila real conocida: `PROYECTO ESPECIAL
  CHAVIMOCHIC` (RUC `20156058719`) trae `UBIGEO=130111` (distrito de Trujillo), dirección real
  (`AV. JUAN JULIO GANOZA`, urbanización `CALIFORNIA`), estado `ACTIVO`, condición `HABIDO`.
- **Implicación para el conector**: el caso de uso de este proyecto (cruzar con proveedores de
  `compras-publicas` y entidades de `radar-ejecucion`/`infobras`) es casi 100% RUC-20 —
  gobiernos, municipalidades, empresas contratistas. La cobertura real de `UBIGEO` para esa
  población es la que importa, y es alta. **No filtrar ni descartar la fuente por el hallazgo
  inicial de "0% poblado" — era un sesgo de muestra, no un defecto del dato.**

## Lo que esto habilita (validado contra el schema real, 2026-08-20)

**Confirmado: `compras-publicas` SÍ trae RUC, ya en el dato, sin cruce adicional.**
`awards.supplier_id` viene como `PE-RUC-<11 dígitos>` (ej. `PE-RUC-20100027021` →
`UNIMAQ S.A.`) — es literalmente el RUC del proveedor con el prefijo OCDS estándar de Perú.
De una muestra de 242 adjudicaciones, **187 (77.3%) traen RUC de 11 dígitos válido**; el 21.1%
restante (51 casos) son mayormente `CONSORCIO...` con un `supplier_id` interno más corto que no
es RUC estándar — esos no cruzan por esta vía, siguen dependiendo del matcher difuso.
`awards.buyer_id`/`procurement_processes.buyer_id`, en cambio, vienen como
`PE-CONSUCODE-<código>` — **no es RUC**, es un identificador interno de OSCE/CONSUCODE.

**Confirmado: `radar-ejecucion.entities` NO trae RUC.** Su `entity_code` es un código propio
del MEF (`entity_code`, `nombre`, `nivel_gobierno`, `sector`, `ubigeo` — sin RUC). Mismo patrón
hereda `infobras` (usa `codigo Entidad`, no RUC — ver
`docs/data-contracts/infobras-obras-publicas.md`).

**Implicación real, sin inflar el alcance:**

1. **Cruce exacto por RUC** — funciona para el **lado proveedor** de `compras-publicas`
   (77.3% de cobertura ya, sin construir nada adicional del lado OCDS). **No reemplaza** el
   matcher difuso para el lado entidad (`buyer`/gobierno regional o municipal) en ningún cruce
   — ese lado nunca tuvo RUC para empezar, en ninguna de las 5 apps.
2. **Proveedores con estado tributario irregular que ganaron contratos públicos** — cruzar
   `estado del contribuyente` (`BAJA...`, `SUSPENSION TEMPORAL`) y `condición de domicilio`
   (`NO HABIDO`) contra `awards.supplier_id`. Hallazgo de vigía verificable y nombrable, listo
   de construir con el 77.3% de proveedores que sí tienen RUC limpio.
3. **Domicilio fiscal fuera de la región que ejecuta la obra** — aplica solo al **proveedor**
   (empresa contratista), no a la entidad ejecutora. Usando `UBIGEO` de la empresa (RUC-20,
   99.9% de cobertura) vs. el `departamento`/`provincia` de la obra en
   `infobras`/`radar-inversiones`/`procurement_processes`. Validado como viable.

## RUC del lado entidad (gobiernos/municipalidades) — validado con matices (2026-08-20)

Pregunta directa: ¿se puede resolver también el RUC del lado entidad (`radar-ejecucion.entities`,
`infobras`), que hoy no tiene RUC en ningún campo? Respuesta corta: **sí, en principio — toda
entidad pública peruana es persona jurídica y tiene su propio RUC en este mismo padrón** — pero
**no es gratis como el lado proveedor**, requiere un paso de matching, no una lectura directa.

Tres casos reales probados:

| Entidad en `radar-ejecucion` | Búsqueda exacta que funcionó | RUC | Ubigeo |
|---|---|---|---|
| PROYECTO ESPECIAL CHAVIMOCHIC | nombre exacto, primer intento | `20156058719` | `130111` (Trujillo) |
| MUNICIPALIDAD PROVINCIAL DE ASCOPE | nombre exacto, primer intento | `20187052221` | `130201` (Ascope) |
| MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION - HUAMACHUCO | **falló 2 veces** (con "DE", con "HUAMACHUCO") antes de encontrar la forma real: `MUNICIPALIDAD PROVINCIAL SANCHEZ CARRION` (sin "DE") | `20141897935` | `130901` (Huamachuco) |

El tercer caso es la evidencia real de por qué esto no es un lookup directo: el nombre que usa
`radar-ejecucion` (`... - HUAMACHUCO`, agregando la capital de provincia) no coincide con la
razón social oficial en SUNAT (`MUNICIPALIDAD PROVINCIAL SANCHEZ CARRION`, sin el "DE" que sí
llevan otras municipalidades como Ascope). Encontrarlo tomó 3 intentos y una pista lateral (un
sindicato registrado con el nombre correcto de la municipalidad en su propia razón social).

**Implicación para construir esto**: no es un cruce automático — es un trabajo de matching que
reutiliza el matcher difuso ya construido (`matchEntities`, patrón `confirmada`/`candidata` de
`compras-publicas/src/crossref/match.ts`), pero probablemente necesita reglas de normalización
nuevas que el matcher actual no tiene (quitar "DE", manejar el patrón "nombre de provincia +
capital de provincia" que usa MEF y que SUNAT no usa). Una vez resuelto, cada `entity_code` de
`radar-ejecucion`/`infobras` tendría un RUC autoritativo — habilitando chequeo de estatus
tributario a nivel de entidad (no solo proveedor) y cruces exactos por RUC entre las apps del
lado MEF, que hoy solo cruzan por nombre difuso.

## Distribución real por tipo de RUC (escaneo completo de las 18,342,483 filas)

| Prefijo RUC | Filas | % | Interpretación |
|---|---|---|---|
| `10` | 15,446,014 | 84.2% | Personas naturales — sin `UBIGEO` poblado, fuera del caso de uso |
| **`20`** | **2,339,313** | **12.75%** | **Empresas/personas jurídicas — `UBIGEO` poblado al 99.9%, es donde vive todo proveedor/entidad del Estado** |
| `15` | 463,337 | 2.5% | No domiciliados sin RUC (categoría especial) |
| `17` | 93,790 | 0.5% | Otra categoría especial de contribuyente |
| `00` / otros | 30 | ~0% | Ruido/artefactos de formato, despreciable |

**Decisión de alcance resuelta con esto**: ingerir solo RUC-20 reduce el volumen de ingesta de
18.3M a 2.3M filas (-87%) sin perder nada del caso de uso real — es exactamente la población
donde está poblado el `UBIGEO` y donde están los proveedores/entidades que interesa cruzar con
`compras-publicas`/`radar-ejecucion`/`infobras`. Ingerir el universo completo sería ~8x más
trabajo por datos (personas naturales sin domicilio) que no aportan al caso de uso.

## Pendiente antes de construir el conector

1. ~~Confirmar si `compras-publicas`/`radar-ejecucion` exponen RUC~~ — RESUELTO 2026-08-20:
   `compras-publicas.awards.supplier_id` sí (77.3% de cobertura real), `radar-ejecucion.entities`
   no (ningún lado-entidad de las 5 apps tiene RUC).
2. ~~Decisión de alcance de ingesta (universo completo vs. filtrado)~~ — RESUELTO: filtrar a
   RUC-20 en el parser (ver tabla arriba).
3. No se ha investigado aún si existe un `Padrón reducido de local Anexo` (mencionado en la
   página de descarga, URL relativa sin confirmar) que traiga ubicaciones adicionales por RUC
   (sedes/sucursales) — relevante si una empresa tiene domicilio fiscal en Lima pero sede
   operativa en La Libertad.
