# PRD — Actividad Empresarial Formal por Distrito (MTPE)

**Estado:** Completado y migrado — AE-01, AE-02 y AE-03 implementados el 2026-09-05 sobre el CSV
de PNDA (año 2022), y **migrados el mismo día** a la fuente propia de MTPE
(`www2.trabajo.gob.pe`, 2014-2025) tras confirmar en una búsqueda avanzada que existía una versión
sustancialmente más fresca. La versión vigente ingiere 2025 (1,510 distritos, 18,120 filas),
resolviendo dinámicamente el año más reciente en cada corrida en vez de un año fijo — ver
`docs/adr/0021-research-spike-mtpe-empleo-formalizacion.md` (addendum) y
`docs/data-contracts/mtpe-empresas-sector-privado.md` para el detalle técnico completo (scraping
HTML, descompresión `.7z`, parseo `.xlsx` — tres técnicas nuevas para el proyecto). Crossref
probado en vivo contra el nuevo corte (Trujillo: 11,928 empresas activas dic-2025 vs. S/ 7,326M de
inversión viable acumulada), sin ningún campo `puntoCiego` ni inferencia de causalidad.
**Fecha:** 2026-09-05
**Ámbito:** una app nueva (`actividad-empresarial`), `mcp-server/src/catalog.ts`, `docs/conectores.md`, `docs/data-contracts/`
**Horizonte:** un sprint corto (alcance más chico que el PRD de Salud+Social — un solo dataset)
**Origen:** [`docs/adr/0021-research-spike-mtpe-empleo-formalizacion.md`](adr/0021-research-spike-mtpe-empleo-formalizacion.md), Hallazgo 1

## 1. Decisión de producto

El spike de ADR-0021 verificó en vivo que el dataset de MTPE "Empresas en el Sector Privado por
mes, según distritos" es real, descargable, con UBIGEO de 6 dígitos (mismo formato que
`investments`/`ipress`/`cobertura_social`) y sin ningún riesgo de PII — a diferencia de otro
dataset del mismo ministerio ("Personas Trabaja Perú") que el mismo ADR marca como **fuente
prohibida** por traer DNI individual.

Este PRD ingiere ese dataset y lo expone junto a inversión pública total por distrito — **sin
forzar el patrón de "punto ciego"** que sí tiene sentido para servicios de salud (activo/inactivo
es una pregunta binaria) pero no para actividad empresarial (un distrito rural con pocas
empresas no es un problema que la inversión deba "resolver" — es solo una característica del
territorio). El cruce es descriptivo: muestra ambos números por distrito, no etiqueta ninguno
como deficiente.

**Advertencia de vigencia, verificada en vivo y no negociable en este PRD**: el único recurso
disponible en PNDA es del **año 2022** — no existe un corte más reciente publicado por MTPE bajo
este dataset (confirmado revisando el catálogo completo el 2026-09-05). Cualquier lectura de este
cruce debe declarar que compara inversión con una fotografía de actividad empresarial de hace
~3-4 años, no con el presente.

## 2. Problema y oportunidad

Rastro no tiene ninguna señal de actividad económica formal privada por distrito — todos los
cruces existentes (`actividad-agraria`, `seguridad-ciudadana`, y ahora `servicios-salud`/
`programas-sociales`) comparan inversión contra un servicio público, nunca contra el tejido
empresarial del territorio. Este dataset permite una primera aproximación a la pregunta "¿la
inversión pública coincide con distritos donde también crece la actividad privada formal?" — sin
inferir causalidad, solo exponiendo ambos números lado a lado.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Ingerir el conteo mensual de empresas activas por distrito (2022, único año disponible) y
exponerlo junto a inversión pública total por distrito (todas las funciones, no solo una), por
UBIGEO exacto.

### No objetivos

- No infiere causalidad ni etiqueta ningún distrito como "deficiente" — a diferencia del cruce de
  salud/social, no hay un patrón de "punto ciego" aplicable aquí.
- No ingiere el dataset gemelo más antiguo (`empresas-en-el-sector-privado-por-meses-según-distritos`,
  slug sin "MTPE", con un recurso 2021) — el dataset con sufijo MTPE ya cubre 2022, un corte más
  reciente; si en el futuro aparece un año posterior bajo cualquiera de los dos slugs, ese es el
  momento de revisar si conviene una serie histórica multi-año, no ahora con un solo año disponible.
