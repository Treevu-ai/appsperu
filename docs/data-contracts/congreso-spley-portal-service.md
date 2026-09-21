# Data contract — Congreso de la República: `spley-portal-service` (Proyectos de Ley)

- Fuente oficial: Congreso de la República del Perú — Sistema de Proyectos de Ley (SPLEY)
- URL base API: `https://api.congreso.gob.pe/spley-portal-service`
- Portal de exploración (frontend Angular): `https://wb2server.congreso.gob.pe/spley-portal/`
- Owner del conector: ningún conector construido todavía — este documento cierra el ticket **ADS-15** (`docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`); la ingesta real es **LEG-01** (`docs/PRD_Inteligencia_Legislativa_Congreso_v1.md`).
- Confirmado en vivo el 2026-09-21 (dos pasadas: hallazgo inicial del endpoint durante la investigación de adscritos, y esta verificación completa de contrato con `curl`).

## Estado: CONTRATO CONFIRMADO — fuente pública, sin auth, sin estado de sesión

**Conclusión de ADS-15, con evidencia real**: la fuente es **(a) automatizable vía `fetch()`/`curl` directo**, sin necesidad de cookies, tokens generados por JavaScript, fingerprinting de navegador, ni ningún otro estado de sesión — el criterio de reproducción con cliente no-browser (mismo que se exigió en DEU-01 para el MEF) se cumplió sin fricción: un `curl` con solo `User-Agent`+`Content-Type: application/json` recibe la respuesta completa real.

Esto contrasta directamente con `mef.gob.pe` (Incapsula WAF, bloquea incluso `curl` con `User-Agent` de navegador — ver `docs/PRD_Deuda_Publica_MEF_v1.md`) y confirma que no todos los dominios gubernamentales peruanos están igual de protegidos: `api.congreso.gob.pe` corre detrás de un API gateway Kong sin protección anti-bot activa contra requests bien formados.

---

## Método de acceso

### Endpoint principal — listado de proyectos de ley

```
POST https://api.congreso.gob.pe/spley-portal-service/proyecto-ley/lista-con-filtro?pageSize=<N>&page=<P>&rowStart=0
Content-Type: application/json

{
  "perParId": <entero, REQUERIDO>,
  "perLegId": null,
  "comisionId": null,
  "estadoId": null,
  "grupParId": null,
  "tipoFirmanteId": null,
  "congresistaId": null,
  "texto": null,
  "fechaPresentacion": null,
  "numeroProyecto": null
}
```

**Verificado en vivo 2026-09-21** con `curl` puro (sin cookies, sin sesión de navegador). Comando exacto usado para cada caso, con la respuesta real capturada:

**Caso 1 — `perParId=2021` (periodo 2021-2026)**

```bash
curl -s -X POST "https://api.congreso.gob.pe/spley-portal-service/proyecto-ley/lista-con-filtro?pageSize=100000&page=1&rowStart=0" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  -H "Content-Type: application/json" \
  -d '{"perParId":2021,"perLegId":null,"comisionId":null,"estadoId":null,"grupParId":null,"tipoFirmanteId":null,"congresistaId":null,"texto":null,"fechaPresentacion":null,"numeroProyecto":null}'
```

`HTTP 200`, `Content-Length: 8786237` bytes. `data.proyectos.length` = **14,864** — coincide exactamente con el conteo citado por el informe de investigación competitiva y es cercano al del repo de terceros `unimauro/congreso-abierto-peru` (que reportó 14,704 en una fecha anterior, diferencia consistente con nuevas presentaciones desde entonces). Primeros 2 registros reales de la respuesta (de 14,864):

```json
[
  {
    "perParId": 2021,
    "pleyNum": 14864,
    "proyectoLey": "14864/2025-CR",
    "desEstado": "PRESENTADO",
    "fecPresentacion": "2026-07-22T00:00:00.000-05:00",
    "titulo": "PROYECTO DE LEY QUE RESTITUYE LA COMPETENCIA DE LA JURISDICCIÓN ORDINARIA SOBRE LOS PROCESOS PENALES SEGUIDOS CONTRA MILITARES Y POLICÍAS",
    "desProponente": "Congreso",
    "autores": "Luque Ibarra, Ruth; Bazán Narro, Sigrid Tesoro; Paredes Piqué, Susel Ana María",
    "codTipoParl": "C",
    "codTipoParlActual": "C",
    "rowsTotal": 0
  },
  {
    "perParId": 2021,
    "pleyNum": 14863,
    "proyectoLey": "14863/2025-PE",
    "desEstado": "PRESENTADO",
    "fecPresentacion": "2026-07-20T00:00:00.000-05:00",
    "titulo": "PROYECTO DE LEY QUE MODIFICA LA LEY N.° 27943, LEY DEL SISTEMA PORTUARIO NACIONAL, A FIN DE OTORGAR LA FACULTAD DE EJECUCIÓN COACTIVA A LA AUTORIDAD PORTUARIA NACIONAL",
    "desProponente": "PODER EJECUTIVO",
    "autores": "",
    "codTipoParl": "C",
    "codTipoParlActual": "C",
    "rowsTotal": 0
  }
]
```

