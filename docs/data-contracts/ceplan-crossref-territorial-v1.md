# Data contract — CEPLAN crossref territorial v1 (Fase 2)

> PRD: [`docs/PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md`](../PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md)  
> Ticket: AL2-04  
> App propietaria: `ceplan-estrategico/api`

## Propósito

Enriquecer el marco de gestión estratégica CEPLAN (ObservaPerú, agregado GN/GR) con **contexto territorial departamental** de `ceplan-geo`, sin afirmar que CEPLAN reporta indicadores por departamento.

## Endpoint

```
GET /api/crossref/territorial?departamento={NOMBRE}
```

### Parámetros

| Parámetro | Tipo | Requerido | Valores |
|---|---|---|---|
| `departamento` | string | sí | `LA LIBERTAD`, `LAMBAYEQUE`, `PIURA`, `CAJAMARCA`, `CUSCO` |

### Respuesta 200

```json
{
  "matcher": "departamento_prefijo_ubigeo",
  "cobertura": "PARCIAL",
  "restriccion": "Indicadores CEPLAN son nacionales por nivel de gobierno; el bloque territorial describe el departamento en ceplan-geo, no desempeño estratégico regional.",
  "dependencias": [
    { "app": "ceplan-geo", "url": "http://localhost:4005/api/...", "ok": true }
  ],
  "corte": {
    "generadoEl": "2026-08-26T00:00:00.000Z",
    "anioCeplan": 2024,
    "anioEjecucion": 2026
  },
  "departamento": "LA LIBERTAD",
  "ubigeoPrefijo": "13",
  "marcoEstrategicoNacional": {
    "GN": {
      "CUMP02": 73.7,
      "CUMP03": 95.1,
      "segPp": 21.4,
      "executionEfficiency": 0.776
    },
    "GR": {
      "CUMP02": null,
      "CUMP03": null,
      "nota": "serie disponible en catálogo; validar measurement_date"
    }
  },
  "contextoTerritorial": {
    "distritos": 83,
    "infraestructura": { "aeropuerto": 7, "puerto": 1 },
    "fuente": "ceplan-geo"
  }
}
```

### Errores

| Código | Condición |
|---|---|
| 400 | `departamento` ausente o fuera del piloto de 5 regiones |
| 502 | `ceplan-geo` no responde — `cobertura: BLOQUEADA`, `resultados` vacío |

## Matcher

| Campo | Valor |
|---|---|
| `matcher` | `departamento_prefijo_ubigeo` |
| Llave | Nombre canónico departamento → prefijo UBIGEO 2 dígitos |
| **No usa** | `entity_code`, `SEC_EJEC`, point-in-polygon |

## Campos obligatorios de metadata

Igual que cruces existentes: `matcher`, `cobertura`, `restriccion`, `dependencias`, `corte`.

## Implementación prevista (Sprint 7)

- `ceplan-estrategico` lee `strategic_indicators` localmente.
- HTTP GET a `CEPLAN_GEO_API_URL` para agregados territoriales (endpoint `territories/summary` o equivalente).
- Tests con mock HTTP + fixtures de 5 departamentos.

## Corrección ADR-0005

El cruce `ceplan-estrategico ↔ ceplan-geo` **no** es `entity_code → ubigeo`. Ver nota en ADR-0005 (Sprint 6).
