# Cobertura de fuentes y cumplimiento legal — Rastro

Documento de referencia del proyecto. Dos partes: (1) qué tanto del ciclo de gestión
municipal peruano cubren hoy los 14 conectores/apps del monorepo, cruzado dimensión ×
fuente; (2) una revisión de riesgo legal por conector bajo el marco normativo peruano
aplicable. Grounded en el código real (`src/routes/*.ts`, `src/db/migrations/*.sql`,
`docs/conectores.md`) — no en supuestos.

**Fecha de este análisis**: 2026-09-03. **Alcance**: worktree `feat/fly-io-api-rastro-fyi`
(rama de infra Fly.io). El conector de conformación societaria OSCE (`perfilprov-
conformacion-connector.ts`, socios/representantes de proveedores) **no está presente en
esta rama** — vive en `chore/dev-local-memory-constrained-subset` (commit `5d92b72`).
Auditado directamente contra ese código el mismo día (ver Parte 2) — ya no es una
estimación pendiente, es un hallazgo confirmado.

---

## Parte 1 — Matriz de cobertura de fuentes

Filas = dimensiones del ciclo de gestión pública municipal en Perú. Columna "Conector(es)"
lista el app/archivo real que la cubre. "Qué captura" está verificado contra rutas y
migraciones, no solo la descripción de alto nivel del conector.

