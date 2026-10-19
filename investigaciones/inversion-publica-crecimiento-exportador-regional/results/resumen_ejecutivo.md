# Resumen ejecutivo — inversión pública productiva y exportadores regionales (fase piloto)

*Generado por `scripts/analisar.py` · fecha: 2026-10-19 · panel 175 obs
(25 dept × 7 años, 2019-2025)*

## Advertencia de diseño (leer primero)

**Fase piloto.** La variable dependiente cubre 339 RUC con registro FOB de una meta de
~13.366 (2.5%) — muestra parcial NO aleatoria (ingesta secuencial de Aduanet). El
31% de los dept-año no tiene ningún exportador registrado. Todos los resultados
son exploratorios.

## Qué se midió

- **Inversión**: finalizaciones de obra (fecha_fin_ejecucion ≤ 2026; se excluyen 48.263
  proyectos con fechas futuras hasta 2070) clasificadas dos veces:
  (a) por función de obra (TRANSPORTE/ENERGÍA/AGROPECUARIA: 17,071
  proyectos finalizados 2019-2025) y (b) por pliego ejecutor (la clasificación original de la
  propuesta: TRANSPORTES Y COMUNICACIONES / AGRICULTURA Y RIEGO / ENERGIA Y MINAS).
- **Exportadores**: RUC distintos con registro FOB por año cuyo domicilio fiscal
  (padrón SUNAT) queda en el departamento (337/339 RUC con ubigeo).

## Hallazgos

1. **Concentración extrema**: los 3 departamentos principales concentran el
   72% de los registros exportador-año (LIMA 655, JUNIN 82, SAN MARTIN 76).
2. **Precedencia inversión→exportadores: sin señal.** Especificación principal (M1):
   beta = -0.1214 (p=0.2048, n=175, R²=0.989).
   Con rezagos 0-3 (M2, beta_t = -0.0014, p=0.9911) y con la
   clasificación por pliego (M5, beta = -0.059, p=0.1774) tampoco hay señal.
3. **Dirección inversa (M4)**: rezagos de exportadores sobre inversión presente —
   betas [-0.0009, 0.0176, 0.0055, -0.0165] (p=[0.9636, 0.773, 0.9349, 0.5323]); tampoco hay señal.
4. **Cobertura de la inversión**: 99% de los dept-año tienen
   al menos una finalización productiva registrada.

## Lectura honesta

Con la muestra actual de exportadores, el test de precedencia da **null en ambas
direcciones**: no hay con qué distinguir inversión→exportadores de exportadores→
inversión. Esto NO demuestra ausencia de relación — la potencia del panel chico
(n=175, DV con 31% de ceros) la descarta como herramienta diagnóstica. El
resultado útil es metodológico: el pipeline queda listo para la fase completa cuando
Aduanet complete la ingesta, sin ningún cambio de código.

## Reproducibilidad

`scripts/extraer_datos.py` → `data/raw/` (17.120 filas) → `scripts/analisar.py` → `results/`.
