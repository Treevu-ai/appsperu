# Catálogo de tools — MCP Rastro

**Fuente:** `rastro_buscar_tools` (39 apps, 199 tools, todas de solo lectura / GET).
**Fecha de captura:** 2026-09-25.
**Invocación:** `rastro_llamar` con `tool` = nombre exacto y `args` = path params + query params.

| App | Tools |
|---|---|
| radar-ejecucion | 34 |
| compras-publicas | 26 |
| ceplan-estrategico | 7 |
| ceplan-geo | 16 |
| radar-inversiones | 5 |
| infobras | 7 |
| identidad-fiscal | 14 |
| salud-institucional | 2 |
| proveedores-sancionados | 9 |
| actividad-agraria | 5 |
| actividad-empresarial | 2 |
| seguridad-ciudadana | 2 |
| bcrp-comercio-exterior | 2 |
| bcrp-la-libertad | 2 |
| inversion-privada | 8 |
| servicios-salud | 2 |
| programas-sociales | 2 |
| informes-control | 2 |
| mindef | 3 |
| mimp | 2 |
| renamu | 3 |
| autoridades-electas | 1 |
| candidatos-erm | 1 |
| instituciones-educativas | 3 |
| violencia-escolar | 2 |
| legislativo-congreso | 3 |
| infracciones-ambientales | 2 |
| areas-protegidas | 2 |
| catastro-minero | 2 |
| catastro-forestal | 2 |
| senace-cartera-proyectos | 2 |
| geo-intersections | 5 |
| territorio-inteligencia | 4 |
| emergencias-indeci | 3 |
| residuos-solidos | 1 |
| red-vial-subnacional | 1 |
| infraestructura-mtc | 3 |
| riesgo-fiscal-isds | 4 |
| poder-judicial | 3 |
| **Total** | **199** |

---

## 1. Ejecuta y ejecución presupuestal

### radar-ejecucion (34)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `radar_ejecucion_execution` | Ejecución presupuestal por entidad | PIA/PIM/Devengado por entidad, función y año fiscal (CSV MEF). Cobertura parcial acotada a La Libertad; sin año puede mezclar ejercicios. | nivel, funcion, anio, ubigeo, departamento, metaDepartamento |
| `radar_ejecucion_execution_resumen` | Agregado de ejecución | Agrupa PIA/PIM/devengado por función o genérica de gasto sin paginar todo. `groupBy` requerido. | groupBy, nivel, anio, ubigeo, departamento, metaDepartamento |
| `radar_ejecucion_execution_by_entity` | Ficha de ejecución de una entidad | Detalle de ejecución de una entidad por su `entity_code`. | path:entityCode |
| `radar_ejecucion_benchmark` | Peer benchmarking de ejecución | Compara la ejecución de una entidad contra su cohorte (mismo nivel de gobierno) en un año. 422 si no hay regla de cohorte. | path:entityCode, anio |
| `radar_ejecucion_meta_sources` | Frescura de ingesta MEF | Metadata de los últimos 10 lotes (cuándo, cuántos registros, checksum). | — |
| `radar_ejecucion_lluvias_seguimiento` | Tablero de lluvias | Actividad MEF con PIA/PIM/devengado + proyectos territoriales con CUI verificado, en secciones separadas. | anio, departamento, busqueda |
| `radar_ejecucion_sector_inventory` | Inventario de entidades | Entidades MEF en La Libertad: GN por destino y GR por sede, con marca de si tienen clasificación sectorial verificada. | anio, departamento, limit |
| `radar_ejecucion_sector_ficha` | Ficha sectorial | Entidades verificadas de un sector: PIA/PIM/devengado, regla territorial y cortes usados. CUI/obra/contratación solo con claves exactas. | path:sectorId, anio, departamento |
| `radar_ejecucion_sector_entidad_ficha` | Ficha de entidad en sector | Igual que `sector_ficha` pero acotado a una entidad. | path:entityCode, anio, departamento |
| `radar_ejecucion_sector_comparativo` | Comparativo sectorial | Comparativo descriptivo de entidades sectoriales verificadas; separa responsabilidad nacional dirigida de ejecución regional por sede. | anio, departamento, sectores |
| `radar_ejecucion_budget_movement` | Reparto de presupuesto | Explicación determinística de la distribución PIA/PIM/devengado entre GN dirigido y GR ejecutado. No suma ambos universos. | anio, departamento, sectores |
| `radar_ejecucion_care_services` | Servicios que cuidan | Registro trazable de infraestructura de cuidado (CUI/obra por clave exacta) y alimentación escolar (solo con evidencia oficial). | tipo, departamento |
| `radar_ejecucion_care_service_by_id` | Ficha de servicio de cuidado | Detalle de un servicio, con proveedores (RUC, lote) y evidencia de entrega por colegio. | path:serviceId, departamento |
| `radar_ejecucion_food_lots` | Lotes de alimentación escolar | Lotes materializados desde evidencia oficial: contrato, comité, proveedor y RUC solo si están publicados exactamente. | periodo, estado |
| `radar_ejecucion_food_coverage` | Cobertura de alimentación | Solo muestra colegio/provincia/distrito/entrega con código modular y acta oficial. | periodo, provincia, distrito |
| `radar_ejecucion_food_supplier` | Proveedor de alimentos | Lotes y evidencia de cumplimiento por RUC exacto de 11 dígitos. No vincula por nombre de consorcio. | path:ruc, periodo |
| `radar_ejecucion_food_integrity` | Integridad cadena alimentaria | Control lote–RUC–colegio–entrega. Devuelve BLOQUEADO_POR_EVIDENCIA si faltan claves/actas; `estricto=true` → HTTP 409. | periodo, estricto |
| `radar_ejecucion_food_evidence_queue` | Cola de evidencia alimentaria | Evidencia faltante para trazabilidad (RUC, padrón de colegios, actas, viabilidad de fuente), con prioridad de revisión humana. | periodo, estado |
| `radar_ejecucion_supplier_observations` | Observaciones sobre proveedor | Sanción formal, denuncia con expediente, proceso en curso o antigüedad de RUC, por RUC exacto. | path:ruc, tipo, estado |
| `radar_ejecucion_supplier_observations_unlinked` | Observaciones sin RUC | Referencias externas sin RUC exacto, preservadas para revisión. Prohibida atribución a proveedor/lote/ranking. | — |
| `radar_ejecucion_tourism_hospedaje` | Hospedaje turístico | Indicadores MINCETUR de arribos y pernoctaciones por departamento/mes (Ocupabilidad PNDA). | departamento, anio |
| `radar_ejecucion_tourism_crossref` | Turismo vs gasto | Flujo MINCETUR contra gasto en función TURISMO (MEF) y PIM/devengado MPT Trujillo, separando sede de meta. | departamento, anio, anioFiscal, entidadMpt |
| `radar_ejecucion_infrastructure_assets` | Activos de infraestructura | Activos materializados: CUI/obra cuando existe, evidencia separada de cierre, operador, mantenimiento y disponibilidad. | departamento, sector |
| `radar_ejecucion_infrastructure_asset` | Ficha de activo | Identidad, obra INFOBRAS por CUI exacto, recepción/cierre, operador, mantenimiento, indicadores y vacíos. | path:assetId |
| `radar_ejecucion_infrastructure_operation` | Operación de activo | Recepción, operador y disponibilidad. Ausencia es vacío de evidencia, no prueba de inoperatividad. | path:assetId |
| `radar_ejecucion_infrastructure_maintenance` | Mantenimiento de activo | PIM/devengado identifica financiamiento y ejecución registrada; no prueba mantenimiento real. | path:assetId, anio |
| `radar_ejecucion_infrastructure_integrity` | Integridad de infraestructura | Verifica cierre/operador/mantenimiento/disponibilidad/indicador. `estricto=true` → 409 sin evidencia mínima. | departamento, sector, estricto |
| `radar_ejecucion_infrastructure_evidence_queue` | Cola de evidencia de activos | Evidencia faltante por activo, priorizada. No es una lista de inoperativos. | estado |
| `radar_ejecucion_sector_review_queue` | Cola de revisión de vínculos | Candidatos CUI–actividad o entidad–compra pendientes de revisión humana. No son vínculos oficiales ni alimentan agregados. | estado, limit |
| `radar_ejecucion_proyectos` | Qué construye una entidad | Nombre real de proyecto/actividad/obra por entidad + función. | entityCode, funcion, anio, metaDepartamento |
| `radar_ejecucion_personal` | Dotación personal | Dotación del Estado (MEF/AIRHSP) por pliego, unidad ejecutora, régimen y grupo ocupacional; cantidad y costo anual. | entidad, ejercicio |
| `radar_ejecucion_patrimonio_bienes_muebles_baja` | Bajas patrimoniales | Activos dados de baja por entidad (resolución, acto de baja, bien). Solo bajas, no inventario completo. | entidad, ejercicio |
| `radar_ejecucion_patrimonio_bienes_muebles_baja_por_distrito` | Bajas por distrito | Agregado por distrito, solo municipalidades (cruce vivo identidad-fiscal + ceplan-geo); resto excluido por domicilio fiscal en Lima. | departamento, ejercicio |
| `radar_ejecucion_burocracia_inversion` | Gasto en planilla vs inversión | Ratio gasto-en-planilla vs gasto-en-inversión por entidad/distrito (genérica 1 vs 6). `ratioIndefinido` si inversión = 0. | anio, departamento, nivel, entityCode |