| Dimensión | Conector(es) | Qué captura (verificado en código) | Estado |
|---|---|---|---|
| **Planeamiento estratégico** | `ceplan-estrategico` (`observa-connector.ts`) | Indicadores priorizados de gestión estratégica agregados por nivel de gobierno (GN/GR/MP/MD/Total) — **no hay modelo per-entidad público**, solo agregado nacional/nivel. | Parcial estructural — la fuente (ObservaPerú) no publica el dato per-municipalidad; no es un hueco de ingesta, es un techo de la fuente. |
| **Presupuesto y ejecución de gasto** | `radar-ejecucion` (`mef-connector.ts`) | PIA/PIM/Devengado por `(SEC_EJEC, FUNCION, ANO_EJE)`, tabla `budget_execution`. Cobertura real: **parcial por diseño**, acotada a La Libertad vía offsets manuales calibrados (ver ADR-0015). | Cubierto, con caveat de cobertura territorial documentado. |
| **Inversión pública** | `radar-inversiones` (`invierte-connector.ts`) | Detalle de proyectos Invierte.pe (costos, estado, entidad), clave `SEC_EJEC`/`CUI`. Cobertura parcial por bytes (ventana Range), no delta. | Cubierto. |
| **Contrataciones — mayor cuantía (OCDS)** | `compras-publicas` (`oece-connector.ts`, `oece-records-connector.ts`) | Releases y records OCDS, `awards` con adjudicaciones. Parcial: solo 10 páginas más recientes por corrida. | Cubierto, con caveat de profundidad histórica. |
| **Contrataciones — menor a 8 UIT** | `compras-publicas` (`seace-public-minor-contracts-connector.ts`, `legacy-seace-orders-connector.ts`) | Contratos menores adjudicados, tabla `minor_contracts` compartida con el conector legacy. Declara cobertura real por corrida en `territorial_coverage` (completa/parcial/sin datos). | Cubierto — es el segmento que hasta CX-01 (2026-09-02) quedaba fuera de los cruces de `identidad-fiscal`/`proveedores-sancionados`; ya cerrado. |
| **Ejecución física de obras** | `infobras` (`infobras-connector.ts`) | Avance físico, paralización, entidad responsable — snapshot nacional completo del XLSX de Contraloría. | Cubierto. |
| **Identidad fiscal de proveedores/entidades (RUC)** | `identidad-fiscal` (`padron-connector.ts`) | Padrón SUNAT filtrado a personas jurídicas (RUC-20), 2.3M filas, universo nacional completo. | Cubierto — ver nota de alcance intencional en Parte 2 (excluye personas naturales por diseño). |
| **Identidad/conformación societaria de proveedores** (socios, representantes legales) | `perfilprov-conformacion-connector.ts` (rama `chore/dev-local-memory-constrained-subset`, no mergeado a esta rama) | Socios, representantes legales y órganos de administración por RUC, vía `eap.oece.gob.pe/ficha-proveedor-cns` — captura nombre, tipo y **número de documento (DNI/CE)**, cargo, y **% de participación accionaria**. Fuente reverse-engineered (ver Parte 2), no un endpoint documentado por OSCE. | Cubierto (fuera de esta rama) — pero es el conector de mayor riesgo legal del catálogo, ver Parte 2. |
| **Sanciones e inhabilitaciones** | `proveedores-sancionados` (`sanciones-connector.ts`) | Inhabilitaciones + multas vigentes/históricas, universo nacional completo (17.9K filas), cruce por RUC exacto contra `awards` y `minor_contracts`. | Cubierto. |
| **Personal / planilla municipal** | — | Sin conector, pero **investigado 2026-09-04: sí existe fuente estructurada pública** — dataset AIRHSP en la Plataforma Nacional de Datos Abiertos (gestionado por MEF), CSV descargable por año (2017–2026) a nivel de registro individual (persona-entidad-régimen), con metadatos vía API estilo CKAN. | **Hueco cerrable** — candidato directo a conector 15; solo falta mapear entidades a los códigos MEF/AIRHSP para el crossref. |
| **Patrimonio y bienes muebles del Estado** | — | Sin conector. Investigado 2026-09-04: SBN publica CSV abierto de **predios (inmuebles)** en datosabiertos.gob.pe — estructurado y usable. Bienes muebles (vehículos, equipos) solo existen dentro del aplicativo interno SINABIP Web, sin exportación pública conocida. | **Hueco parcialmente cerrable** — viable ahora para inmuebles; muebles requeriría solicitud formal de acceso a información. |
| **Rendición de cuentas / cierre presupuestal** | — | `radar-ejecucion` cubre ejecución en curso. Investigado 2026-09-04: el Buscador de Informes de Control de la Contraloría exporta listados de metadatos de búsqueda (hasta 1000 registros), pero cada informe es un PDF individual — los hallazgos de auditoría y montos observados no están en un dataset estructurado. | **Hueco real, no cerrable a corto plazo** — se podría raspar metadatos (título/entidad/fecha/tipo) de forma semi-estructurada, pero el contenido sustantivo sigue en PDF. |
| **Participación ciudadana / presupuesto participativo** | — | No hay fuente digital estructurada: el instrumento normativo (Ley 28056, Instructivo MEF) exige actas físicas/PDF por municipalidad, sin repositorio nacional consolidado. | **No estructuralmente automatizable hoy** — no es un hueco de Rastro, es una ausencia de dato abierto en el ecosistema estatal. |
| **Seguridad ciudadana** | `seguridad-ciudadana` (`sidpol-connector.ts`) | Denuncias policiales por `(año, mes, ubigeo, modalidad)`, dataset nacional completo (MININTER/SIDPOL). | Cubierto. |
| **Actividad agraria** | `actividad-agraria` (3 conectores: jornal, tractor, yunta) | Indicadores mensuales agropecuarios por departamento (MIDAGRI), dataset nacional completo. | Cubierto — agregado departamental, no distrital. |
| **Comercio exterior** | `bcrp-comercio-exterior` (`bcrp-connector.ts`) | Series mensuales agregado nacional (BCRP). Sin desagregado departamental (la API lo tiene pero está congelado desde 2022/2023). | Cubierto a nivel nacional únicamente — no es una dimensión municipal en sentido estricto. |
| **Actividad económica regional (La Libertad)** | `bcrp-la-libertad` (`pdf-connector.ts`) | 7/10 anexos del PDF mensual de Sucursal Trujillo (agropecuario, pesca, minería, manufactura, crédito, depósitos, ejecución presupuestal regional). Ingesta manual (WAF bloquea automatización). | Cubierto parcialmente — único conector sin automatización posible en el catálogo. |
| **Inversión privada (APP/PA/OxI)** | `inversion-privada` (`vertix-connector.ts`, `oxi-connector.ts`, `gis-connector.ts`) | Cartera PROINVERSIÓN, complementa (no sustituye) inversión pública. Completa por corrida. | Cubierto. |
| **Territorio/infraestructura georreferenciada** | `ceplan-geo` (`geoserver-client.ts`) | Capas WFS de CEPLAN: distritos, aeropuertos, puertos. Cobertura nacional en distritos; departamental/provincial sin tabla `territories` separada. | Cubierto (MVP), pilotado en 5 regiones. |
| **Score compuesto / salud institucional** | `salud-institucional` | No es fuente propia — agregador en vivo de 5 apps (ejecución, obras, inversiones, compras, salud tributaria). No cuenta como dimensión nueva de cobertura, es una síntesis de las anteriores. | N/A — meta-capa, no dato primario. |