**Hallazgo adicional sobre `pageSize`**: se probó el mismo cuerpo con `pageSize=2` en la URL y la respuesta trajo igualmente los 14,864 registros completos — **el parámetro `pageSize` no está siendo respetado por el backend en las pruebas realizadas** (o requiere un mecanismo de paginación distinto no descubierto en esta pasada). LEG-01 debe verificar esto de nuevo antes de asumir paginación real; por ahora, la única evidencia es que una sola llamada trae el dataset completo del periodo.

**Caso 2 — `perParId=2026` (periodo 2026-2031, recién iniciado)**

```bash
curl -s -X POST "https://api.congreso.gob.pe/spley-portal-service/proyecto-ley/lista-con-filtro?pageSize=5&page=1&rowStart=0" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  -H "Content-Type: application/json" \
  -d '{"perParId":2026,"perLegId":null,"comisionId":null,"estadoId":null,"grupParId":null,"tipoFirmanteId":null,"congresistaId":null,"texto":null,"fechaPresentacion":null,"numeroProyecto":null}'
```

`HTTP 200`, `data.proyectos.length` = **4** — el periodo está activo y ya tiene datos, aunque mínimos por ser nuevo.

**Caso 3 — `perParId` faltante (`{}`)**

```bash
curl -s -X POST "https://api.congreso.gob.pe/spley-portal-service/proyecto-ley/lista-con-filtro?pageSize=5&page=1&rowStart=0" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  -H "Content-Type: application/json" \
  -d '{}'
```

`HTTP 400`, respuesta real (truncada, campo `errors` es lo relevante):

```json
{
  "code": 400,
  "status": "Validation failed for argument [0] in public pe.gob.congreso.core.librarycommon.global.models.Respuesta pe.gob.congreso.app.spleyportalservice.endpoints.expediente.controller.ProyectoLeyController.getListWithFilters(...): [Field error in object 'filtroProyecLeyDto' on field 'perParId': rejected value [null]; ... default message [Ingrese el periodo]] ",
  "errors": [{"field": "perParId", "message": "Ingrese el periodo"}],
  "timestamp": "2026-09-21T11:57:05.428-05:00"
}
```

Confirma que `perParId` es el único campo obligatorio de `FiltroProyecLeyDto` — el resto acepta `null` sin error.

**Caso 4 — `perParId` con valor inexistente**

Probado con `99999`, y con los años `2016`/`2011`/`2006` y los enteros `1`-`7` (hipótesis de que `perParId` fuera un ID secuencial en vez de un año) — mismo comando que el Caso 1/2 cambiando solo `perParId`. **Todos** devuelven `HTTP 200` con `{"data":{"proyectos":[],"rowsTotal":0}}` — **no hay validación contra un catálogo de periodos conocidos; un `perParId` inválido no es un error, es simplemente "sin resultados"**. Esto significa que **no se puede asumir que `perParId` = año de inicio del periodo funciona para periodos anteriores a 2021** solo por analogía — hay que confirmarlo contra el catálogo real (ver abajo).

**Caso 5 — Filtro `estadoId=10` ("APROBADO")**

```bash
curl -s -X POST "https://api.congreso.gob.pe/spley-portal-service/proyecto-ley/lista-con-filtro?pageSize=3&page=1&rowStart=0" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  -H "Content-Type: application/json" \
  -d '{"perParId":2021,"perLegId":null,"comisionId":null,"estadoId":10,"grupParId":null,"tipoFirmanteId":null,"congresistaId":null,"texto":null,"fechaPresentacion":null,"numeroProyecto":null}'
```

`HTTP 200`, respuesta real:

```json
{"code":200,"status":"success","data":{"proyectos":[{"perParId":2021,"pleyNum":12120,"proyectoLey":"12120/2025-PE","desEstado":"APROBADO","fecPresentacion":"2025-08-15T00:00:00.000-05:00","titulo":"PROYECTO DE LEY DE LA CUENTA GENERAL DE LA REPÚBLICA 2024.","desProponente":"PODER EJECUTIVO","autores":"","codTipoParl":"C","codTipoParlActual":"C","rowsTotal":0}],"rowsTotal":0},"timestamp":"2026-09-21T11:58:04.790-05:00"}
```

Filtro aplicado correctamente — `desEstado` de todos los registros devueltos es `"APROBADO"`.

### Endpoint de catálogo de periodos parlamentarios (hallazgo nuevo, no estaba en ADS-15 original)

