# Validación manual — crossref territorial CEPLAN × 5 regiones ALSOL (Sprint 7)

**Fecha:** 2026-08-26  
**Tickets:** AL2-09, AL2-11, AL2-13  
**Apps:** `ceplan-estrategico` (4004) → `ceplan-geo` (4005)

## Resumen

| Componente | Estado |
|---|---|
| `GET /api/crossref/territorial?departamento=` | ✅ Implementado |
| `GET /api/territories/summary?departamento=` | ✅ Implementado |
| Matcher `departamento_prefijo_ubigeo` | ✅ |
| Validación departamento ∈ 5 piloto | ✅ 400 fuera de piloto |
| Fallback `cobertura: BLOQUEADA` si geo caída | ✅ HTTP 502 |
| Tests unitarios (mock HTTP + DB) | ✅ |

## Prerrequisitos

```bash
# ceplan-geo con territorios ingeridos
cd apps/ceplan-geo/api
npm run migrate && npm run ingest:territories && npm run ingest:infrastructure
npm run dev   # :4005

# ceplan-estrategico con indicadores ObservaPerú
cd apps/ceplan-estrategico/api
npm run migrate && npm run ingest:observa
CEPLAN_GEO_API_URL=http://localhost:4005 npm run dev   # :4004
```

## Corridas por departamento piloto

### 1. LA LIBERTAD (prefijo UBIGEO 13)

```bash
curl -s "http://localhost:4004/api/crossref/territorial?departamento=LA%20LIBERTAD" | jq .
curl -s "http://localhost:4005/api/territories/summary?departamento=LA%20LIBERTAD" | jq .
```

**Esperado (geo con ingesta nacional):** `distritos: 83`, infraestructura con aeropuertos/puertos dentro del departamento.

### 2. LAMBAYEQUE (14)

```bash
curl -s "http://localhost:4004/api/crossref/territorial?departamento=LAMBAYEQUE" | jq .
curl -s "http://localhost:4005/api/territories/summary?departamento=LAMBAYEQUE" | jq .
```

**Esperado:** `distritos: 38`.

### 3. PIURA (20)

```bash
curl -s "http://localhost:4004/api/crossref/territorial?departamento=PIURA" | jq .
curl -s "http://localhost:4005/api/territories/summary?departamento=PIURA" | jq .
```

**Esperado:** `distritos: 65`.

### 4. CAJAMARCA (06)

```bash
curl -s "http://localhost:4004/api/crossref/territorial?departamento=CAJAMARCA" | jq .
curl -s "http://localhost:4005/api/territories/summary?departamento=CAJAMARCA" | jq .
```

**Esperado:** `distritos: 127`.

### 5. CUSCO (08)

```bash
curl -s "http://localhost:4004/api/crossref/territorial?departamento=CUSCO" | jq .
curl -s "http://localhost:4005/api/territories/summary?departamento=CUSCO" | jq .
```

**Esperado:** `distritos: 112`.

## Campos obligatorios en respuesta crossref

Toda respuesta 200 debe incluir:

- `matcher`: `"departamento_prefijo_ubigeo"`
- `cobertura`: `"PARCIAL"`
- `restriccion`: texto sobre indicadores nacionales vs contexto territorial
- `dependencias`: `[{ "app": "ceplan-geo", "url": "...", "ok": true }]`
- `corte.generadoEl`, `corte.anioCeplan`, `corte.anioEjecucion`
- `marcoEstrategicoNacional.GN` / `.GR` con `CUMP02`, `CUMP03`, `segPp`, `executionEfficiency` (o `null` si falta serie)
- `contextoTerritorial.distritos`, `.infraestructura`, `.fuente`

## Caso negativo — departamento fuera de piloto

```bash
curl -s "http://localhost:4004/api/crossref/territorial?departamento=LIMA"
# HTTP 400 — departamentosPermitidos: [LA LIBERTAD, LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO]
```

## Caso degradado — ceplan-geo no disponible

```bash
# Con ceplan-geo apagado:
curl -s -w "\nHTTP %{http_code}\n" "http://localhost:4004/api/crossref/territorial?departamento=PIURA"
```

**Esperado:** HTTP `502`, `cobertura: "BLOQUEADA"`, `contextoTerritorial: null`, bloque `marcoEstrategicoNacional` aún presente si hay datos ObservaPerú locales.

## MCP

```text
ceplan_estrategico_crossref_territorial  → GET /api/crossref/territorial
ceplan_geo_territories_summary           → GET /api/territories/summary
```

## Contrato

Ver [`docs/data-contracts/ceplan-crossref-territorial-v1.md`](data-contracts/ceplan-crossref-territorial-v1.md).
