# Datos crudos — estado real (2026-10-15)

**Actualización**: los dos huecos descritos abajo para Comtrade quedaron resueltos usando BACI (CEPII) en su lugar — `baci_peru_hs2.csv`, `baci_mundo_hs2.csv` y `baci_peru_bilateral_hs2.csv` cubren los 10 años completos (2015-2024) y los 12 socios CPTPP+China. El job de Comtrade se detuvo manualmente al quedar redundante (ver `../README.md`). `comtrade_flujos.csv` queda como referencia secundaria, no se completó.

## `wdi_wgi.csv`
2,550 filas, 15 países, 2015-2024, 17 indicadores (incluidas las 6 dimensiones WGI). Completo para los fines de este proyecto.

## `comtrade_flujos.csv`
7,636 filas. Dos huecos reales, verificados en Neon antes de exportar:

### 1. Socios CPTPP sin cargar (7 de 12)
Cubiertos: Canadá, Chile, China, Japón, México.
**Faltan**: Australia (36), Brunéi Darussalam (96), Malasia (458), Nueva Zelanda (554), Singapur (702), Vietnam (704), Reino Unido (826).

El conector `mcp-server/src/ingest/comtrade-benchmark.ts` ya soporta `--partners`, no hace falta un conector nuevo:

```bash
npx tsx mcp-server/src/ingest/comtrade-benchmark.ts --reporters 604 --partners 0,36,96,458,554,702,704,826
```

### 2. Agregado mundial (reporter_code '0') solo cargado para 2019
Perú (`reporter_code '604'`) está completo 2019-2024, pero el denominador mundial que exige el cálculo de RCA y de shift-share **solo existe para 2019**. Sin esto, `05_shift_share.py` y cualquier RCA multi-año fallan por diseño (ver el guard explícito en esos scripts, no es un bug).

Para completarlo, correr el bloque `--mundo` del mismo conector para los años faltantes:

```bash
npx tsx mcp-server/src/ingest/comtrade-benchmark.ts --reporters 604 2020,2021,2022,2023,2024
```

(revisar el conector por el manejo exacto de rango de años — no se corrió en esta sesión por quedar fuera del alcance de "organizar, no redactar").
