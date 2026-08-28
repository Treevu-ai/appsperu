# Data contract — BCRP Sucursal Trujillo: Síntesis de Actividad Económica de La Libertad

> Ficha técnica: `docs/adr/0014-bcrp-la-libertad-sintesis-economica-ingesta-manual.md`.
> Owner del conector: app `bcrp-la-libertad` (`apps/bcrp-la-libertad/api`).

- Fuente oficial: Banco Central de Reserva del Perú (BCRP), Sucursal Trujillo, Departamento de
  Estudios Económicos. Reporte mensual **"LA LIBERTAD: Síntesis de Actividad Económica"**,
  distinto de `bcrp-comercio-exterior` (agregado nacional, API JSON en
  `estadisticas.bcrp.gob.pe`, sin WAF).
- **Confirmado en vivo el 2026-08-28**: descarga manual del PDF de enero 2026 por el usuario
  (`docs/sintesis-la-libertad-01-2026.pdf`), lectura completa, spike técnico de parseo con
  `pdf-parse` v2.

## Estado: PARCIALMENTE CONFIRMADO — acceso bloqueado, contenido y 7/10 anexos sí parseables

### Acceso — bloqueado para herramientas automatizadas

URL predecible: `https://www.bcrp.gob.pe/docs/Sucursales/Trujillo/{AÑO}/sintesis-la-libertad-{MM}-{AÑO}.pdf`
(confirmada por indexación de buscador para varios meses/años, 2014–2026).

`bcrp.gob.pe` está detrás de un WAF **Incapsula** con challenge JS. Confirmado bloqueado:

- `curl` directo → HTML de "Pardon Our Interruption" (`Content-Type: text/html`, HTTP 200).
- `curl` con cookie-jar en dos pasadas (patrón que a veces basta si solo falta la cookie de
  sesión) → sigue bloqueado.
- `WebFetch` → redirige a la home del sitio.
- El navegador real del usuario **sí** carga el PDF sin problema — confirma que el bloqueo es
  el challenge JS (que solo un navegador real resuelve), no un problema de red/IP como el que
  tuvo `infobras` con `infobras.contraloria.gob.pe` (ese se resolvió corriendo la ingesta desde
  otra máquina; acá no hay máquina sin navegador que lo resuelva).

**Conclusión**: no hay descarga automatizable con las herramientas disponibles en este
proyecto. La ingesta es manual — alguien descarga el PDF con su navegador y lo pasa a
`npm run ingest:pdf -- <ruta>`.

### Contenido — estructura confirmada

Portada: `"LA LIBERTAD: Síntesis de Actividad Económica\n{Mes} {Año}"` (ej. "Enero 2026") — de
ahí se deriva el período del reporte, no de las etiquetas de mes de cada tabla (que no
distinguen año).

10 secciones `ANEXO N` (`ANEXO 1` a `ANEXO 10`, formato de encabezado inconsistente entre
"ANEXO N", "ANEXO Nº 0N", "ANEXO N° N" — el parser usa una regex flexible), cada una una tabla
de indicador × 13 columnas mensuales (12 meses previos + el mes del reporte):

| Anexo | Título | Unidad |
|---|---|---|
| 1 | Producción agropecuaria | TM |
| 2 | Producción pesquera | TM |
| 3 | Producción minera | Onzas troy |
| 4 | Producción manufacturera (índice) | Índice 1994=100 |
| 5 | Producción manufacturera (variación %) | % |
| 6 | Crédito | Millones de soles |
| 7 | Tasa de morosidad | % |
| 8 | Depósitos | Millones de soles |
| 9 | Importaciones por el Puerto de Salaverry | Millones US$ FOB |
| 10 | Ejecución del presupuesto público, según tipo de gasto | Millones de soles |

### Extracción de texto — spike técnico con `pdf-parse` v2

`getTable()` (detección automática de tablas) **falla** en las páginas densas de este reporte
(devuelve filas casi vacías) — descartado.

`getText()` sí funciona, pero el layout interno del PDF no es uniforme entre anexos:

**Formato A (Anexos 1, 2, 3, 5, 6, 8, 10 — funciona limpio)**: cada valor mensual es su propio
campo separado por `\t`, con el label repetido al final de la fila:

```
I. GASTOS CORRIENTES \t459 \t425 \t415 \t433 \t479 \t485 \t531 \t484 \t446 \t510 \t473 \t810 \t559 \tI. GASTOS CORRIENTES
```

