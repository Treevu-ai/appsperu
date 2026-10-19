# Inversión pública en infraestructura y crecimiento exportador regional

Propuesta de investigación: si la finalización de proyectos de inversión pública en infraestructura productiva (Invierte.pe) antecede temporalmente al crecimiento de la actividad exportadora en la región donde se ejecutan.

Ver [`propuesta/`](propuesta/) para el documento completo. **Fase piloto ejecutada el 2026-10-19** (extracción + análisis + resultados); el test de precedencia da **null en ambas direcciones** con la cobertura actual de exportadores (339/13.366 RUC) — ver `results/resumen_ejecutivo.md`. El pipeline queda listo para la fase completa sin cambios de código cuando Aduanet complete la ingesta.

## Estructura

```
propuesta/   # documento de propuesta (.md; .docx generado)
data/raw/    # 4 CSV (17.120 filas): panel inversión dept×año 2015-2026,
             # detalle de proyectos productivos, FOB por RUC, padrón con ubigeo
scripts/     # extraer_datos.py (solo lectura, lee .env.local) + analisar.py (Python)
results/     # resumen_ejecutivo.md, 3 tablas CSV, 3 figuras PNG
```

## Resultados de la fase piloto (2026-10-19)

- **Panel**: 175 obs (25 dept × 7 años, 2019-2025). 31% de dept-año sin exportadores registrados.
- **Precedencia inversión→exportadores**: sin señal en ninguna especificación
  (M1 β=-0,12 p=0,20 · M2 rezagos 0-3 β=-0,001 p=0,99 · M5 por pliego β=-0,06 p=0,18).
- **Dirección inversa** (exportadores→inversión, M4): coeficientes todos no significativos.
- **Concentración**: LIMA concentra el 58% de los registros exportador-año (655 de 1.122);
  top-3 (Lima, Junín, San Martín) = 72%.
- **Hallazgos de calidad de datos** (corregidos en la extracción):
  - 48.263 proyectos de `radar_inversiones.investments` tienen `fecha_fin_ejecucion`
    futura (hasta 2070) — fechas proyectadas, excluidos del panel histórico.
  - El campo `sector` clasifica por **pliego ejecutor** (1.227 proyectos en Transportes);
    `funcion` clasifica por **tipo de obra** (36.073 en TRANSPORTE). Se usan ambas
    clasificaciones; la propuesta original solo contemplaba `sector`.
  - 2 de 339 RUC exportadores sin ubigeo en el padrón SUNAT.

## Fase completa (pendiente)

Cuando `identidad_fiscal.ruc_exportaciones_fob` cubra la ingesta Aduanet completa
(~13.366 RUC): re-ejecutar `scripts/extraer_datos.py` y `scripts/analisar.py` —
sin cambios de código. Con DV completo se podrán añadir controles (población,
PIP regional) y pasar de test de precedencia a especificaciones con efectos
fijos más ricos.