### infobras (7)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `infobras_public_works` | Obras públicas monitoreadas | Avance físico/financiero, paralización y entidad responsable (Contraloría). Cobertura completa: snapshot nacional XLSX. | departamento, estado, conParalizacion, distritoSospechoso |
| `infobras_public_works_resumen` | Resumen de obras | Total de obras, % con paralización, % con avance físico, conteo `distrito_sospechoso`; desglose por sector, nivel de gobierno, naturaleza, modalidad y causal. | departamento, groupBy |
| `infobras_public_work_by_codigo` | Ficha de obra | Detalle de una obra por su código INFOBRAS. | path:codigoInfobras |
| `infobras_crossref` | Obra ↔ inversión | Cruce por CUI exacto (sin fuzzy): obras de un departamento con su inversión asociada. Default LA LIBERTAD. | departamento |
| `infobras_crossref_salud` | Salud del cruce | Filas totales, confirmadas, candidatas y última construcción del crosswalk. VACIO si no hay filas. | — |
| `infobras_crossref_ejecucion` | Obra ↔ ejecución | Cruce por nombre de entidad (matcher difuso persistido, recalculable): devengado, obras y obras paralizadas. | confidence |
| `infobras_meta_sources` | Frescura INFOBRAS | Metadata de los últimos lotes de ingesta; alimenta la barra de frescura GORE. | — |

### radar-inversiones (5)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `radar_inversiones_investments` | Cartera de inversión pública | Proyectos de Invierte.pe con costo, estado y entidad responsable. Cobertura parcial: snapshot por ventana de bytes del CSV. | departamento, estado, situacion, funcion |
| `radar_inversiones_investment_by_cui` | Ficha de inversión | Detalle de un proyecto por su CUI. | path:cui |
| `radar_inversiones_investments_desactivadas` | Inversiones desactivadas | La mitad del Banco de Inversiones que `investments` no cubre; `situacion` conserva el estado al desactivarse. Paginado real. | departamento, situacion, funcion, limit, offset |
| `radar_inversiones_investment_desactivada_by_cui` | Ficha de inversión desactivada | Detalle por CUI. | path:cui |
| `radar_inversiones_crossref` | Inversión ↔ ejecución | Cruce por SEC_EJEC exacto (sin fuzzy) con devengado presupuestal de la misma entidad. Default LA LIBERTAD. | departamento |

### salud-institucional (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `salud_institucional_score` | Score institucional 0-100 | Calculado en vivo combinando ejecución, obras, inversiones, compras y salud tributaria de proveedores. Si una fuente no tiene dato, el componente se OMITE (nunca 0 ni 100). Incluye banda por percentiles reales de La Libertad. | departamento, anio |
| `salud_institucional_score_por_provincia` | Score por provincia | Promedio de `scoreCompuesto` por provincia. Provincia sin entidades con score trae `promedioScore:null` y `sinDatos:true`. | departamento, anio |

---

## 2. Compras y proveedores

