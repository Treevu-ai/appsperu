# Data contract — Score de salud institucional

Construido en vivo: 2026-08-20.

## Qué es

`apps/salud-institucional/api` — app de solo lectura, **sin base propia**, que
combina 5 señales ya cruzadas y verificadas en el resto del proyecto en un
único índice por entidad (`entity_code` de `radar-ejecucion`, la llave
canónica). No ingiere nada; conecta en vivo a las 5 bases existentes.

## Componentes (cada uno 0-100, promedio simple de los disponibles)

| Componente | Fuente | Cruce | Fórmula |
|---|---|---|---|
| Ejecución presupuestal | `radar-ejecucion` (propia) | — | `devengado/pim`, cap 100 |
| Obras no paralizadas | `infobras` | `entity_crosswalk` (difuso, recién poblado: 74 confirmadas + 15 candidatas de 121) | `1 - paralizadas/total` |
| Inversiones sin sobrecosto | `radar-inversiones` | `sec_ejec` (exacto) | `1 - conSobrecosto/total` |
| Compras no concentradas | `compras-publicas` | `entity_crosswalk` (difuso, 42 entidades) | `1 - maxProveedor/totalAdjudicado` |
| Salud tributaria de proveedores | `identidad-fiscal` | RUC exacto (vía `supplier_id`) | `regulares/evaluables` |

**Regla central, no negociable**: si una fuente no tiene dato para una
entidad, ese componente se omite del promedio — nunca se imputa 0 ni 100 por
ausencia. `componentesUsados` viaja explícito en cada resultado; un score con
1 componente no es comparable a uno con 5, y el consumidor debe poder verlo.

## Hallazgo real al construir esto: el crosswalk `infobras ↔ radar-ejecucion` existía en código pero nunca se había corrido

La migración `003_entity_crosswalk.sql` y el endpoint `GET /api/crossref/ejecucion`
de `infobras/api` ya existían (documentados en `docs/ESTADO.md`), pero la
tabla nunca se había poblado — `SELECT * FROM entity_crosswalk` fallaba con
"relation does not exist" porque la migración nunca corrió. Se aplicó
(`npm run migrate`) y se reconstruyó (`npm run crossref:build`) como parte de
este trabajo: **74 confirmadas, 15 candidatas, 75 sin match** de 121
entidades de `radar-ejecucion` × 164 entidades de `infobras`.

## Verificado en vivo (2026-08-20)

- `GET /api/score?departamento=LA%20LIBERTAD` — **200 OK en 0.45s**, 121
  entidades, las 121 con al menos un componente disponible.
- Caso de control (Municipalidad Provincial de Sánchez Carrión, ya
  investigada en `docs/data-contracts/sunat-padron-ruc.md`): score compuesto
  **58.6**, con los 5 componentes disponibles — ejecución 34.6%, obras no
  paralizadas 90.6%, inversiones sin sobrecosto 29.8%, compras no
  concentradas 38%, salud tributaria de proveedores 100%.
- Extremos reales: mejor score con datos completos, `MUNICIPALIDAD DISTRITAL
  DE PUEBLO NUEVO` (82.6, 3 componentes). Peor con 5 componentes disponibles,
  `MUNICIPALIDAD PROVINCIAL DE VIRU` (39.5).

## Limitaciones explícitas

- **Pesos iguales entre componentes, sin justificación empírica** — es un
  punto de partida razonable, no una calibración validada. Cambiar los pesos
  cambiaría el ranking; cualquier publicación debe declarar que son iguales
  por diseño, no por hallazgo.
- **`componentesUsados` bajo = score menos confiable**, pero el número solo
  se expone, no se pondera automáticamente contra la confianza del dato — un
  score de 1 componente puede parecer tan "sólido" como uno de 5 si no se lee
  el campo explícito.
- **Los dos crosswalks difusos (`infobras`, `compras-publicas`) heredan sus
  propias limitaciones** — confianza `candidata` no es lo mismo que
  `confirmada`; el score no distingue hoy cuánto de cada componente viene de
  un match exacto vs. difuso.
- **`salud tributaria de proveedores`** solo cuenta proveedores con RUC
  válido de 11 dígitos ya ingeridos en `identidad-fiscal` (RUC-20) — los
  consorcios y personas naturales quedan fuera del cálculo, no se penalizan
  ni favorecen.
