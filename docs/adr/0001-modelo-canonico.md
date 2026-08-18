# ADR 0001 — Modelo canónico para App 01 (Radar de ejecución)

- Estado: Aceptado
- Fecha: 2026-08-16
- Ámbito: solo el subconjunto necesario para App 01 (presupuesto/ejecución + territorio).
  El modelo completo del grafo (inversión, contrato, proveedor, obra) se define cuando se
  construyan las apps 02-04, no ahora — evita comprometer esquema para dominios que no
  tenemos ingeridos todavía.

## Entidades canónicas (v0.1)

| Entidad | Clave | Notas |
|---|---|---|
| `territory` | `ubigeo` | Departamento/provincia/distrito, con `vigente_desde` y `fuente`. |
| `entity` | `entity_code` | Código de pliego/ejecutora del MEF. Referencia `ubigeo`. |
| `budget_execution` | `(entity_code, funcion, anio_fiscal)` | PIA, PIM, devengado, fecha de corte. |
| `raw_mef_batches` | `id` (autogenerado) | Lote crudo, nunca se sobreescribe (lake de evidencia). |
| `cohort_rule` | `id` + `version` | Regla de agrupación territorial versionada. |

## Tipos de relación

Siguiendo la "Regla de enlace" del documento fuente: toda relación entre entidades se marca
como `confirmada`, `candidata` o `no_disponible`. En App 01 todas las relaciones son
`confirmada` porque provienen de una sola fuente (MEF) con claves directas — no hay linking
probabilístico todavía. Esto cambia cuando se agregue OCDS/proveedores (App 03).

## Decisiones

1. `raw_mef_batches.payload` se guarda como `jsonb` sin transformar — es el hecho fuente.
2. Ningún cálculo derivado (avance %, percentil) se persiste sin su fórmula documentada
   (ver `docs/data-contracts/mef-presupuesto-ejecucion.md`).
3. Un benchmark nunca se publica si el tamaño de cohorte (`n`) es menor al mínimo definido
   en `cohort_rule` — se responde `datos_insuficientes` explícitamente.
