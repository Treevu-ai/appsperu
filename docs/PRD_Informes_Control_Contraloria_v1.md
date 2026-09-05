# PRD — Informes de Servicios de Control (Contraloría)

**Estado:** Completado — construido y verificado en vivo el 2026-09-05.
**Ámbito:** una app nueva (`informes-control`), `mcp-server/src/catalog.ts`, `docs/conectores.md`
**Origen:** pedido directo del usuario de replicar, para otras entidades, el patrón de reverse
engineering ya usado contra OECE (`perfilprov-conformacion-connector.ts`) — con la condición
explícita, acordada antes de escribir código, de no tocar datos de personas naturales.

## 1. Decisión de producto

Cierra el hueco de "rendición de cuentas / cierre presupuestal" que
`docs/COBERTURA_Y_CUMPLIMIENTO.md` marcaba como "hueco real, no cerrable a corto plazo": el
buscador de informes de auditoría de la Contraloría no publica un dataset abierto, pero su SPA
consume un endpoint JSON no documentado (`BusquedaInformesCGR.ashx`) — mismo patrón que ya usa el
proyecto contra OECE.

**Decisión explícita de diseño, distinta del precedente de OECE**: la fuente real mezcla, en la
misma respuesta, campos de entidad (los que se ingieren) con campos de persona natural
(`Funcionarios`, `Responsabilidad`) cuando un informe identifica responsabilidad. A diferencia
del conector de OECE (que captura DNI y lo enmascara), este conector **nunca lee esas claves del
objeto crudo** — se excluyen antes de cualquier persistencia, verificado con un test que confirma
que un nombre real no sobrevive a la normalización.

## 2. Alcance funcional

- **Conector** (`informes-control-connector.ts`): pagina la API por año (`PageSize=500`,
  cortesía 300ms), normaliza cada fila descartando campos de persona natural, upsert por
  `codigo_informe`.
- **Lectura** (`GET /api/informes`): filtros por entidad (parcial), departamento, período,
  `esConResponsabilidad` (booleano).
- **MCP**: tool `informes_control_informes`.

## 3. Verificado en vivo

- Endpoint real confirmado (`buscadorinformes.contraloria.gob.pe`), sin autenticación.
- 363,971 informes históricos totales; 2015 → 2, 2026 → 24,256 (por año).
- Ingesta real de 2015 (2 filas) contra Postgres real: una de las dos filas reales tiene
  `es_con_responsabilidad = true` — confirma que el flag se captura correctamente en un caso real
  sin haber persistido el nombre de la persona involucrada.
- Test explícito: una fila con `Funcionarios` poblado con un nombre no aparece en ningún parámetro
  del `INSERT` real ni en el objeto normalizado.

## 4. Fuera de este PRD

- Backfill histórico completo (363,971 filas) — se decide aparte si vale la pena el volumen.
- Contenido de los PDF individuales de cada informe.
- Cualquier acción de la misma API distinta de `loadInformesElastic`.
- Cruces contra otras apps (candidato natural: `entity_crosswalk` para vincular con ejecución
  presupuestal/obras) — no implementado en este PRD.
