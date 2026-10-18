# Investigaciones

Proyectos de investigación académica que usan los datos de Rastro como insumo empírico, distintos de los hallazgos operativos documentados en `docs/`. Cada proyecto vive en su propia carpeta, con su propuesta, scripts de extracción/análisis y datasets derivados — reproducible de principio a fin sin depender de la memoria de una sesión de Claude Code.

## Convención de carpeta por proyecto

```
<nombre-proyecto>/
  propuesta/     # documento de propuesta (.docx)
  data/
    raw/         # datos exportados de Neon/fuentes externas, con README de huecos conocidos
    processed/   # salidas de los scripts de análisis
  scripts/       # extracción (TypeScript, mismo patrón que mcp-server/src/ingest) y análisis (Python)
  results/       # resultados finales (tablas, gráficos) una vez corrido el análisis completo
```

## Proyectos

- [`rca-shift-share-cptpp-china/`](rca-shift-share-cptpp-china/) — Gobernanza institucional y competitividad exportadora real: descomposición shift-share de las exportaciones peruanas hacia el CPTPP y China, 2015-2024.
- [`infraestructura-logistica-competitividad-exportadora/`](infraestructura-logistica-competitividad-exportadora/) — Infraestructura portuaria/aérea/vial del MTC como determinante del valor y diversificación exportadora por aduana. En diseño; datos de infraestructura completos, datos de exportaciones en cobertura parcial.
- [`inversion-publica-crecimiento-exportador-regional/`](inversion-publica-crecimiento-exportador-regional/) — Precedencia temporal entre inversión pública (Invierte.pe, 150K proyectos) y crecimiento exportador regional. En diseño; panel de inversión completo, variable dependiente regional en cobertura parcial.
