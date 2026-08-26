# Análisis — Piura: brechas y competitividad (2026-08)

Primer memo ALSOL Fase 2 para **Piura** (UBIGEO `20`), plantilla
[`docs/plantilla-memo-regional-alsol-v1.md`](plantilla-memo-regional-alsol-v1.md).

## Resumen ejecutivo

| Dimensión | Estado preflight | Hallazgo principal |
|---|---|---|
| Territorio (ceplan-geo) | ✅ COMPLETA_VERIFICADA | 65 distritos; 3 aeropuertos; **0 puertos** en polígonos distritales |
| Ejecución MEF | ✅ COMPLETA_VERIFICADA | GR 55.7%, GL 44.5% — re-corrida 2026-08-26 (16/16 secciones + meta GN) |
| Obras INFOBRAS | ⏸ BLOQUEADO_EGRESS | 3 reintentos cloud (26-08 22:00 UTC): sin conectividad a `infobras.contraloria.gob.pe` |
| Inversiones Invierte | ✅ COMPLETA_VERIFICADA | 7,402 proyectos; 49.5% sobrecosto; 9.1% cartera productiva |
| Marco CEPLAN | ✅ NACIONAL | GN/GR agregado |
| **Preflight global** | **🟡 PARCIAL** | MEF + Invierte verificados; INFOBRAS pendiente |

**Lectura preliminar:** Piura es el departamento más extenso del piloto costero (65 distritos) y
muestra **mayor conectividad aérea relativa** (3 aeropuertos) pero **sin puerto registrado** en
la capa CEPLAN `cn_puertosx` dentro de sus límites distritales — validar si refleja ausencia de
puerto mayor o límite de capa (Paita/San Andrés pueden quedar fuera del polígono o clasificación).

---

## 1. Preflight territorial

| Fuente | Estado | Evidencia |
|---|---|---|
| ceplan-geo | ✅ | 65 distritos (2026-08-26) |
| radar-ejecucion | ✅ | GR 55.7%, GL 44.5% (2026-08-26) |
| infobras | ⏸ | Timeout red cloud agent |
| radar-inversiones | ✅ | 7,402 proyectos; corrida full 2026-08-26 |

```sql
SELECT departamento, COUNT(*) FROM territories WHERE departamento = 'PIURA';
-- 65
```

---

## 2. Ejecución presupuestal (verificado 2026-08-26)

| Nivel | PIM | Devengado | Avance % |
|---|---|---|---|
| Gobierno Regional Piura | S/ 4,694.0M | S/ 2,613.0M | **55.7%** |
| Gobiernos Locales (65 distritos) | S/ 2,771.2M | S/ 1,232.5M | **44.5%** |

**Comparación La Libertad (misma fuente):** GR 49.2%, GL 41.2%.

Piura muestra el **mayor avance regional del piloto** (55.7% GR) con rezago municipal similar
(~11 pp). Al cerrar INFOBRAS, segmentar causales de paralización será crítico por fenómenos El Niño.

---

## 3. Obras públicas — pendiente

Referencia La Libertad: 2.5% paralizadas; clima + contrato entre causales top.

---

## 4. Inversiones (verificado 2026-08-26)

- **7,402** proyectos activos en Piura.
- **49.5%** con sobrecosto (costo actualizado > monto viable) — el más alto del piloto costero.
- Cartera productiva directa (agro/comercio/turismo/pesca): **9.1%** del total (673 proyectos).

Referencia La Libertad: 39.4% sobrecosto; 7.5% cartera productiva.

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
