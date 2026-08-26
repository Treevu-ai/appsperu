# Análisis — Cusco: turismo, cultura y desarrollo productivo (2026-08)

Memo dual AL2-32 — **turismo/cultura** + **desarrollo económico productivo**, Cusco.

## Resumen ejecutivo

| Preflight | Estado |
|---|---|
| Invierte / INFOBRAS / MEF | ⏸ PENDIENTE_INGESTA |
| ceplan-geo `ip_pryturx` | 🟡 3 features nacionales |
| **Global** | **🟡 PARCIAL** |

---

## Parte A — Turismo y cultura

### A.1 Inversión en turismo (pendiente)

Post-ingesta Invierte:

```sql
SELECT provincia, COUNT(*), SUM(costo_actualizado)
FROM investments
WHERE departamento = 'CUSCO'
  AND (funcion ILIKE '%TURISMO%' OR funcion ILIKE '%CULTURA%' OR nombre ILIKE '%TURIS%')
  AND estado NOT ILIKE '%cerrado%'
GROUP BY provincia;
```

Provincias esperadas con peso: **Cusco**, **Urubamba** (Valle Sagrado), **La Convención**.

### A.2 Capa geo `ip_pryturx`

Spike: 3 features nacionales con `departamen`, geometría Point — muestra mínima; no sustituye Invierte.

### A.3 PBA — dimensión Turismo y cultura

```bash
curl "http://localhost:4004/api/indicators/plan-budget-alignment?departamento=CUSCO&anio=2026"
```

Mapeo v1: funciones MEF `TURISMO`, `CULTURA` → dimensión CEPLAN "Turismo y cultura".

### A.4 Obras culturales INFOBRAS

Buscar obras en Cusco/Urubamba con avance físico y paralización — crítico en corredor turístico.

---

## Parte B — Desarrollo económico productivo

### B.1 Participación productiva en cartera

| Corte | Proyectos | Costo |
|---|---|---|
| Cartera activa Cusco | — | — |
| Funciones productivas | — | — |
| % total | — | — |

**Referencia La Libertad:** 4.6% costo en funciones productivas directas.

### B.2 Agro altoandino vs turismo

Hipótesis: Cusco puede mostrar **mayor peso relativo de TURISMO/CULTURA** que La Libertad en
cartera Invierte, y **menor peso agroexportador costero** que Lambayeque/Piura.

### B.3 Conectividad y producto

27 aeropuertos (geo) habilitan narrativa de **dispersión territorial** — costo logístico de llevar
insumos productivos a provincias alejadas del hub Cusco/Urubamba.

---

## Caveats

- Turismo es estacional — promedios anuales de ejecución pueden distorsionarse por calendario fiscal.
- Machu Picchu / patrimonio UNESCO no aparece como fila única en Invierte — buscar por nombre/CUI.
- CEPLAN no reporta turismo por departamento — marco nacional solo.

## Reproducibilidad

- Memo brechas: [`docs/analisis-cusco-2026-08.md`](analisis-cusco-2026-08.md)
- PBA contract: [`docs/data-contracts/ceplan-plan-budget-alignment-v1.md`](data-contracts/ceplan-plan-budget-alignment-v1.md)
