# Data contract — MTPE: Empresas en el Sector Privado por distrito

> Ficha técnica: `docs/adr/0021-research-spike-mtpe-empleo-formalizacion.md` (spike + addendum de
> fuente fresca) y `docs/PRD_Actividad_Empresarial_Formal_v1.md` (AE-01, migrado 2026-09-05).

- Fuente oficial: Ministerio de Trabajo y Promoción del Empleo (MTPE) — portal operativo propio
  `https://www2.trabajo.gob.pe/estadisticas/ind-lab-a-nivel-distrital/`, **no** la Plataforma
  Nacional de Datos Abiertos.
- Owner del conector: app `actividad-empresarial` (`src/ingest/mtpe-distrital-connector.ts`).

## Estado: CONFIRMADO Y MIGRADO — conector reescrito y verificado (2026-09-05)

### Por qué se migró desde PNDA

La primera versión de este conector (AE-01 original) ingería el CSV de
`datosabiertos.gob.pe` (dataset `empresas-en-el-sector-privado-por-mes-según-distritos-...`),
cuyo único año disponible confirmado era **2022**. A pedido explícito de verificar si había una
fuente más fresca en otro lugar: **sí la había**. MTPE mantiene su propio portal con la misma
serie ("EMPRESAS_{año}") publicada anualmente **2014-2025**, sin depender de que la republiquen
en la PNDA. El conector se reescribió por completo para apuntar a esta fuente — no es un ajuste,
es un reemplazo total de la lógica de descubrimiento y parseo.

### Flujo de resolución del recurso (tres pasos, tres formatos distintos)

1. **HTML del listado** (`www2.trabajo.gob.pe/estadisticas/ind-lab-a-nivel-distrital/`): cada año
   aparece como un enlace a una publicación de `gob.pe/institucion/mtpe/informes-publicaciones/`.
   No hay un patrón de slug único entre años (`indicadores-laborales-a-nivel-de-distrito-2020` vs.
   `indicadores-a-nivel-de-distrito-2023`) — el conector extrae el año directamente de la URL, no
   del slug, y elige el año más alto encontrado.
2. **HTML de la publicación** de ese año (`gob.pe/institucion/mtpe/informes-publicaciones/...`):
   enlaza el archivo real alojado en `cdn.www.gob.pe/uploads/document/file/...`, **comprimido en
   `.7z`** (no hay versión sin comprimir ni en otro formato).
3. **Archivo `.xlsx` dentro del `.7z`**: un único archivo (`INDICADORES A NIVEL DISTRITAL
   {año}.xlsx`, confirmado ~23 MB para 2025) con **~49 hojas** — el conector solo usa la hoja
   `EMPRESAS_{2 últimos dígitos del año}` (`EMPRESAS_25` para 2025).

### Tres técnicas sin precedente previo en el proyecto

- **Scraping de HTML** para descubrir la URL del recurso (todos los demás conectores del proyecto
  usan una API JSON de CKAN o una URL de archivo directa/predecible).
- **Descompresión `.7z`** — dependencia nueva (`node-7z` + `7zip-bin`, que empaqueta binarios
  `7za` por plataforma, sin depender de un `7-Zip` instalado en el sistema).
- **Parseo de `.xlsx`** — dependencia nueva (`exceljs`). El único conector previo que tocaba un
  formato no-CSV era `pdf-connector.ts` de `bcrp-la-libertad`, y ese es PDF, no Excel.

Mismo requisito de `User-Agent` de navegador que el resto de conectores contra dominios
`gob.pe`/`datosabiertos.gob.pe` — confirmado en vivo que `gob.pe` también devuelve HTTP 418 al
user-agent por defecto.

### Robustez ante cambios de estructura entre años

El conector no asume una posición fija de filas/columnas:
- **Fila de encabezado**: se busca la primera fila cuya columna A contenga "UBIGEO" (confirmada
  en la fila 7 del archivo 2025), no se asume un número de fila fijo.
- **Columnas de mes**: se resuelven por nombre de encabezado (`ENERO`...`DICIEMBRE`, con
  "SETIEMBRE" real, no "SEPTIEMBRE"), no por posición.
- **Año de la hoja**: se confirma buscando "AÑO {año}" en las primeras filas antes de usar los
  datos — si el nombre de la hoja (`EMPRESAS_25`) no coincide con lo que la propia hoja declara,
  el conector falla explícitamente en vez de confiar ciegamente en el nombre.
- **Fin de tabla**: una fila se descarta si su UBIGEO no es puramente numérico (notas al pie,
  fuente, totales) — no se asume un número fijo de filas de datos.

### Cobertura confirmada en vivo (2026-09-05)

**1,510 distritos, año 2025** (18,120 filas tras normalizar a formato largo) — más que los 1,398
de la versión 2022 de PNDA. Trujillo (UBIGEO 130101): 10,660 empresas (dic-2022, versión anterior)
→ 11,928 empresas (dic-2025, versión actual) — trayectoria de crecimiento consistente, no un
salto sospechoso.

### Pendiente, no bloqueante

- No se verificó si los archivos de 2014-2024 mantienen exactamente la misma estructura de hoja
  (`EMPRESAS_{yy}`, mismo encabezado) — el conector solo ingiere el año más reciente en cada
  corrida, no hace backfill histórico. Si se decide ingerir años anteriores, cada uno debe
  verificarse individualmente antes de asumir que el parser genérico funciona igual.
- El archivo trae ~48 hojas adicionales (tamaño de empresa, remuneraciones, trabajadores por
  régimen laboral, pensionistas, etc.) sin explorar — quedan fuera de este ticket.

## Cautelas

- El dataset gemelo de PNDA (`empresas-en-el-sector-privado-por-mes-según-distritos-...`, ver
  versión anterior de este documento en el historial de git) queda completamente reemplazado —
  no se consulta más.
- La descompresión `.7z` requiere espacio en disco temporal (`os.tmpdir()`) y se limpia
  explícitamente al final de cada corrida, exitosa o no (`finally` con `rm recursive`).
