# Data contract — MINEDU/SíseVe (Listado detallado de casos reportados)

> Ficha técnica del conector: [`docs/conectores.md#violencia-escolar`](../conectores.md#violencia-escolar).
> **Construido y verificado en vivo el 2026-09-21** — app standalone `violencia-escolar` (API
> puerto 4029, Postgres 5460).

Investigación en vivo: 2026-09-21, a pedido explícito de mapear los endpoints del dashboard
público de SíseVe (`siseve.minedu.gob.pe/Web/App/Mapa`).

## Callejón sin salida investigado primero: el dashboard AJAX cifra sus respuestas

El mapa público (`/Web/App/Mapa`) llama a dos endpoints internos:
- `POST /TableroControl/ListarAnio` — lista los años disponibles.
- `POST /TableroControl/ListarDatosMapa` — datos agregados del mapa (`{ANIO: <año>}`).

Ambos devuelven, en producción, un string cifrado con **AES-128-CBC** (vía CryptoJS), no JSON
plano. La clave real se deriva así (replicado y confirmado funcional en Node, sin errores de
padding):

1. La página incluye `<div id="divTheme" data-url="<token>">`. `<token>` es una cadena donde
   los primeros y últimos 8 caracteres son un "candado" (`key1String`/`key2String`), y la parte
   central es la clave real, cifrada.
2. `key1`/`key2` se obtienen sustituyendo cada carácter del candado por un dígito, vía un
   diccionario fijo embebido en el JS (`L→0, G→1, A→2, q→3, t→4, P→5, Z→6, B→7, M→8, S→9`).
3. La clave real se descifra con AES-128-CBC usando `key1+key2` (concatenación de dígitos) como
   clave **y** como IV (CryptoJS: `iv: key`).
4. Esa clave real, del mismo modo (clave = IV), descifra las respuestas de los endpoints.

**Confirmado en vivo**: el token `data-url` es **estático** — idéntico en 3 fetches distintos de
la página, sin cookies de sesión. En principio, esto es reproducible sin autenticación.

**Decisión: no seguir por esta vía.** Aunque técnicamente viable, es una dependencia frágil
(clave hardcodeada del lado cliente, sujeta a cambiar en cualquier deploy de SíseVe sin aviso)
para datos que la misma plataforma expone sin cifrar por otra vía — ver siguiente sección. Se
abandonó tras confirmar la derivación de la clave (el paso de usarla para descifrar una
respuesta real fue bloqueado por el clasificador de seguridad del agente, razonablemente: el
patrón "reconstruir una clave criptográfica desde JS ofuscado" se parece a bypass de control de
acceso, incluso cuando el dato de destino es un dashboard público agregado).

## Fuente real usada — exportación pública sin cifrar

- **Endpoint**: `POST https://siseve.minedu.gob.pe/Web/Inicio/DescargarEXCEL` — sin body, sin
  cookies, sin sesión.
- **Confirmado en vivo 2026-09-21**: reproduce **byte-por-byte** el mismo archivo que descarga
  el botón "Excel" (`#divExcelDescargar`) del dashboard público — verificado comparando el
  archivo bajado por el usuario manualmente contra el bajado por `curl` sin ninguna cabecera de
  sesión.
- **No pasa por la capa de cifrado AJAX** descrita arriba — es una descarga de archivo binario
  (`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), no una
  respuesta JSON de `AjaxService`.
- **Sin WAF detectado** en este endpoint específico (a diferencia de `datosabiertos.gob.pe`, que
  sí bloquea `curl` sin `User-Agent` de navegador con un 418 CloudWAF — SíseVe corre en su propia
  infraestructura, comportamiento distinto).

## Contenido del Excel (confirmado en vivo)

Hoja `BaseCompleta`, 50,639 filas totales (incluye título/notas antes de la cabecera real). La
cabecera real (`FECHA_REPORTE, DRE, UGEL, NIVEL_EDUCATIVO, TIPO_REPORTE, TIPO_VIOLENCIA,
SUBTIPO_VIOLENCIA, TIPO_ESTADO_REPORTE`) está en la fila 6 en el corte verificado — el conector
la busca dinámicamente (primera fila cuya columna A es literalmente `FECHA_REPORTE`), no asume
un número de fila fijo, por si MINEDU agrega o quita una nota en el futuro.

### Sin clave natural — hallazgo real, no un descuido de la fuente

La fuente **no trae número de expediente ni ningún identificador único por caso**. Dos filas con
los 7 mismos valores (misma fecha, misma UGEL, mismo tipo/subtipo) pueden representar dos casos
reales distintos. Confirmado en vivo: hay filas exactamente duplicadas en el archivo real (ej.
dos casos "Personal IE a Escolares"/Sexual/"Tocamientos..." en la misma UGEL Pacasmayo, misma
fecha). El conector **nunca deduplica por contenido** — cada fila se inserta tal cual.

### Snapshot completo, no incremental

El título del reporte declara el rango `DEL 01/01/2024 AL <fecha de hoy>` — cada descarga trae
el histórico completo desde 2024, no solo lo nuevo. El conector trata cada ingesta como un
**reemplazo completo**: inserta un nuevo `raw_siseve_batches`, y `GET /api/casos`/`GET
/api/resumen` filtran siempre a `MAX(source_batch_id)` — mezclar snapshots de corridas distintas
duplicaría casos.

### Sin PII

Sin nombre, DNI, ni identificador de alumno o institución educativa individual — la
granularidad más fina de la fuente es UGEL (225 valores distintos), no colegio.

## Cobertura real ingerida (verificado en vivo, 2026-09-21)

**50,633 filas insertadas, 0 rechazadas.** Rango de fechas: 2024-01-02 a 2026-08-31.

| Tipo de violencia | Casos | % |
|---|---|---|
| Física | 21,425 | 42.3% |
| Psicológica | 19,801 | 39.1% |
| Sexual | 9,407 | 18.6% |

**Hallazgo notable dentro de violencia sexual**: de los 9,407 casos, **4,670 son "Personal IE a
Escolares"** (perpetrados por personal de la institución educativa contra estudiantes) vs.
**4,737 "Entre Escolares"** — prácticamente mitad y mitad, no predominantemente entre pares como
podría asumirse.

Subtipos de violencia sexual (los 6 valores reales de la fuente):

| Subtipo | Casos |
|---|---|
| Tocamientos, actos de connotación sexual o actos libidinosos | 5,989 |
| Hostigamiento sexual | 1,476 |
| Violación sexual | 829 |
| Violencia con fines sexuales a través de medios tecnológicos | 453 |
| Acoso sexual | 353 |
| Acoso sexual a través de medios tecnológicos | 307 |

Top DRE por casos de violencia sexual: Lima Metropolitana (2,513), Piura (615), Arequipa (570),
Junín (439), Ancash (424), **La Libertad (408)**, Loreto (405), Amazonas (400).

**La Libertad** (foco del proyecto): 2,252 casos totales, 408 de violencia sexual, cubriendo las
15 UGELs del departamento — UGEL 03 Trujillo Nor Oeste concentra el mayor volumen (588 casos, 70
sexuales).

## Decisión sobre nivel de detalle expuesto (explícita del usuario, 2026-09-21)

Antes de construir, se preguntó explícitamente al usuario qué nivel de agregación exponer, dado
que con 225 UGELs algunas combinaciones (sobre todo `Sexual`) tienen conteos de 1-2 casos —
riesgo real de exposición indirecta aunque no haya PII directa. Opciones presentadas: (a) solo
hasta DRE, (b) hasta UGEL pero sin desglose sexual, (c) réplica exacta de la fuente (UGEL +
subtipo completo), (d) no construir. **El usuario eligió (c)**, con el argumento de que MINEDU
ya publica esto sin restricción — Rastro no agrega un nivel de exposición nuevo al ya existente.

## Lo que esto habilita

1. **Primera fuente del catálogo sobre violencia escolar** — nada parecido existía antes en
   Rastro.
2. **Candidato de cruce futuro**: por DRE/UGEL contra inspecciones de infraestructura educativa
   (PRONIED, ver `docs/data-contracts/minedu-siagie-trayectoria.md`, sección "No explorado en
   esta pasada") o presupuesto educativo (`radar-ejecucion`, `FUNCION = EDUCACIÓN`) — relacionar
   capacidad de prevención institucional con incidencia real reportada.
3. **Serie temporal por año/mes** — el conector guarda `fecha_reporte` por caso individual, no
   solo un agregado anual; permite analizar tendencia mes a mes si se construye esa vista.

## No explorado en esta pasada

- **Endpoints AJAX cifrados** (`/TableroControl/ListarAnio`, `/TableroControl/ListarDatosMapa`)
  — descartados deliberadamente, ver arriba.
- **`/App/MapaDetalle`** — enlace que arma el propio dashboard al hacer clic en una región del
  mapa (`window.location.href = ".../App/MapaDetalle?filter=" + btoa(JSON.stringify({...}))`),
  no investigado si trae más detalle que el Excel ya usado.
- **Serie histórica pre-2024** — el Excel solo cubre desde 01/01/2024; no se investigó si SíseVe
  tiene un export separado para años anteriores.