### Lectura de la matriz

De **16 dimensiones reales** del ciclo de gestión municipal identificadas: **13 están
cubiertas** (algunas con caveats de profundidad/territorio ya documentados en
`docs/conectores.md`; incluye conformación societaria, confirmada aunque vive en otra
rama), **1 es un hueco cerrable a corto plazo** (personal/planilla, vía el dataset AIRHSP
de datos abiertos — investigado 2026-09-04), **1 es parcialmente cerrable** (patrimonio:
predios sí, bienes muebles no), **1 sigue siendo un hueco real sin salida corta**
(rendición de cuentas formal — solo PDFs individuales en el buscador de Contraloría), y
**1 no es automatizable con el estado actual del dato abierto peruano** (participación
ciudadana). El siguiente paso natural para el hueco de personal/planilla ya no es
"investigar si hay fuente" — es **construir el conector 15 contra AIRHSP**, mapeando
entidades a los códigos que usa el dataset. En paralelo, sigue pendiente resolver el punto
de cumplimiento legal real del conector de conformación societaria (ver Parte 2).

---

## Parte 2 — Revisión de cumplimiento legal

### Marco normativo aplicable

- **Ley 27806** (Transparencia y Acceso a la Información Pública) — legitima republicar
  datos que las entidades ya están obligadas a difundir. Base legal de bajo riesgo para
  la mayoría del catálogo.
- **Ley 29733** de Protección de Datos Personales + reglamento vigente (**DS
  016-2024-JUS**, en vigor desde 2025-03-30), supervisada por la **ANPDP** (Autoridad
  Nacional de Protección de Datos Personales, bajo el Ministerio de Justicia). Aplica
  cuando el dato identifica a una **persona natural**, no a una persona jurídica — el
  RUC-20 (empresa) y su razón social no son datos personales bajo esta ley; el RUC-10
  (persona natural con negocio) y su nombre, sí.
- **Ley de Contrataciones del Estado** (Ley 30225 y modificatorias) — marco de los dos
  regímenes que cubre `compras-publicas` (OCDS/mayor cuantía vs. SEACE/menor a 8 UIT).
- **DS 157-2021-PCM** + Plataforma Nacional de Datos Abiertos (PCM) — política que
  respalda la obligación estatal de publicar en abierto lo que varias de estas fuentes
  ya exponen; argumento normativo a favor de Rastro si una entidad cuestiona el reuso.

### Evaluación por conector

