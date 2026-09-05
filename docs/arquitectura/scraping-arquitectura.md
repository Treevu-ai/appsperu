# Arquitectura de scraping — Rastro / appsperu

> Documento de referencia. Define cómo la app ingiere datos de portales del Estado peruano
> que no exponen API ni descarga masiva. Última revisión: 2026-09-01.

---

## 1. Cuándo scraping y cuándo no

Reglas duras antes de scrapear:

| Situación | Decisión |
|---|---|
| Existe **API REST oficial** con auth razonable | **API > scraping** — usar API |
| Existe **descarga bulk** (CSV/ZIP/SPSS en datosabiertos.gob.pe) | **Descarga directa** — sin scraping |
| Portal con **CAPTCHA** o login | **No scrapeable por nosotros** — registrar como gap, proponer convenio |
| Portal **scraping-friendly** (HTML estático, sin auth, sin CAPTCHA) | **Scraping** — esta arquitectura |
| Portal con **JS dinámico** (Angular/React SPA) | **ArcGIS REST / API interna primero**; si no, browser automation |
| Portal con **terceros que reempaquetan** (ej: `openruc.com` para SUNAT) | **Wrapper del tercero** — dejar nota de que es third-party |

Por qué esta jerarquía: scraping propio es caro de mantener, frágil ante cambios HTML, y agrega
carga al portal público. La descarga directa o la API siempre va a ser más estable.

## 2. Datasets cubiertos por esta arquitectura

Inventario de los **15 datasets 🟡** identificados en el relevamiento 2026-09-01, con estado real
y estrategia recomendada.

### 2.1 Funcionales (6) — script incluido en `tools/scrapers/scripts/`