### compras-publicas (26)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `compras_publicas_procurement` | Procesos de contratación | Releases OCDS de OECE. Cobertura parcial: hasta 10 páginas recientes por corrida. | departamento, categoria, buyerId |
| `compras_publicas_procurement_by_ocid` | Ficha de proceso | Detalle de un proceso por su OCID. | path:ocid |
| `compras_publicas_unsuccessful_tenders` | Procesos desiertos | Ítems DESIERTO o NULO: dinero convocado, no gastado. Es la mitad de OCDS que `procurement` no cubre. | departamento, statusDetails, buyerId |
| `compras_publicas_suppliers` | Mapa de proveedores | Agregado por adjudicaciones, entidades distintas y valor total, con índice de concentración de mercado. | departamento |
| `compras_publicas_supplier_by_id` | Historial de proveedor | Adjudicaciones completas de un proveedor por `supplier_id`. | path:supplierId |
| `compras_publicas_bidders_by_ocid` | Postores de un proceso | Participantes por OCID, con ganador si lo hay. "Participante" = figura en OCDS, no equivale a oferta válida. | path:ocid |
| `compras_publicas_bidders_by_provider` | Win rate de proveedor | Participaciones, victorias y win rate. Descriptivo, no mide desempeño. | path:providerId |
| `compras_publicas_bidders_competition` | Top proveedores | Top 10 por victorias con participaciones, victorias y descalificaciones en la muestra ingerida. | — |
| `compras_publicas_bidders_coparticipation` | Co-participación | Pares de proveedores que coinciden en ≥3 procesos. Puede responder a rubro/zona/período; NO determina colusión. | — |
| `compras_publicas_crossref` | Compras ↔ ejecución | Cruce por nombre de entidad (matcher difuso, persistido en `entity_crosswalk`): devengado + compras por entidad cruzada. | confidence |
| `compras_publicas_crossref_salud` | Salud del crossref | Filas totales, confirmadas, candidatas y última construcción. VACIO si no hay filas. | — |
| `compras_publicas_entity_profile` | Ficha de entidad compradora | Procesos por categoría, adjudicaciones por año/moneda, postores, reconciliación OCID y contratos menores SEACE. | path:buyerId |
| `compras_publicas_identities` | Relaciones de identidad | Vínculos RUC/nombres/identificadores de entidad o persona (`entity_identity_links`). `soloVerificadas` debe alimentar cruces automáticos. | identifier, soloVerificadas |
| `compras_publicas_conformacion_vinculos` | Socios en múltiples RUC | Personas naturales (DNI últimos 3 dígitos) que aparecen como socio/representante en >1 RUC que ganó en >1 entidad. NO implica irregularidad. | — |
| `compras_publicas_conformacion_by_ruc` | Conformación societaria | Socios, representantes y órganos de administración desde el Buscador de Proveedores del Estado, con DNI/CE enmascarados. | path:ruc |
| `compras_publicas_minor_contracts` | Contratos menores (<8 UIT) | Contrataciones municipales SEACE: objeto, monto estimado/adjudicado, cotizaciones, ganador; filtrable por `signalType`. | year, municipalityId, supplierId, category, minAmount, maxAmount, quotationCount, signalType, q, limit |
| `compras_publicas_minor_contract_by_id` | Ficha de contrato menor | Cotizaciones, eventos, documentos, evidencia y señales con versiones de normalizador/modelo. | path:id |
| `compras_publicas_municipalities` | Municipalidades activas | Municipios de La Libertad con contratos menores materializados: total, monto y proveedores distintos. | q, limit |
| `compras_publicas_municipality_by_id` | Ficha municipal | Métricas agregadas, desglose por categoría, top 20 proveedores y conteo de señales de revisión. | path:id |
| `compras_publicas_signals` | Señales de revisión (S01–S13) | Señales sobre contratos menores: fraccionamiento, objetos similares, proveedor recurrente. Identifica evidencia/patrones; NO determina corrupción. | signalType, municipalityId, supplierId, contractingId, signalRunId, limit |
| `compras_publicas_signal_by_id` | Detalle de señal | Evidencia recolectada y decisión de revisión humana (aprobada/descartada). | path:id |
| `compras_publicas_semantic_review_queue` | Bandeja semántica | Pares de contratos comparables por similitud (S12/S13), deduplicados y priorizados (S13 antes que S12). | municipalityId, limit |
| `compras_publicas_semantic_review_clusters` | Clusters de contratos | Unión transitiva de pares S12/S13 con monto total y similitud máxima; organiza la revisión documental. | limit |
| `compras_publicas_freshness` | Frescura de ingesta | Metadata por fuente (OECE/OCDS y SEACE): última corrida, filas, id de batch, filas rechazadas. | — |
| `compras_publicas_analytics_territorial` | Analítica territorial | Contratos menores por provincia/distrito: total, monto, proveedores distintos, concentración CR1/CR3. `dateBasis` importa (source_year vs publication_year). | year, category, dateBasis |
| `compras_publicas_analytics` | Analítica descriptiva | Indicadores reproducibles según `kind`: concentration, competition, near-threshold, recurrence, evidence. Ninguno es conclusión jurídica. | path:kind |

### proveedores-sancionados (9)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `proveedores_sancionados_sanciones` | Sanciones del Tribunal | Inhabilitaciones y multas por RUC. "Vigente hoy" ≠ "vigente al momento de adjudicar": revisar fechas desde/hasta. Cobertura nacional (~17.9K filas). | ruc |
| `proveedores_sancionados_inhabilitaciones_judiciales` | Inhabilitaciones judiciales | Vigentes por mandato judicial (OECE), base legal DISTINTA a la sancion administrativa. Incluye personas naturales. 1 fila rechazada por fecha inicio > fecha fin (anomalía real). | rucDni, dni, limit, offset |
| `proveedores_sancionados_crossref` | Sancionado vs contrato | Cruce por RUC exacto con adjudicaciones. Inhabilitación vigente = prohibición legal de contratar. `soloNuevos` filtra `esNuevoDesdeUltimaCorrida`. No envía notificaciones. | departamento, soloInhabilitados, soloNuevos |
| `proveedores_sancionados_doble_inhabilitacion` | Doble inhabilitación | ¿Sanción administrativa Y orden judicial simultáneas? Bases legales distintas; la coincidencia es la señal más fuerte. `vigenteEnFecha` calcula vigencia real. | ruc |
| `proveedores_sancionados_personas` | Persona sancionada en empresa | Persona sancionada directamente (RUC-10) que además es socia/representante/miembro de una empresa activa. DNI siempre enmascarado. | soloVigentes |
| `proveedores_sancionados_candidatos_sancionados` | Candidato con antecedente | Cruce candidato↔sanción por DNI exacto contra vínculos societarios y sanciones directas. Distingue vínculo societario de sanción. | departamento, dni |
| `proveedores_sancionados_recurrente` | Sancionado recurrente | Agrupa inhabilitaciones por RUC y marca los que tienen N resoluciones DISTINTAS dentro de una ventana de días. Preselección exploratoria, no conclusión. | minResoluciones, ventanaDias |
| `proveedores_sancionados_velocidad_sancion_contrato` | Velocidad sanción→contrato | Alerta por cruzar awards + contratos menores vs inhabilitaciones, con severidades DURANTE_SANCION_VIGENTE y POCO_DESPUES_DE_SANCION. Default NACIONAL. | departamento, ventanaDiasPostSancion |
| `proveedores_sancionados_redes_proveedores` | Redes de proveedores | Proveedores de contratos menores que ganan en varias municipalidades de un departamento. Señal de concentración, NO conclusión. Solo cuenta municipios reales. | departamento, minMunicipios, soloSancionados |

