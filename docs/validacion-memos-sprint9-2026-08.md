# Validación Sprint 9 — Memos Lambayeque y Piura (AL2-22 a AL2-28)

**Fecha:** 2026-08-26  
**Puerta Sprint 9:** 6 memos publicados; preflight `COMPLETA_VERIFICADA` o `PARCIAL` documentado.

## Entregables

| ID | Documento | Estado |
|---|---|---|
| AL2-22 | [`docs/plantilla-memo-regional-rastro-v1.md`](plantilla-memo-regional-rastro-v1.md) | ✅ |
| AL2-23 | [`docs/analisis-lambayeque-2026-08.md`](analisis-lambayeque-2026-08.md) | ✅ |
| AL2-24 | [`docs/analisis-lambayeque-desarrollo-economico-2026-08.md`](analisis-lambayeque-desarrollo-economico-2026-08.md) | ✅ |
| AL2-25 | [`docs/analisis-agro-lambayeque-2026-08.md`](analisis-agro-lambayeque-2026-08.md) | ✅ |
| AL2-26 | [`docs/analisis-piura-2026-08.md`](analisis-piura-2026-08.md) | ✅ |
| AL2-27 | [`docs/analisis-piura-desarrollo-economico-2026-08.md`](analisis-piura-desarrollo-economico-2026-08.md) | ✅ |
| AL2-28 | [`docs/analisis-agro-piura-2026-08.md`](analisis-agro-piura-2026-08.md) | ✅ |

## Preflight por departamento

| Departamento | ceplan-geo | MEF | INFOBRAS | Invierte | Preflight |
|---|---|---|---|---|---|
| LAMBAYEQUE | ✅ 38 distritos, 1 aeropuerto, 1 puerto | ⏸ | ⏸ | ⏸ | **🟡 PARCIAL** |
| PIURA | ✅ 65 distritos, 3 aeropuertos, 0 puertos | ⏸ | ⏸ | ⏸ | **🟡 PARCIAL** |

### Evidencia geo (SQL 2026-08-26)

```sql
-- ceplan_geo @ localhost:5432
SELECT departamento, COUNT(*) FROM territories
WHERE departamento IN ('LAMBAYEQUE','PIURA') GROUP BY 1;

SELECT t.departamento, i.infra_type, COUNT(*)
FROM infrastructure i
JOIN territories t ON ST_Within(i.geometry, t.geometry)
WHERE t.departamento IN ('LAMBAYEQUE','PIURA')
GROUP BY 1, 2;
```

## Comandos para elevar preflight a COMPLETA_VERIFICADA

```bash
# MEF
cd apps/radar-ejecucion/api
MEF_DEPARTAMENTO=LAMBAYEQUE npm run ingest:mef
MEF_DEPARTAMENTO=PIURA npm run ingest:mef

# INFOBRAS
cd apps/infobras/api
INFOBRAS_DEPARTAMENTOS=LAMBAYEQUE,PIURA npm run ingest:infobras

# Invierte
cd apps/radar-inversiones/api
INVIERTE_DEPARTAMENTOS=LAMBAYEQUE npm run ingest:invierte:full
INVIERTE_DEPARTAMENTOS=PIURA npm run ingest:invierte:full

# Indicadores consolidados
cd apps/ceplan-estrategico/api
npm run indicators:regional -- --departamento=LAMBAYEQUE
npm run indicators:regional -- --departamento=PIURA
```

## Criterio de aceptación

- [x] Plantilla con secciones fijas (preflight → caveats)
- [x] 6 memos con fuente, corte y completitud territorial explícitos
- [x] Sin afirmar SEG CEPLAN regional ni cobertura MEF sin ingesta
- [x] Comparación opcional vs La Libertad citada con fecha de corte
- [ ] Cifras MEF/INFOBRAS/Invierte dept — pendiente AL2-03 en entorno con Docker

## Próximo

Sprint 10 — memos Cajamarca y Cusco + índice comparativo 5 regiones (AL2-29 a AL2-35).
