# Inversión pública en infraestructura y crecimiento exportador regional

Propuesta de investigación: si la finalización de proyectos de inversión pública en infraestructura productiva (Invierte.pe) antecede temporalmente al crecimiento de la actividad exportadora en la región donde se ejecutan.

Ver [`propuesta/`](propuesta/) para el documento completo. Estado al 2026-10-17: el panel de inversión (`radar_inversiones.investments`, 150.042 proyectos, 2001-2026) está completo y sin cuello de botella; la variable dependiente regional (exportadores por región) depende de `identidad_fiscal.ruc_exportaciones_fob`, con cobertura parcial (339/13.366 RUC) — se corrigió además el supuesto inicial de que `bcrp_comercio_exterior` tenía desagregación regional (no la tiene, es serie nacional agregada).

## Estructura

```
propuesta/   # documento de propuesta (.md; .docx pendiente de generar)
data/raw/    # pendiente: export del panel de inversión y del cruce RUC↔ubigeo↔exportaciones
scripts/     # pendiente: extracción (TypeScript) y análisis (Python)
results/     # pendiente
```