### identidad-fiscal (14)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `identidad_fiscal_contribuyentes` | Padrón RUC SUNAT | Personas jurídicas (RUC-20) por razón social, estado o ubigeo. Cobertura nacional completa (~2.3M filas). | razonSocial, estado, ubigeo, limit, offset |
| `identidad_fiscal_contribuyente_by_ruc` | Ficha de contribuyente | Detalle por RUC exacto de 11 dígitos. | path:ruc |
| `identidad_fiscal_ruc_consulta_masiva` | Consulta múltiple SUNAT | Hasta 100 RUC por corrida SIN reCAPTCHA; 23 campos (CIIU, comercio exterior, Buen Contribuyente, agentes IGV). | razonSocial, estado, departamento, provincia, distrito, buenContribuyente, limit, offset |
| `identidad_fiscal_ruc_consulta_masiva_by_ruc` | Ficha de consulta múltiple | 404 si el RUC no fue consultado por esta vía. | path:ruc |
| `identidad_fiscal_ficha_ruc` | Ficha individual SUNAT | Búsqueda por razón social, cultivo o si exporta. Cobertura MUY PARCIAL: consulta manual una por una, bloqueada por reCAPTCHA v3. | razonSocial, cultivo, exportador, limit, offset |
| `identidad_fiscal_ficha_ruc_by_ruc` | Ficha individual por RUC | Razón social, fechas, domicilio, CIIU, comprobantes electrónicos, representantes. 404 si no está en ficha. | path:ruc |
| `identidad_fiscal_padron_ppa` | Padrón Productores Agrarios | Confirma si el RUC está en el padrón MIDAGRI (formalidad agraria, no tributaria). Solo booleano + nombre. El endpoint de cultivo/hectáreas nunca responde datos. | registrado, limit, offset |
| `identidad_fiscal_padron_ppa_by_ruc` | Estado PPA por RUC | 404 si no se consultó; distinto de `registrado:false` = consultado y NO inscrito. | path:ruc |
| `identidad_fiscal_oece_ficha` | Ficha Proveedor Estado | Snapshot fresco SUNAT + contacto + si está inscrito en RNP. `inscritoRnp`/`codigoRegistro` dicen si puede contratar. | razonSocial, departamento, inscritoRnp, limit, offset |
| `identidad_fiscal_oece_ficha_by_ruc` | Ficha OECE completa | Incluye conformación societaria y directiva (representantes, consejo, socios, cargo, fecha de ingreso). Personas vacío si no está en RNP. | path:ruc |
| `identidad_fiscal_crossref_proveedores` | Proveedor irregular | Cruce por RUC exacto con adjudicaciones (~77.3% cobertura), marcando estatus tributario irregular (BAJA/NO HABIDO) que ganó contratos. | departamento, soloIrregulares |
| `identidad_fiscal_crossref_entidades` | Salud tributaria del Estado | Resuelve el RUC de cada gobierno/municipalidad para chequear su propio estatus tributario (matcher difuso). | departamento |
| `identidad_fiscal_exportaciones_fob` | Exportaciones FOB | Valor FOB USD por RUC, agregado por mes/aduana/agente/país (Aduanet, sin captcha, ingesta automatizada). NO trae kilos; filas a nivel de embarque. | ruc, anio, mes, paisCodigo, limit, offset |
| `identidad_fiscal_exportaciones_fob_resumen` | FOB agregado por RUC | Total FOB y número de embarques por año. Es la forma correcta de responder "cuánto exportó este RUC en 20XX". | path:ruc, anio |

---

## 3. Planificación, territorio y geo

### ceplan-estrategico (7)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `ceplan_estrategico_indicators` | Indicadores de gestión estratégica | Agregados por nivel de gobierno (GN/GR/MP/MD/Total). NO existe modelo per-entidad público. | indicatorCode, nivelGobierno |
| `ceplan_estrategico_indicators_seg` | Strategic Execution Gap | Nacional: CUMP03−CUMP02 (GN/GR). Departamental: PROXY_DEPARTAMENTAL (devengado/PIM − avance físico INFOBRAS). Solo 5 regiones piloto. | departamento, anio |
| `ceplan_estrategico_indicators_execution_efficiency` | Eficiencia de ejecución | Nacional: CUMP02/CUMP03. Departamental: PROXY_DEPARTAMENTAL (avance físico / ejecución presupuestal). Solo 5 regiones piloto. | departamento, anio |
| `ceplan_estrategico_indicators_plan_budget_alignment` | Alineación plan–presupuesto | Mapeo heurístico dimensión CEPLAN → función MEF v1; % devengado por dimensión. No prueba alineación PEI. | departamento, anio |
| `ceplan_estrategico_crossref` | CEPLAN ↔ ejecución | Único bucket exacto: GN/GR. CEPLAN no distingue MP/MD y radar-ejecucion los junta en GOBIERNOS LOCALES. | — |
| `ceplan_estrategico_crossref_territorial` | CEPLAN ↔ territorio | Cruce con ceplan-geo por departamento piloto, con CUMP02/CUMP03 nacionales como contexto. Cobertura parcial. | departamento |
| `ceplan_estrategico_meta_aplicativo` | Estado del aplicativo CEPLAN | Fuentes alternativas de datos per-entidad (PEI/POI por pliego). Hoy `perEntityAvailable=false`. | — |