- No ingiere ningún otro dataset del spike de ADR-0021 (Trabaja Perú histórico, PLAME/T-Registro
  sin verificar) — quedan fuera, ver ADR-0021 para su estado.
- No construye vistas nuevas en `rastro-web`/`rastro.fyi` — backend + MCP + documentación
  únicamente, mismo criterio que el PRD de Salud+Social.
- No implementa scheduler — ingesta manual, igual que el resto del proyecto.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Cobertura de ingesta | `GET /api/empresas` devuelve los ~1,398 distritos confirmados en el spike para 2022, con 12 valores mensuales por distrito. |
| Cruce por UBIGEO funcional | `GET /api/crossref` junta el conteo de empresas (diciembre 2022, el corte más reciente del único año disponible) con inversión total acumulada por distrito de `investments`, sin matcher difuso. |
| Honestidad de vigencia | La respuesta de ambos endpoints declara explícitamente que el dato es del año 2022, no del año actual. |
| Documentación viva | `docs/conectores.md` y un data contract nuevo documentan columnas reales, el gotcha del espacio final en valores numéricos, y el dataset gemelo descartado. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Gestor público / analista | "¿Los distritos con más inversión también tienen más actividad empresarial formal?" | `GET /api/crossref` responde por distrito, sin inferir causalidad. |
| Agente de IA (MCP) | Consultar el número de empresas activas de un distrito específico. | Tool MCP `actividad_empresarial_empresas`. |

## 5. Alcance funcional

### AE-01 — App `actividad-empresarial`: schema + conector

**Prioridad:** P0 · **Esfuerzo:** S · **Dependencias:** ninguna

Crear la app (`apps/actividad-empresarial/api`, mismo esqueleto que `servicios-salud`). Tabla
`empresas_privadas_distrito` con clave `(ubigeo, anio, mes)` — mismo patrón de normalización
ancho→largo que ya usa `actividad-agraria/agricultural_wage` (el CSV de origen trae una fila por
distrito con 12 columnas de mes; se normaliza a formato largo). Conector
`empresas-distrito-connector.ts`: descarga el recurso CSV vía `package_show` del dataset
`empresas-en-el-sector-privado-por-mes-según-distritos-ministerio-de-trabajo-y-promoción-del`
(un único recurso de datos confirmado hoy — no hay ambigüedad de "más reciente" que resolver
como en RENIPRESS/INFOMIDIS, pero el conector debe loguear una advertencia si en el futuro
aparece más de un recurso CSV, en vez de asumir silenciosamente cuál usar). Mismo header
`User-Agent` de navegador que el resto de conectores contra `datosabiertos.gob.pe`.

**Gotchas confirmados en el spike**:
- Encoding **Latin-1** (confirmado con un caso real: el byte `0xD1` en "NEPE\xd1A" decodifica
  correctamente a "NEPEÑA" solo como Latin-1, falla como UTF-8) — mismo encoding que INFOMIDIS,
  distinto de RENIPRESS (UTF-8 con BOM).
- Los valores numéricos traen un espacio en blanco al final (`"546 "`, no `"546"`) — confirmado
  que es solo un espacio final, no un separador de miles interno (valores de 5 dígitos como
  `"16523 "` para Lima se leyeron intactos, sin espacio interno). El parser debe `trim()` antes
  de convertir a número.
- **Trampa confirmada en la fila real**: la columna `FECHA_CORTE` vale `20230807` — es la fecha
  en que MTPE publicó este corte, no el año que reportan las 12 columnas de mes. El año real de
  los datos (2022) viene del título del recurso (`"...año 2022"` en `package_show`), no de
  `FECHA_CORTE`. El conector debe fijar `anio` a partir del recurso resuelto, nunca parseando
  `FECHA_CORTE` como si fuera el año de los datos.

**Criterios de aceptación**

- El conteo de distritos ingeridos se acerca a 1,398 (confirmado en el spike para 2022).
- Cada distrito produce 12 filas (una por mes) en `empresas_privadas_distrito`, con `anio = 2022`
  fijado desde el recurso resuelto, no desde `FECHA_CORTE`.
- Un valor con espacio final se parsea correctamente (`"546 "` → `546`).
- Un nombre de distrito con `Ñ` se lee correctamente (ej. "NEPEÑA"), confirmando que el archivo
  se decodifica como Latin-1 y no como UTF-8.
