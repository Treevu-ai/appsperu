# Estructura del dataset `CARGAS_2010_2017.xlsx` (APN) — VUL-02/VUL-05

> **Ticket:** VUL-02 (inspeccionar) / VUL-05 (documentar), Épica 4 · Índice de Vulnerabilidad
> Portuaria (ver `docs/backlog/backlog-rastro-proyectos.md` y `docs/prd/PRD-004-vulnerabilidad-portuaria.md`).
> **Fecha de inspección:** 2026-10-03.

---

## 1. Origen y acceso

- **URL:** `https://www.datosabiertos.gob.pe/sites/default/files/CARGAS_2010_2017.xlsx`
- **Dataset ID (portal):** `ba073cf0-59c7-4cc4-a212-ef00627594c3`
- **Bloqueo de WAF confirmado en vivo:** una petición HTTP sin cabeceras de navegador (ej.
  `curl` por defecto) recibe `418` con una página de bloqueo de CloudWAF ("访问被拦截").
  Se necesita como mínimo `User-Agent` de navegador real; se usó el mismo patrón que
  `infraestructura-mtc-connector.ts` (`USER_AGENT` tipo Chrome/Windows) y además `Referer`
  apuntando a la página del dataset. Cualquier conector para este archivo debe fijar esas
  cabeceras o fallará en producción.
- **Tipo real de archivo:** `.xlsx` válido (Excel 2007+), 48 KB, 1 sola hoja ("Hoja1").

## 2. Corrección a una suposición del PRD-004

El PRD-004 (§2, pirámide de factibilidad) asumía una granularidad probable de
**"puerto × año × tipo_carga × TM"**. Al inspeccionar el archivo real, **no existe columna de
tipo de carga** (contenedorizada / granel sólido / granel líquido / otros). El dato es un único
total de TM por terminal por año. El modelo de datos de la sección 3 del PRD-004 (columna
`tipo_carga` en `cargas_portuarias_historico`) debe ajustarse: esa columna no se puede poblar
con este archivo.

## 3. Rango de datos útil

- Hoja única `Hoja1`, rango con contenido real: **filas 8 a 107** (columnas B a J). El resto del
  `dimension` reportado por Excel (hasta fila 131) es padding vacío con 2 filas de pie de fuente
  repetidas por error de plantilla.
- **Encabezado (fila 8):** `Terminales Portuarios | Uso | Año 2010 | Año 2011 | ... | Año 2017 | Variación (%)`.
- 8 columnas de año (2010-2017) + 1 de variación porcentual total del periodo. **Nada mensual.**

## 4. Jerarquía de filas (no es una tabla plana)

Hay dos tipos de fila mezclados en la misma columna "Terminales Portuarios":

1. **Filas de agregado** — sin valor en "Uso": `TOTAL GENERAL`, `Maritimo`, `Fluvial`, y una fila
   por cada **puerto o bahía** (ej. `Callao`, `Paita`, `Matarani`, `Talara`). Sus valores de TM son
   la suma de los terminales que le siguen.
2. **Filas de detalle** — con `Uso` = `Público` o `Privado`: el terminal específico dentro de ese
   puerto (ej. bajo `Callao`: `TNM Callao - ENAPU/APM Terminals Callao`, `TP Callao Zona Sur - DP
   World Callao`, `T Multiboyas Refinería La Pampilla - Repsol`).

Un ingest que trate esto como CSV plano sin distinguir ambas capas va a duplicar/triplicar los
totales si suma indiscriminadamente, o va a perder la relación puerto↔terminal si solo toma las
filas de detalle.

## 5. Cobertura por ámbito — gap confirmado

- Solo aparecen **Marítimo** y **Fluvial**. **No hay sección Lacustre** (ningún terminal del
  Titicaca aparece en este anuario 2010-2017).
- Esto deja sin dato de volumen histórico a cualquier terminal lacustre del inventario MTC — el
  índice v2/v3 no podrá incorporar esa variable para ese subconjunto, deberá documentarse como
  limitación heredada, no corregida por este dataset.
- Puertos/bahías cubiertos (nivel agregado): Talara, Paita, Bayóvar, Eten, Chicama, Salaverry,
  Chimbote, Huarmey, Supe, Huacho, Callao, Pisco, San Nicolás, Matarani, Ilo (marítimo); Iquitos,
  Yurimaguas, Pucallpa, Puerto Maldonado (fluvial). 80 filas con datos reales en total
  (agregados + detalle).

## 6. Riesgo real para VUL-11 (join con el inventario MTC)

Los nombres de terminal de este XLSX (ej. `"TP Multiboyas Refinería La Pampilla - Repsol"`,
`"TP Shougan Hierro Perú"`) tienen un estilo de redacción distinto al de `nombre_terminal` en
`terminales_portuarios` (que en los fixtures de prueba del proyecto usa formas como
`"Multipropósito de Salaverry"`). **No se puede asumir un `JOIN` por texto exacto** — VUL-11
debe presupuestar una tabla de mapeo manual/fuzzy por puerto, no una unión directa por nombre.

## 7. Decisión de carga

Se descarga el XLSX en cada ejecución del conector (mismo patrón que
`infraestructura-mtc-connector.ts`: fetch con cabeceras de navegador, checksum guardado en
`raw_infraestructura_mtc_batches`) — **no se versiona el binario en el repo**, siguiendo la
convención ya establecida para los otros datasets de esta app.

## 8. Limitaciones que se mantienen (igual que el PRD-004 ya anticipaba)

| Limitación | Impacto |
|---|---|
| Datos terminan en 2017 (8 años desactualizados) | El índice v2 mejora cobertura pero no frescura — ver VUL-14/15/16 |
| Sin desagregación por tipo de carga | Corrige la suposición del PRD-004 §3 — ese campo no puede poblarse con esta fuente |
| Sin cobertura Lacustre | El índice v2 no mejora el score de terminales lacustres |
| Nombres de terminal no normalizados contra MTC | VUL-11 necesita mapeo manual, no join directo |
| Solo totales anuales, sin mensual | No permite detectar estacionalidad ni caídas abruptas intra-año |