### ceplan-geo (16)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `ceplan_geo_layers` | Catálogo de capas WFS | Capas ingeridas desde GeoServer CEPLAN (PostGIS): distritos, aeropuertos, puertos. | — |
| `ceplan_geo_layer_by_id` | Metadata de capa | Metadatos por UUID interno. | path:id |
| `ceplan_geo_layer_features` | Features de capa | Features vectoriales con bbox y limit opcionales. | path:id, bbox, limit |
| `ceplan_geo_territories` | Territorio por UBIGEO | Distrito/territorio oficial por UBIGEO o tríada depto/provincia/distrito. Sin coordenadas inventadas. | ubigeo, departamento, provincia, distrito |
| `ceplan_geo_territories_summary` | Agregado territorial | Conteo de distritos e infraestructura dentro del polígono departamental (5 regiones piloto). | departamento |
| `ceplan_geo_territories_bbox` | Territorios en un bbox | Distritos que intersectan un bounding box. | minx, miny, maxx, maxy |
| `ceplan_geo_infrastructure` | Infraestructura CEPLAN | Aeropuertos, puertos, red hídrica principal y proyectos agro (filtro por código INEI de 2 dígitos). | type, departamento |
| `ceplan_geo_infrastructure_near` | Infraestructura cercana | Radio en km desde el centroide del distrito. Proximidad descriptiva, no causal. | ubigeo, radius_km, type |
| `ceplan_geo_denominadores_poblacion` | Denominador poblacional | Población por UBIGEO (piloto provincia Trujillo, Censo 2017). | departamento, provincia |
| `ceplan_geo_denominadores_tasas` | Tasas por distrito | Tasas dentro de una provincia (ej. denuncias por 1,000 hab.) con población INEI 2017. | departamento, provincia, anio, por, metrica |
| `ceplan_geo_denominadores_benchmark_ejecucion` | Ejecución comparada entre distritos | PIM/devengado (solo GOBIERNOS LOCALES) con población 2017. PIM=0 con devengado>0 expone `avancePct:null` + `avancePctIndefinido:true`. | departamento, provincia |
| `ceplan_geo_patrimonio_predios` | Predios estatales | Supervisión SBN: resultado, titular, área y zona de playa protegida. Cobertura parcial (solo predios supervisados, no universo SINABIP). | departamento, provincia, distrito |
| `ceplan_geo_crossref_inversiones` | Inversión ↔ territorio | Enriquece inversiones con territorio CEPLAN e infra cercana (matcher por nombre; la API de inversiones no expone UBIGEO). | departamento |
| `ceplan_geo_crossref_obras` | Obra ↔ territorio | Enriquece obras con territorio CEPLAN sin usar coordenadas (INFOBRAS no las publica). | departamento |
| `ceplan_geo_crossref_ejecucion` | Territorio ↔ ejecución | Por UBIGEO: ejecución por sede y gasto nacional dirigido en secciones separadas, con infraestructura cercana. No sumar ambos ámbitos. | ubigeo |
| `ceplan_geo_crossref_salud` | Salud del crosswalk | Caché `territory_name_crosswalk` (audit 2026-09-13): filas, confirmadas, candidatas, sinMatch, departamentosConstruidos de 25. | — |

### geo-intersections (5)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `geo_intersections_cruce_punto` | Títulos sobre un punto | Derechos mineros y títulos forestales que cubren un lat/lon o dentro de un radio, vía PostGIS ST_Contains. | lat, lon, radio_km |
| `geo_intersections_reporte` | Superposiciones minero ↔ forestal | Reporte completo de intersecciones con km² ordenados desc, filtrable por departamento, sustancia, capa y área mínima. | departamento, sustancia, capa, min_area_km2, limit, offset |
| `geo_intersections_stats` | Estadísticas de solapamiento | Cuántos derechos/títulos tienen geometría, intersecciones totales y desglose por departamento, sustancia y capa. | — |
| `geo_intersections_minero` | Solapes de una concesión | Superposiciones de un derecho minero por CODIGOU con títulos forestales. | path:codigou |
| `geo_intersections_forestal` | Solapes de un título | Superposiciones de un título forestal por capa + objectid con derechos mineros. | path:capa, path:objectid |

---

## 4. Territorio, recursos y ambiente

### territorio-inteligencia (4)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `territorio_inteligencia_titulares_riesgo` | Titular con riesgo | Titulares de derechos mineros/forestales con inhabilitaciones, multas o sanciones judiciales. Ingesta manual, sin scheduler. | ruc, tipoRiesgo |
| `territorio_inteligencia_captura_territorio` | Captura de territorio | Concentración de superficie territorial por RUC en un departamento. Ingesta manual. | departamento, ruc |
| `territorio_inteligencia_inconsistencia_presupuesto` | Inconsistencia presupuestal | Proyectos de inversión que se superponen con derechos mineros/forestales. Ingesta manual. | departamento, cui |
| `territorio_inteligencia_riesgo_eudr` | Riesgo EUDR | Cumplimiento del EUDR cruzando títulos forestales con datos de deforestación MINAM. Ingesta manual. | ruc, departamento |

### catastro-minero (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `catastro_minero_derechos` | Derechos mineros | Catastro INGEMMET filtrable por ubicación, estado, sustancia, concesión o titular. Clave real `codigou` (66,823 filas). Solo consulta. | departamento, provincia, distrito, estado, sustancia, concesion, titular, limit, offset |
| `catastro_minero_derecho_detalle` | Ficha de derecho minero | Detalle por código único `codigou` (ej. '010033716'). 404 si no existe. Ingesta manual. | path:codigou |

### catastro-forestal (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `catastro_forestal_titulos` | Títulos habilitantes forestales | SERFOR en 10 capas (modalidades, cesiones, PFDM, cambio de uso, bosques locales, unidades de aprovechamiento, concesiones, ordenamientos). Cobertura de La Libertad mínima (1 fila). Ingesta manual. | capa, nomDep, nomPro, nomDis, limit, offset |
| `catastro_forestal_titulo_detalle` | Ficha de título forestal | Detalle por capa + objectid (único dentro de la capa, no global). 404 si no existe. | path:capa, path:objectid |

### areas-protegidas (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `areas_protegidas_areas` | Áreas naturales protegidas | SERNANP en 5 capas (ANP nacional, zona reservada, conservación regional/privada, sitios prioritarios). `codigo` NO es clave única (geometría multi-parte duplica filas). | capa, nombre, ubicacion, categoria, limit, offset |
| `areas_protegidas_area_detalle` | Ficha de área protegida | Detalle por capa + objectid de ArcGIS, no por `codigo`. | path:capa, path:objectid |

