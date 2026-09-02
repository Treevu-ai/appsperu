# Backlog ejecutable — Confiabilidad de Conectores y Cruces v1

**Producto:** AppsPerú (backend/ingesta)
**PRD:** [`docs/PRD_Confiabilidad_Conectores_y_Cruces_v1.md`](PRD_Confiabilidad_Conectores_y_Cruces_v1.md)
**Tickets:** [`docs/TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md`](TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md)
**Apps en alcance:** `identidad-fiscal`, `proveedores-sancionados`, `compras-publicas`, `radar-ejecucion` (más `docs/conectores.md` como entregable transversal en cada ticket).
**Reglas transversales (del PRD §7):**
- Todo campo de cruce nuevo distingue su origen (`awards` vs. `minor_contracts`, u otra fuente) — nunca se fusiona de forma indistinguible.
- Ningún endpoint existente cambia de forma incompatible sin verificar consumidores primero.
- `docs/conectores.md` se actualiza en el mismo PR que el cambio, no después.
- "Sin match" nunca se convierte en un valor que parezca un match real.

**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

---

## Resumen de sprints

| Sprint | Objetivo | Tickets | Puerta de salida |
|---|---|---|---|
| **1** | Cerrar el gap de riesgo de proveedores y sacar la decisión de MEF de un comentario a un ADR | CX-01, CX-02, CX-03 | `/api/crossref` de identidad-fiscal y proveedores-sancionados cubre `minor_contracts`; existe un ADR mergeado sobre `mef-connector.ts`; el conector SEACE tiene nombre correcto y todos sus tests pasan |
| **2** | Decidir con evidencia si automatizar, y blindar el catálogo contra desactualización futura | CX-04, CX-06 | Evaluación de automatización documentada (implementada o explícitamente diferida); CI falla si se agrega un conector sin documentar |
| **3 (opcional)** | Consolidación de matching de entidades, solo si CX-05 concluye que vale la pena | CX-05 | Evaluación documentada; implementación solo si el resultado la justifica |

---

## Secuencia estratégica

```text
Sprint 1: CX-02 (ADR de MEF, sin bloquear el resto) ⟷ CX-01 (cruce minor_contracts) ⟷ CX-03 (rename SEACE)
            ↓
Sprint 2: CX-04 (evaluación/automatización, depende de la decisión de CX-02 para el caso MEF)
            ↓         CX-06 (chequeo CI, independiente, puede ir en paralelo)
Sprint 3: CX-05 (evaluación de entity_crosswalk compartido) — opcional, sin fecha comprometida
```

Cada sprint deja una **puerta de salida verificable**: si la puerta no se cumple, no se abre el siguiente sprint. CX-02 y CX-01/CX-03 son independientes entre sí y pueden trabajarse en paralelo dentro del Sprint 1.

---

## Sprint 1 — Cerrar el gap de riesgo y decidir sobre MEF

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| CX-01 | Cruzar `minor_contracts` en identidad-fiscal y proveedores-sancionados | `/api/crossref` de ambas apps incluye resultados de `minor_contracts` con campo de origen distinguible; pruebas de las 4 combinaciones (solo awards, solo minor_contracts, ambos, ninguno); `docs/conectores.md` actualizado | — | P0 | M | ✅ Hecho |
| CX-02 | ADR de decisión sobre `mef-connector.ts` | ADR mergeado nombrando los 7 consumidores del cruce y la decisión tomada (completar streaming / monitoreo / otra mitigación); ficha de `docs/conectores.md` actualizada | — | P0 | M | ✅ Hecho (ADR-0015) |
| CX-03 | Renombrar `oece-minor-contracts-connector.ts` | Archivo, exports y script npm renombrados reflejando SEACE; suite completa de `compras-publicas/api` en verde; `docs/conectores.md` actualizado | — | P1 | S | ✅ Hecho |

**Puerta de salida del Sprint 1**: un proveedor con inhabilitación vigente y solo contratos menores aparece marcado en `/api/crossref` de proveedores-sancionados; el ADR de MEF está mergeado y su decisión reflejada en el catálogo; ningún archivo del repo se sigue llamando "oece-minor-contracts" sin serlo.

---

## Sprint 2 — Automatización evaluada y catálogo blindado

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| CX-04 | Evaluar (e implementar si corresponde) automatización de mef/oece-connector/oece-records | Documento de evaluación de staleness vs. costo de infraestructura; si se automatiza, al menos un conector corre sin intervención manual con corrida auditable; si no, la razón queda documentada y el ticket se cierra | CX-02 (para el caso MEF) | P1 | M | 🟡 Evaluado, diferido (ADR-0016) |
| CX-06 | Chequeo CI de conector sin documentar | Script que compara `src/ingest/*-connector.ts` contra menciones en `docs/conectores.md`; CI falla con mensaje claro si hay desfase; nota al pie en el catálogo explicando el chequeo | — | P1 | S | ✅ Hecho |

**Puerta de salida del Sprint 2**: existe una decisión documentada (no implícita) sobre automatización de los 3 conectores núcleo; un PR que agregue un `*-connector.ts` nuevo sin tocar `docs/conectores.md` falla en CI.

---

## Sprint 3 (opcional) — Consolidación de matching de entidades

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| CX-05 | Evaluar consolidación de `entity_crosswalk` (compras-publicas, infobras, identidad-fiscal) | Documento de evaluación costo/beneficio; si se consolida, ADR de interfaz del servicio compartido antes de tocar código; si no, razón documentada | — | P2 | M | 🟡 Evaluado, recomienda consolidar, diferido (ADR-0017) |

**Puerta de salida del Sprint 3**: decisión documentada sobre consolidación, con o sin implementación según lo que la evaluación concluya. Este sprint no tiene fecha comprometida y puede diferirse indefinidamente sin bloquear los sprints 1 y 2.

---

## Fuera de alcance de este backlog

Ver PRD §9. En particular: automatización de los 18 conectores restantes, cambios al modelo canónico de contrataciones más allá de CX-01, nuevas fuentes de datos, y cualquier cambio en `apps/rastro-web` (si CX-01/CX-03 requieren ajustes en el frontend, son tickets de seguimiento fuera de este backlog).