| Conector / app | ¿Expone dato de persona natural? | Base legal | Riesgo | Mitigación recomendada |
|---|---|---|---|---|
| `radar-ejecucion` (MEF, MINCETUR) | No — entidades públicas y agregados. | Ley 27806 (dato ya público, entidades del Estado). | **Bajo** | Ninguna. |
| `compras-publicas` — OCDS (`awards`) | Posible: `supplier_id`/proveedor puede corresponder a RUC-10 (persona natural con negocio) cuando el postor es individual. | Ley 27806 — el estándar OCDS es público por diseño; el postor participó sabiendo que su adjudicación se publica. | **Bajo-medio** | Confirmar que OECE ya publica esta info sin restricción (así es, es su propio portal público) antes de asumir base legal automática para cualquier enriquecimiento adicional que Rastro le agregue. |
| `compras-publicas` — contratos menores (SEACE) | Igual que arriba — `supplier_profiles`/`winning_supplier_id` puede ser persona natural. | Ley 27806, mismo razonamiento — SEACE es un buscador público oficial. | **Bajo-medio** | Igual que arriba. |
| `radar-inversiones` | No — proyectos y entidades públicas. | Ley 27806. | **Bajo** | Ninguna. |
| `infobras` | No — obras y entidades. | Ley 27806. | **Bajo** | Ninguna. |
| `identidad-fiscal` | **Excluido por diseño**: la ingesta filtra explícitamente a RUC-20 (personas jurídicas) — ver comentario en `001_init.sql`: *"Filtrado en la ingesta a personas jurídicas (RUC-20 por defecto)... el 84.2% son personas naturales... fuera del caso de uso"*. | Ley 27806 (padrón RUC de personas jurídicas, público por SUNAT). | **Bajo** | Ninguna adicional — el filtro por RUC-20 ya es la mitigación correcta; documentarlo explícitamente en una política de privacidad del proyecto refuerza la defensa si se cuestiona. |
| `proveedores-sancionados` | **Sí, real**: `razon_social` en `inhabilitaciones`/`multas` es literalmente el nombre de la persona cuando el sancionado tiene RUC-10 — no hay separación entre "nombre de empresa" y "nombre de persona natural" en el esquema. | Ley 27806 — el RNP/Tribunal de Contrataciones publica estas sanciones precisamente para que sean conocidas (es un registro de inhabilitación con efecto legal erga omnes); republicar un dato que la propia entidad sancionadora hace público con ese fin tiene base sólida. | **Medio** | Declarar explícitamente en una política de privacidad que este dataset republica sanciones ya públicas del RNP con fin de interés público (control ciudadano del gasto), y evitar agregar cualquier enriquecimiento propio (ej. cruzar con datos de contacto) que la fuente original no publique. |
| `ceplan-estrategico` | No — indicadores agregados por nivel de gobierno. | Ley 27806. | **Bajo** | Ninguna. |
| `ceplan-geo` | No — geometrías territoriales. | Ley 27806 / dato geográfico sin PII. | **Bajo** | Ninguna. |
| `inversion-privada` (VERTIX/OxI/GIS) | No — proyectos, entidades promotoras. | Ley 27806. | **Bajo** | Ninguna. |
| `bcrp-comercio-exterior` / `bcrp-la-libertad` | No — series macroeconómicas agregadas. | Ley 27806. | **Bajo** | Ninguna. |
| `actividad-agraria` / `seguridad-ciudadana` | No — agregados departamentales (jornal, denuncias por modalidad/ubigeo), sin identificar personas. | Ley 27806. | **Bajo** | Ninguna. |
| `salud-institucional` | No — score derivado de las 5 fuentes anteriores, a nivel de entidad. | Hereda la base legal de las fuentes que combina. | **Bajo** | Ninguna. |
| Conector de conformación societaria (OSCE `perfilprov`) — **auditado en `chore/dev-local-memory-constrained-subset`, commit `5d92b72`** | **Sí, confirmado**: `supplier_conformacion` guarda `nombre`, `tipo_documento`/`numero_documento` (DNI/CE) y `cargo` de una persona natural identificada. La API pública ya **no expone** el % de participación accionaria (retirado 2026-09-03) y el `numeroDocumento` se sirve **enmascarado** (solo últimos 3 dígitos, `routes/conformacion.ts`, corregido 2026-09-03) — el dato completo se conserva solo en la tabla, para cruce interno entre RUCs. | **Débil, no equiparable al resto del catálogo.** El propio comentario del conector (`perfilprov-conformacion-connector.ts:6-12`) declara: *"No es un endpoint documentado públicamente: se descubrió inspeccionando el bundle JS de la SPA"*. A diferencia de SEACE/INFOBRAS/MEF/RNP (portales de datos abiertos oficiales, con vocación explícita de difusión), este es un endpoint interno (`eap.oece.gob.pe/perfilprov-bus`, `/ficha-proveedor-cns`) que sostiene la UI web de OSCE — accesible sin autenticación, pero sin que OSCE haya declarado que su consumo automatizado y republicación masiva estén autorizados. Ley 27806 cubre el *dato* (la ficha es visible para cualquiera que use el buscador oficial), pero no necesariamente el *método* de obtenerlo a escala. **Decisión de proyecto (2026-09-03): no se buscará autorización formal de OSCE** — pedir permiso explícito arriesga una negativa explícita, que convertiría un uso hoy defendible ("dato ya público, método no restringido expresamente") en uno claramente no autorizado. Se opta por mitigación técnica (minimizar campos expuestos, enmascarar identificadores, mantener bajo perfil operativo) en vez de gestión formal. | **Medio** (bajó desde Alto: % accionario retirado + DNI enmascarado; el problema de fondo — endpoint no documentado, sin autorización explícita — **no desaparece, se acepta como riesgo residual gestionado**, no resuelto) | (1) ~~Gestionar autorización formal ante OSCE~~ — **descartado por decisión del proyecto**: se evita todo contacto formal para no convertir una zona gris en una prohibición explícita; el riesgo residual de "acceso no autorizado" bajo Ley 30096 se mitiga manteniendo volumen bajo, sin publicitar el mecanismo de descubrimiento del endpoint, y listos para desactivar el conector si OSCE lo objeta directamente. (2) ~~Enmascarar `numero_documento`~~ — **hecho**: solo últimos 3 dígitos visibles en la API pública. (3) ~~Retirar `numero_acciones`/`porcentaje_acciones`~~ — **hecho**. (4) Mantener la cortesía de 300ms entre requests ya implementada, y declarar base legal (interés legítimo, trazabilidad de conflictos de interés) en una política de privacidad — sigue pendiente, sin bloquear el uso del conector. |