### senace-cartera-proyectos (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `senace_cartera_proyectos` | Cartera de certificación ambiental | Proyectos SENACE (Clasificación, EIA-d/sd, MEIA-d, ITS, PPC, TdR) del portal de datos abiertos. `senaceId` es único global (1,870 filas). Ingesta manual. | estado, actividad, ruc, texto, limit, offset |
| `senace_cartera_proyecto_detalle` | Ficha de proyecto SENACE | Detalle por `senaceId`. 404 si no existe. | path:senaceId |

### infracciones-ambientales (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `infracciones_ambientales_infracciones` | Sancionados OEFA | Administrado, subsector, ubicación, expediente, infracción y monto de multa (RUIAS). Documento enmascarado para personas naturales, completo para RUC. 14,724 filas. | departamento, provincia, distrito, subsectorEconomico, administrado, limit, offset |
| `infracciones_ambientales_crossref` | Sanción ambiental vs contratación | Cruza sancionados por RUC con contratación activa. Solo cruza RUC. Una sanción ambiental NO inhabilita para contratar: es coincidencia de identidad, no irregularidad. | ruc, departamento, limit, offset |

### residuos-solidos (1)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `residuos_solidos_residuos` | Generación de residuos | Residuos domiciliarios y municipales por distrito (MINAM/SIGERSOL): población, per cápita y toneladas/día. Serie 2019-2024. | departamento, provincia, distrito, ubigeo, anio, historico, limit, offset |

### emergencias-indeci (3)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `emergencias_indeci` | Histórico de emergencias | INDECI/SINPAD 2003-2025: inundaciones, huaicos, sismos, heladas, incendios, sequías y 22 tipos más. Datos EDAN por evento. `sinpadId` NO es clave única: usar `id`. 142,139 filas. Ingesta manual. | departamento, provincia, distrito, peligro, anio, limit, offset |
| `emergencias_indeci_detalle` | Ficha de emergencia | Detalle por `id` interno, no por `sinpadId`. 404 si no existe. | path:id |
| `emergencias_indeci_preparacion_riesgo` | Preparación frente a El Niño | Cruce por distrito entre emergencias tipo El Niño y proyectos de prevención de Invierte.pe (búsqueda por nombre, no exhaustiva), enriquecido opcionalmente con INFOBRAS y SEACE. Esos enriquecimientos son `null` si sus bases no están configuradas. Solo coincidencia territorial y de texto, nunca causalidad. | departamento, peligros |

---

## 5. Infraestructura física

### infraestructura-mtc (3)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `infraestructura_mtc_terminales_portuarios` | Terminales portuarias | MTC: ubicación, ámbito marítimo/fluvial/lacustre, tipo, tráfico, estado, titularidad y administrador. Panel multi-corte 2022-2025 (507 filas). | idDepartamento, ambito, estado, fechaCorte, historico, limit, offset |
| `infraestructura_mtc_aerodromos` | Aeródromos | Código OACI, escala, estado, jerarquía, titularidad y administrador. Clave real = `codigoAerodromo` (el ID de la fuente trae '#¡REF!'). 595 filas. | idDepartamento, provincia, tipoAerodromo, fechaCorte, historico, limit, offset |
| `infraestructura_mtc_peajes` | Unidades de peaje | Red vial nacional: ubicación, código de ruta, km de inicio, titularidad, administrador y estado. 233 features. | idDepartamento, codigoRuta, estado, fechaCorte, historico |

### red-vial-subnacional (1)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `red_vial_subnacional_intervenciones` | Intervenciones viales subnacionales | Provías/MTC: ruta, tramo, longitud, estado de conservación, superficie, tipo de intervención y responsable. Llega a ruta/tramo dentro de una provincia, no al distrito exacto. 12,536 filas. | departamento, provincia, estado, codigoRuta, limit, offset |

### servicios-salud (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `servicios_salud_ipress` | Establecimientos de salud | RENIPRESS/SUSALUD con su estado operativo tal cual lo declara la fuente (`ACTIVO` u otro valor, no normalizado a booleano). Paginación real con `total`/`hasMore`. | ubigeo, departamento, distrito, estado, limit, offset |
| `servicios_salud_crossref` | Inversión en salud vs IPRESS | Por UBIGEO: inversión en FUNCION SALUD / SALUD Y SANEAMIENTO vs establecimientos activos, marcando `puntoCiego`. Declara en vivo el alcance territorial de `investments`. | departamento, ubigeo |

### instituciones-educativas (3)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `instituciones_educativas_instituciones` | Padrón educativo | MINEDU/ESCALE (180,828 instituciones): nivel, gestión, ubicación, coordenadas y UGEL. Único conector con georreferenciación por establecimiento. | departamento, provincia, distrito, ubigeo, estado, gestion, nombre, areaCenso, limit, offset |
| `instituciones_educativas_resumen` | Cobertura educativa | Agregado por provincia y distrito (total y cuántas activas). Default LA LIBERTAD: 84 distritos, 12 provincias, 9,391 instituciones. | departamento |
| `instituciones_educativas_trayectoria` | Trayectoria estudiantil | SIAGUE 2021-2024 por código modular: matriculados, aprobados, retirados y atraso, con tasas. `desaprobado`/`promocionGuiada` vienen NULL por cambio de terminología en la fuente. | codMod, anio, departamento, provincia, distrito, ubigeo, limit, offset |

### violencia-escolar (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `violencia_escolar_casos` | Casos de violencia escolar | SíseVe/MINEDU: fecha, DRE, UGEL, nivel, tipo de reporte, tipo y subtipo de violencia. Sin PNI: la granularidad más fina es UGEL. Ingesta manual, sin scheduler. | dre, ugel, nivelEducativo, tipoReporte, tipoViolencia, subtipoViolencia, tipoEstadoReporte, fechaDesde, fechaHasta, limit, offset |
| `violencia_escolar_resumen` | Conteo por tipo de violencia | Psicológica/Física/Sexual agregado por DRE o por UGEL. Evita paginar el listado. | dre |

---

## 6. Economía y finanzas

### bcrp-comercio-exterior (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `bcrp_comercio_exterior_trade` | Comercio exterior | Agregado nacional en millones US$ FOB: exportaciones, importaciones y balanza mensual (series PN38714BM–PN38723BM). Indicador macro, sin desagregación territorial ni por empresa. | series, anio, desde, hasta |
| `bcrp_comercio_exterior_meta_sources` | Frescura BCRP | Metadata de los últimos 10 lotes (series, rango, checksum). | — |

