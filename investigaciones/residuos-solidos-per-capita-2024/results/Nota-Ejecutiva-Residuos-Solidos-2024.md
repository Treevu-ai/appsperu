# Nota ejecutiva — Generación de residuos sólidos per cápita en el Perú (corte 2024)

**Corte:** 2024 · **Universo:** 1.891 distritos (padrón MINAM) · **Unidad:** kg/hab/día sobre población urbana
**Fuentes:** MINAM/SIGERSOL (residuos), MTPE (empresas formales, 2025), Invierte.pe (inversión acumulada a 2024), INEI (población), MEF (clasificación municipal del Programa de Incentivos)
**Diseño:** corte transversal; regresiones con errores estándar robustos clusterizados por departamento (n = 1.508 casos completos). Versión técnica: `resumen_ejecutivo.md`.

---

## Qué muestra este corte

La generación de residuos domiciliarios per cápita —uno de los pocos proxies de consumo material disponibles a nivel distrital en el país— promedia **0,48 kg/hab/día** en 2024 y exhibe una desigualdad territorial moderada pero sistemática: el distrito del percentil 90 genera **1,97 veces** el del percentil 10 (0,65 frente a 0,33). Esa variación se asocia con la actividad económica formal del distrito y con su tamaño y grado de urbanización, pero **no** con la inversión pública acumulada.

## Hallazgos

**1. La brecha entre departamentos es pequeña; la que importa es la interna, entre distritos.** La media nacional es 0,48 kg/hab/día (mediana 0,45; rango 0,20–0,80). De los 25 departamentos, Callao encabeza (0,69) y Tacna cierra (0,43): los extremos difieren solo 1,6 veces, mientras que dentro de un mismo departamento la dispersión distrital es mucho mayor. El pico exacto en 0,45 kg/hab/día refleja que la cifra proviene de estudios de caracterización, no de medición continua.

**2. La actividad formal explica parte de la variación; la inversión pública, no.** En la especificación principal (R² = 0,198), un 1% más de empresas formales por distrito se asocia con **+0,018% de residuos per cápita** (EE 0,009; significativo al 5%). El coeficiente es estable: entre +0,017 y +0,025, siempre significativo, en las 8 especificaciones (efectos fijos de departamento, winsorización 1%, variable dependiente municipal, año 2023 y sin el control de urbanización). La inversión pública acumulada (mediana S/ 167 millones por distrito) **no es significativa en ninguna de ellas**: un null honesto que conviene declarar.

**3. La clasificación MEF A–G mide urbanización, no capacidad fiscal.** Las medias de generación caen desde A (ciudades principales) 0,60 y C (Lima Metropolitana) 0,66 hasta F 0,46 y G 0,45. Frente a la clase A, F es −0,134 y G −0,121 (significativos), y el contraste se sostiene al retirar el control de urbanización (F = −0,141). C es la única clase superior (+0,050), y es la que más empresas concentra (4.201 formales/mes frente a 1.592 en A). Como E/F/G se definen por el porcentaje de población urbana, estos contrastes recogen **tamaño y urbanización del municipio, no presupuesto**: leerlos como "menor capacidad fiscal" sería incorrecto.

**4. La priorización identifica alta generación en municipios pequeños y dispersos.** El índice de presión (50% posición en generación + 50% posición inversa en la escala MEF A→G) selecciona 30 distritos, **todos de clase G**. Seis empatan en el valor máximo (0,80 kg/hab/día + clase G): MOLLEPAMPA (Huancavelica), CONDURIRI (Puno), PUÑOS (Huánuco), YAUYUCAN (Cajamarca), LIMATAMBO y OCORURO (Cusco) — el orden dentro del empate es arbitrario y el patrón es lo que importa: generación alta reportada donde hay menor densidad y, por tanto, mayor costo unitario de recolección. En total, 37 distritos tocan el techo de 0,80.

## Tres implicancias de política

1. **Focalizar por costo unitario de servicio, no por la escala A–G.** El índice de presión funciona como pantalla inicial para dirigir acompañamiento técnico o transferencias condicionadas a municipios donde la recolección por tonelada es más cara por dispersión. Como la prioridad se define con generación y no con capacidad de gasto, debe complementarse con datos de cobertura de servicio antes de condicionar recursos.

2. **La generación per cápita es una señal rápida de actividad local.** Su asociación estable con las empresas formales la vuelve un indicador de contraste para distritos donde la estadística económica llega con demora. El corolario del null de inversión pública: la inversión acumulada no debe usarse como proxy del consumo domiciliario local.

3. **Mejorar la medición antes de condicionar recursos.** Con 37 distritos en el techo exacto de 0,80 y una GPC derivada de estudios de caracterización municipales, la comparabilidad es limitada: conviene actualizar las caracterizaciones en SIGERSOL y sumar, en un siguiente producto, la cobertura de recolección y tratamiento (SINAN). En paralelo, dejar claro que esa escala no mide capacidad fiscal evitará lecturas erróneas en documentos de política.

## Advertencias

- **Asociación, no causalidad:** el diseño es transversal por definición.
- **Cortes distintos:** residuos 2024 · empresas 2025 · programas sociales 2026-04-30.
- **383 distritos sin dato MTPE** se excluyen de los modelos (n = 1.508/1.891), sin imputar ceros.
- **Se mide generación, no cobertura de servicio:** no se afirman brechas de recolección.
- Unidades y diccionario MEF confirmados con el diccionario oficial MINAM (2026-10-19); base re-ingestada el mismo día con 0 registros dañados.

## Reproducibilidad

`scripts/extraer_datos.py` → `data/raw/` (16.739 filas en 4 CSV) → `scripts/analisar.py` → `results/` (4 tablas, 4 figuras, `resumen_ejecutivo.md` y `top30_priorizacion.csv`). Todo el proceso es de solo lectura sobre Neon y corre de punta a punta en menos de un minuto.
