# Resumen ejecutivo — infraestructura de salida y competitividad exportadora (fase piloto)

*Generado por `scripts/analisar.py` · fecha: 2026-10-19 · panel aduana×mes
1260 obs (15 aduanas × 84 meses, 2019-2025)*

## Advertencia de diseño (leer primero)

**Fase piloto.** La muestra cubre 339 RUC de una meta de ~13.366
(~3%) — ingesta parcial y no aleatoria de Aduanet. Los niveles de FOB
**no representan** el comercio total por aduana; solo lo ingerido. Con 15 aduanas y
atributos de infraestructura de corte único, β se identifica de la variación entre
aduanas (poder limitado; 15 clusters es poco para EE cluster).

## Qué se midió

- **Panel aduana×mes** (2019-2025) de FOB, RUC activos y diversificación de destinos
  (1−HHI), con ceros explícitos para aduana-mes sin registros.
- **Atributos MTC** por aduana (mapeo manual documentado en el script): terminales
  mapeados (8 aduanas marítimas/fluviales), aeródromo para la aérea
  (Jorge Chávez), 4 fronterizas sin terminal y 1 interior.
  Dedupe: 217 terminales con estado
  no disponible → 105 con estado real.

## Hallazgos

1. **Concentración**: la aduana marítima del Callao concentra el
   62% del FOB de la muestra; las 3 primeras (Callao marítimo,
   Callao aéreo, Paita) superan el 84%.
2. **Concesión**: los modelos dan β positivo para terminales concesionados
   (entre-aduanas y panel con FE de tiempo; ver `tabla_02_modelos.csv`), PERO la
   concesión coincide exactamente con las aduanas más grandes del país (Callao,
   Paita, Matarani): con 15 aduanas, β NO separa el efecto concesión del efecto
   tamaño. Lectura correcta: el resultado es compatible con la hipótesis pero no
   la identifica.
3. **Estado de conservación**: 8 aduanas con dato usable
   (el resto: 'Información no disponible' en el MTC) — limitación del registro oficial.
4. **Cargas históricas (2010-2017)**: solo 8 aduanas tienen
   contraparte en el registro histórico de cargas — cobertura insuficiente para un
   control serio.

## Cómo leer esto

Correlacional, muestral y con N chico. Sirve como pipeline verificado para la fase
completa (misma ingesta Aduanet, sin cambios de código) y como diagnóstico de la
calidad del registro oficial de infraestructura (312/507 terminales sin estado).

## Reproducibilidad

`scripts/extraer_datos.py` → `data/raw/` (15.037 filas) → `scripts/analisar.py` → `results/`.
