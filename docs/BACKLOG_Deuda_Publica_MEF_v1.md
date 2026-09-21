# Backlog ejecutable — Deuda Pública (MEF)

**Producto:** Rastro
**Regla transversal:** ninguna ingesta se compromete sobre una fuente sin viabilidad confirmada; ausencia de dato ≠ cero deuda.
**Estimación:** S ≤ 1 día, M 2–3 días, L 4–6 días. Las estimaciones no son compromiso de calendario.
**PRD asociado:** `docs/PRD_Deuda_Publica_MEF_v1.md`
**Nota de remisión (2026-09-21):** la sección "Pendiente de integración" de este documento fue consolidada en `docs/PRD_Organismos_Adscritos_Consolidado_v1.md` / `docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`, que es la fuente viva de seguimiento para esos hallazgos. El contenido original queda abajo sin cambios, como registro histórico.

## Hallazgo de partida (2026-09-21)

`curl` contra `mef.gob.pe/es/consulta-de-deuda-publica` (con y sin `User-Agent` de navegador) devuelve el shell de **Incapsula** ("Request unsuccessful"), no la página real. Es una protección anti-bot distinta y más agresiva que el CloudWAF ya conocido de `datosabiertos.gob.pe`. Mismo dominio y mismo tipo de bloqueo que ya documentó `riesgo-fiscal-isds` para el PDF del MMM/IAPM — ahí la solución fue descarga manual con navegador real (`claude-in-chrome`), no un conector automático.

## Secuencia estratégica

| Fase | Objetivo | Tickets comprometibles | Criterio de corte |
|---|---|---|---|
| 0 | Confirmar si la fuente es alcanzable, y de qué forma. | DEU-01 | Sin esto, ningún ticket de ingesta procede — bloqueante real. |
| 1 | Ingerir deuda nacional y subnacional, si DEU-01 lo habilita. | DEU-02, DEU-03 | Cobertura de La Libertad verificada explícitamente en DEU-03. |
| 2 | Capa de lectura. | DEU-04 | Declara honestamente si la vía fue manual-asistida. |

## Tickets

| ID | Épica | Objetivo | Criterios de aceptación | Dependencias | Prioridad | Esfuerzo | Fase |
|---|---|---|---|---|---|---|---|
| DEU-01 | Viabilidad de fuente | Determinar la vía real de acceso a la Consulta de Deuda Pública del MEF (automática / manual-asistida / no viable). | Evidencia real registrada (respuesta de `curl`, o hallazgo de `claude-in-chrome` en la pestaña Network); conclusión explícita de una de las 3 vías, documentada. | Ninguna. | P0 | S | 0 |
| DEU-02 | Ingesta | Ingerir stock de deuda del sector público nacional. | Columnas confirmadas contra fuente real, no contra descripción de búsqueda; fecha de corte real declarada. | DEU-01 (viable). | P1 | M | 1 |
| DEU-03 | Ingesta | Ingerir deuda de gobiernos regionales y locales, con foco en cobertura real de La Libertad. | Cobertura de La Libertad declarada explícitamente (cuántas entidades aparecen, o ausencia documentada). | DEU-01 (viable). | P1 | M | 1 |
| DEU-04 | Capa de lectura | Registrar tools MCP y ficha en `docs/conectores.md`. | Si la vía fue manual-asistida, la descripción de la tool lo declara explícitamente, mismo criterio que `riesgo-fiscal-isds`. | DEU-02, DEU-03. | P2 | S | 2 |

## Definition of Done por ticket

- DEU-01 no se marca "hecho" sin una conclusión explícita de las 3 vías posibles, con evidencia.
- Si DEU-01 concluye "no viable", los tickets DEU-02 a DEU-04 se cierran formalmente como "bloqueados por fuente", no quedan indefinidamente abiertos.
- Ningún dato de deuda se presenta con cobertura nacional/regional asumida sin verificarla contra la respuesta real de la fuente.
- Sin UI, sin scheduler.

## Registro histórico (ver nota de remisión arriba — ya no es el estado actual)

Hallazgos de órganos adscritos investigados en paralelo esta misma sesión. **Ya tienen PRD/backlog propio** (`docs/PRD_Organismos_Adscritos_Consolidado_v1.md` / `docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`) — esta tabla queda como registro de cuándo y con qué evidencia se encontró cada uno, no como pendiente activo:

| Entidad | Adscrita a | Hallazgo |
|---|---|---|
| SERFOR / GEOSERFOR | MIDAGRI | `geo.serfor.gob.pe/geoserfor` responde; catastro forestal ya en `datosabiertos.gob.pe`. URL exacta del servicio WFS/REST sin confirmar (un intento a `/geoserver/wfs` dio 404). Alta relevancia EUDR. |
| ONPE | Sistema electoral (junto a JNE) | Grupo propio en `datosabiertos.gob.pe`, **375 datasets**, incluye resultados electorales 2025. Sin explorar a fondo. |
| SENACE | MINAM (no MTC) | API REST documentada real: `datosabiertos.senace.gob.pe/Api/Help`, verificado HTTP 200 en vivo. |
| OSITRAN | MTC | Portal propio verificado en vivo: `serviciosdigitales.ositran.gob.pe:8443/PortalDatosOsitran/`. |
| SUNAFIL | MTPE | Presencia confirmada en `datosabiertos.gob.pe`, contenido sin verificar. |
| SUNEDU | Sistema educativo (no MINEDU directo) | Licenciamiento universitario, dato real referenciado por terceros, fuente primaria sin verificar directamente. |
| RENIEC | Sistema electoral/identidad | Datasets agregados (DNI por edad/sexo/departamento, donantes de órganos) — sin PII, sin verificar en profundidad. |
| ANA, SENASA, SUTRAN, INS, INABIF | MIDAGRI, MIDAGRI, MTC, MINSA, MIMP | Sin verificar en esta pasada — quedaron fuera por presupuesto de tiempo de la investigación. |

Requiere su propio PRD antes de convertirse en tickets ejecutables.
