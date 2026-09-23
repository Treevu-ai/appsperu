# Data contract — CENARES (Seguimiento de Pecosas)

> Ficha técnica del conector: [`docs/conectores.md#servicios-salud`](../conectores.md#servicios-salud)

Investigación en vivo: 2026-09-23. Ingesta real verificada contra Postgres local (66,687 filas, 0 rechazadas).

## Fuente

- `datosabiertos.gob.pe` (PNDA), dataset
  `seguimiento-de-pecosas-del-centro-nacional-de-abastecimiento-en-recursos-estratégicos`,
  publicado por CENARES/MINSA — mismo grupo CKAN que `cenares-distribucion.md`
  (`group/centro-nacional-de-abastecimiento-de-recursos-estratégicos-en-salud-cenares`), pero es
  un dataset independiente, no un recurso adicional del mismo.
- Resuelto vía `package_show` de CKAN (`@appsperu/ckan-client`, mismo cliente que RENIPRESS/CENARES
  distribución) — un único recurso CSV.
- Corte 2023 (a diferencia de CENARES distribución, que es corte 2024) — datasets complementarios
  por año, no duplicados.

## Cómo se llegó a esto

Al investigar el mercado de reactivos médicos como proveedores del Estado, se verificó si el grupo
CKAN de CENARES tenía algún recurso separado de "reactivos". No lo tiene, pero sí tiene 2 datasets
adicionales al ya ingerido: este (Pecosas) y "Monto Presupuestal" (agregado SIAF/MEF, sin nivel de
ítem — descartado, no aporta granularidad nueva). Pecosas sí aportaba algo que CENARES distribución
no tiene: proveedor por entrega.

## Schema real confirmado — 13 columnas

```
ANIOPECOSA;NROPECOSA;FECHAPECOSA;CODIGO_SIGA;NOMBRE_ALM;NROPEDIDO;DESCMARCAPECOSA;
ANIO_OC;NRO_OC;OBSERVACION_OC;MARCA_OC;PROVEEDOR;DESC_PROVEEDOR
```

- **Encoding Latin-1**, igual que CENARES distribución (no UTF-8).
- **`FECHAPECOSA` sin cero a la izquierda** (`"6/03/2023"`, no `"06/03/2023"`) — a diferencia de
  CENARES distribución (`FECHACREACION`/`FECHAPECOSA` siempre con cero a la izquierda). El parser
  de fechas de este conector (`parseFechaFlexibleDDMMYYYY`) es deliberadamente distinto del de
  `cenares-parse.ts` por esto — no se reutilizó `parseFechaDDMMYYYY` porque hubiera rechazado la
  mayoría de fechas reales del dataset.
- **`DESC_PROVEEDOR`/`PROVEEDOR`**: proveedor de la orden de compra asociada a la pecosa — esto es
  lo que CENARES distribución no tiene. 103 proveedores distintos en las 66,687 filas ingeridas;
  los 4 con más filas son droguerías/laboratorios farmacéuticos (Instituto Quimioterápico,
  Medifarma, Laboratorios Americanos, Droguería Inversiones JPS).
- **`OBSERVACION_OC`** es texto libre con `;`/comas dentro de comillas — mismo criterio de
  `relax_column_count: true` que CENARES distribución.

## Hallazgo real — este dataset NO tiene reactivos de laboratorio

Verificado post-ingesta: `SELECT COUNT(*) FROM cenares_pecosas WHERE desc_marca_pecosa ILIKE
'%REACTIV%'` → **0 filas** de 66,687. Los productos que trae (`HYOS-B20`, `CLINDINEX`, etc.) son
medicamentos, no reactivos de diagnóstico in vitro. **Conclusión operativa: CENARES, en ninguno de
sus 3 datasets en PNDA, es una fuente útil para el mercado de reactivos médicos** — ese canal corre
por compras directas de cada red de salud vía OECE (ver
[`oece-reactivos-medicos-hallazgos.md`](oece-reactivos-medicos-hallazgos.md)), no por CENARES.

## Pendiente / fuera de alcance de este conector

1. **Sin cruce con CENARES distribución** — ambos datasets podrían compartir `NRO_OC`/proveedor en
   años donde se solapan, pero son cortes de años distintos (2023 vs. 2024) y no se intentó cruzar.
2. **`CODIGO_SIGA`** se ingiere tal cual como texto, sin validar contra el catálogo SIGA real.
