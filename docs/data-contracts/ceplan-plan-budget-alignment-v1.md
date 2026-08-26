# Data contract — Plan–Budget Alignment (PBA) v1

> PRD: [`docs/PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md`](../PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md)  
> Ticket: AL2-05  
> App propietaria: `ceplan-estrategico/api` (indicadores) + lectura `radar-ejecucion`

## Propósito

Comparar **dimensiones temáticas** del marco CEPLAN (ObservaPerú) con la **distribución del gasto devengado** por función MEF en un departamento piloto — exploratorio, no certificación de alineación del PEI.

## Endpoint previsto (Sprint 8)

```
GET /api/indicators/plan-budget-alignment?departamento={NOMBRE}&anio={YYYY}
```

## Tabla de mapeo v1 (heurística)

| Dimensión CEPLAN | Indicadores catálogo | Funciones MEF (`radar-ejecucion`) | Confianza |
|---|---|---|---|
| Salud y nutrición | `SOC*`, `CUMP*` (salud) | `SALUD` | Media |
| Educación | `SOC*`, `ip_pryedux` | `EDUCACION` | Media |
| Turismo y cultura | `ip_pryturx`, PN turismo | `TURISMO`, `CULTURA` | Media |
| Agro y riego | `ip_prysecagr`, `ECO*` | `AGROPECUARIA`, `PESCA` | Media |
| Ambiente | `AMB*`, `ma_*` geo | `AMBiente` (normalizar mayúsculas) | Baja |
| Infraestructura vial | `ip_prysectra`, `cn_redvial*` | `TRANSPORTES`, `COMUNICACIONES` | Media |
| Seguridad ciudadana | `ip_pryordpubsegx` | `SEGURIDAD CIUDADANA`, `JUSTICIA` | Media |
| Desarrollo económico | `ECO*`, `INV*` | `COMERCIO`, `PRODUCCION` | Baja |
| Institucional | `INST*`, `PLAN*` | `GOBIERNO GENERAL`, `PLANEAMIENTO` | Baja |
| Vivienda | `ip_pryvivdesurbx` | `VIVIENDA`, `SANEAMIENTO` | Media |

## Salida por dimensión

```json
{
  "dimension": "Turismo y cultura",
  "indicadoresCeplan": ["ip_pryturx"],
  "funcionesMef": ["TURISMO", "CULTURA"],
  "gastoDevengadoDepartamento": 155789000,
  "participacionPresupuestoDept": 0.042,
  "matcher": "heuristica_dimension_v1",
  "restriccion": "Mapeo CEPLAN→MEF no es oficial; no prueba alineación del PEI regional."
}
```

## Reglas

1. Solo departamentos piloto (5 regiones).
2. Numerador: `SUM(devengado)` filtrado por `departamento` + `funcion IN (...)`.
3. Denominador: `SUM(devengado)` total del departamento en el mismo año.
4. Si CEPLAN no tiene serie regional, el bloque CEPLAN es referencia nacional GN/GR, no del departamento.
5. Versión del mapeo en respuesta: `mapeoVersion: "v1"`.

## Limitaciones

- ObservaPerú no publica presupuesto por dimensión × departamento.
- Funciones MEF usan nomenclatura distinta al pilar CEPLAN.
- No sustituye análisis cualitativo del PEI regional.

## Próximo paso

Implementar en Sprint 8 con tests de fixture para La Libertad (función TURISMO ya analizada en memo turismo).
