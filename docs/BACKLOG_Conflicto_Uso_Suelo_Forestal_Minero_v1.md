# Backlog ejecutable — Conflicto de uso de suelo (forestal × minero)

**Producto:** Rastro / Follow the Sol
**Origen:** sesión 2026-09-21 — idea alternativa mientras la ingesta nacional de Invierte.pe
(MEF) estaba bloqueada por un archivo fuente en 0 bytes. Se eligió porque no depende de MEF ni de
INFOBRAS: usa dos conectores ya mergeados esta semana (catastro-forestal PR #189, catastro-minero
PR #184) con datos ya ingeridos.
**Regla transversal:** API/CLI/MCP. Sin web nueva. Sin inferir superposición de polígonos (ninguna
de las dos fuentes trae geometría) ni causalidad/ilegalidad.

## Tickets

| ID | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| CFM-01 | Spike de valores reales | Confirmar en vivo que `nom_dep`/`nom_pro`/`nom_dis` de SERFOR son UBIGEO (no nombres) en la capa a usar; decidir campo de vigencia forestal (no `SITUAC`, sin significado documentado); decidir valor de `estado` minero que cuenta como "activo"; documentar en `docs/spike-conflicto-uso-suelo-forestal-minero-2026-09.md`. | — | P0 | S | ✅ Hecho |
| CFM-02 | Endpoint `GET /api/crossref/conflicto-uso-suelo` en `catastro-forestal` | Recibe `departamento` (default MADRE DE DIOS); agrega concesiones forestales vigentes por distrito (vía `fec_ter`); traduce UBIGEO a nombre real vía `territories` de ceplan-geo (join exacto, no texto libre); cruza contra derechos mineros titulados (`estado='T'`) del mismo distrito en catastro-minero; responde `hayConflictoUsoSuelo` por distrito. Metadata `matcher`, `restriccion` explícita (sin geometría, sin causalidad). 8 tests (sin config, lista vacía, con/sin derecho minero, filtro de departamento, fallos en vivo de cada pool externo, default). | CFM-01 | P0 | M | ✅ Hecho — verificado en vivo contra MADRE DE DIOS real |
| CFM-03 | Tool MCP + docs | Registrar tool en `mcp-server/src/catalog.ts`; actualizar `docs/conectores.md` y `docs/ESTADO.md`; `npm test`/`npm run build` verdes en `catastro-forestal`. | CFM-02 | P1 | S | ✅ Hecho |

**Puerta de salida:** `GET /api/crossref/conflicto-uso-suelo?departamento=MADRE%20DE%20DIOS`
responde con al menos un distrito con concesión forestal vigente y su estado de derechos mineros
asociados (presente o explícitamente ausente); ningún resultado afirma superposición de polígonos
ni ilegalidad. **Cumplida** — verificado en vivo 2026-09-21: el distrito de Huepetuhe (zona de
minería informal ampliamente documentada) tiene 190 derechos mineros titulados (32,105 ha)
coexistiendo con 5 concesiones forestales vigentes (32,957 ha) — superficies casi idénticas.

## Fuera de alcance (explícito)

| Ítem | Motivo |
|---|---|
| Superposición real de polígonos | Ninguna de las dos fuentes trae geometría en este conector; requeriría ingerir capas con geometría de INGEMMET/SERFOR aparte, no comprometido |
| Otros departamentos amazónicos (Loreto, Ucayali, San Martín) | Fuera del alcance probado en esta sesión; el endpoint ya lo soporta vía query param, falta verificar en vivo |
| Clasificación de `SITUAC` | Sin diccionario de datos público de SERFOR que lo documente — no se adivina |
| Capas de SERFOR distintas a `modalidad_concesiones_forestales` | Las otras 9 capas son permisos/autorizaciones de menor escala o zonificación sin titular; candidatas a extender el cruce si se justifica |
