# Qué tenemos en Rastro para postular a fondos ProCiencia 2027

**Pregunta:** qué activos (datos, productos previos, infraestructura, equipo) existen en `appsperu`/Rastro para generar estudios, documentos de trabajo y documentos de discusión de temas vigentes y de alto impacto institucional, en cadenas de valor, competitividad, innovación y afines, presentables a fondos de ProCiencia 2027.

**Corte de evidencia:** 16-10-2026. Fuentes: inventario del monorepo (`README.md`, `docs/conectores.md`, migraciones y logs de ingesta), `investigaciones/`, `docs/` (~25 informes), `docs/financiamiento/`, el reporte previo `reports/Líneas de investigación UP Perú.md` y sus notas.

---

## 1. BLUF — el diagnóstico en un párrafo

Rastro **ya tiene materia prima de nivel nacional suficiente para 4–5 documentos de trabajo sólidos**: ~65 apps con datos oficiales del Estado (padrón RUC completo de 2.34 M, ejecución presupuestal 2009–2026, comercio exterior BCRP/SUNAT, actividad empresarial MTPE 2014–2025, agrario MIDAGRI, 66.8 k derechos mineros, 48.7 k adjudicaciones), un paper académico terminado en dos idiomas con datos reproducibles de BACI-CEPII y WGI, y estudios de caso ya cerrados (reactivos médicos, competitividad La Libertad, integridad en contrataciones). Además **ya existen dos propuestas redactadas** en el repo —una al XI Concurso de Investigación de la UP (S/450,000 de fondo, cierre **29-oct-2026**) y una a Hinrich Foundation (cierre **31-oct-2026**)— y el mapeo completo del portafolio ProCiencia 2027 (S/52.3 M, 15 concursos), con la convocatoria **"Investigación Aplicada a Prioridades 2027-03" abierta hasta el 10-nov-2026**. Los cuatro bloqueos no son de datos sino de **habilitantes**: (1) no hay grupo verificado en Renacyt, (2) ProCiencia exige postulante institucional → la vía es la Universidad del Pacífico, (3) falta capturar las bases de la convocatoria (montos/criterios), y (4) el eje **innovación es el más débil** —no hay ENAID ni datos de innovación de firmas— por lo que debe enmarcarse vía innovación pública/datos abiertos o vía la propuesta de cadenas con componente de innovación.

---

## 2. Activos de datos por eje temático

### 2.1 Cadenas de valor (el activo más fuerte)

| Activo | Fuente oficial | Cobertura | Estado |
|---|---|---|---|
| `identidad-fiscal`: padrón RUC | SUNAT | **2,339,313 filas (universo nacional)**, sector CIIU, condición, domicilio | Verificado |
| `identidad-fiscal` → `ruc_exportaciones_fob` | SUNAT por RUC | Semilla 596 RUC exportadores, **US$208.8 M FOB 2025** | Verificado (universo acotado) |
| `bcrp-comercio-exterior` | API BCRP | 10 series mensuales FOB/CIF nacionales + macro (TC, IPC, PBI, TPM). ⚠️ Series **departamentales congeladas desde dic-2022/2023** | Al día (conector más simple) |
| `sunat-aduanas` | Anuario CE SUNAT | Importaciones por aduana y subpartida, 2023–2024 (cdro_15/16) | 2/22 cuadros ingeridos — **20 XLSX descargados en `data/sunat/` sin ingerir** (incl. exportaciones) |
| `actividad-agraria` | MIDAGRI | Jornal, alquiler de tractor y yunta **mensual por departamento** | Serie completa |
| `investigaciones/rca-shift-share-cptpp-china` | BACI-CEPII, WITS, WDI/WGI, GeoDist | RCA y shift-share 2015–2024, panel gravedad 184 socios/1,496 obs. | Estudio corrido con datos en `data/raw` |
| Mercado de reactivos médicos | OECE/SEACE/CENARES | 25 regiones, 2024–2026, **S/112.4 M verificados** | Estudio **terminado** |
| `identidad-fiscal` → EUDR | SUNAT (diligencia debida UE) | Lotes/parcelas de café y cacao | Trabajo activo (trazabilidad agroexport) |
| `fonafe-empresarial` | FONAFE | 34 empresas estatales (pesca, agroindustria) | Verificado |

### 2.2 Competitividad