### Resumen de riesgo

De los **14 conectores activos verificados en esta rama**: **12 en riesgo bajo** (datos de
entidades públicas o agregados sin identificar personas, o con exclusión de personas
naturales ya implementada como en `identidad-fiscal`), **1 en riesgo bajo-medio**
(`compras-publicas`, por la posibilidad de postores RUC-10, mitigado por ser dato que la
propia OECE/SEACE ya publica), y **1 en riesgo medio** (`proveedores-sancionados`, por
nombres de personas naturales sancionadas — mitigado por tratarse de un registro con
efecto legal público por diseño del propio RNP).

Fuera de esta rama, el conector de conformación societaria (OSCE `perfilprov`) queda
auditado en **riesgo medio** (bajó de Alto tras dos correcciones aplicadas 2026-09-03:
retirar el % de participación accionaria y enmascarar el DNI a solo 3 dígitos visibles en
la API pública). Sigue siendo el caso de mayor riesgo del catálogo porque el problema de
fondo — endpoint no documentado, sin autorización explícita de OSCE — no se resuelve con
mitigación técnica sola. El proyecto decidió explícitamente **no** buscar autorización
formal de OSCE, para no arriesgar una negativa que convierta una zona gris hoy defendible
en un uso claramente prohibido; el riesgo residual se acepta y se gestiona con perfil
operativo bajo (rate limiting ya implementado, campos mínimos expuestos, sin publicitar el
mecanismo de descubrimiento del endpoint), no con gestión formal ante la entidad.

**Recomendación general**: el proyecto no tiene hoy una política de privacidad publicada
que declare explícitamente la base legal de Ley 27806/29733 para el tratamiento de estos
datos. El riesgo real está concentrado en 3 conectores, no en los 14: `proveedores-
sancionados` (medio, ya mitigado por diseño), `compras-publicas` (bajo-medio), y sobre todo
conformación societaria (alto, con acción pendiente antes de producción). La acción de
mayor costo-beneficio es (1) redactar una política de privacidad corta que cubra
específicamente estos casos y (2) resolver las mitigaciones de conformación societaria
antes de mergear ese conector, en vez de una revisión legal exhaustiva de todo el
catálogo.
