# PRD-001 · Radar de Captura Contractual
**Versión:** 1.0 · **Fecha:** 2026-09-26 · **Estado:** Propuesto
**Autor:** Ricardo · **Alcance:** RASTRO / Treevu · **Prioridad:** 1/4

---

## 1. Objetivo del producto

Proveer un panel de monitoreo en tiempo real que exponga y alerte sobre proveedores sancionados (inhabilitación o multa vigente del TCE/OSCE) que mantienen contratos adjudicados con el Estado peruano. El producto es una herramienta de transparencia activa: cualquier periodista, controlador, fiscal o investigador debe poder consultar en menos de tres clicks quién está ejecutando plata pública mientras tiene una sanción vigente.

---

## 2. Estado actual

### Lo que existe

- **Endpoint central:** `GET /api/crossref` en `proveedores-sancionados` (p.4008)
  - Cruza `inhabilitaciones` (RNP/TCE) × `awards` + `minor_contracts` (SEACE/OCDS)
  - Devuelve: RUC, razón social, entidad compradora, monto, fecha de adjud., estado de inhabilitación, flag `esNuevoDesdeUltimaCorrida`, estado SUNAT del contribuyente
  - Cobertura: nacional con `departamento=TODOS`
  - **494 proveedores** confirmados con S/ 365.6M en contratos activos
- **Endpoints complementarios:** `sancionado-recurrente`, `doble-inhabilitacion`, `velocidad-sancion-contrato`, `extorsion-sancionados`, `redes-proveedores`
- **Tests existentes:** 12 archivos de tests en `proveedores-sancionados`; el test `crossref.test.ts` cubre 6 escenarios de la lógica PV-05 (atomicidad, race condition, flags)

### Lo que falta

| Gap | Severidad | Descripción |
|---|---|---|
| `proveedores-sancionados` no tiene tools en catalog.ts | 🔴 Crítica | Los agentes LLM no pueden usar la app — todo su potencial está invisible para el sistema MCP |
| Sin scheduler de ingesta | 🔴 Crítica | El connector es manual. Si no se ejecuta, los datos se quedan congelados. No hay `/meta/freshness` |
| Sin endpoint consolidado de radar | 🟡 Alta | No hay un `GET /api/radar` que una toda la inteligencia en una sola llamada |
| `valorMoneda` null en minor_contracts | 🟡 Alta | No se confirma si el monto está en PEN |
| Race condition documentada en `esNuevoDesdeUltimaCorrida` | 🟡 Alta | Dos lecturas seguidas del flag lo consumen en la primera (CX-01) |
| Sin visibilidad de fraîcheur por fuente | 🟡 Media | Un dashboard sin mostrar "datos actualizados el X" pierde valor |
| `entity_crosswalk` puede estar vacío | 🟡 Media | La tabla de mapeo MEF→OECE podría tener 0 filas sin que nadie lo note (SI-07) |

---

## 3. Arquitectura propuesta

### Opción elegida: Nueva app `radar-captura` (mediano plazo)

Se crea una app Node.js Express standalone que consulta directamente las bases de datos de `proveedores-sancionados` y `compras-publicas`:

```
Streamlit / Next.js (puerto 8501)
    │
    └──► GET /api/radar           → nueva app radar-captura (p.4040)
              │
              ├──► pool  (proveedores-sancionados)     [PostgreSQL]
              └──► comprasPool / pool (compras-publicas) [PostgreSQL]

MCP catalog: tool "radar_captura_summary"
```

**Endpoint consolidado `GET /api/radar`:**

```json
{
  "generadoEn": "2026-09-26T12:00:00Z",
  "frescura": {
    "proveedoresSancionados": { "ultimaIngesta": "2026-09-25", "diasSinActualizar": 1 },
    "comprasPublicas": { "ultimaIngesta": "2026-09-26", "diasSinActualizar": 0 }
  },
  "resumen": {
    "totalProveedores": 494,
    "totalContratosMonto": 365634581,
    "moneda": "PEN",
    "top5Proveedores": [...],
    "top5Entidades": [...],
    "nuevosDesdeUltimaCorrida": 3,
    "proveedoresDobleInhabilitacion": 7
  },
  "alertas": [
    { "tipo": "NUEVO_CONTRATO_SANCIONADO", "ruc": "...", "monto": 36000000, "diasDesdeSanción": 14 }
  ],
  "signals": [ /* signals S01-S13 de minor_contracts */ ],
  "redes": [ /* redes corporativas detectadas */ ]
}
```

### Tareas técnicas principales

1. Crear nuevo pool de conexión Postgres en la nueva app que lea de `proveedores-sancionados` y `compras-publicas`
2. Exponer endpoint `/api/radar` con lógica de cruce en SQL (JOIN entre tablas, no HTTP calls)
3. Consumir tool en `mcp-server/src/catalog.ts`
4. Configurar scheduler (cron) para ingesta automática de `proveedores-sancionados` (idealmente diario)
5. Front-end Streamlit mínimo sobre el endpoint

---

## 4. Métricas de éxito

| Métrica | Meta |
|---|---|
| Tiempo de carga del dashboard | < 3 segundos con datos frescos |
| Cobertura de proveedores sancionados | 100% del universo TCE/RNP |
| Actualización de datos | Scheduler diario, sin intervención manual |
| Tests覆盖率 | ≥ 80% en lógica de negocio del endpoint |
| Accesibilidad MCP | Tool disponible en catalog.ts |

---

## 5. Scope

### In
- Dashboard con ranking de proveedores sancionados × contratos vivos
- Endpoint `/api/radar` consolidado
- Tool MCP para acceso desde agente
- Scheduler diario de ingesta
- Tests de lógica de negocio (Vitest)
- Alertas de nuevos contratos de sancionadores

### Out
- Modificación de las apps existentes (`proveedores-sancionados`, `compras-publicas`)
- Análisis predictivo de riesgo de captura (ML — fase 2)
- Notificaciones push/email
- Autenticación de usuarios (dashboard abierto)
