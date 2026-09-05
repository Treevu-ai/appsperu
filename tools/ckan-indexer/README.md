# CKAN Indexer

Indexa el catálogo nacional de datos abiertos del Perú (`datosabiertos.gob.pe`) para alimentar análisis y discovery dentro de Rastro.

## Por qué existe

Rastro se enfoca en inversión pública (14 conectores propios). Pero el Estado publica ~5,000 datasets abiertos que cruzan inversión con salud, educación, programas sociales, justicia, etc. Este indexer construye la **capa de descubrimiento** que permite ver el catálogo completo y decidir qué vale la pena conectar de verdad.

## Uso rápido

```powershell
# Smoke test (200 datasets, sin HEAD checks, ~30s)
python tools\ckan-indexer\ckan_indexer.py --quick

# Cobertura media con calidad (1000 datasets, ~5-8 min)
python tools\ckan-indexer\ckan_indexer.py --limit 1000

# Catálogo completo (~15-25 min)
python tools\ckan-indexer\ckan_indexer.py --full

# Continuar desde donde quedó
python tools\ckan-indexer\ckan_indexer.py --resume --limit 1000
```

## Salidas (en `docs/inventario-fuentes/`)

| Archivo | Qué es | Para qué sirve |
|---|---|---|
| `catalog.json` | Catálogo completo normalizado (~5-15 MB) | Consumo programático, búsqueda, Rastro feed |
| `catalog.csv` | Una fila por dataset, columnas planas | Excel, filtros rápidos, análisis ad-hoc |
| `reporte-calidad.md` | Métricas de URLs vivas/muertas + top formatos + muestra de problemas | Decidir qué datasets son confiables |
| `por-ministerio.md` | Catálogo agrupado por ministerio/entidad, ordenado por prioridad Rastro | Lectura humana, priorizar integraciones |

## Estado resumible

`state/progress.json` guarda lo que ya se procesó. `--resume` continúa desde ahí sin repetir trabajo. Útil para ejecuciones largas que se cortan.

## Sin dependencias externas

Solo stdlib de Python 3.9+. Probado en Python 3.14. Si tu `pip` no tiene `aiohttp` o no podés instalar nada, esto corre igual.

## Rate limit

8 req/segundo contra CKAN. Es un portal público sin auth, pero somos respetuosos. Si necesitás más velocidad, cambiá `RATE_LIMIT_PER_SEC` y `MAX_WORKERS` arriba del script.

## Próximos pasos (no implementados)

- `--watch`: re-correr cada N días para detectar datasets nuevos / URLs muertas
- Filtrar por `organization` para re-indexar solo un ministerio
- Salida `catalog-min.json` curado para embeber en Rastro (subset relevante)
