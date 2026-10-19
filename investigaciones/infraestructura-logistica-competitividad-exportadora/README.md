# Infraestructura logística y competitividad exportadora

Propuesta de investigación: si la calidad de la infraestructura portuaria, aérea y vial de salida explica diferencias en el valor y la diversificación de las exportaciones peruanas por aduana.

Ver [`propuesta/`](propuesta/) para el documento completo. **Fase piloto ejecutada el 2026-10-19** (extracción + análisis + resultados); ver `results/resumen_ejecutivo.md`. El modelo de concesión da señal positiva, pero con 15 aduanas la concesión es indistinguible del tamaño de la aduana — resultado compatible con la hipótesis, no identificativo. La fase completa (misma ingesta Aduanet, sin cambios de código) resuelve el poder estadístico.

## Estructura

```
propuesta/   # documento de propuesta (.md; .docx generado)
data/raw/    # 6 CSV (15.037 filas): FOB por RUC×aduana×mes×país, snapshots
             # deduplicados de terminales e índice de vulnerabilidad, cargas
             # históricas 2010-2017, aeródromos, peajes
scripts/     # extraer_datos.py (solo lectura, lee .env.local) + analisar.py (Python)
results/     # resumen_ejecutivo.md, 2 tablas CSV, 3 figuras PNG
```

## Resultados de la fase piloto (2026-10-19)

- **Panel**: 1.260 obs (15 aduanas × 84 meses, 2019-2025); FOB de la muestra US$1.898 MM.
- **Concentración**: Callao marítima = 62% del FOB de la muestra; top-3 (Callao marítimo,
  Callao aéreo, Paita) ≈ 85%.
- **Modelos**: concesión β positivo y significativo en panel con FE de tiempo
  (p=0,012) y marginal entre-aduanas (p=0,073) — **pero** las concesionadas
  (Callao, Paita, Matarani) son exactamente las aduanas más grandes: con N=15
  no se separa el efecto concesión del efecto tamaño.
- **Estado de conservación**: solo 8/15 aduanas con dato usable; 312/507
  terminales del registro MTC figuran "Información no disponible" — hallazgo
  de calidad del registro oficial.
- **Mapeo aduana↔entidad MTC**: hecho manualmente y documentado en
  `scripts/analisar.py` (8 marítimas/fluviales con códigos de puerto, 1 aérea
  [Jorge Chávez], 4 fronterizas sin terminal, 1 interior, Puerto Maldonado
  vía cargas históricas). Tumbes (019) y Chancay (370) sin contraparte
  terminal usable en los cortes del MTC.

## Fase completa (pendiente)

Cuando `identidad_fiscal.ruc_exportaciones_fob` cubra la ingesta Aduanet completa
(~13.366 RUC): re-ejecutar `scripts/extraer_datos.py` y `scripts/analisar.py` —
sin cambios de código. Con más aduanas activas y meses por aduana, el modelo
de concesión ganará poder para separarse del tamaño; convendrá además
actualizar los snapshots MTC (fechas de corte viejas) antes del análisis definitivo.
