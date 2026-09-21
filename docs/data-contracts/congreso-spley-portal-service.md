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

**Verificado en vivo 2026-09-21** con `curl` puro (sin cookies, sin sesión de navegador):

- `perParId=2021` (periodo 2021-2026), `pageSize=100000`: `HTTP 200`, **14,864 proyectos** reales — coincide exactamente con el conteo citado por el informe de investigación competitiva y por el repo de terceros `unimauro/congreso-abierto-peru` (que reportó 14,704 en una fecha anterior, diferencia consistente con nuevas presentaciones).
- `perParId=2026` (periodo 2026-2031, recién iniciado): `HTTP 200`, **4 proyectos** — el periodo está activo y ya tiene datos, aunque mínimos por ser nuevo.
- `perParId` sin body (`{}`): `HTTP 400`, error de validación real de Spring — `NotNull.perParId`, mensaje `"Ingrese el periodo"`. Confirma que `perParId` es el único campo obligatorio de `FiltroProyecLeyDto`.
- `perParId` con valor inexistente (ej. `99999`, o los años `2016`/`2011`/`2006`/`1`-`7` que el repo de terceros asume como periodos históricos): `HTTP 200` con `proyectos: []` — **no hay validación contra un catálogo de periodos conocidos; un `perParId` inválido no es un error, es simplemente "sin resultados"**. Esto significa que **no se puede asumir que `perParId` = año de inicio del periodo funciona para periodos anteriores a 2021** solo por analogía — hay que confirmarlo contra el catálogo real (ver abajo).
- Filtro `estadoId=10` ("APROBADO"): `HTTP 200`, filtro aplicado correctamente (verificado con una consulta real que devolvió solo proyectos en estado `APROBADO`).

### Endpoint de catálogo de periodos parlamentarios (hallazgo nuevo, no estaba en ADS-15 original)

```
GET https://api.congreso.gob.pe/spley-portal-service/periodo-parlamentario
```

**Verificado en vivo**: `HTTP 200`, devuelve únicamente **dos periodos**: `2026` (2026-2031, activo, recién iniciado) y `2021` (2021-2026, activo). **No lista 2016, 2011 ni 2006** — esto explica por qué esos `perParId` devuelven `proyectos: []`: no es que el endpoint esté mal, es que **este servicio (`spley-portal-service`) no tiene datos de periodos parlamentarios anteriores a 2021**. Los periodos históricos (si existen en algún sistema del Congreso) están fuera del alcance de este endpoint — no se puede asumir que un scraping por año histórico va a traer datos.

Cada entrada del catálogo trae también `periodosLegislativos` (sub-periodos anuales dentro de cada periodo parlamentario, con su propio `perLegId`) — útil para el filtro opcional `perLegId`.

### Endpoint de catálogo de filtros (hallazgo nuevo, no estaba en ADS-15 original)

```
GET https://api.congreso.gob.pe/spley-portal-service/periodo-parlamentario/{perParId}/filtros?codTipoParl=C
```

**Verificado en vivo** para `perParId=2021`, `codTipoParl=C`: `HTTP 200`, devuelve los catálogos completos de valores válidos para cada filtro de `FiltroProyecLeyDto`:

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
