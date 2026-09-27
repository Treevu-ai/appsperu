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
│   └── mimp_estadisticas.py
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
| `sunat_ruc.py` | ✅ Wrapper de `openruc.com` (tercero). Gratis, sin auth, edge-cached. | Riesgo: dependencia de tercero. |
| `me_consulta_amigable.py` | ✅ Usa API REST de `gestionpublicaperu.com.pe` sobre DuckDB del MEF. | 30 req/min, sin auth. Swagger UI para validar SQL. |
| `inpe_siep.py` | ✅ ArcGIS REST query. | Endpoints de `services6.arcgis.com` validados como públicos. |
| `midis_infomidis.py` | ⚠️ Endpoints tentativos. | Validar con DevTools (Network tab) antes de prod. |
| `mimp_estadisticas.py` | ⚠️ Endpoints tentativos. | Mismo caveat. |

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

1. Validar los endpoints tentativos de MIDIS y MIMP con DevTools
2. Probar `inpe_siep.py` contra el ArcGIS real
3. Migrar a Cloudflare Workers cuando haya backend (ver §3.7 de la arquitectura)
