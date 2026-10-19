# data/raw — cobertura y huecos conocidos (diagnóstico 2026-10-19)

Aún no hay extractos: esta carpeta documenta lo verificado en vivo contra Neon (proyecto `appsperu`, branch `production`) el **2026-10-19**, antes de correr la extracción.

## 1. Base principal — `residuos_solidos.residuos_solidos_municipales`

| Métrica | Valor |
|---|---|
| Filas | 11.310 |
| Clave | `(ubigeo, anio)` — 1.891 ubigeos × 6 años (2019–2024) |
| Departamentos | 25 |
| Nulos en `poblacion_total`, `generacion_percapita_dom`, `generacion_mun_tanio`, `clasificacion_municipal_mef`, `region_natural` | **0** |
| Nulos de `ubigeo` | 0 |
| Registros rechazados (`residuos_solidos_rejected`) | 0 |
| Lotes de ingesta | 1 (`record_count` 11.310, `fetched_at` 2026-09-30T23:33Z) |
| `fecha_corte` en los datos | 2024-04-10 … 2025-12-18 |

Filas por año: 2019 = 1.874 · 2020 = 1.874 · 2021 = 1.890 · 2022 = 1.890 · 2023 = 1.891 · 2024 = 1.891.

**Estadísticos año 2024 (n = 1.891):** `generacion_percapita_dom` min 0,20 · P10 0,33 · mediana 0,45 · P90 0,65 · P95 0,70 · máx 0,80 · media 0,479 · media `generacion_percapita_mun` 0,684.

**Rango por año (revisado 2026-10-19):** 2019 0,08–2,00 · 2020 0,11–2,00 · 2021 0,11–0,93 · 2022 0,11–0,87 · 2023 0,11–0,87 · 2024 0,20–0,80. Los extremos de 2019–2020 (2,00 kg/hab/día) son outliers de reporte → winsorizar en robustez. Top 2024 = 0,80 con empates en distritos pequeños (LLAPO 588 hab, MARCA 2.206, OCROS 1.178 — Ancásh; OROPESA 2.137 — Apurímac), de ahí el control por `log(poblacion_total)`.

Por clase MEF (media per cápita dom., 2024): A 0,604 (n=74) · B 0,504 (n=122) · C 0,661 (n=42) · D 0,550 (n=129) · E 0,473 (n=378) · F 0,460 (n=509) · G 0,453 (n=637). Gradiente visible pero no monótono → justifica el análisis, no la concluye.

## 2. Covariables verificadas

### `actividad_empresarial.empresas_privadas_distrito`
- 18.120 filas = 1.510 ubigeos × 12 meses de **2025** (enero–diciembre), suma nacional 4.590.979 empresas.
- Cruce con residuos: **1.508/1.891 distritos (79,7%)**.
- **383 distritos sin registro** → tratar como *missing*, no como 0, hasta verificar si son ceros formales o falla de cobertura MTPE.
- **2 ubigeos huérfanos** (no existen en el padrón MINAM): `000401` y `160109`.
- **Bug de ingesta:** la columna `distrito` llega como `"[object Object]"`. No usar para etiquetas → tomar nombres desde `residuos_solidos_municipales`.

### `radar_inversiones.investments`
- 150.042 proyectos (2001-05-24 … 2026-10-12), 149.896 con `ubigeo`, 2.026 ubigeos distintos (>1.891: hay variantes a depurar en la normalización).
- `estado` es `ACTIVO` para las 150.042 filas → usar `situacion` o `fecha_fin_ejecucion`/`avance_ejecucion` para filtrar ejecución real.

### `programas_sociales.cobertura_social`
- 1.893 filas, un solo corte `fecha_corte` = **2026-04-30**; cruza 1.891/1.891 distritos.
- 2 ubigeos huérfanos: `160405`, `120699`.

### `radar_ejecucion` (descartado como covariable nacional)
- `entities`: 211 entidades, pero solo **84 gobiernos locales** (La Libertad) con ubigeo → no cubre el país. `budget_execution` es solo 2026 con 3 cortes.

### Bases descartadas por este proyecto
- `riesgo_fiscal_isds`: **sin tablas** (0 objetos).
- `servicios_salud.ipress`: 0 filas.
- `identidad_fiscal.ruc_exportaciones_fob`: 1 fila.

## 3. Huecos que hay que cerrar antes de publicar

1. **Unidades** de `generacion_percapita_dom` (se asume kg/hab/día) — diccionario `.xlsx` de MINAM sin decodificar (`docs/data-contracts/minam-residuos-solidos.md`).
2. **Diccionario MEF A–G** sin decodificar en el data contract.
3. **Cobertura MTPE** en los 383 distritos faltantes (¿cero de verdad?).
4. **Año 2025 de residuos**: re-correr ingesta manual si la fuente ya lo publica.
5. Desfase de cortes entre fuentes (2024 / 2025 / 2026) — documentado, no eliminable.

## 4. Extractos planificados

```
data/raw/
  residuos_distrital_2019_2024.csv    # tabla principal (11.310 filas)
  empresas_distrital_2025.csv         # promedio/máximo mensual por ubigeo
  inversion_publica_por_ubigeo.csv    # agregados por distrito
  cobertura_social_2026_04_30.csv     # 1.893 filas
  README.md                           # este archivo (actualizar al extraer)
```
