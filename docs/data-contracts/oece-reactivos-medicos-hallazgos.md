# Data contract — OECE Reactivos Médicos (recorte temático)

> Ficha técnica del conector: [`docs/conectores.md#compras-publicas`](../conectores.md#compras-publicas)

Investigación en vivo: 2026-09-23. Verificado con dos corridas reales contra Postgres local
(ventana 2026-01-01→2026-09-23: 19 hallazgos; ventana 2026-09-10→2026-09-23: 13, con 7 en común —
el upsert por `(ocid, item_desc)` dedupe correctamente).

## Qué es

No es un conector genérico de OECE (eso ya lo hacen `oece-connector.ts`/`oece-records-connector.ts`
para todo rubro) — es un recorte de negocio: procesos de `/api/v1/releases`
(`mainProcurementCategory=goods`) cuyo título, descripción o algún ítem menciona "reactivo", con el
adjudicatario si ya existe (vía `/api/v1/records?ocid=...`, que sí trae
`compiledRelease.awards` a diferencia de `/releases`).

## Cómo se llegó a esto

Análisis manual del mercado de reactivos médicos como proveedores del Estado (ver sesión
2026-09-23): se escaneó una muestra de releases recientes filtrando texto `REACTIV`, y se cruzaron
los matches con `/records?ocid=` uno por uno para sacar adjudicatario. Este script persiste esa
misma lógica como capacidad reusable (`npm run ingest:reactivos-medicos -- --start-date ...
--end-date ...`), en vez de quedar como script de scratchpad.

## Comportamiento confirmado

- `isReactivoText` es un match simple `/REACTIV/i` contra título/descripción/ítems — acepta falsos
  positivos leves (ej. "reactiva" como adjetivo) a cambio de no perder casos reales; no distingue
  reactivo de diagnóstico in vitro de otros usos de la palabra (ej. "armario para reactivos
  peligrosos" es un mueble, no un reactivo, y sí entra en el filtro — revisar manualmente antes de
  usar los montos agregados).
- Una fila por (proceso, ítem que matchea). Si el proceso no trae ítems desglosados en `/releases`
  pero el título sí menciona reactivo, se usa el título como `item_desc` (fallback).
- **La ventana `--start-date`/`--end-date` de OECE no se comporta como "fecha de publicación
  exacta"**: un proceso con `datePublished` dentro de la ventana puede no aparecer si excede el
  límite de páginas (`--max-pages`, default 40 páginas = 800 releases) — confirmado en vivo: el
  proceso `ocds-dgv273-seacev3-1248973` (GORE Madre de Dios, adjudicado a INTERSHOPLAB S.A.C.,
  publicado 2026-09-15) no apareció ni en la ventana anual ni en la de 2 semanas con el cap default,
  pese a estar dentro de ambas ventanas por fecha — el volumen nacional de tenders "goods" excede el
  cap en pocos días. **No es exhaustivo por diseño** — subir `--max-pages` amplía la cobertura a
  costa de más llamadas a la API.
- `matchesConAward` fue 0 en ambas corridas de verificación — los 21+ procesos de reactivos
  encontrados en esta ventana reciente siguen en convocatoria; se confirmó por separado (llamada
  directa a `/records?ocid=ocds-dgv273-seacev3-1248973`) que `firstAwardOf` sí extrae el
  adjudicatario real (INTERSHOPLAB S.A.C., S/ 211,638) cuando el release está dentro del set
  escaneado — el 0 refleja la ventana, no un bug de extracción.

## Corrección aplicada tras code review (2026-09-23)

- **[HIGH corregido]** El armado de `item_desc` usaba `??`, que no trata `""` como ausente —
  dos ítems distintos de un mismo release con `description: ""` pero cada uno matcheando
  "reactivo" solo por `classification.description` producían el mismo `item_desc = ""` y
  colisionaban en el upsert por `(ocid, item_desc)`, perdiendo un hallazgo real en silencio.
  Reemplazado por `firstNonEmpty(...)`, que sí trata `""` como ausente (mismo criterio que
  `textOrNull` en `cenares-pecosas-parse.ts`). Test de regresión:
  `reactivos-medicos-scan.test.ts` → "no colisiona itemDesc cuando dos ítems distintos...".
- **[MEDIUM corregido]** El `ON CONFLICT ... DO UPDATE` solo refrescaba los campos `award_*` —
  si una corrida posterior encontraba el mismo `(ocid, item_desc)` con `buyer_name`,
  `departamento`, `titulo`, `valor_tender` o `fecha_publicacion` distintos (proceso enmendado),
  esos campos quedaban congelados con el valor de la primera inserción. Ahora el `DO UPDATE`
  refresca todos los campos, no solo el award.
- **[MEDIUM corregido]** No había test de integración para `scanReactivosMedicos` (la función que
  hace el `INSERT ... ON CONFLICT` real) — el mock dejaba `pool` sin `connect`, así que esa
  función nunca se ejecutaba en la suite. Agregado con `pool`/`fetch` mockeados, siguiendo el
  mismo patrón que `cenares-pecosas-connector.test.ts`.

## Pendiente / fuera de alcance de este conector

1. **Un `ocid` puede tener varios `award` por lote/ítem** — `firstAwardOf` solo toma el primero con
   proveedor válido como señal de "ya adjudicado"; no reconstruye todos los lotes de un proceso con
   adjudicación parcial (ver hallazgo de EsSalud Red Asistencial La Libertad, sesión 2026-09-23: un
   tender de S/ 12.28M con un award parcial de solo S/ 385,200 a DIVCOM S.A.C.).
2. **Sin normalización de RUC/proveedor contra `identidad-fiscal`** — `award_supplier_id` se guarda
   tal cual viene de OECE (`PE-RUC-...`), sin cruzar contra el resto del sistema de identidad fiscal
   del proyecto.
3. **No corre en cron/segmentado** — a diferencia de `run-oece-segmented.ts`, esta es una corrida
   manual bajo demanda; si se quiere cobertura histórica completa habría que correrla por tramos de
   fecha igual que `ingest:libertad`.
