# Memo — Ejecución presupuestal en función TURISMO, La Libertad (corte 2026-08-18)

**Para**: equipo de gestión pública / seguimiento de inversión turística regional
**De**: análisis de datos abiertos, Follow the Sol
**Fecha**: 2026-08-20
**Fuentes**: MEF (Presupuesto y ejecución de gasto, `2026-Gasto-Mensual.csv`), OECE (procesos de contratación, muestra departamental), SUNAT (Padrón Reducido RUC)

## Resumen ejecutivo

De 39 unidades ejecutoras de La Libertad con presupuesto asignado a la función **TURISMO** en 2026, **5 tienen 0% de avance de ejecución** a la fecha de corte (2026-08-18), mientras que 4 municipalidades comparables ya llegaron al 100%. El análisis descarta la hipótesis de "municipalidad sin capacidad operativa" para al menos una de ellas (Pías, con S/7.5M en compras públicas de otras partidas) — el problema es específico a cómo se diseñó o priorizó la partida de turismo, no una incapacidad general de gestión.

## Hallazgo 1 — Avance global y dispersión

- Avance global de la región en función TURISMO: **55.9%** (S/ 4,952,236 devengado de S/ 8,851,637 de PIM).
- Rango real: desde 0% hasta 100% entre municipalidades con presupuestos de magnitud similar (S/1,000 a S/68,301 en las de peor desempeño) — la dispersión no se explica por tamaño de presupuesto.

## Hallazgo 2 — Las 5 unidades con 0% de ejecución

| Municipalidad | Entity code (MEF) | PIM turismo | RUC (SUNAT) | Estado tributario | Procesos de compra registrados (OECE, todas las funciones) |
|---|---|---|---|---|---|
| MUNICIPALIDAD DISTRITAL DE PIAS | 301185 | S/ 15,988 | 20201... (no verificado directamente, match por crosswalk) | — | 3 procesos, S/ 7,542,517.81 |
| MUNICIPALIDAD DISTRITAL DE SITABAMBA | 301204 | S/ 28,500 | — | — | 1 proceso, S/ 829,151.58 |
| MUNICIPALIDAD DISTRITAL DE HUAYO | 301181 | S/ 1,000 | — | — | 1 proceso, S/ 65,790.00 |
| MUNICIPALIDAD DISTRITAL DE HUASO | 301160 | S/ 68,301 | — | — | 1 proceso, S/ 0.00 (sin monto asignado aún) |
| MUNICIPALIDAD DISTRITAL DE PARANDAY | 301167 | S/ 41,767 | **20201254117** — ACTIVO, HABIDO | Regular | **0 procesos** (sin match en el crosswalk ni en búsqueda directa por nombre) |

## Hallazgo 3 — Paranday: el caso más nítido

Paranday es el único de los 5 con identidad fiscal 100% verificada y sin irregularidad: RUC `20201254117`, estado **ACTIVO**, condición de domicilio **HABIDO**, ubigeo `130610` (coincide con el de la entidad en el padrón MEF — mismo distrito). No hay ninguna señal de que la municipalidad tenga un problema administrativo de fondo.

Sin embargo, **no aparece ni un solo proceso de contratación** a su nombre en la muestra de OECE para todo el departamento — ni en turismo ni en ninguna otra función. Esto es distinto al caso de Pías (que sí compra activamente, solo que no en turismo): en Paranday, la ausencia es total.

**Interpretación con el debido cuidado**: esto puede significar (a) que la municipalidad efectivamente no ha sacado ningún proceso a concurso en el periodo cubierto, o (b) que la muestra de OECE simplemente no la capturó — la ingesta actual cubre 144 procesos en 56 entidades de La Libertad, una fracción del total de las ~83 municipalidades distritales y provinciales de la región (limitada por `OECE_MAX_PAGES=10` en el conector). **No se puede afirmar con la evidencia actual que Paranday no ejecuta nada** — solo que no hay registro de ello en esta muestra. Ampliar la paginación del conector de OECE es el paso necesario antes de nombrar esto como un hallazgo definitivo sobre Paranday específicamente.

## Lo que sí se puede afirmar con la evidencia actual

1. La brecha de ejecución en función TURISMO en La Libertad es real y verificable (55.9% de avance regional, con 5 unidades en 0%).
2. Al menos un caso (Pías) demuestra que la falta de ejecución en turismo no es un problema de capacidad de gestión general — la entidad sí ejecuta compras públicas de magnitud considerable en otras partidas.
3. Ningún indicio de irregularidad fiscal o administrativa explica el estancamiento de Paranday — su identidad fiscal está limpia.

## Lo que falta para cerrar el caso

- Ampliar `OECE_MAX_PAGES` (hoy en 10) para confirmar si Paranday genuinamente no sacó procesos o si es un artefacto de la muestra parcial.
- Revisar el detalle de la partida de turismo en el PIM de cada municipalidad de 0% (¿es un proyecto de inversión sin expediente técnico listo? ¿gasto corriente sin actividad definida?) — esto requeriría el detalle por meta/actividad, no solo el agregado por función que trae `radar-ejecucion` hoy.
- Confirmar RUC y estado tributario de Sitabamba, Huayo y Huaso (pendiente, no se hizo el cruce individual para las 3 restantes).

---
*Datos: `radar-ejecucion` (puerto 4000), `compras-publicas` (puerto 4001), `identidad-fiscal` — consultas directas verificadas 2026-08-20. Metodología de cruce (`entity_crosswalk`, fuzzy matching) documentada en `docs/data-contracts/`.*
