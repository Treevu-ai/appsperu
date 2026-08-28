# ADR-0010: Research spike — PROINVERSIÓN / VERTIX (cartera APP, PA y OxI)

> Este ADR es una **investigación**, no una decisión de construir. A diferencia de
> ADR-0002/0003 (apps standalone ya decididas) o ADR-0008 (decisión posterior sobre MIDAGRI),
> aquí se documenta lo confirmado en vivo sobre la cartera de inversión privada promovida por
> PROINVERSIÓN — con nivel de confianza explícito por hallazgo, igual que ADR-0007.
> **No se decide build/no-build todavía.**

## Contexto

El proyecto ya cubre **inversión pública** vía `radar-inversiones` → Invierte.pe (MEF/SNIP,
`DETALLE_INVERSIONES.csv`). Eso no sustituye la cartera de **inversión privada** que promueve
PROINVERSIÓN: Asociaciones Público-Privadas (APP), Proyectos en Activos (PA) y Obras por
Impuestos (OxI).

En `docs/revision-mapa-fuentes-estado.md` PROINVERSIÓN figuraba como **no verificado**. Este
spike confirma qué es descargable de forma estructurada y qué sigue siendo solo documento o
portal autenticado.

**Alcance de la investigación**: portales `investinperu.pe`, endpoints embebidos en el tema
WordPress de VERTIX, y `vertix.proinversion.gob.pe` como backend. No se exploró sala virtual
de procesos de selección ni `apps.proinversion.gob.pe/pmisapi` más allá de un probe superficial.

## Hallazgo 1 — VERTIX (feb 2026): confianza alta, JSON estructurado sin login

PROINVERSIÓN presentó **VERTIX** como plataforma integradora de APP, PA y OxI (noticia oficial
26-feb-2026 en `investinperu.pe`). La UI pública vive en:

- Dashboard: `https://www.investinperu.pe/dashboard-vertix/`
- Buscador de cartera: `https://www.investinperu.pe/inversiones-cartera-vertix/`
- GIS: `https://www.investinperu.pe/gis-vertix/`

El buscador no usa un CSV ni una API REST documentada. En su lugar, el front hace **POST
multipart** a un proxy PHP del mismo sitio:

```text
POST https://www.investinperu.pe/wp-content/themes/hello-elementor-child/__api/service/app/vertixService.php
```

Parámetros relevantes (FormData, confirmados leyendo el JS embebido en la página y probados con
`curl`):

| Campo | Uso |
|---|---|
| `Lan` | `es` |
| `Page` | Número de página (1-based) |
| `PageLimit` | Tamaño de página — la UI usa `6`; para ingesta usar `500` |
| `NombreProyecto` | Búsqueda por texto |
| `TipoProyectoList` | IDs separados por coma (`25299` = APP, `25300` = PA) |
| `SectorList`, `EstadoList`, `DepartamentoList`, `TipologiaList`, `AnioList`, `EntidadList`, `GreenBrownList`, `SituacionActualList`, `TipoIniciativaList`, `ModalidadList` | Filtros opcionales |

**Verificado en vivo (2026-08-28)**:

- `RecordsTotal`: **340** proyectos en cartera activa consultable
- Con `PageLimit=500` y página 1: **340 filas** en `Data`
- Desglose por `TipoProyecto`: **226 APP**, **114 PA**
- Filtro territorial `DepartamentoList=13` (INEI, La Libertad): **22** proyectos
- Respuesta JSON con campos por proyecto: `Id`, `Slug`, `TipoProyecto`, `Nombre`, `Sector`,
  `Cartera`, `Fase`, `Estado`, `Titular`, `MontoInversionSIGV`, `Modalidad`, `GreenBrownfield`,
  `BuenaProPrevista`, `url_thumb`, etc. (detalle en data contract)
- **Sin CUI** en ninguna de las 340 filas (`CodigosSubProyectos` / `CodigosSubProyectosList`
  vacíos en el corte completo) → no hay cruce exacto con `radar-inversiones` ni `infobras`

**Riesgo**: endpoint no documentado oficialmente; puede cambiar sin aviso. No se verificaron
términos de uso para ingesta automatizada masiva.