- `docs/data-contracts/mtpe-empresas-sector-privado.md` documenta columnas, el dataset gemelo
  descartado (con su slug exacto), y la advertencia de vigencia (único año: 2022).

### AE-02 — Crossref `actividad-empresarial` vs. `investments`

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** AE-01

`GET /api/crossref`: agrega `empresas_privadas_distrito` por `ubigeo` (valor de diciembre 2022,
el corte más reciente disponible) y lo junta contra `investments` de `radar-inversiones` (pool
directo, mismo patrón que `servicios-salud`), agregado por `ubigeo` **sin filtrar por función**
(a diferencia de SS-02/PS-03, acá no hay una categoría de gasto específica para "actividad
empresarial" — se compara contra el total de inversión del distrito, todas las funciones). Igual
que en `servicios-salud`, la respuesta declara el alcance territorial real de `investments`
consultado en vivo (hoy 100% La Libertad).

**Criterios de aceptación**

- La respuesta no incluye ningún campo tipo `puntoCiego` ni etiqueta de deficiencia — solo los
  dos números lado a lado (`empresasActivas`, `inversionTotal`) por distrito.
- Declara explícitamente que `empresasActivas` es de diciembre 2022, y que `inversionTotal` es a
  la fecha de la consulta (corte actual de `investments`) — dos fechas de referencia distintas,
  no deben presentarse como comparables sin esa aclaración.
- Tests: distrito con inversión y con dato de empresas, distrito con inversión y sin dato de
  empresas (no debería ocurrir dado que el dataset es nacional, pero se prueba igual), distrito
  con dato de empresas y sin inversión.

### AE-03 — MCP + documentación

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** AE-01, AE-02

Agregar `actividad_empresarial_empresas` y `actividad_empresarial_crossref` a
`mcp-server/src/catalog.ts` (convención `ToolSpec` existente, `SIN_SCHEDULER`). Ficha nueva en
`docs/conectores.md`. Regenerar `apps/rastro-web/src/data/mcp-tools-catalog.json`
(`npm run generate:mcp-catalog`) — no editar ese archivo a mano.

**Criterios de aceptación**

- `scripts/check-connectors-documented.sh` pasa sin cambios de script.
- El catálogo de `rastro-web` refleja las 2 tools nuevas después de regenerar.

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | AE-01 | Dataset ingerido y consultable de forma independiente. |
| **Siguiente** | AE-02 | El cruce descriptivo inversión ↔ actividad empresarial. |
| **Después** | AE-03 | Capa de lectura para agentes de IA y documentación al día. |

## 7. Requisitos no funcionales

- **User-Agent obligatorio**: mismo requisito que todos los conectores contra `datosabiertos.gob.pe`.
- **Sin inferencia de causalidad**: ningún texto de la API ni de la documentación debe sugerir que
  baja actividad empresarial es culpa de baja inversión, o viceversa — son dos series
  descriptivas, no un diagnóstico.
- **Fechas de referencia explícitas**: toda respuesta que combine `empresas_privadas_distrito`
  (2022) con `investments` (corte actual) debe declarar ambas fechas por separado.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El dataset nunca se actualiza más allá de 2022 (MTPE lo abandonó) | No es un riesgo que este PRD pueda mitigar — se documenta la vigencia real y se decide caso por caso si vale la pena reingerir cuando/si aparece un corte nuevo. |
| Alguien reutiliza el dataset gemelo descartado (slug sin "MTPE") asumiendo que es una fuente distinta | `docs/data-contracts/mtpe-empresas-sector-privado.md` documenta explícitamente ambos slugs y por qué se usa solo uno. |
| El cruce AE-02 se interpreta como una métrica de desempeño de gestión pública | Requisito no funcional explícito (§7) — ninguna descripción de tool MCP ni ficha de documentación debe enmarcarlo así. |

## 9. Fuera de este PRD

- Cualquier otro dataset del ADR-0021 (Trabaja Perú histórico, Empleo Registro Administrativo,
  PLAME/T-Registro).
- Serie histórica multi-año (no hay más de un año disponible hoy).
- Cambios en `apps/rastro-web` o `rastro.fyi`.

## 10. Definition of Done

- AE-01, AE-02 y AE-03 mergeados con PR, revisión y pruebas automatizadas.
- `docs/conectores.md`, el data contract nuevo, y `mcp-tools-catalog.json` reflejan el estado real.
- Ninguna respuesta de la API sugiere causalidad entre inversión y actividad empresarial.
