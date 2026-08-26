# Análisis — Piura: brechas y competitividad (2026-08)

Primer memo ALSOL Fase 2 para **Piura** (UBIGEO `20`), plantilla
[`docs/plantilla-memo-regional-alsol-v1.md`](plantilla-memo-regional-alsol-v1.md).

## Resumen ejecutivo

| Dimensión | Estado preflight | Hallazgo principal |
|---|---|---|
| Territorio (ceplan-geo) | ✅ COMPLETA_VERIFICADA | 65 distritos; 3 aeropuertos; **0 puertos** en polígonos distritales |
| Ejecución MEF | ⏸ PENDIENTE_INGESTA | Sin corrida terminal |
| Obras INFOBRAS | ⏸ PENDIENTE_INGESTA | — |
| Inversiones Invierte | ⏸ PENDIENTE_INGESTA | — |
| Marco CEPLAN | ✅ NACIONAL | GN/GR agregado |
| **Preflight global** | **🟡 PARCIAL** | Geo + marco nacional únicamente |

**Lectura preliminar:** Piura es el departamento más extenso del piloto costero (65 distritos) y
muestra **mayor conectividad aérea relativa** (3 aeropuertos) pero **sin puerto registrado** en
la capa CEPLAN `cn_puertosx` dentro de sus límites distritales — validar si refleja ausencia de
puerto mayor o límite de capa (Paita/San Andrés pueden quedar fuera del polígono o clasificación).

---

## 1. Preflight territorial

| Fuente | Estado | Evidencia |
|---|---|---|
| ceplan-geo | ✅ | 65 distritos (2026-08-26) |
| radar-ejecucion | ⏸ | `MEF_DEPARTAMENTO=PIURA npm run ingest:mef` |
| infobras | ⏸ | `INFOBRAS_DEPARTAMENTOS=PIURA npm run ingest:infobras` |
| radar-inversiones | ⏸ | `INVIERTE_DEPARTAMENTOS=PIURA npm run ingest:invierte:full` |

```sql
SELECT departamento, COUNT(*) FROM territories WHERE departamento = 'PIURA';
-- 65
```

---

## 2. Ejecución presupuestal — pendiente

Tabla a completar tras ingesta MEF (año fiscal 2026):

| Nivel | PIM | Devengado | Avance % |
|---|---|---|---|
| Gobierno Regional Piura | — | — | — |
| Gobiernos Locales | — | — | — |

**Comparación referencia La Libertad (2026-08-18):** GR 49.2%, GL 39.9%.

Piura enfrenta históricamente **fenómenos El Niño** que afectan ritmo de obra — al cerrar ingesta,
segmentar causales de paralización en INFOBRAS será crítico para no mezclar gestión y clima.

---

## 3. Obras públicas — pendiente

Referencia La Libertad: 2.5% paralizadas; clima + contrato entre causales top.

---

## 4. Inversiones — pendiente

Referencia La Libertad: 40.8% proyectos con sobrecosto.

---

## 5. Marco estratégico CEPLAN (nacional)

| Nivel | CUMP02 | CUMP03 | SEG (pp) |
|---|---|---|---|
| GN | 76.6% | 95.0% | 18.4 |
| GR | 73.7% | 95.1% | 21.4 |

Endpoint: `GET /api/crossref/territorial?departamento=PIURA`

---

## 6. Contexto geo (verificado)

| Métrica | Piura | Lambayeque | La Libertad |
|---|---|---|---|
| Distritos | **65** | 38 | 83 |
| Aeropuertos | **3** | 1 | 7 |
| Puertos | **0** | 1 | 1 |

```bash
curl "http://localhost:4005/api/territories/summary?departamento=PIURA"
```

**Nota metodológica:** conteo de puertos usa `ST_Within` contra distritos oficiales CEPLAN — no
sustituye catálogo logístico del MTC o ENAFER.

---

## 7. Indicadores derivados

```bash
npm run indicators:regional -- --departamento=PIURA
```

Proxy SEG: ⏸ null hasta MEF+INFOBRAS.

---

## 8. Competitividad — marco contextual

Piura articula **agro (mango, limón, arándano)**, **minería** y **comercio fronterizo** (Tumbes
cercano). Proyectos hidráulicos mayores (Chira-Piura, reforma agraria costera) tienen historia
pre-Invierte — mismo caveat que megaproyectos en memo La Libertad.

---

## 9. Caveats

1. Preflight **PARCIAL** — cifras de ejecución Piura son placeholders hasta AL2-03.
2. 0 puertos en geo no prueba ausencia de actividad portuaria sin validar capa y geometría.
3. SEG CEPLAN regional inexistente — usar proxy etiquetado.

## Reproducibilidad

- Matriz: [`docs/matriz-cobertura-5-regiones-2026-08.md`](matriz-cobertura-5-regiones-2026-08.md)
- Validación crossref: [`docs/validacion-crossref-territorial-5-regiones-2026-08.md`](validacion-crossref-territorial-5-regiones-2026-08.md)
