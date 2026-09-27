# PRD-002 · Termómetro SIDPOL
**Versión:** 1.0 · **Fecha:** 2026-09-26 · **Estado:** Propuesto
**Autor:** Ricardo · **Alcance:** RASTRO / Treevu · **Prioridad:** 2/4

---

## 1. Objetivo del producto

Crear un sistema de alerta temprana de violencia urbana que permita detectar, por departamento y por modalidad, cuándo el volumen de denuncias SIDPOL se sale de su patrón histórico esperado. El producto sirve a investigadores, periodistas y decisores de política pública que necesitan saber dónde está aumentando el crimen antes de que los medios lo cubran.

El termómetro traduce conteos brutos de denuncias en señales comprensibles: nivel de riesgo (BAJO/NORMAL/ALERTA/CRÍTICO), variación intermensual e interanual, y posición relativa en la serie 2018-2026.

---

## 2. Estado actual

### Lo que existe

- **Endpoint:** `GET /api/denuncias` en `seguridad-ciudadana` (p.4010)
  - Campos: `departamento`, `provincia`, `distrito`, `ubigeo`, `anio`, `mes`, `modalidad`, `cantidad`
  - Serie histórica confirmada: **2018–2026** (8 años, a nivel distrital)
  - 24 departamentos, ~200 provincias, ~1,900 distritos
  - Modalidades conocidas: Robo, Hurto, Extorsión, Estafa, Violencia contra la mujer, Secuestro, Otros
- **Conectores:** SIDPOL (CSV en datosabiertos.gob.pe), Comisarías Contraloria, Equipamiento PNP (SEACE)
- **Tests existentes:** `normalize.test.ts` (7 tests), `connectors.test.ts` (~15 tests). **No hay tests del endpoint `/api/denuncias`**
- **Deduplicación:** conflict unique en `(anio, mes, ubigeo, modalidad)`

### Lo que falta

| Gap | Severidad | Descripción |
|---|---|---|
| Sin población/denominador | 🔴 Crítica | Solo conteos brutos. Sin tasa por 100k no se puede comparar distritos de distinto tamaño |
| Sin métricas pre-calculadas | 🔴 Crítica | No hay media móvil, desviación estándar ni z-score. El termómetro no existe todavía |
| Sin lógica de detección | 🔴 Crítica | No hay endpoint `/api/denuncias/termometro` |
| Sin scheduler | 🟡 Alta | Los datos SIDPOL se actualizan periódicamente en datosabiertos sin trigger automático |
| Sin desestacionalización | 🟡 Alta | Navidad y Fiestas Patrias generan picos predecibles. Un modelo naive genera falsos positivos |
| Sin tests del router `/api/denuncias` | 🟡 Media | El endpoint no tiene cobertura de tests |
| Sin benchmark inter-departamental | 🟡 Media | No hay forma de comparar LA LIBERTAD vs LIMA en contexto relativo |

---

## 3. Arquitectura propuesta

### Capa 1: Motor de métricas (nuevo endpoint)

**`GET /api/denuncias/termometro`** en `seguridad-ciudadana` (p.4010):

```
Parámetros:
  - departamento  (requerido)
  - anio          (default: año actual)
  - modalidad     (opcional, default: todas)

Retorna:
{
  "departamento": "LA LIBERTAD",
  "anio": 2026,
  "generadoEn": "2026-09-26T12:00:00Z",
  "modalidad": "EXTORSION",
  "series": {
    "historico": [ /* {mes, cantidad, tasa_100k, z_score, percentil} 2018-2025 */ ],
    "actual": { "mes": 8, "cantidad": 312, "tasa_100k": 14.2, "z_score": 2.3, "nivel": "ALERTA", "percentil": 91 }
  },
  "comparativo": {
    "variacion_mensual_pct": +8.3,
    "variacion_interanual_pct": +22.1,
    "vs_promedio_historico_pct": +34.7
  },
  "benchmark": [
    { "departamento": "LIMA", "tasa_100k": 12.1 },
    { "departamento": "LA LIBERTAD", "tasa_100k": 14.2 }
  ]
}
```

**Motor de cálculo (window functions en SQL):**

```sql
SELECT
  departamento, modalidad, anio, mes, cantidad,
  AVG(cantidad) OVER (
    PARTITION BY departamento, modalidad, mes
    ORDER BY anio
    ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING
  ) AS media_movil_3anios,
  STDDEV(cantidad) OVER (...) AS desviacion,
  CASE
    WHEN z_score > 3 THEN 'CRITICO'
    WHEN z_score > 2 THEN 'ALERTA'
    WHEN z_score > 1 THEN 'NORMAL'
    ELSE 'BAJO'
  END AS nivel
FROM police_reports
JOIN poblacion_inei ON police_reports.ubigeo = poblacion_inei.ubigeo
                    AND police_reports.anio = poblacion_inei.anio
```

### Capa 2: Fuente de población (dato nuevo)

Se necesita una tabla `poblacion_inei` con población por ubigeo/año para calcular tasas. Opciones:
1. Usar la tool `ceplan_geo_denominadores_tasas` que ya existe en `ceplan-geo` (INEI 2017)
2. Crear tabla propia ingestando desde INEI/CENASO con los censos disponibles

### Capa 3: Desestacionalización

Para la primera versión, se excluyen los meses de diciembre y julio (Fiestas Patrias y Navidad) del cálculo de la media móvil. En fase 2, se implementa desestacionalización con decompose estacional.

### Decisiones de diseño pendientes (confirmar con Ricardo)

- ¿Departamentos (24) o distritos (~1,900)?
- ¿Extorsión como modalidad prioritaria o todas?
- ¿Alerta temprana (prospectivo) o diagnóstico post-hoc?
- ¿Motor en Postgres (más rápido) o en capa API (más flexible)?

---

## 4. Métricas de éxito

| Métrica | Meta |
|---|---|
| Tiempo de respuesta `/api/denuncias/termometro` | < 1.5 segundos (Postgres window functions) |
| Detección de spike real (validación manual) | ≥ 80% de precisión |
| Cobertura de tests del endpoint | ≥ 80% de覆盖率 |
| Scheduler de ingesta SIDPOL | Diario automático |
| Datos con población | ≥ 80% de ubigeos con denominador |

---

## 5. Scope

### In
- Endpoint `/api/denuncias/termometro` con z-score y niveles
- Tabla de población INEI por ubigeo/año
- Tests del nuevo endpoint
- Scheduler de ingesta SIDPOL
- Documentación de la lógica de detección

### Out
- Dashboard web (fase 2)
- Modelo predictivo/ML (fase 3)
- Alertas push/email
- Integración con otros datasets (no SIDPOL)