| Activo | Fuente | Cobertura | Estado |
|---|---|---|---|
| `actividad-empresarial` | MTPE | Empresas privadas por distrito **2014–2025**, UBIGEO | Verificado (nacional) |
| `radar-ejecucion` → `budget_execution` | MEF | PIA/PIM/devengado **2009–2026** por función/entidad (la tabla más cruzada del repo). ⚠️ GR/GL acotado a La Libertad; CSV mensual 2026 con 404 en última corrida | Serie anual disponible; mensual con fricción |
| `infraestructura-mtc` | MTC + Anuario APN | 507 terminales portuarios, 595 aeródromos, 233 peajes, **741 filas de cargas portuarias históricas**, índice de vulnerabilidad portuaria | Verificado 2026-10-03 |
| `inacal-acreditados` | INACAL | 56 organismos, 105 laboratorios (infraestructura de calidad) | Verificado |
| `osinergmin-combustibles` | OSINERGMIN | 3,429 grifos + precios por distribuidor (costo energético/logístico) | Verificado |
| `red-vial-subnacional` + `ositran-reclamos` | Provías / OSITRAN | 12,536 intervenciones viales; 3,978 reclamos, tráfico y recaudación de concesiones | Verificado |
| `indecopi-clc` | INDECOPI | 3,123 expedientes (señal de calidad/conformidad) | Verificado |

### 2.3 Innovación (el eje más débil — hay que construirlo)

| Activo | Qué aporta | Estado |
|---|---|---|
| `docs/investigacion-agro-digital-2026-10-06.md` | Viabilidad de 3 fuentes MIDAGRI (OCAPAS, Georural, AgroDigital): **innovación en datos abiertos del sector agrario** | Estudio de viabilidad terminado |
| `sunedu-licenciamiento` | 47,156 filas de licenciamiento (capital humano) | Verificado |
| `docs/ANALISIS_INDICE_EXPOSICION_PORTUARIA_PERU.md` | Diseño de índice nuevo (réplica de Busan), 29 refs. con DOI — **producto de innovación metodológica, sin ejecutar** | Diseño listo |
| **Brecha** | **ENAID / Encuesta Nacional de Innovación: no ingerida, no disponible.** Sin datos de I+D ni de innovación de firmas | Gap explícito |
| **Alternativa de encuadre** | "Innovación pública en datos abiertos" — Rastro mismo es objeto de estudio (14 conectores, MCP, cobertura verificable) | Disponible |

### 2.4 Gobernanza y gestión pública (soporte para "afines")

`proveedores-sancionados` (17,919 filas 1993–2026), `compras-publicas` (48,761 adjudicaciones + 59,372 contratos menores), `renamu` (1,891 municipalidades con capacidades), `informes-control` (24,256 informes 2026), `ceplan-estrategico` (alineación plan↔presupuesto), `catastro-minero` (66,823 derechos), `geo-intersections` (14,650 pares comunidad–minero), índices ya construidos: **HHI de concentración en adjudicaciones, índice de calidad de ejecución presupuestal, índice de integridad en contrataciones (IIC)**.

---

## 3. Productos de investigación ya escritos (qué se puede convertir en DtD hoy)

| # | Producto | Ruta | Tema | Estado | Publicable |
|---|---|---|---|---|---|
| 1 | **Paper WGI × competitividad exportadora** (ES + EN, gravedad 184 socios, endogeneidad reportada) | `investigaciones/rca-shift-share-cptpp-china/paper_wgi_competitividad_*` | Competitividad/gobernanza | Terminado | 🟢 (falta IV/GMM para causalidad) |
| 2 | **Propuesta UP XI Concurso** (coordinadora Dra. Larios Francia; presupuesto S/47,730) | `.../propuesta/UP-XI-Concurso-Propuesta-Gobernanza-Exportaciones-ES.md` | Cadenas × gobernanza | **Lista para postular** | 🟢 |
| 3 | **Propuesta Hinrich** (trade governance) | `.../propuesta/Hinrich-Proposal-Governance-Trade-Peru-EN.md` | Cadenas/gobernanza | Lista (cierre 31-oct) | 🟢 |
| 4 | **Mercado de reactivos médicos** (14 secciones, concentración 73.8% en 2 empresas) | `docs/INVESTIGACION_Mercado_Reactivos_Medicos_2026-09-23.txt` | Cadena de valor sectorial | Terminado | 🟢 muy alto |
| 5 | **RADAR competitividad La Libertad** + análisis desarrollo económico + actividad agraria | `docs/RADAR_COMPETITIVIDAD_LA_LIBERTAD_2026-08-28.md` etc. | Competitividad territorial | Terminado (agro con erratas de encoding) | 🟢 |
| 6 | **Índice de Integridad en Contrataciones (IIC)** (132 entidades, defecto de método detectado y corregido) | `docs/hallazgo-iic-integridad-contrataciones-2026-10.md` | Gobernanza/método | Terminado | 🟢 muy alto |
| 7 | **RENAMU × INFOBRAS** (S/18.1 MM en obras GL sin ejecutar) | `docs/INFORME_RENAMU_INFOBRAS_Cruce_La_Libertad_2024_2025.md` | Gestión pública | Terminado | 🟢 |
| 8 | Inversión pública vs. privada LL (brecha de presencia por sector) | `docs/MEMO_LA_LIBERTAD_*_2026-08-28.md` | Cadenas/inversión | Terminado | 🟢 |
| 9 | Índice de exposición/vulnerabilidad portuaria | `docs/ANALISIS_INDICE_EXPOSICION_PORTUARIA_PERU.md` | Innovación metodológica | Diseño sin ejecutar | 🟡 |
| 10 | Agro digital (fuentes de datos MIDAGRI) | `docs/investigacion-agro-digital-2026-10-06.md` | Innovación en datos | Terminado | 🟡 |

