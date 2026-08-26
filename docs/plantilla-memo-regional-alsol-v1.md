# Plantilla — Memo regional ALSOL v1

> **Uso:** análisis territorial Follow the Sol / CEPLAN Fase 2 (5 regiones piloto).  
> **Ticket:** AL2-22  
> **Versión:** `v1` — 2026-08-26

## Metadatos (obligatorio)

| Campo | Valor |
|---|---|
| Departamento | `{DEPARTAMENTO}` |
| UBIGEO prefijo | `{UBIGEO_PREFIJO}` |
| Fecha de corte | `{YYYY-MM-DD}` |
| Preflight territorial | `COMPLETA_VERIFICADA` / `PARCIAL` / `BLOQUEADA` |
| Autor / corrida | Cloud Agent ALSOL Fase 2 |

## 1. Preflight territorial

Tabla app × completitud para el departamento. Sin afirmar cobertura nacional.

| Fuente | Estado | Evidencia / comando |
|---|---|---|
| ceplan-geo (distritos) | | `GET /api/territories/summary?departamento=` |
| radar-ejecucion (MEF) | | `npm run cobertura:territorial -- --jurisdiccion {DEPARTAMENTO}` |
| infobras | | `INFOBRAS_DEPARTAMENTOS={DEPARTAMENTO} npm run ingest:infobras` |
| radar-inversiones | | `INVIERTE_DEPARTAMENTOS={DEPARTAMENTO} npm run ingest:invierte:full` |
| compras-publicas | | muestra OECE — declarar parcialidad |
| ceplan-estrategico | N/A dept | indicadores GN/GR nacionales |

## 2. Ejecución presupuestal (`radar-ejecucion`)

- Gobierno Regional: PIM, devengado, avance %
- Gobiernos Locales: PIM, devengado, avance %
- **Caveat:** gasto nacional con `meta_departamento` es concepto distinto a ejecución de sede regional.

## 3. Obras públicas (`infobras`)

- Total obras, % paralizadas, avance físico promedio
- Causales de paralización (top 3) si hay volumen suficiente
- **Caveat:** XLSX Contraloría — filtrar por departamento tras ingesta.

## 4. Inversiones (`radar-inversiones`)

- Proyectos activos, % con sobrecosto, cartera viable vs actualizada
- **Caveat:** muestra Invierte.pe por departamento.

## 5. Compras públicas (`compras-publicas`)

- Procesos, entidades, concentración proveedor (con disclaimer de muestra)
- Cruce `entity_crosswalk` si aplica.

## 6. Marco estratégico CEPLAN (`ceplan-estrategico`)

- CUMP02 / CUMP03 nacional GN y GR (ObservaPerú)
- `GET /api/crossref/territorial?departamento=` — **no** implica desempeño regional CEPLAN
- SEG nacional = CUMP03 − CUMP02; proxy dept solo con MEF+INFOBRAS (`PROXY_DEPARTAMENTAL`)

## 7. Contexto geo (`ceplan-geo`)

- Distritos oficiales (conteo WFS)
- Infraestructura logística (`ST_Within`): aeropuertos, puertos
- Capas hidráulica/proyectos: ver spike `cb_redhidricaprinx`, familia `ip_pry*` — no sustituyen Invierte.

## 8. Indicadores derivados (Sprint 8)

```bash
cd apps/ceplan-estrategico/api
npm run indicators:regional -- --departamento={DEPARTAMENTO}
```

| Indicador | Nacional (CEPLAN) | Proxy dept (MEF+INFOBRAS) |
|---|---|---|
| SEG | CUMP03 − CUMP02 | devengado/PIM − avance físico |
| Execution Efficiency | CUMP02 / CUMP03 | avance físico / devengado/PIM |
| PBA | N/A | participación % por dimensión CEPLAN→MEF |

## 9. Comparación opcional (baseline La Libertad)

Solo si el memo lo requiere — citar `docs/analisis-la-libertad-2026-08.md` con fecha de corte explícita.

## 10. Caveats y límites

- [ ] No afirmar SEG CEPLAN regional sin fuente.
- [ ] Proxy departamental etiquetado `PROXY_DEPARTAMENTAL`.
- [ ] Preflight `PARCIAL` visible en el resumen ejecutivo.
- [ ] Fuentes y fecha de corte en cada cifra verificada.

## 11. Reproducibilidad

```bash
# Crossref territorial + geo
curl "http://localhost:4004/api/crossref/territorial?departamento={DEPARTAMENTO}"
curl "http://localhost:4005/api/territories/summary?departamento={DEPARTAMENTO}"

# Indicadores consolidados
npm run indicators:regional -- --departamento={DEPARTAMENTO}
```
