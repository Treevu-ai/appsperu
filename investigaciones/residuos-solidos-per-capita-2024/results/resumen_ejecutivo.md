# Resumen ejecutivo — residuos sólidos per cápita y clasificación municipal MEF (corte 2024)

*Generado por `scripts/analisar.py` · fecha: 2026-10-19 · universo 1.891 distritos · modelos con n = 1.508 (casos completos)*

## 1. Qué se hizo

Corte transversal nacional (año 2024) de la generación de residuos sólidos per cápita
(kg/hab/día, unidades confirmadas con el diccionario oficial MINAM 2026-10-19),
cruzada con empresas formales por distrito (MTPE, 2025), inversión pública acumulada
(Invierte.pe, hasta 2024), programas sociales (corte 2026-04-30) y la clasificación
MEF del municipio del **Programa de Incentivos a la Mejora de la Gestión Municipal** —
que agrupa por tamaño de ciudad y % de población urbana (A ciudades principales ·
C Lima Metropolitana · E/F/G no principales con >70%, 35–70% y <35% urbana), **no por
capacidad fiscal**. Base: panel MINAM/SIGERSOL 2019-2024 extraído de Rastro
(1.891 distritos, 0 nulos en variables clave).
Advertencia de origen: la GPC proviene de **estudios de caracterización** municipales,
no de medición continua — de ahí la fuerte cuantización (pico en 0,45 kg/hab/día).

## 2. Hallazgos

**a) La desigualdad territorial es moderada pero sistemática.** El P90 distrital
(0,65 kg/hab/día) es 1,97 veces el P10 (0,33),
con mediana 0,45 y media 0,48. El rango 2024 va de
0,20 a 0,80 (la serie histórica llega a 2,00 en 2019-2020: outliers
de reporte, por eso 2024 es el corte más limpio).

**b) La generación se asocia al tamaño/urbanización del municipio, no a su capacidad
presupuestaria.** Medias por clase MEF: A 0,60 · B 0,50 · C 0,66 · D 0,55 · E 0,47 · F 0,46 · G 0,45 kg/hab/día. En M3 (ref. = clase A):
**F** (-0.134***), **G** (-0.121**), **E** (-0.119***), **D** (-0.071**) se quedan **por debajo de A y significativas**, mientras
**C** (+0.050***) queda **por encima** (4.201 empresas formales/mes vs
1.592 en A; solo 42 distritos en C, la mayoría urbano al 99%). Lectura: los
distritos **rurales/pequeños (F/G)** generan ~13% menos por habitante que las ciudades
principales — coherente con que la GPC sale de estudios de caracterización y con
menor consumo medido, **no** con "menos capacidad municipal". Como E/F/G se definen
por % de población urbana, esos contrastes son en parte colineales con el control
`pct_urbana`: al retirarlo (M8) el contraste F es -0.141***, lo que confirma que
absorbe urbanización, no presupuesto.
**B** (-0.077*) es negativa pero solo al 10%.

**c) Actividad formal explica parte de la variación; inversión pública no.** En M3
(R² = 0.198, n = 1.508, EE cluster por departamento):
`log(empresas formales)` = +0.018** (EE 0.009) y `log(inversión pública acumulada)` =
+0.006 (EE 0.009) (**no significativo en ninguna de las 8 especificaciones**);
`población urbana` = +0.020 (EE 0.073) y `log(población)` = +0.006 (EE 0.009).
Lectura: un 1% más de empresas formales se asocia con ~0.018% más de residuos
per cápita — la generación sirve como proxy de consumo/formalidad, no solo de tamaño.

**d) Los resultados son estables.** El coeficiente de empresas formales se mantiene
positivo y significativo en las 8 especificaciones (M4 +0.025** · M5 +0.018** · M6 +0.017** · M7 +0.021*** · M8 +0.018**): con FE de departamento
(M4), DV winsorizado 1%/99% (M5), DV per cápita municipal (M6), DV del año 2023 (M7)
y sin el control de urbanización (M8, diagnóstico de colinealidad MEF).

**e) Priorización.** El índice de presión (50% posición en generación + 50% posición
inversa en la escala MEF A→G, es decir distritos pequeños/no urbanos) identifica
30 distritos prioritarios; 30 de ellos están en clases F/G (distritos
rurales). La lectura de política no es "menor capacidad fiscal" sino **alto costo
unitario de servicio**: generación alta en localidades dispersas, donde la recolección
por tonelada cuesta más. Los 5 primeros:
   1. **MOLLEPAMPA** (HUANCAVELICA, clase G, 0,80 kg/hab/día, 1.067 hab)
   2. **CONDURIRI** (PUNO, clase G, 0,80 kg/hab/día, 2.013 hab)
   3. **PU�OS** (HUANUCO, clase G, 0,80 kg/hab/día, 3.815 hab)
   4. **YAUYUCAN** (CAJAMARCA, clase G, 0,80 kg/hab/día, 2.661 hab)
   5. **LIMATAMBO** (CUSCO, clase G, 0,80 kg/hab/día, 7.517 hab).

## 3. Cobertura y limpieza aplicada

| Concepto | Valor |
|---|---|
| Distritos en el padrón MINAM 2024 | 1.891 |
| Con dato de empresas (MTPE 2025) | 1.508 (79,7%) |
| Con ≥1 proyecto Invierte.pe registrado hasta 2024 | 1.891 (100,0%) |
| Filas descartadas fuera del padrón (inversión / empresas / programas) | 135 / 2 / 2 |
| Proyectos Invierte.pe acumulados a 2024 | 110.373 |

## 4. Advertencias para no sobreinterpretar

1. **Asociación, no causalidad**: el diseño es transversal por definición.
2. ~~Unidades y diccionario MEF pendientes~~ → **resueltos 2026-10-19** con el
   diccionario oficial MINAM: per cápita en kg/hab/día y MEF = Programa de Incentivos
   (tamaño de ciudad + % urbana), **no** capacidad fiscal.
3. **GPC basada en estudios de caracterización** municipales (SIGERSOL), no medición
   continua: valores cuantizados y comparabilidad imperfecta entre distritos.
4. **Desfase de cortes**: residuos 2024 · empresas 2025 · programas 2026-04-30.
5. **383 distritos sin dato MTPE**: se excluyen, no se imputan ceros.
6. Se mide **generación**, no cobertura de recolección/tratamiento (SINAN no está en el catálogo).
7. `avance_ejecucion` de Invierte.pe trae 167 valores fuera de rango
   (0-100 esperado): se filtra en la extracción; no usar sin limpiar.
8. **Nombres de distrito con ``** en la fuente MINAM (bug de codificación Latin-1→UTF-8 en la
   ingesta; 48 nombres): afecta solo etiquetas, no claves (`ubigeo`) ni resultados.

## 5. Salidas

`tabla_01_descriptivos.csv` · `tabla_02_por_departamento.csv` · `tabla_03_por_clase_mef.csv` ·
`tabla_04_regresiones.csv` (y `.md`) · `top30_priorizacion.csv` · `fig_01` a `fig_04` (.png).
