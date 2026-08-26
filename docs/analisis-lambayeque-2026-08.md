# Análisis — Lambayeque: brechas y competitividad (2026-08)

Primer memo ALSOL Fase 2 para **Lambayeque** (UBIGEO `14`), siguiendo
[`docs/plantilla-memo-regional-alsol-v1.md`](plantilla-memo-regional-alsol-v1.md). Complementa el
baseline de La Libertad ([`docs/analisis-la-libertad-2026-08.md`](analisis-la-libertad-2026-08.md)).

## Resumen ejecutivo

| Dimensión | Estado preflight | Hallazgo principal |
|---|---|---|
| Territorio (ceplan-geo) | ✅ COMPLETA_VERIFICADA | 38 distritos; 1 aeropuerto + 1 puerto en polígonos distritales |
| Ejecución MEF | ⏸ PENDIENTE_INGESTA | Sin corrida terminal documentada para Lambayeque |
| Obras INFOBRAS | ⏸ PENDIENTE_INGESTA | Filtro departamental disponible; corrida persistente no verificada |
| Inversiones Invierte | ⏸ PENDIENTE_INGESTA | `INVIERTE_DEPARTAMENTOS` admite Lambayeque |
| Marco CEPLAN | ✅ NACIONAL | Referencia GN/GR — no granularidad departamental |
| **Preflight global** | **🟡 PARCIAL** | Solo contexto geo + marco nacional verificables en esta corrida |

**Lectura preliminar:** Lambayeque comparte el arco costero norte con La Libertad y Piura. Sin
ingesta MEF/INFOBRAS local no es posible cuantificar brechas de ejecución propias; el marco
nacional CEPLAN (brecha financiero–física ~21 pp en GR) sigue siendo la referencia comparativa
hasta cerrar AL2-03.

---

## 1. Preflight territorial

| Fuente | Estado | Evidencia |
|---|---|---|
| ceplan-geo | ✅ | 38 distritos (`territories`, corte 2026-08-26) |
| radar-ejecucion | ⏸ | Ver `docs/matriz-cobertura-5-regiones-2026-08.md` |
| infobras | ⏸ | `INFOBRAS_DEPARTAMENTOS=LAMBAYEQUE npm run ingest:infobras` |
| radar-inversiones | ⏸ | `INVIERTE_DEPARTAMENTOS=LAMBAYEQUE npm run ingest:invierte:full` |
| compras-publicas | 🟡 | Muestra OECE — sin corrida terminal dept |

**Comando geo verificado:**

```sql
-- ceplan_geo @ localhost:5432
SELECT departamento, COUNT(*) FROM territories WHERE departamento = 'LAMBAYEQUE';
-- 38
```

---

## 2. Ejecución presupuestal — pendiente de ingesta

> **Estado:** ⏸ Sin datos MEF materializados para Lambayeque en el entorno de esta corrida.

Cuando se cierre la ingesta (`MEF_DEPARTAMENTO=LAMBAYEQUE npm run ingest:mef`), reportar:

| Nivel | PIM | Devengado | Avance % |
|---|---|---|---|
| Gobierno Regional Lambayeque | — | — | — |
| Gobiernos Locales (38 distritos) | — | — | — |

**Comparación de referencia (La Libertad, 2026-08-18, verificado):**

| Nivel | Avance % |
|---|---|
| GR La Libertad | 49.2% |
| GL La Libertad (84 mun.) | 39.9% |

Lambayeque tiene **menos municipios** (38 vs 83) pero similar peso costero — la hipótesis a
contrastar tras ingesta es si el rezago local replica el patrón LL (~10 pp detrás del regional).

---

## 3. Obras públicas — pendiente de ingesta

> **Estado:** ⏸ Sin obras Lambayeque persistidas en INFOBRAS en esta corrida.

**Referencia La Libertad (verificada 2026-08-18):** 10,134 obras, 252 paralizadas (2.5%);
causales dominantes: incumplimiento de contrato y no pago de valorizaciones.

---

## 4. Inversiones — pendiente de ingesta

> **Estado:** ⏸ Sin cartera Invierte materializada para Lambayeque.

**Referencia La Libertad:** 1,612 proyectos activos, 40.8% con sobrecosto.

---

## 5. Compras públicas

Muestra OECE parcial a nivel nacional — no usar concentración de proveedor sin disclaimer.
Cruce `compras-publicas ↔ radar-ejecucion` vía `entity_crosswalk` aplicable tras ingesta MEF.

---

## 6. Marco estratégico CEPLAN (nacional)

Indicadores ObservaPerú — **agregado nacional**, no específico de Lambayeque:

| Nivel | CUMP02 (físico) | CUMP03 (presupuestal) | SEG (pp) |
|---|---|---|---|
| GN | 76.6% (2024) | 95.0% | 18.4 |
| GR | 73.7% | 95.1% | 21.4 |

Fuente: cruce documentado en [`docs/analisis-la-libertad-2026-08.md`](analisis-la-libertad-2026-08.md)
y endpoint `GET /api/crossref/territorial?departamento=LAMBAYEQUE` (bloque `marcoEstrategicoNacional`).

**Restricción:** el bloque territorial adjunto describe **geografía**, no desempeño estratégico
regional CEPLAN.

---

## 7. Contexto geo (verificado)

| Métrica | Valor | Fuente |
|---|---|---|
| Distritos oficiales | **38** | ceplan-geo WFS `cb_limdistx` |
| Aeropuertos en polígono dept. | **1** | `cn_aeropuertosx` × `ST_Within` |
| Puertos en polígono dept. | **1** | `cn_puertosx` × `ST_Within` |

```bash
curl "http://localhost:4005/api/territories/summary?departamento=LAMBAYEQUE"
```

**Comparación La Libertad:** 83 distritos, 7 aeropuertos, 1 puerto — Lambayeque tiene menor
densidad de conectividad aérea pero mantiene salida marítima en el litoral norte.

---

## 8. Indicadores derivados (proxy dept)

> **Estado:** ⏸ `segPp` proxy = null hasta MEF + INFOBRAS (`INFOBRAS_DATABASE_URL` + ingesta).

```bash
npm run indicators:regional -- --departamento=LAMBAYEQUE
```

Fórmula proxy (cuando haya datos): `% devengado/PIM (MEF) − avance físico medio (INFOBRAS)`.

---

## 9. Competitividad — marco contextual (no verificado en DB)

Lambayeque es referencia nacional en **agroexportación de la costa norte** (espárrago, arándano,
caña) con capital en Chiclayo. Este párrafo es **contexto sectorial público**, no cifra del
ecosistema ALSOL — las métricas de inversión productiva se desarrollan en el memo de desarrollo
económico y agro.

---

## 10. Caveats

1. Preflight **PARCIAL** — no publicar cifras de ejecución Lambayeque hasta cerrar AL2-03.
2. SEG CEPLAN regional **no existe** en ObservaPerú; usar proxy MEF+INFOBRAS etiquetado.
3. Comparación con La Libertad usa corte **2026-08-18** — no mezclar años fiscales distintos.

## Reproducibilidad

- Plantilla: [`docs/plantilla-memo-regional-alsol-v1.md`](plantilla-memo-regional-alsol-v1.md)
- Matriz cobertura: [`docs/matriz-cobertura-5-regiones-2026-08.md`](matriz-cobertura-5-regiones-2026-08.md)
- Geo SQL: `territories` + `infrastructure` en `ceplan_geo`, corrida 2026-08-26