## Hallazgo 2 — OxI: confianza media-alta, export XLSX vía JSON base64

Endpoint adicional en el mismo árbol `__api`:

```text
POST https://www.investinperu.pe/wp-content/themes/hello-elementor-child/__api/service/oxi/investmentpromotionExport.php
```

**Verificado en vivo (2026-08-28)**:

- Respuesta `Content-Type: application/json`
- Campo `Data` = archivo XLSX (~122 KB en el corte probado) codificado en base64
- Estructura ZIP/XLSX válida (`xl/worksheets/sheet1.xml`)

No se parseó el contenido de la hoja en este spike — queda pendiente confirmar columnas,
frecuencia de actualización y si cubre el mismo universo que el buscador APP/PA o solo OxI.

## Hallazgo 3 — Backend VERTIX y documentos: confianza alta, no aptos como conector primario

| Recurso | Resultado |
|---|---|
| `vertix.proinversion.gob.pe` | `302` → `/Account/Login` — requiere sesión |
| `apps.proinversion.gob.pe/pmisapi/` | Redirige; no expone catálogo público obvio |
| `datosabiertos.gob.pe` | Sin datasets publicados por PROINVERSIÓN (solo MEF/Invierte) |
| `investinperu.pe/estadisticas-proinversion/` | Boletines y anuarios en **PDF** (agregados) |
| Brochure cartera 2025-2026 | PDF estático en `info.investinperu.pe` |

Los documentos sirven para contexto y validación manual, no para ingesta fila a fila con el
rigor del resto del proyecto.

## Hallazgo 4 — Relación con Invierte.pe: confianza alta, universos distintos

| | **Invierte.pe** (`radar-inversiones`) | **PROINVERSIÓN / VERTIX** |
|---|---|---|
| Naturaleza | Inversión pública SNIP/MEF | Inversión privada APP/PA/OxI |
| Fuente | `fs.datosabiertos.mef.gob.pe` CSV | Proxy PHP `vertixService.php` |
| Clave | CUI | `Id` interno PROINVERSIÓN |
| Volumen | ~246 MB / miles de inversiones | 340 proyectos de cartera (corte 2026-08-28) |
| Conector | `invierte-connector.ts` — construido | No existe |

Son fuentes **complementarias**. Un megaproyecto puede aparecer en narrativa pública de ambos
lados sin compartir CUI en VERTIX.

## Decisión

**No se decide construir ninguna app todavía.** Este spike deja registrado:

1. **Candidato viable de mayor prioridad**: `vertixService.php` — JSON estructurado, sin login,
   universo completo en una sola corrida con `PageLimit=500`.
2. **Segundo recurso**: `investmentpromotionExport.php` — OxI en XLSX; confirmar esquema antes
   de modelar.
3. **No priorizar**: PDFs de boletines/anuarios; scraping de `vertix.proinversion.gob.pe`
   autenticado; sala virtual de licitación APP.
4. **Si se avanza**, el patrón natural es app standalone + `vertix-connector.ts` (POST
   multipart, snapshot completo, filtros opcionales por departamento INEI) — análogo a
   `oece-connector.ts` en complejidad, más simple que `sanciones-connector.ts` (sin sesión
   ASP), más frágil que `padron-connector.ts` (sin API estable documentada).

## Pendientes concretos

1. Parsear el XLSX de OxI y documentar columnas + cardinalidad.
2. Confirmar si el GIS (`gis-vertix`) expone coordenadas descargables o solo mapa embebido.
3. Evaluar estabilidad del endpoint en el tiempo (monitoreo de `RecordsTotal` y checksum).
4. Definir modelo de cruce con el ecosistema existente sabiendo que **no hay CUI** — como
   mínimo sector/región/titular, sin matching por nombre salvo spike aparte.
5. Revisar términos de uso / robots de `investinperu.pe` antes de automatizar en producción.

## Referencias

- Data contract: `docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`
- Conector existente más cercano (inversión pública): `docs/conectores.md#radar-inversiones`
- Estado previo del mapa de fuentes: `docs/revision-mapa-fuentes-estado.md`
- Precedente de spike: ADR-0007 (MIDAGRI/MINCETUR)