```bash
curl -s "https://api.congreso.gob.pe/spley-portal-service/periodo-parlamentario" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  -H "Accept: application/json, text/plain, */*"
```

`HTTP 200`, `Content-Length: 1444` bytes, respuesta real completa:

```json
{"code":200,"status":"success","data":[{"perParId":2026,"desPerPar":"Periodo Parlamentario 2026 - 2031","desPerParAbrev":"2026-2031","fecIni":"2026-07-27 00:00:00.0","fecFin":"2031-07-26 00:00:00.0","activo":true,"periodosLegislativos":[{"perParId":2026,"perLegId":2026,"desPerLeg":"2026 - 2027","desPerLegAbrev":"2026","fecIni":"2026-07-27T00:00:00","fecFin":"2027-07-26T00:00:00","activo":true}]},{"perParId":2021,"desPerPar":"Periodo Parlamentario 2021 - 2026","desPerParAbrev":"2021-2026","fecIni":"2021-07-22 00:00:00.0","fecFin":"2026-07-26 00:00:00.0","activo":true,"periodosLegislativos":[{"perParId":2021,"perLegId":2021,"desPerLeg":"2021 - 2022","desPerLegAbrev":"2021","fecIni":"2021-07-27T00:00:00","fecFin":"2022-07-26T00:00:00","activo":true},{"perParId":2021,"perLegId":2022,"desPerLeg":"2022 - 2023","desPerLegAbrev":"2022","fecIni":"2022-07-27T00:00:00","fecFin":"2023-07-26T00:00:00","activo":true},{"perParId":2021,"perLegId":2023,"desPerLeg":"2023 - 2024","desPerLegAbrev":"2023","fecIni":"2023-07-27T00:00:00","fecFin":"2024-07-26T00:00:00","activo":true},{"perParId":2021,"perLegId":2024,"desPerLeg":"2024 - 2025","desPerLegAbrev":"2024","fecIni":"2024-07-27T00:00:00","fecFin":"2025-07-26T00:00:00","activo":true},{"perParId":2021,"perLegId":2025,"desPerLeg":"2025 - 2026","desPerLegAbrev":"2025","fecIni":"2025-07-27T00:00:00","fecFin":"2026-07-26T00:00:00","activo":true}]}],"timestamp":"2026-09-21T11:56:38.547-05:00"}
```

Devuelve únicamente **dos periodos**: `2026` (2026-2031, activo, recién iniciado) y `2021` (2021-2026, activo). **No lista 2016, 2011 ni 2006** — esto explica por qué esos `perParId` devuelven `proyectos: []`: no es que el endpoint esté mal, es que **este servicio (`spley-portal-service`) no tiene datos de periodos parlamentarios anteriores a 2021**. Los periodos históricos (si existen en algún sistema del Congreso) están fuera del alcance de este endpoint — no se puede asumir que un scraping por año histórico va a traer datos.

Cada entrada del catálogo trae también `periodosLegislativos` (sub-periodos anuales dentro de cada periodo parlamentario, con su propio `perLegId`) — útil para el filtro opcional `perLegId`.

### Endpoint de catálogo de filtros (hallazgo nuevo, no estaba en ADS-15 original)

```bash
curl -s "https://api.congreso.gob.pe/spley-portal-service/periodo-parlamentario/2021/filtros?codTipoParl=C" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
```

`HTTP 200`. Primeras entradas reales de `data.comisiones` (26 en total para el periodo 2021):

```json
{
  "code": 200,
  "status": "success",
  "data": {
    "comisiones": [
      {"id": 1, "descripcion": "Agraria", "flagPortalDictamen": null},
      {"id": 2, "descripcion": "Ciencia, Innovación y Tecnología", "flagPortalDictamen": null},
      {"id": 11, "descripcion": "Energía y Minas", "flagPortalDictamen": null}
    ],
    "estados": [
      {"estadoId": 101, "desEstado": "ACLARACIÓN", "flagPortalDictamen": false},
      {"estadoId": 10, "desEstado": "APROBADO", "flagPortalDictamen": false}
    ],
    "gruposParlamentarios": [
      {"id": 1, "descripcion": "Acción Popular", "flagPortalDictamen": null},
      {"id": 2, "descripcion": "Alianza Para el Progreso", "flagPortalDictamen": null}
    ],
    "tiposFirmantes": [
      {"id": 1, "descripcion": "Autor Principal", "flagPortalDictamen": null},
      {"id": 2, "descripcion": "Coautor", "flagPortalDictamen": null},
      {"id": 3, "descripcion": "Adherente", "flagPortalDictamen": null}
    ]
  }
}
```

(respuesta real truncada arriba a modo de muestra — los conteos totales por catálogo están en la tabla siguiente, verificados contra el JSON completo)

