# Data contract — Contraloría: Informes de Servicios de Control

> Ficha técnica: origen de este spike es una petición directa del usuario (2026-09-05) de
> replicar, para otras entidades, el patrón de reverse engineering ya usado contra OECE
> (`perfilprov-conformacion-connector.ts`, ver `docs/COBERTURA_Y_CUMPLIMIENTO.md` Parte 2) —
> con la condición explícita, acordada antes de escribir código, de **no** tocar datos de
> personas naturales. Este documento es tanto el data contract como el registro de esa decisión.

- Fuente oficial: Contraloría General de la República del Perú — Buscador de Informes de
  Servicios de Control, `https://buscadorinformes.contraloria.gob.pe/BuscadorCGR/Informes/`.
- Owner del conector: app `informes-control` (`src/ingest/informes-control-connector.ts`).

## Estado: CONFIRMADO — conector construido y probado (2026-09-05)

### El endpoint: mismo patrón que OECE, un JSON no documentado detrás de un buscador público

El buscador (`Avanzado.html`) es una SPA que consume `BusquedaInformesCGR.ashx`
(`Action=loadInformesElastic`), un handler ASP.NET que devuelve JSON directamente — no hay
documentación pública de esta API, se descubrió inspeccionando `script/Avanzado.js`, el mismo
método que ya usa el proyecto contra OECE. Sin autenticación, sin CAPTCHA, accesible para
cualquier visitante del buscador oficial.

### Decisión de privacidad — la razón de ser de este documento

La respuesta real de la API confirma que la misma fila mezcla **datos de entidad** (los que este
conector ingiere) con **datos de persona natural** cuando el informe identifica responsabilidad:

```json
{
  "CodigoInforme": "...", "Entidad": "...", "Departamento": "...",
  "EsConResponsabilidad": "S",
  "TotalFuncionarios": "1", "Funcionarios": "<nombre real cuando aplica>",
  "Responsabilidad": "<texto libre>",
  "Text": "<índice de búsqueda que concatena muchos campos>"
}
```

**`Funcionarios`, `TotalFuncionarios`, `Responsabilidad` y `Text` nunca se leen** en
`normalizeInforme()` (`src/ingest/informes-control-parse.ts`) — ni siquiera se accede a esas
claves del objeto crudo antes de descartarlas. `CAMPOS_PERSONALES_EXCLUIDOS` documenta esto en
el propio código como una constante, para que agregar uno de esos campos al mapeo en el futuro
sea una decisión visible en el diff, no un descuido. Confirmado con un test que verifica
explícitamente que un nombre real en `Funcionarios` no sobrevive a `normalizeInforme()` ni
aparece en los parámetros del `INSERT` real.

**`EsConResponsabilidad` sí se conserva**, pero como booleano — indica que *existe* un hallazgo
de responsabilidad en el informe, sin decir *de quién*. Es una señal legítima de interés público
(¿este informe tiene un hallazgo de responsabilidad o no?) que no requiere saber el nombre de la
persona para ser útil.

### Alcance de la ingesta: por período (año) y, opcionalmente, por departamento

Confirmado en vivo: **363,971 informes en total** desde el inicio del registro hasta 2026. El
conector ingiere **un año por corrida** (`npm run ingest:informes -- <año> [departamento]`,
default: año actual, departamento opcional) — mismo patrón de año-por-corrida que
`mincetur-hospedaje-connector.ts`. El filtro `pDepartamento` (confirmado en vivo: 2,239 informes
para LA LIBERTAD en 2023, vs. 58,950 nacional) es el mismo que usa el selector de región del
buscador web. Un backfill nacional completo de todos los años es una decisión de producto aparte
(¿vale la pena el volumen para el caso de uso de Rastro?), no algo que este ticket decida
unilateralmente.

Volumen confirmado en vivo por año: 2015 → 2 informes, 2023 (sin filtro adicional) → 58,950,
2026 → 24,256. La cortesía entre requests (300ms) es la misma que ya usa
`perfilprov-conformacion-connector.ts` contra OECE.