15 campos al separar por tab: `[label, v1..v13, label]`. Trivialmente parseable.

**Formato B (Anexos 4, 7, 9 — NO se ingiere)**: un solo tab tras el label, luego los 13
valores separados por espacio simple, sin distinguir de forma confiable dónde termina un valor
y empieza el siguiente cuando un valor usa espacio como separador de miles:

```
1512-15 Harina y Aceite de Pescado \t391 0 0 134 490 1 383 0 0 0 1318 539 391 1512-15 Harina y Aceite de Pescado
```

Acá "1 383" es **un** valor (1383), no dos ("1" y "383") — pero partiendo por espacios en
blanco no hay forma de saberlo sin conocer las posiciones x/y originales del PDF (que
`getText()` no preserva). Intentar adivinar (ej. "un token de 1-3 dígitos después de otro
token numérico se funde con el anterior") arriesgaría corromper datos reales de forma
silenciosa — se decidió **no ingerir estos 3 anexos** en vez de arriesgar eso. Ver
ADR-0014, sección "Alternativas consideradas".

**Jerarquía repetida dentro del ANEXO 10**: las etiquetas "Gobierno nacional", "Gobierno
regional" y "Gobiernos locales" se repiten 6 veces cada una en este anexo — una vez por cada
categoría de gasto (I. Gastos Corrientes, Remuneraciones, Bienes y Servicios, Transferencias,
II. Formación Bruta de Capital, Gasto No Financiero Total). El texto extraído no preserva
indentación, así que la jerarquía se reconstruye por **orden secuencial**: a cada aparición de
esas 3 etiquetas se le asigna como `seccion` la última fila de datos que no fue una de ellas
(su categoría padre inmediata). Sin esto, el `UNIQUE (anexo_numero, indicador, periodo_anio,
periodo_mes)` original pisaba las 6 apariciones de "Gobierno nacional" entre sí en el upsert —
bug encontrado y corregido el 2026-08-28 (ver ADR-0014); el esquema final incluye `seccion` en
la clave única.

### Corte verificado (enero 2026, `docs/sintesis-la-libertad-01-2026.pdf`)

- 650 filas ingeridas en 7 anexos (`1`:13, `2`:78, `3`:26, `5`:39, `6`:65, `8`:104, `10`:325).
- Anexo 10 (ejecución presupuestal), enero 2026: gasto no financiero total = **S/ 757
  millones** — coincide exactamente con el texto narrativo del reporte ("la ejecución
  presupuestal del gasto no financiero (S/ 757 millones) disminuyó 7,7 por ciento
  interanual"). Diciembre 2025 = S/ 1,349 millones — confirma que el separador de miles ("1
  349") se parseó correctamente como un solo valor, no como dos.

## Implicaciones para cruces con el ecosistema

| Entidad destino | Clave disponible | Viabilidad |
|---|---|---|
| `radar-ejecucion` (MEF) | Ninguna clave exacta — BCRP agrega por nivel de gobierno (GN/GR/GL), sin `SEC_EJEC` ni CUI por fila | No — solo lectura conjunta descriptiva, como el resto de cruces sin clave del proyecto (ej. `actividad-agraria ↔ radar-ejecucion`) |
| `radar-inversiones` | Ninguna | No — BCRP reporta agregados, no proyectos individuales |
| Análisis territorial | Departamento fijo (La Libertad, es el alcance completo del reporte) | Sí — todo el dataset es de un solo departamento por diseño |

## Riesgos de ingesta

1. **Sin descarga automatizable** — riesgo operativo real: si nadie descarga el PDF un mes,
   ese mes queda sin dato, sin forma de recuperarlo por API después (aunque el histórico del
   BCRP sigue disponible manualmente).
2. **Formato de tabla no uniforme dentro del mismo PDF** — 3 de 10 anexos usan un layout
   distinto que el parser actual no soporta.
3. **Sin confirmar estabilidad entre ediciones** — solo se probó con el PDF de enero 2026;
   otros meses podrían tener page counts, orden de anexos, o layouts de tabla ligeramente
   distintos. `ingestPdf` falla ruidosamente (excepción, no fila silenciosa) si no encuentra el
   período de portada o ningún encabezado `ANEXO N`.
4. **API no oficial en el sentido de que el PDF no es un contrato de datos** — es un reporte
   de lectura humana; cualquier cambio de diseño del documento (aunque sea visual) puede romper
   el parser.
