# Rastro — Changelog Ejecutivo

2026-09-21

Últimas \~3 semanas (2026-09), 15 PRs mergeados a `master`: nuevos cruces de riesgo institucional, 11 fuentes de datos ingresadas, MCP desplegado en producción con autenticación, y una autocorrección (SUNARP reclasificado como hallazgo negativo).

## Cruces de riesgo nuevos

- **Doble inhabilitación** (administrativa × judicial): cruza sanciones de OECE con mandatos judiciales; antes solo se veía la vía administrativa.
- **Infracciones ambientales × compras públicas** (OEFA × contrataciones): detecta empresas sancionadas por OEFA que siguen contratando con el Estado. Así se encontró el caso PETROPERÚ (468 infracciones OEFA + S/205M en contratos vigentes).
- **Velocidad sanción→contrato**: alerta cuando una empresa gana un contrato público poco después de ser sancionada — señal de posible arreglo o captura.
- **RENAMU × inversiones GL**: cruza capacidad institucional municipal con ejecución de inversiones por departamento.
- **Poder Judicial × CEPLAN-geo**: cruce territorial que expone UBIGEO en la API — antes Poder Judicial no tenía ancla geográfica utilizable.

## Nuevas fuentes de datos

- **INDECI/SINPAD**: emergencias históricas (desastres, daños) — Rastro no tenía datos de gestión de riesgo de desastres.
- **SERFOR**: catastro forestal (títulos habilitantes).
- **SENACE**: cartera de proyectos en certificación ambiental (EIA en trámite).
- **INGEMMET**: catastro minero (derechos mineros por departamento).
- **SERNANP**: áreas naturales protegidas.
- **Congreso**: proyectos de ley — primera cobertura del Legislativo (antes solo Ejecutivo/GL/GR).
- **OECE**: inhabilitaciones por mandato judicial, sumadas a las administrativas.
- **SIAGIE**: trayectoria y deserción estudiantil 2021-2024.
- **SíseVe**: casos de violencia escolar (MINEDU).
- **Poder Judicial**: estadística jurisdiccional de procesos judiciales.
- **Identidad fiscal**: RUC masivo, Padrón PPA, Ficha OECE, exportaciones FOB.

## Infraestructura y acceso

- **MCP en producción** (`mcp.rastro.fyi`, Fly.io) con **API keys `sk-rastro-*`** — antes el MCP no estaba desplegado públicamente ni tenía autenticación por key.
- \~167 tools MCP catalogadas, con `querySchema` validado en `invokeTool` — antes algunas tools aceptaban argumentos sin validar.

## Correcciones

## Borrador — post de LinkedIn

> ⚠️ **Antes de publicar**: verificar 1:1 las cifras (468 infracciones, S/205M) contra la fuente primaria OEFA/SEACE y confirmar el cruce por RUC antes de nombrar a PETROPERÚ públicamente.

---

**Una empresa estatal acumuló 468 infracciones ambientales de OEFA — y siguió firmando contratos públicos por más de S/205 millones.**

No lo encontramos revisando un caso a mano. Lo encontramos porque construimos algo que antes no existía: un cruce automático entre el registro de infracciones ambientales de OEFA y el registro de contrataciones del Estado.

El patrón no es solo "empresa sancionada sigue contratando". Es la velocidad: en Rastro ahora medimos cuánto tiempo pasa entre una sanción y el siguiente contrato ganado por la misma empresa. Cuando ese tiempo es corto, deja de ser coincidencia y empieza a ser una señal de gobernanza.

Esto ya no es un hallazgo aislado. Es una capacidad permanente: el cruce OEFA × compras públicas y el detector de velocidad sanción→contrato corren sobre datos públicos del Perú, disponibles ahora vía API/MCP para quien quiera auditar, investigar o simplemente preguntar.

Así es como debe verse la fiscalización en 2026: no un reporte que se publica una vez, sino infraestructura que sigue mirando.

🔗 \[link a Rastro / mcp.rastro.fyi\]

\#TransparenciaPeru #DatosAbiertos #Anticorrupcion #GovTech

- **SUNARP reclasificado a Épica C** (hallazgo negativo real): se determinó que no aporta lo esperado, así que Rastro ahora es más honesto sobre lo que SUNARP *no* puede dar.
