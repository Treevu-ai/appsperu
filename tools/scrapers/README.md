# Scrapers

Scrapers de portales del Estado peruano que no exponen API. Documentación completa en
[`appsperu/docs/arquitectura/scraping-arquitectura.md`](../../docs/arquitectura/scraping-arquitectura.md).

## Estructura

```
tools/scrapers/
├── README.md              ← este archivo
├── run_all.py             ← runner agregado
├── lib/                   ← utilidades compartidas (http, cache, state, normalizer, quality)
├── scripts/               ← un script por dataset
│   ├── sunat_ruc.py
│   ├── me_consulta_amigable.py
│   ├── inpe_siep.py
│   ├── midis_infomidis.py
│   ├── mimp_estadisticas.py
│   ├── pnda_transporte.py      ← datasets de transporte del PNDA (datosabiertos.gob.pe)
│   ├── ositran_data.py         ← reportes OSITRAN (aeropuertos, carreteras, metro, puertos, reclamos)
│   ├── atu_transporte.py       ← ATU Lima y Callao (WebForms .NET + XLS) — Metropolitano, corredores, regular, especial, ferroviario
│   ├── mtc_geoserver.py        ← WFS OGC: red vial, terminales, aeropuertos, puertos, peajes
├── cache/                 ← snapshots con fecha (no commiteado)
└── reports/               ← JSONL con métricas de cada corrida
```

## Uso rápido

```powershell
# Correr un script individual
python tools\scrapers\scripts\sunat_ruc.py 20100047218

# Buscar un RUC con cache de 30 días
python tools\scrapers\scripts\sunat_ruc.py 20100047218

# Cargar varios RUCs desde archivo
python tools\scrapers\scripts\sunat_ruc.py --bulk rucs.txt

# Correr todos los scrapers
python tools\scrapers\run_all.py

# Solo algunos
python tools\scrapers\run_all.py --only sunat_ruc inpe_siep
```

## Estado de cada script

| Script | Funciona | Notas |
|---|---|---|
| `sunat_ruc.py` | ✅ | Wrapper de `openruc.com` (tercero). Gratis, sin auth, edge-cached. | Riesgo: dependencia de tercero. |
| `me_consulta_amigable.py` | ✅ | API REST de `gestionpublicaperu.com.pe` sobre DuckDB MEF 2013–2026. | 30 req/min, sin auth. |
| `inpe_siep.py` | ✅ | ArcGIS REST query. | Endpoints `services6.arcgis.com` públicos. |
| `midis_infomidis.py` | ⚠️ | Endpoints tentativos. | Validar con DevTools antes de prod. |
| `mimp_estadisticas.py` | ⚠️ | Endpoints tentativos. | Mismo caveat. |
| `pnda_transporte.py` | ✅ | CKAN/DKAN client sobre `datosabiertos.gob.pe` — lista 4,647 datasets, filtra por keywords/orgs, descarga mejor recurso por dataset. | Sin auth. `--limit N` para pruebas. |
| `ositran_data.py` | ✅ | Playwright sobre `datos.ositran.gob.pe` — descubre 51 códigos de reporte en 9 secciones, descarga como XLS/CSV. | Requiere Chromium (ya instalado). |
| `atu_transporte.py` | ✅ | Spider sobre `atu.gob.pe` (.NET WebForms) — parsea 5 categorías, busca links XLS con `openpyxl`/`xlrd`. | openpyxl/xlrd opcionales (guarda binario si no hay parser). |
| `mtc_geoserver.py` | ✅ | Cliente WFS OGC sobre `mtcgeo2.mtc.gob.pe:8080` — 10 capas (red vial, terminales, aeropuertos, puertos, ferrocarriles, peajes). | IP-restringido: requiere red peruana o VPN. GeoJSON/CSV/SHP. |

## Scripts que NO existen (gaps documentados)

Estos datasets están en la lista 🟡 pero **no se scrapean** por decisión consciente:

- **MINEDU — SIAGIE**: login + datos sensibles de menores. Requiere convenio.
- **MIDIS — SISFOH / Pensión 65 / Juntos / Contigo / Cuna Más**: CAPTCHA + DNI. Vía convenio MIDIS o datasets agregados en PNDA.

Detalles y justificaciones en `docs/arquitectura/scraping-arquitectura.md` §2.3.

## Salidas

- `cache/{entity}/{dataset}/{YYYY-MM-DD}.json` — datos scrapeados
- `reports/{YYYY-MM-DD}.jsonl` — un Report por línea
- `reports/consolidated-{YYYY-MM-DD}.json` — resumen de la corrida agregada

## Próximos pasos

1. ~~Validar los endpoints tentativos de MIDIS y MIMP con DevTools~~
2. ~~Probar `inpe_siep.py` contra el ArcGIS real~~
3. ~~Migrar a Cloudflare Workers cuando haya backend~~  (ver `docs/arquitectura/scraping-arquitectura.md` §3.7)
4. **Probar conectores nuevos en red peruana**: OSITRAN, ATU y MTC Geoserver desde VPN/IP peruana.
5. **PNDA full scan**: `python -m tools.scrapers.scripts.pnda_transporte --limit 4647` (~30 min); correr con `--limit 100` por sesión para no saturar rate limit.
6. **OSITRAN descarga completa**: `python -m tools.scrapers.scripts.ositran_data --download-all` (51 reportes, ~15-30 min con Playwright).
7. **MTC Geoserver peajes 2024-25**: desde red peruana, `python -m tools.scrapers.scripts.mtc_geoserver --layer MTC_pg:peajes_2024_2025`.