### bcrp-la-libertad (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `bcrp_la_libertad_indicadores` | Actividad económica de La Libertad | Indicadores mensuales BCRP Trujillo: agropecuario, pesca, minería, crédito, depósitos y ejecución presupuestal (anexo 10). Ingesta manual por WAF; anexos 4, 7 y 9 no se ingieren. | anexo, indicador, anio, mes |
| `bcrp_la_libertad_meta_sources` | Frescura BCRP Trujillo | Últimos 10 lotes manuales y desglose de filas por anexo, para confirmar qué periodos ya se ingirieron. | — |

### actividad-agraria (5)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `actividad_agraria_wage` | Jornal agrícola | Valor en S/ por departamento/año/mes (MIDAGRI). `null` = mes sin dato o futuro no reportado, indistinguibles. | departamento, anio |
| `actividad_agraria_tractor_rental` | Alquiler de tractor | Precio en S/ por departamento/año/mes (MIDAGRI-03.04). Misma semántica que jornal. | departamento, anio |
| `actividad_agraria_yunta_rental` | Alquiler de yunta | Precio en S/ por departamento/año/mes (MIDAGRI-03.05). Misma semántica que jornal. | departamento, anio |
| `actividad_agraria_regional_outcome` | Resultado agropecuario regional | VBP, superficie y productores. Piloto SIEA La Libertad 2024, marcado MANUAL_PILOT hasta existir CSV PNDA equivalente. | departamento, anio |
| `actividad_agraria_crossref` | Resultado agro vs gasto | Cruce SIEA + insumos MIDAGRI vs gasto AGROPECUARIA, separando ejecución con sede regional/local de gasto nacional dirigido. No sumar ambos ámbitos. | departamento, anio |

### actividad-empresarial (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `actividad_empresarial_empresas` | Empresas activas | Conteo mensual de empresas del sector privado por distrito (MTPE). Único año disponible: 2022. | ubigeo, anio, mes |
| `actividad_empresarial_crossref` | Inversión vs empresas | Cruce por UBIGEO entre inversión pública total y empresas activas (corte 2022). Sin inferencia de causalidad ni etiqueta de "punto ciego". | departamento, ubigeo |

### inversion-privada (8)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `inversion_privada_projects` | Cartera APP/PA | PROINVERSIÓN (VERTIX): proyectos con sector, fase, titular y monto. Sin CUI; el departamento se infiere por filtro. | departamento, sector, tipo, titular, fase |
| `inversion_privada_project_by_id` | Ficha de proyecto APP/PA | Detalle por Id interno PROINVERSIÓN. | path:vertixId |
| `inversion_privada_oxi_projects` | Cartera OxI | Obras por Impuestos en promoción. `codigoReferencia` mezcla SNIP/Invierte.pe/IDEA, así que no siempre es un `codigo_snip` exacto. | departamento, funcion, fase, entidad |
| `inversion_privada_oxi_by_id` | Ficha OxI | Detalle por Id numérico interno. | path:oxiId |
| `inversion_privada_oxi_crossref_invierte` | OxI ↔ Invierte.pe | Cruce por `codigo_snip` exacto, sin fuzzy. Solo confirma lo que matchea: una fila sin match no implica que el proyecto no exista. | departamento |
| `inversion_privada_gis_geojson` | GeoJSON de la cartera | FeatureCollection real y descargable del endpoint público (sin login, a diferencia del visor GIS oficial). Cruce IDPROYECTO=vertix_id verificado 151/156. | departamento |
| `inversion_privada_gis_project_geometry` | Geometría de proyecto | Geometría(s) GIS de un proyecto por `vertix_id`. | path:vertixId |
| `inversion_privada_meta_sources` | Frescura VERTIX | Últimos lotes de ingesta APP/PA y OxI, con desglose por fase. | — |

### riesgo-fiscal-isds (4)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `riesgo_fiscal_isds_pasivos_contingentes` | Pasivos contingentes | Controversias ISDS, APP y procesos judiciales/administrativos del SPNF por año de cierre, con total y `pctPbi`. Serie 2020-2025 leída del PDF. | — |
| `riesgo_fiscal_isds_ediciones` | Metadata de documentos | Fecha de publicación, fuente oficial, fecha de verificación y estado verificado/no_localizado. | — |
| `riesgo_fiscal_isds_serie_historica` | Serie histórica de controversias | Cita 2014/2021/2024 sobre el peso de las controversias internacionales como % del PBI. Fuente SECUNDARIA (declaración pública), marcada como tal. | — |
| `riesgo_fiscal_isds_meta_sources` | Frescura de ingesta PDF | Últimos 10 lotes manuales (checksum, edición, filas insertadas). | — |

### informes-control (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `informes_control_informes` | Informes de control | Auditorías/servicios de la Contraloría: entidad, ubicación, fechas, sector y si tiene hallazgo de responsabilidad. Por diseño nunca expone nombres de funcionarios. Un año puede superar el límite (~65K filas). | entidad, departamento, periodo, esConResponsabilidad, limit, offset |
| `informes_control_crossref` | Control vs ejecución | Cruce fuzzy por nombre de entidad: cuántos informes, cuántos con hallazgo de responsabilidad (conteo agregado, nunca un nombre) y devengado total. | departamento |

---

## 7. Social, salud y población

### programas-sociales (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `programas_sociales_cobertura` | Cobertura de programas sociales | MIDIS (JUNTOS, WASI MIKUNA, FONCODES, CUNAMÁS, CONTIGO, PAIS/Tambos, Pensión 65) agregado por distrito por el propio MIDIS. `null` = sin dato ese corte, no cobertura cero. | ubigeo, fechaCorte |
| `programas_sociales_crossref` | Inversión social vs cobertura | Por UBIGEO: inversión en PROTECCIÓN SOCIAL / ASISTENCIA Y PREVISION SOCIAL vs último corte INFOMIDIS. Solo lista distritos del lado de `investments`. | departamento, ubigeo |

### mimp (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `mimp_cem_casos` | Casos de violencia contra la mujer | Agregado por Centro Emergencia Mujer, desglosado por sexo y tipo de violencia. Nunca un registro individual; el dataset de acogimiento residencial se descartó por ser individual sobre menores. | departamento, anio |
| `mimp_chat100_consultas` | Consultas Chat 100 | Agregado nacional anual por sexo de consultas a la línea contra violencia familiar y sexual. Sin desagregación territorial. | anio |