**Activos metodológicos:** plantilla de memo regional (`docs/plantilla-memo-regional-rastro-v1.md`), matriz de cobertura 5 regiones, 24 ADRs, data contracts por fuente, pipeline md→pdf/docx reproducible, convención `investigaciones/README.md` (cada proyecto con `propuesta/`, `data/raw`, `scripts/`, `results/` — reproducible de principio a fin), y **formulação de cita del dataset** ya escrita (`docs/HISTORIAL_ABOUT_RASTRO.md` §15.1).

**Preguntas de investigación abiertas ya documentadas** (`docs/RESEARCH_PENDING_EVALUATIONS.md` + §13 de reactivos + "Próximos pasos" del paper): IV/GMM para pasar de asociación a causalidad; shift-share por socio; hipótesis sin cerrar de las 4 regiones (¿sierra>costa en riego?); ejecución MEF 2018–2025 para series; índice portuario Fases 1–3.

---

## 4. Infraestructura que sostiene la postulación

- **MCP Server en producción** (`https://rastro.fyi/mcp`, Cloudflare Worker con `x-api-key`): ~209 tools de solo lectura vía 3 meta-tools (`rastro_buscar_tools`, `rastro_llamar`, `rastro_health`) — argumento de "infraestructura de evidencia reutilizable" y de reproducibilidad para cualquier evaluador.
- **Neon**: 1 proyecto Postgres, ~36–46 bases, tablas crudas con `raw_*_batches` + checksum (trazabilidad de lote) y tablas `*_rejected` (nunca se descartan en silencio).
- **Cobertura verificable**: `docs/COBERTURA_Y_CUMPLIMIENTO.md` (13/16 dimensiones del ciclo municipal), matriz de cobertura por región, validaciones por sprint.
- **Limitación declarada en cada tool**: sin scheduler — ingesta manual; frescura = fecha de última corrida. Decirlo en la sección de datos de la propuesta (los evaluadores de ProCiencia valoran honestidad; el material previo ya lo hace).

---

## 5. Ruta de postulación y calendario (lo urgente)

| Fecha | Convocatoria | Monto | Acción |
|---|---|---|---|
| **29-oct-2026, 17:00** | **XI Concurso de Investigación UP** (S/450,000; proyectos 1 año S/50K, 2 años S/100K; exige afiliación UP, depósito en Datasets UP, manuscrito Q1) | hasta S/100K/proyecto | **La propuesta ya está escrita** (`UP-XI-Concurso-Propuesta-...ES.md`) — pulir y enviar vía FacultyUP. Es el semillero natural y financiador interno |
| 31-oct-2026 | Hinrich Foundation (trade governance) | — | Propuesta EN lista |
| **10-nov-2026, 13:00** | **ProCiencia "Investigación Aplicada a Prioridades 2027-03"** (bases RDE 082-2026, `smartsig.prociencia.gob.pe`) | S/4 M globales (monto/proyecto **no capturado**) | **Descargar bases HOY** y preparar postulación **vía Universidad del Pacífico** |
| Ciclo 2027 | ProCiencia "Desafíos para la solución de prioridades nacionales" | **S/20 M** | Segunda ola: escalar tras semillero con resultados |
| Ciclo 2027 | "Articulación con el sector productivo para transferencia tecnológica" | S/4 M | Vía para el componente MIPYME/ISCAM |
| Anual | CYTED Redes Temáticas (≥6 grupos, ≥6 países) | — | Internacionalización |

**Frase oficial de encaje** (de la convocatoria precedente): *"incrementar la competitividad de cadenas de valor y diversificación productiva"* — usarla textual en el marco.

---

## 6. Portafolio propuesto de documentos de trabajo (mínimo esfuerzo, material existente)

