# Residuos sólidos per cápita y capacidad económica distrital: un corte transversal nacional (2024)

**Tipo:** investigación de corte transversal, corta y reproducible
**Unidad de análisis:** distrito (n = 1.891)
**Corte temporal:** año 2024 (serie 2019–2024 disponible para robustez)
**Fuentes:** MINAM/SIGERSOL, MTPE, Invierte.pe, MIDIS/INFOMIDIS, INEI (población) — todas ya conectadas en Rastro
**Estado (2026-10-19):** aprobada y ejecutada — ver [`../results/resumen_ejecutivo.md`](../results/resumen_ejecutivo.md). Unidades y diccionario MEF confirmados con el diccionario oficial MINAM (ver `docs/data-contracts/minam-residuos-solidos.md`).

---

## 1. Motivación e interés público económico

La generación de residuos per cápita es una de las pocas variables distritales disponibles en el país que funciona como **proxy de consumo material y de actividad económica cotidiana**, y a la vez es el insumo del costo que cada municipalidad debe asumir en recolección y disposición final.

Dos hechos hacen relevante un corte transversal nacional:

- **Municipalidades con realidades muy distintas.** El MEF (Programa de Incentivos a la Mejora de la Gestión Municipal) clasifica a los municipios de A a G según **tamaño de ciudad y % de población urbana** (A ciudades principales · C Lima Metropolitana · E/F/G no principales con >70%, 35–70% y <35% urbana). Si la generación de residuos per cápita difiere sistemáticamente entre esas clases, el costo de recolección por tonelada —más alto donde hay menos densidad— recae sobre territorios con menor escala de servicio: un problema de economía política local con impacto directo en tarifas, transferencias y saneamiento.
- **Falta de lectura territorial integrada.** Los datos existen por separado (residuos, empresas formales, inversión pública, cobertura social), pero no se han cruzado a nivel distrito. Rastro ya los tiene conectados, lo que hace viable un producto corto en días, no meses.

**Pregunta central:** *En el corte 2024, ¿cómo se distribuye la generación de residuos sólidos per cápita entre los 1.891 distritos del Perú y qué relación guarda con la actividad económica formal, la inversión pública acumulada y la clasificación MEF (tamaño/urbanización) del municipio?*

**Preguntas secundarias:**

1. ¿Cuánta desigualdad territorial hay (P90/P10) y dónde se concentra?
2. ¿Los distritos con más empresas formales y más inversión pública generan más residuos per cápita?
3. ¿Qué distritos combinan **alta generación con clasificación MEF baja** (prioridad de política)?

## 2. Datos

| Variable | Fuente en Rastro | Cobertura verificada | Rol |
|---|---|---|---|
| Generación residuos domiciliarios y municipal per cápita (**kg/hab/día**, según diccionario oficial MINAM), ton/día, ton/año, población INEI, región natural, tipo de municipalidad, clasificación MEF | `residuos_solidos.residuos_solidos_municipales` | 1.891 ubigeos × 2019–2024, 0 nulos, ingesta 2026-09-30 | **DV y covariables base** |
| Empresas formales por distrito (mensual 2025) | `actividad_empresarial.empresas_privadas_distrito` | 1.508/1.891 distritos (80%) | Proxy de actividad/formalidad |
| Inversión pública acumulada y en ejecución por distrito | `radar_inversiones.investments` | 150.042 proyectos, 149.896 con ubigeo | Inversión pública |
| Hogares Juntos, Pensión 65, Qali Warma, FONCODES por distrito | `programas_sociales.cobertura_social` (corte 2026-04-30) | 1.891/1.891 | Vulnerabilidad / control |

**Corte elegido:** 2024, último año con cobertura completa (1.891 distritos) en la fuente MINAM. 2019–2023 se usan para robustez (¿la relación se sostiene en el tiempo?) sin convertir el producto en un panel.

## 3. Diseño y método (breve)

1. **Descripción:** percentiles (P10, P50, P90) de generación per cápita, descomposición por departamento, región natural, tipo de municipalidad y clase MEF; mapa de coropletas a nivel distrito.
2. **Asociación:** regresión de `log(generación per cápita domiciliaria)` sobre `log(empresas por distrito)`, `log(inversión pública acumulada + 1)`, `% población urbana`, `log(población)`, clase MEF y controles de región natural, con errores estándar robustos clusterizados por departamento. Dado que E/F/G se definen por % urbana, se añade una especificación sin `pct_urbana` para diagnosticar colinealidad.
3. **Priorización:** índice simple de dos dimensiones (posición en generación per cápita × posición inversa en la escala MEF A→G, i.e. municipios pequeños/no urbanos) para listar los 30 distritos de mayor presión combinada — alta generación con alto costo unitario de servicio.
4. **Robustez:** año 2023; exclusión de distritos con población < 1.000; winsorización del 1% superior; muestra completa vs muestra con empresas (sesgo de selección).

**Herramientas:** extracción con SQL directo a Neon (`scripts/diagnostico.sql` y script de extracción pendiente), análisis en Python (pandas + statsmodels), figuras en matplotlib. Todo reproducible desde `data/raw/`.

## 4. Entregables

- 4–6 tablas/figuras en `results/` (distribución, mapa, tabla de regresión, lista de priorización).
- Nota ejecutiva de 2–3 páginas con hallazgos y sus tres implicancias de política.
- Post de LinkedIn derivado (patrón ya usado en Rastro).

## 5. Limitaciones declaradas

- Se mide **generación**, no cobertura de servicio: no se afirmarán brechas de recolección (SINAN no está en el catálogo).
- Desfase de años entre fuentes (residuos 2024, empresas 2025, programas 2026): se declara explícitamente y no se presentan como simultáneos.
- ~~Unidades de generación y diccionario MEF pendientes de confirmación~~ → **resueltos 2026-10-19** con el diccionario oficial MINAM: per cápita en kg/hab/día (sobre población urbana) y MEF = Programa de Incentivos (tamaño de ciudad + % urbana, no capacidad fiscal). Queda la advertencia de que la GPC sale de estudios de caracterización municipales, no de medición continua.
- 383 distritos sin dato MTPE: se modelan como faltantes, no como cero.
- Asociación, no causalidad: el diseño es transversal por definición.

## 6. Esfuerzo estimado

| Fase | Esfuerzo |
|---|---|
| Extracción + limpieza | 0,5 día |
| Descriptivos + figuras | 0,5 día |
| Regresión + robustez | 0,5 día |
| Nota ejecutiva + revisión | 0,5 día |
| **Total** | **~2 días** |