### mindef (3)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `mindef_offset_agreements` | Offset de defensa | Convenios Específicos de Compensaciones Industriales y Sociales: obligaciones que un proveedor extranjero asume como parte de un contrato. Dataset pequeño (8 filas), es todo lo que MINDEF publica. | entidadContraparte |
| `mindef_training_abroad` | Capacitación en el exterior | Personal militar capacitado en el exterior: institución, curso, país y fechas. `personalCantidad` es conteo por curso, nunca lista de nombres. | pais |
| `mindef_peace_missions` | Misiones de Paz | Personal de FF.AA. en Misiones de Paz, Observadores y Contingentes Militares. `cantidad` es agregado por misión/año. | anio, pais |

### poder-judicial (3)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `poder_judicial_procesos` | Carga procesal | Estadísticas agregadas (pendientes/ingresados/resueltos) por año, mes y órgano jurisdiccional, sin expedientes individuales ni PII. Sin diccionario oficial: los nombres de columna del CSV se preservan sin reinterpretar. | anio, mes, distritoJudicial, provincia, distrito, tipoOrgano, especExp, condicion, estado, limit, offset |
| `poder_judicial_procesos_resumen` | Resumen por distrito judicial | Suma las columnas titulares agrupando por distrito judicial, tipo de órgano, experimental, año, mes, estado y condición. | groupBy, anio, mes, distritoJudicial |
| `poder_judicial_territorios` | Cobertura territorial | Triadas (provincia, distrito) presentes con conteo de filas (390 triadas). No trae `distritoJudicial` porque es circunscripción judicial, no territorio administrativo. | — |

### renamu (3)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `renamu_municipalidades` | Municipalidades registradas | RENAMU/INEI, 1,891 municipios con ubigeo, departamento, provincia, distrito y tipo. Alcance parcial: se excluyó el Módulo I por PII del alcalde. | anio, departamento, ubigeo, historico |
| `renamu_equipamiento` | Capacidad institucional | Módulo II: vehículos operativos/no operativos y conectividad. Único conector que mide capacidad declarada, no ejecución de gasto; no incluye maquinaria pesada ni computadoras. | ubigeo, anio |
| `renamu_crossref` | Inversión vs capacidad | Inversión ejecutada por gobierno local contra capacidad institucional por ubigeo, marcando `puntoCiego` (inversión sin vehículo operativo ni internet). Cobertura: 374 distritos. | departamento, ubigeo, anio |

### seguridad-ciudadana (2)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `seguridad_ciudadana_denuncias` | Denuncias policiales | SIDPOL/MININTER agregado por departamento/provincia/distrito/año/mes/modalidad. Conteos agregados por el origen, no eventos individuales. Cobertura 2018-2026. | departamento, provincia, anio, modalidad |
| `seguridad_ciudadana_crossref` | Denuncias vs gasto en seguridad | Cruce exacto (sin fuzzy) entre denuncias por modalidad y ejecución de ORDEN PUBLICO Y SEGURIDAD, separando gasto regional/local del Gobierno Nacional. No implica causalidad. | departamento, anio |

---

## 8. Political y gobierno

### autoridades-electas (1)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `autoridades_electas_autoridades` | Autoridades proclamadas | JNE: nombre, cargo, organización política, ubigeo y periodo. NO son candidatos. Sin DNI ni clave de persona: el match es por nombre+cargo+proceso+ubigeo, con riesgo de colisión por homonimia. | nombre, cargo, organizacionPolitica, ubigeo, anioEleccion, limit, offset |

### candidatos-erm (1)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `candidatos_erm_candidatos` | Candidatos 2026 | Inscritos a gobernador, consejero, alcalde, regidor y provincial/distrital para octubre 2026. Fuente NO oficial (repetición de terceros; el JNE no publica dataset abierto). `sentenciasDeclaradas` es autodeclaración, no sanción. DNI siempre enmascarado. | dni, departamento, provincia, distrito, ubigeo, cargo, organizacionPolitica, tipoEleccion, estado, limit, offset |

### legislativo-congreso (3)

| Tool | Concepto | Descripción | Parámetros |
|---|---|---|---|
| `legislativo_congreso_proyectos` | Proyectos de ley | Congreso: periodo, estado (texto exacto), autor o texto libre del título. Clave real `perParId`+`pleyNum` (14,868 filas, 0 duplicados). Resultado vacío puede significar periodo nunca ingerido. Ingesta manual. | periodo, estado, autor, texto, limit, offset |
| `legislativo_congreso_proyecto_detalle` | Ficha de proyecto de ley | Detalle por `perParId`+`pleyNum` (no por el código legible tipo '14864/2025-CR'). 404 si no existe. | path:periodo, path:numero |
| `legislativo_congreso_periodos` | Periodos disponibles | Qué `perParId` existen, con última ingesta y conteo de proyectos. Distingue "no disponible" (nunca ingerido) de disponible sin coincidencias: ausencia de dato ≠ cero. | — |

---

## Notas de uso transversales

1. **Alcance territorial.** La mayoría de los cruces y scores están calibrados para **LA LIBERTAD**. `departamento=TODOS` solo existe en algunos endpoints (`proveedores_sancionados_*`).
2. **Semántica del `null`.** Casi siempre significa "sin dato en ese corte", nunca 0. Revisar los campos `*Estado` / `sinDatos` antes de concluir.
3. **Señales ≠ irregularidad.** Todas las tools de `*_signals`, `*_queue` y `territorio-inteligencia` producen material de revisión humana, no conclusiones.
4. **Sin scheduler.** Todas las fuentes son ingesta manual o por ventana; los datos reflejan la última corrida, no el estado actual de la fuente. `*_meta_sources`, `*_freshness` y `*_crossref_salud` sirven para medir eso.
5. **Unicidad de claves.** Varias fuentes documentan un ID que en realidad no es único: `sinpadId` (INDECI), `codigo` (SERNANP), `objectid` (forestal, único solo dentro de la capa). Usar las claves alternativas que se indican.
6. **PII.** No hay respuestas con datos de persona natural: DNI siempre enmascarado a últimos 3 dígitos, sin expedientes individuales en justicia, sin nombres de funcionarios en control.