| DtD | Título tentativo | Material base | Eje | Convocatoria |
|---|---|---|---|---|
| **WP-1** | *Instituciones y desempeño exportador del Perú: gobernanza del mercado de destino y exposición diferencial* | paper WGI (ES/EN) + propuesta UP | Competitividad × cadenas | UP XI Concurso → ProCiencia Aplicada |
| **WP-2** | *Concentración y gobernanza de una cadena de provisión estatal: el mercado de reactivos médicos 2024–2026* | INVESTIGACION_Reactivos + análisis CENARES | Cadenas de valor | ProCiencia Aplicada / Desafíos |
| **WP-3** | *¿Agroexportación sin inversión pública? Brecha entre discurso productivo y patrón de ejecución presupuestal, La Libertad 2018–2026* | RADAR + análisis-la-libertad-desarrollo-economico + INFORME_Actividad_Agraria (limpiar erratas) | Competitividad territorial | ProCiencia Aplicada |
| **WP-4** | *Integridad y ejecución de la inversión subnacional: un índice de integridad en contrataciones* | IIC + HALLAZGOS_contratos_inhabilitación + RENAMU×INFOBRAS | Gobernanza/gestión pública | ProCiencia Aplicada / CIES (borrador ya existe) |
| **WP-5** | *Innovación en datos abiertos del sector productivo: infraestructura y desafíos de la provisión agraria digital* (o índice portuario, si se ejecuta Fase 1) | investigacion-agro-digital + diseño índice portuario | **Innovación** | ProCiencia Aplicada |

WP-1 y WP-2 son los más fuertes; WP-5 es el más débil pero cubre el eje innovación que ProCiencia prioriza.

---

## 7. Brechas y bloqueos (con el siguiente paso)

| # | Brecha | Siguiente paso |
|---|---|---|
| 1 | **Grupo no verificado en Renacyt/CONCYTEC** (habilitante para ProCiencia) | Consultar `servicio-renacyt.concytec.gob.pe/lineas-y-grupos`; pedir código/nivel al VRI (el sitio de grupos estuvo caído el 16-10) |
| 2 | **Bases de ProCiencia 2027-03 sin descargar** (montos, criterios, duración) | `smartsig.prociencia.gob.pe` — paso 1 inmediato |
| 3 | **ENAID/datos de innovación ausentes** | O integrar ENAID (INEI) o enmarcar innovación vía datos abiertos/gestión pública |
| 4 | Sin serie MEF 2018–2025 ni cargas de las 4 regiones | Correr `ingest:infobras` + `invierte:full` para Lambayeque/Piura/Cajamarca/Cusco (el diseño comparativo ya existe) |
| 5 | 20 cuadros del Anuario SUNAT sin ingerir (incl. exportaciones por aduana/país) | Ingerir cdro_* de exportación → precio unitario y cadena por producto |
| 6 | Erratas de codificación en `INFORME_Actividad_Agraria` y `paper_wgi_ES` (caracteres chinos) | Revisión lingüística antes de cualquier envío |
| 7 | No hay serie "Documentos de Trabajo" (numeración, plantilla WP, abstract bilingual, JEL) | Crear plantilla + numerar 5 DtD |
| 8 | Material de financiamiento sin versionar (`docs/financiamiento/` en .gitignore; `reports/` y `research_notes/` untracked) | Versionar sin cifras sensibles o archivar con respaldo |
| 9 | Equipo sin acta (Larios Francia, Cuba Alván) y ORCID pendientes | Confirmar equipo + ORCID antes de postular |
| 10 | Cobertura concentrada en La Libertad vs. "nacional" que exigen los evalores | Declarar cobertura real por tabla (la matriz de cobertura ya existe) |

---

## Conclusión

No partimos de cero: Rastro aporta el **dato nacional verificable y reproducible** (MCP + checksums + cobertura declarada), el material de análisis ya escrito cubre 4 de 5 documentos de trabajo, y la identidad institucional existe —la vía es la **Universidad del Pacífico** (Dra. Rosa Patricia Larios Francia, CONCYTEC Nivel VI, CIUP; Mg. Ricardo Cuba Alván, grupo ISCAM), con el XI Concurso de la UP (29-oct) como financiador interno previo y **ProCiencia "Aplicada a Prioridades 2027-03" (10-nov)** como puerta de entrada al portafolio 2027. Lo que decide el éxito no es generar más análisis, sino resolver en las próximas dos semanas tres habilitantes: **bases de la convocatoria descargadas, grupo en Renacyt y postulación vía la UP**, y elegir 2 de los 5 DtD candidatos para no dispersar el esfuerzo.