Devuelve los catálogos completos de valores válidos para cada filtro de `FiltroProyecLeyDto`:

| Filtro | Campo del catálogo | Cantidad (periodo 2021) | Ejemplo |
|---|---|---|---|
| `comisionId` | `comisiones[].id` | 26 | `{"id": 11, "descripcion": "Energía y Minas"}` |
| `estadoId` | `estados[].estadoId` | 21 | `{"estadoId": 10, "desEstado": "APROBADO"}` |
| `grupParId` | `gruposParlamentarios[].id` | 27 | `{"id": 1, "descripcion": "Acción Popular"}` |
| `proponente` (no es un filtro del DTO, informativo) | `proponentes[].id` | 15 | `{"id": 1, "descripcion": "Congreso"}` |
| `tipoFirmanteId` | `tiposFirmantes[].id` | 3 | `{"id": 1, "descripcion": "Autor Principal"}` |
| `perLegId` | `periodosLegislativos[]` | 5 (para 2021) | sub-periodos anuales |
| (informativo) | `legislaturas[]` | 10 | — |
| `congresistaId` | no viene en este combo — requiere otro endpoint, no investigado en esta pasada | — | — |

**Nota importante para LEG-01**: estos catálogos (`comisiones`, `estados`, `gruposParlamentarios`, etc.) son la fuente correcta para tablas de dimensión/lookup si el schema de ingesta decide normalizar en vez de guardar el texto plano que ya trae el endpoint de proyectos (`desEstado`, `desProponente`, etc. vienen ya legibles en la respuesta principal — normalizar es opcional, no obligatorio).

### Estructura de la respuesta de `lista-con-filtro`

```json
{
  "code": 200,
  "status": "success",
  "data": {
    "proyectos": [
      {
        "perParId": 2021,
        "pleyNum": 14864,
        "proyectoLey": "14864/2025-CR",
        "desEstado": "PRESENTADO",
        "fecPresentacion": "2026-07-22T00:00:00.000-05:00",
        "titulo": "PROYECTO DE LEY QUE...",
        "desProponente": "Congreso",
        "autores": "Apellido Nombre; Apellido Nombre",
        "codTipoParl": "C",
        "codTipoParlActual": "C",
        "rowsTotal": 0
      }
    ],
    "rowsTotal": 0
  },
  "timestamp": "..."
}
```

**Cautela real**: tanto `data.rowsTotal` como `data.proyectos[].rowsTotal` vienen siempre en `0` en las respuestas verificadas — **no son un total real de paginación**, son un campo del DTO que el backend no está poblando (o solo se puebla bajo otra combinación de parámetros no probada todavía). El conteo real de resultados es `data.proyectos.length` — con `pageSize` suficientemente grande (probado con `100000` para el periodo 2021, trajo los 14,864 completos en una sola respuesta) no hace falta paginar de verdad, pero LEG-01 debe verificar si existe un límite real de `pageSize` antes de asumir que siempre trae todo en una sola llamada.

**Clave real para upsert** (confirmar contra la respuesta, no asumir el código compuesto): `perParId` + `pleyNum` (entero) identifican un proyecto de forma única — `proyectoLey` (ej. `"14864/2025-CR"`) es el código legible derivado de esos dos campos, pero contiene `/` y no debe usarse como segmento de ruta sin codificar (ver `docs/PRD_Inteligencia_Legislativa_Congreso_v1.md`, LEG-02).

`autores` viene como un solo string con nombres separados por `;` — congresistas (funcionarios públicos), no hay PII de ciudadanos particulares en este endpoint.

---

## Conclusión de ADS-15

- **(a) automatizable vía `fetch()`/`curl`** con las cabeceras correctas — confirmado, sin estado de sesión de navegador requerido.
- `FiltroProyecLeyDto` documentado: único campo requerido es `perParId` (entero); el resto son opcionales, todos aceptan `null`.
- Valores válidos de `perParId` conocidos hoy: `2021` (14,864 proyectos) y `2026` (4 proyectos, periodo recién iniciado) — **no `2016`/`2011`/`2006`**, que el repo de terceros `unimauro/congreso-abierto-peru` asume sin haberlo verificado contra el catálogo real (su scraper los tiene como `PERIODOS_CONOCIDOS` pero no valida que existan).
- LEG-01 puede proceder — este ticket (ADS-15) se cierra con Épica A confirmada.

## Lo que queda fuera de esta verificación (para una pasada futura, no bloqueante para LEG-01)

- Votaciones, asistencia, comisiones bajo el mismo host (`api.congreso.gob.pe`) — no investigado en esta pasada, mencionado en el alcance original de ADS-15 pero no verificado todavía.
- Endpoint de `congresistaId` (directorio de congresistas) — no encontrado en esta pasada.
- Comportamiento de `pageSize` con valores más allá de 100,000 o si existe un límite real del backend.
