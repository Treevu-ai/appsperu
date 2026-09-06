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

- **Conector** (`informes-control-connector.ts`): pagina la API por año y opcionalmente por
  departamento (`PageSize=500`, cortesía 300ms), normaliza cada fila descartando campos de
  persona natural, upsert por `codigo_informe`.
- **Lectura** (`GET /api/informes`): filtros por entidad (parcial), departamento, período,
  `esConResponsabilidad` (booleano).
- **Cruce** (`GET /api/crossref`): empareja por nombre de entidad (fuzzy, `@appsperu/entity-matcher`
  — la fuente no da un código de entidad compartido) contra `entities` de `radar-ejecucion`,
  agregando total de informes, informes con responsabilidad (conteo, nunca nombre) y devengado
  total (`LATEST_BUDGET_CTE`, `@appsperu/shared-queries`).
- **MCP**: tools `informes_control_informes`, `informes_control_crossref`.

## 3. Verificado en vivo

- Endpoint real confirmado (`buscadorinformes.contraloria.gob.pe`), sin autenticación.
- 363,971 informes históricos totales; 2015 → 2, 2026 → 24,256 (por año).
- Ingesta real de 2015 (2 filas) contra Postgres real: una de las dos filas reales tiene
  `es_con_responsabilidad = true` — confirma que el flag se captura correctamente en un caso real
  sin haber persistido el nombre de la persona involucrada.
- Test explícito: una fila con `Funcionarios` poblado con un nombre no aparece en ningún parámetro
  del `INSERT` real ni en el objeto normalizado.

## 4. Verificado en vivo — cruce

La Libertad, período 2023 (2,239 informes reales ingeridos vía `pDepartamento`): 130 entidades
MEF, 150 nombres de entidad distintos en Contraloría. Caso real: "PROYECTO ESPECIAL
CHAVIMOCHIC" — 30 informes, **3 con hallazgo de responsabilidad**, S/ 66,039,145 de devengado
agregado — sin exponer el nombre de ninguna persona involucrada.

## 5. Fuera de este PRD

- Backfill histórico nacional completo (363,971 filas) — se decide aparte si vale la pena el
  volumen; el filtro `pDepartamento` ya permite ingestas acotadas por región mientras tanto.
- Contenido de los PDF individuales de cada informe.
- Cualquier acción de la misma API distinta de `loadInformesElastic`.
- Cruce contra `infobras`/obras específicas (solo se cruza contra ejecución presupuestal
  agregada de `radar-ejecucion` en este PRD).