### Paginación y checksum

`PageSize=500`, se pagina hasta recibir una página con menos de 500 filas. `TotalRows` viene
repetido en cada fila de la respuesta (no en una cabecera separada) — se lee de la primera fila
de la primera página no vacía. Cada página se guarda como un lote en `raw_contraloria_batches`
con clave `(periodo, page_number, checksum)`.

### Columnas ingeridas (todas de entidad/informe, ninguna de persona)

`codigo_informe` (clave), `numero_informe`, `ciac_codigo`, `entidad`, `codigo_entidad`, `sector`,
`codigo_sector`, `nivel_gobierno`, `departamento`/`provincia`/`distrito`, `descripcion`,
`modalidad_servicio`, `servicio_control`, `tipo_informe`, `periodo`, `fecha_emision`,
`fecha_publicacion`, `fecha_fin_ejecucion`, `es_con_responsabilidad` (booleano), 
`total_recomendaciones`, `es_covid`, `es_reconstruccion`, y tres URLs a PDF (resumen ejecutivo,
resumen del informe, informe completo — el contenido del PDF mismo no se descarga ni se procesa
en este ticket).

Fechas vienen como `"YYYY/MM/DD"` (con `/`, no `-`) — se normalizan a `YYYY-MM-DD`. Booleanos
vienen como `"S"`/`"N"` (confirmado en `EsReconstruccion`/`EsCovid`/`EsConResponsabilidad`), no
como `true`/`false` nativos de JSON.

### Cruce (`GET /api/crossref`) — verificado en vivo, sin ID compartido

`CodigoEntidad` viene `null` en la fuente real (confirmado, no es un dato faltante ocasional —
ninguna fila de la muestra lo trajo poblado), así que el cruce contra `entities` de
`radar-ejecucion` es **fuzzy por nombre**, reutilizando `@appsperu/entity-matcher` (mismo
paquete que `identidad-fiscal/crossref/entidades`) — sin construir un matcher nuevo. El
adaptador (`src/crossref/match.ts`, `matchEntitiesToInformes`) sigue el mismo patrón de traducir
shapes que ya usan los otros 3 adaptadores del monorepo.

Verificado en vivo contra La Libertad 2023 (2,239 informes reales ingeridos): 130 entidades MEF,
150 nombres de entidad distintos en Contraloría, con matches reales confirmados y candidatos —
ej. "PROYECTO ESPECIAL CHAVIMOCHIC" (radar-ejecucion) ~ "PROYECTO ESPECIAL CHAVIMOCHIC"
(Contraloría), 30 informes, **3 con hallazgo de responsabilidad**, S/ 66,039,145 de devengado
agregado. El conteo de responsabilidad es la señal — nunca el nombre de quién.

## Cautelas

- No se auditó si otras acciones del mismo endpoint (`LoadRecomendacionesPorCiacCodigoSpic`,
  `loadFiltro` con `pTipo=APENDICES`/`ANEXOS`) exponen datos de persona — este ticket solo usa
  `loadInformesElastic`. Si en el futuro se agrega otra acción, debe pasar por la misma revisión.
- El propio buscador permite filtrar por `pFuncionario` (nombre de funcionario) como parámetro
  de búsqueda — el conector **nunca** envía ese parámetro, ni lo necesita: usa `pAnio` únicamente.
- Mismo criterio de riesgo residual que OECE (ver `docs/COBERTURA_Y_CUMPLIMIENTO.md` Parte 2):
  es un endpoint no documentado públicamente por la propia Contraloría, aunque accesible sin
  restricción — no se gestionó autorización formal. A diferencia del conector de OECE, este no
  toca ningún dato de persona natural en ningún escenario, lo que reduce sustancialmente el
  riesgo legal frente al marco de la Ley 29733 (no aplica: no hay dato personal tratado).