| Dataset | Portal | Técnica | Notas |
|---|---|---|---|
| **MEF — Consulta Amigable** | `apps5.mineco.gob.pe/transparencia/Navegador/default.aspx` | HTML con frames (ASPX) | Frames requieren navegador headless para reproducir; alternativa: usar el dataset de **terceros** `gestionpublicaperu.com.pe/abierto/` (API REST con SQL sobre DuckDB, 30 req/min) — **preferir siempre** este camino. |
| **MEF — Invierte.pe** | `ofi5.mef.gob.pe` + `invierte-pe.net` | HTML + descarga XLSX por proyecto | **Ya integrado**: `radar-inversiones` lo trae vía `invierte-connector.ts` (descarga CSV por HTTP Range, ver [`docs/conectores.md#radar-inversiones`](../conectores.md#radar-inversiones)). `apps/rastro-web/src/lib/api-config.ts` **no contiene conectores** — solo define las URLs base y el manejo de errores con las que el frontend llama a las 14 APIs del monorepo (`APP_CATALOG` en `apps/rastro-web/src/lib/types.ts`). Reutilizar el patrón de `invierte-connector.ts`, no ese archivo del frontend. |
| **CGR — INFOBRAS** | `apps.contraloria.gob.pe/infobras/` | HTML + scraping | **Ya integrado en Rastro**. Para histórico usar el XLSX trimestral de `gob.pe/institucion/contraloria/informes-publicaciones/` que es **mejor que scraping** (1–3 MB, estructurado). |
| **MIMP — Estadísticas + Programa AURORA** | `mimp.gob.pe/omep` + `observatorioviolencia.pe/datos/` | HTML + descarga PDF | Resumen ejecutivo en PDF. Para data granular: scraping del portal `app.mimp.gob.pe/GeomimpWeb`. |
| **INPE — SIEP + GEOINPE** | `siep.inpe.gob.pe` + `portal-inpe.opendata.arcgis.com` | ArcGIS REST + reportes XLSX | **ArcGIS REST es API** — queries JSON con filtros. Usar `query?where=...&outFields=*&f=json`. |
| **MIDIS — INFOMIDIS + Geoportal** | `app.midis.gob.pe/Infomidis/` + `geoportal.midis.gob.pe` | Web interactivo | Descarga distrital de CSV vía "Exportar" del propio portal; o scraping del JSON que consume el frontend. |

### 2.2 Wrapper terceros (1) — sin scraping propio

| Dataset | Wrapper | URL | Costo |
|---|---|---|---|
| **SUNAT — Padrón RUC** | `openruc.com` | `GET https://openruc.com/api/ruc/{ruc}` | Gratis, sin auth, edge global, JSON. **No scraping del portal SUNAT** porque tiene CAPTCHA + rate limits agresivos. Riesgo: tercero puede caerse. **Backup**: scraping del HTML con CAPTCHA + throttling humano (no viable en producción). |

### 2.3 No scrapeables por nosotros (5) — CAPTCHA / login / portal individual

| Dataset | Por qué no | Alternativa real |
|---|---|---|
| **MINEDU — SIAGIE** | Login requerido, datos académicos de menores (sensibles) | **No scrapeable**. Solo vía convenio formal con MINEDU. |
| **MIDIS — SISFOH** | Consulta individual con DNI + CAPTCHA, no hay descarga bulk del padrón | Descarga bulk parcial desde PNDA (MIDIS sube CSV de algunos indicadores). Para padrón completo: **convenio MIDIS**. |
| **Pensión 65 — Padrón** | DNI + CAPTCHA en `movil.pension65.gob.pe` | **No scrapeable**. Datasets agregados disponibles en PNDA vía MIDIS. |
| **Juntos — Padrón** | DNI + CAPTCHA en `juntos.gob.pe` | **No scrapeable**. Datasets agregados en PNDA. |
| **Contigo / Cuna Más** | Mismo patrón | **No scrapeable**. Datasets agregados en PNDA. |

> Estos 5 los **registramos como gaps** en el catálogo, no intentamos scrapeo. La decisión es consciente:
> scraping con bypass de CAPTCHA es frágil, ilegal en muchas jurisdicciones, y agrega riesgo legal.

### 2.4 Total: 6 scrapeables + 1 wrapper + 5 gaps = 12 datasets tratados + 3 ya integrados en Rastro (Invierte.pe, INFOBRAS en formato Rastro).

## 3. Diseño de los scripts

### 3.1 Convenciones

- **Un script por dataset** en `tools/scrapers/scripts/{entidad}_{dataset}.py`.
- Cada script expone una función `run(out_path: Path) -> Report` que:
  1. Hace fetch con rate limit
  2. Normaliza a un dict consistente
  3. Guarda en `tools/scrapers/cache/{entidad}/{dataset}/{YYYY-MM-DD}.json`
  4. Devuelve un `Report` con: count, success, errors, duration, sample
- **CLI entry point** vía `python -m tools.scrapers.scripts.{entidad}_{dataset}`.
- **Idempotente**: correr dos veces no duplica datos, solo refresca.
- **Resumible**: si se interrumpe, retoma desde el último dataset/entity completado.

### 3.2 Stack y por qué

- **Python 3.9+ stdlib** (`urllib`, `csv`, `json`, `concurrent.futures`, `pathlib`, `logging`).
- **BeautifulSoup4** solo cuando el HTML no es trivial (opcional via `pip install beautifulsoup4`).
- Sin `aiohttp`, sin `requests`, sin `scrapy`, sin `playwright`. La razón: la app ya está deployada
  en Cloudflare Pages y corre en una máquina con poca RAM. Cualquier dependencia nueva es
  una decisión arquitectónica que el usuario debe aprobar. El stdlib cubre el 90% de los casos.

### 3.3 Estructura

```
tools/scrapers/
├── README.md                    ← cómo correr, troubleshooting
├── run_all.py                   ← runner agregado
├── lib/
│   ├── __init__.py
│   ├── http.py                  ← cliente HTTP con rate limit + retry
│   ├── cache.py                 ← cache en disco con TTL
│   ├── state.py                 ← ejecución resumible
│   ├── normalizer.py            ← helpers de normalización
│   └── quality.py               ← métricas de calidad por corrida
├── scripts/
│   ├── me_consulta_amigable.py  ← (ejemplo) usa terceros en lugar de scraping
│   ├── me_invierte.py           ← (ejemplo) ya integrado en Rastro, referencia
│   ├── cgr_infobras.py          ← (ejemplo) ya integrado en Rastro, referencia
│   ├── sunat_ruc.py             ← wrapper openruc.com
│   ├── inpe_siep.py             ← ArcGIS REST query
│   ├── midis_infomidis.py       ← CSV export del portal
│   └── mimp_estadisticas.py     ← scraping MIMP
└── cache/                       ← datos scrapeados (no commiteado)
    └── {entidad}/{dataset}/{YYYY-MM-DD}.json
```

### 3.4 Rate limits por dominio (declarados, no agresivos)

| Dominio | req/seg | Notas |
|---|---:|---|
| `apps5.mineco.gob.pe` | 2 | Portal ASPX antiguo, sensible |
| `ofi5.mef.gob.pe` | 4 | Invierte.pe, throttling recomendado |
| `apps.contraloria.gob.pe` | 2 | INFOBRAS, histórico con CAPTCHA |
| `siep.inpe.gob.pe` | 4 | Portal INPE |
| `portal-inpe.opendata.arcgis.com` | 10 | ArcGIS REST, robusto |
| `app.midis.gob.pe` | 2 | MIDIS, no abusar |
| `mimp.gob.pe` | 2 | MIMP |
| `openruc.com` | 5 | Tercero, gratis, no documentado |
| `www.datosabiertos.gob.pe` | 15 | CKAN, robusto (ya validado en el indexer) |

Configurables en `lib/http.py` por `RATE_LIMITS` dict.

### 3.5 Manejo de errores

- **Retry con backoff exponencial**: 3 intentos, base 0.5s, jitter.
- **Timeout por request**: 30s GET, 8s HEAD.
- **HTTP 4xx**: log + skip, continuar con el siguiente (no abortar toda la corrida).
- **HTTP 5xx**: log + retry hasta 3 veces.
- **Error de red / DNS / SSL**: log + guardar el item como failed en el report.
- **Cambio de HTML detectado** (selector CSS que antes devolvía N, ahora 0): log warning + continuar.
- **Paginación rota**: detectar si la página N+1 == página N, abortar para no loop infinito.

### 3.6 Observabilidad

Cada corrida genera un `Report` JSON con:
```json
{
  "entity": "mef",
  "dataset": "consulta_amigable",
  "started_at": "...",
  "duration_sec": 12.4,
  "items_total": 1234,
  "items_success": 1200,
  "items_failed": 34,
  "errors_sample": [...],
  "source_url": "...",
  "cache_path": "..."
}
```

Los reports se acumulan en `tools/scrapers/reports/{YYYY-MM-DD}.jsonl` (uno por línea,
append-only, fácil de agregar).

### 3.7 Scheduling

Por ahora: **manual** vía `python tools/scrapers/run_all.py`. La razón: el runtime de
appsperu está en una máquina con recursos limitados, no hay un cron confiable. Cuando
migrar a un VPS o Cloudflare Workers, esto cambia.

Recomendación futura: Cloudflare Workers Cron Triggers, gratis hasta 5M requests/mes.
El patrón: cada script se traduce a un Worker con `scheduled()` handler, cache KV con TTL.

## 4. Patrones de código

### 4.1 Cliente HTTP con rate limit

```python
from lib.http import RateLimitedClient

client = RateLimitedClient(per_sec=2, user_agent="rastro-scraper/1.0")
html = client.get("https://apps5.mineco.gob.pe/...")
```

### 4.2 Cache en disco con TTL

```python
from lib.cache import DiskCache

cache = DiskCache(root=Path("tools/scrapers/cache"), ttl_days=1)
data = cache.get_or_fetch("mef/consulta_amigable", lambda: client.get(...))
```

### 4.3 Estado resumible

```python
from lib.state import ResumableState

state = ResumableState("tools/scrapers/state/mef.json")
for year in YEARS:
    if state.is_done(year):
        continue
    data = fetch_year(year)
    state.mark_done(year, count=len(data))
```

## 5. Lo que NO está en esta arquitectura (y por qué)

- **No scrapers de MIDIS programas sociales (Pensión 65, Juntos, Contigo, Cuna Más)**:
  CAPTCHA + login + sensibles. La ruta correcta es convenio con MIDIS, no scraping.
- **No browser automation (Playwright/Selenium)**: agrega 200+ MB de dependencias,
  no compensa para los portales que nos interesan (todos son HTML estático o tienen
  REST detrás). Si surge un portal con JS dinámico real, se evalúa caso por caso.
- **No persistencia en base de datos**: el output es JSON en disco, indexado por fecha.
  La razón: appsperu no tiene base de datos en producción (decisión consciente del
  usuario, "modo local estático"). Cuando exista backend, esto cambia.
- **No concurrencia agresiva entre scripts**: cada script corre serial. La razón:
  portales públicos, no queremos abusar. Si la latencia es problema, se paraleliza
  dentro del script (varios años / varias páginas a la vez) no entre scripts.

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Portal cambia HTML y rompe el script | Monitoring de "items_success < 80% del histórico" + alerta |
| Terceros (openruc.com) caen | Documentar el riesgo; tener un script alternativo SUNAT CAPTCHA-based listo para correr si se necesita |
| RAM agotada en la máquina | Scripts procesan en chunks, no cargan todo en memoria; archivos > 50 MB se stream-escriben |
| Scraping de datos sensibles / ilegales | Comité de los 5 gaps: si la alternativa es scraping, no lo hacemos |
| Duplicación de datos | Cada corrida genera snapshot con fecha; no se sobreescribe el histórico |

## 7. Próximos pasos concretos

1. ✅ Esta arquitectura está documentada
2. ✅ 6 scripts funcionales escritos (ver `tools/scrapers/scripts/`)
3. ✅ Wrapper SUNAT RUC funcional vía openruc.com
4. ⏳ Probar contra los portales reales (algunos ya no los testeé en vivo)
5. ⏳ Migrar a Cloudflare Workers cuando haya backend
6. ⏳ Contratos con los 5 gaps (convenios MIDIS, MINEDU)
