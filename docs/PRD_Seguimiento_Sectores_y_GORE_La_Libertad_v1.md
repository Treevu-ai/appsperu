# PRD — Seguimiento sectorial de ministerios y Gobierno Regional La Libertad

**Estado:** Implementación base ejecutada y validada localmente

**Fecha:** 2026-08-24

**Producto:** ALSOL (AppsPerú)

**Ámbito:** API, bases de datos, conectores existentes, MCP y comandos de terminal. No incluye interfaz web.

## Estado de implementación — 2026-08-24

| Bloque | Estado | Entregable |
|---|---|---|
| SGR-01 a SGR-04 | Implementado | Inventario `/api/sectores/inventory`, `sector_entity_registry`, semilla exacta de 20 entidades y reporte de integridad con cobertura sectorial. |
| SGR-05 a SGR-08 | Implementado | Fichas y comparativo por cortes/particiones, reglas `META_DEPARTAMENTO` y `SEDE_EJECUTORA` separadas. |
| SGR-09 a SGR-12 | Implementado | CUI y INFOBRAS por CUI exacto opcional, compra solo con identidad MEF–compras verificada y cola humana append-only. |
| SGR-13 a SGR-14 | Implementado | Comandos de terminal, contrato de datos y cuatro herramientas MCP de solo lectura. |
| SGR-15 a SGR-16 | Implementado | Pruebas de reglas territoriales/no-inferencia y protocolo de alta institucional. |

Las integraciones INFOBRAS y compras se activan solo si se configura su conexión de lectura. Sin ella, ALSOL devuelve `INFOBRAS_NO_CONFIGURADO` o `COMPRAS_NO_CONFIGURADO`; no reemplaza esa evidencia con un matcher de nombres.

## 1. Decisión de producto

ALSOL debe permitir responder, de manera reproducible y prudente, una pregunta pública simple: **¿qué hacen el Gobierno Nacional y el Gobierno Regional La Libertad con recursos, inversiones, obras y contrataciones vinculadas al departamento?**

No se construirá un ranking político ni una narrativa de culpabilidad. Se construirá una ficha técnica por sector y entidad que preserve cuatro dimensiones distintas:

| Dimensión | Gobierno Nacional: ministerios y organismos | Gobierno Regional La Libertad |
|---|---|---|
| Presupuesto | Solo filas MEF con `META_DEPARTAMENTO=LA LIBERTAD`. La sede en Lima no se presenta como beneficio territorial. | Filas MEF de unidades ejecutoras cuya sede está en La Libertad (`SEDE_EJECUTORA`). |
| Proyecto/inversión | CUI, cuando Invierte.pe u otra fuente oficial lo publique. | CUI y unidad ejecutora, cuando exista la clave oficial. |
| Obra | Obra INFOBRAS por CUI o clave oficial comprobable. | Igual regla; una obra no se une por coincidir en el nombre. |
| Contratación | OCID, `award_id`, código OECE, RUC y territorio de ejecución publicado. | Misma trazabilidad, sin usar domicilio de proveedor como territorio de ejecución. |

La unidad de análisis no será una etiqueta textual como “sector salud”. Será un **registro verificable de entidad/sector**, con identificadores, alcance, evidencia y vigencia.

## 2. Punto de partida comprobado

La base actual ya permite las piezas fundamentales:

- `radar-ejecucion` materializa Gobierno Nacional dirigido a un departamento mediante `META_DEPARTAMENTO`, y Gobierno Regional/Local según la sede de la unidad ejecutora.
- `budget_coverage_snapshots` declara el corte activo por partición; no se debe sumar histórico de distintos cortes.
- `entity_identity_links` registra relaciones RUC, ubigeo y código OECE, pero no materializa un código MEF sin evidencia.
- `project_evidence_links` conserva CUI, fuente, territorio y la ausencia explícita de vínculo presupuestal oficial cuando corresponda.
- Los contratos menores ya tienen agregación por territorio de ejecución y las señales poseen bitácora de revisión humana.

El caso de ANIN demuestra la regla: puede existir gasto nacional dirigido a La Libertad, un CUI y una lista territorial oficial, sin que la fuente publique la llave que autorice atribuir una actividad MEF concreta a ese CUI. ALSOL debe conservar las tres evidencias, no rellenar el puente faltante.

Referencias internas: [ADR-0006](adr/0006-radar-ejecucion-generica-de-gasto-y-gasto-nacional-por-meta-departamento.md), [contrato MEF](data-contracts/mef-presupuesto-ejecucion.md) y [PRD de gobernanza](PRD_Gobernanza_de_Vinculos_y_Cortes_v1.md).

## 3. Objetivo, usuarios y resultado esperado

### Objetivo

Entregar consultas de terminal y contratos API que comparen sectores nacionales y GORE La Libertad sin confundir financiación dirigida, ejecución administrativa, inversión, obra, compra, ni beneficio territorial.

### Usuarios

| Usuario | Decisión habilitada |
|---|---|
| Ciudadanía y prensa | Pedir una explicación concreta sobre un sector, entidad, proyecto u obra. |
| Regidor, consejero o equipo técnico | Identificar qué parte depende del GORE y qué parte depende de un sector nacional. |
| Analista ALSOL | Reproducir una cifra, verificar su corte y encontrar la fuente primaria. |
| Funcionario responsable | Mostrar evidencia de ejecución y corregir vacíos de publicación. |

### Resultado esperado

Para una entidad priorizada, ALSOL podrá devolver una ficha terminal con:

1. identidad institucional verificada y sector;
2. alcance territorial y fecha de corte;
3. PIA, PIM, devengado y saldo, sin doble conteo;
4. CUI, obras y contratos únicamente cuando la llave es verificable;
5. vacíos de evidencia y preguntas de seguimiento, sin acusaciones.

## 4. Alcance y límites

### Alcance inicial

El catálogo inicial será configurable, no una afirmación de que los sectores listados son los únicos responsables:

| Cohorte | Entidades/sectores iniciales | Razón operativa |
|---|---|---|
| Nacional prioritario | ANIN, MTC, MVCS, MINSA, MINEDU, MIDAGRI/MIDAGRI y programas vinculados que aparezcan en MEF | Infraestructura, riesgo climático, salud, educación y actividad productiva con posible alcance regional. |
| Regional | Gobierno Regional La Libertad y sus unidades ejecutoras que el MEF identifique con `SEC_EJEC` | Principal ejecutor regional sujeto a comparación interna, no contra un ministerio como si fueran pares idénticos. |
| Extensión | MIDIS, MINAM, PRODUCE, MINCETUR, PCM y otros sectores | Entran mediante ficha de fuente e identidad aprobada; no por una lista fija. |

### Fuera de alcance v1

- Crear o rediseñar una interfaz visual.
- Atribuir un gasto MEF a un CUI, obra, distrito o contrato por similitud semántica.
- Medir impacto social, calidad del servicio o avance físico sin su fuente oficial correspondiente.
- Declarar irregularidad, abandono, direccionamiento, sobrecosto o incumplimiento a partir de ejecución baja/alta, concentración o ausencia de datos.
- Rastrear transferencias intergubernamentales como si fueran ejecución final, hasta tener una fuente y clave específica.

## 5. Modelo de datos y reglas de vínculo

### 5.1 Registro sector–entidad

Crear un registro nuevo o ampliar `entity_identity_links` con una entidad lógica `sector_entity_registry`:

```text
sector_id                 SALUD | TRANSPORTE | VIVIENDA | AGRARIO | EDUCACION | REGIONAL_LL
sector_nombre             nombre público
entity_code_mef           solo si la fuente lo confirma
entity_name_mef           literal publicado
entity_kind               MINISTERIO | ORGANISMO | PROGRAMA | GOBIERNO_REGIONAL | UNIDAD_EJECUTORA
nivel_gobierno            GOBIERNO NACIONAL | GOBIERNOS REGIONALES
scope_rule                META_DEPARTAMENTO | SEDE_EJECUTORA
identity_link_id          FK opcional al vínculo verificable
evidence_source/url       procedencia
evidence_field            campo/archivo de confirmación
valid_from / valid_to     vigencia conocida
reviewed_at               fecha de revisión
```

Reglas:

1. `entity_code_mef` es obligatorio solo después de validar la fuente; el nombre no basta.
2. Un ministerio puede tener múltiples programas/unidades ejecutoras; no se consolida por nombre sin una relación publicada.
3. Una unidad del GORE se identifica por su propio `SEC_EJEC`; no se asume que todo el gasto regional pertenece a la sede central.
4. El registro puede estar `CANDIDATO` o `NO_VERIFICADO`; esos estados nunca alimentan agregados oficiales.

### 5.2 Dos universos presupuestales explícitos

```text
NACIONAL_DIRIGIDO_A_LL = nivel=GOBIERNO NACIONAL
                         AND meta_departamento=LA LIBERTAD

GORE_EJECUTADO_EN_LL   = nivel=GOBIERNOS REGIONALES
                         AND sede/unidad ejecutora pertenece a LA LIBERTAD
```

Las dos series se muestran juntas solo como comparación de responsabilidades distintas. Nunca se suman como “presupuesto total de La Libertad” sin declarar que pueden tener cobertura, temporalidad y naturaleza de gasto diferentes.

### 5.3 Puentes permitidos

| Desde | Hacia | Llave permitida | Estado si falta |
|---|---|---|---|
| Entidad MEF | Sector | `entity_code_mef` + registro verificado | `SECTOR_NO_VERIFICADO` |
| Actividad MEF | CUI | clave común o fuente oficial explícita | `SIN_VINCULO_OFICIAL` |
| CUI | Obra INFOBRAS | CUI exacto | `SIN_OBRA_PUBLICADA` |
| Contrato | Entidad | OECE/buyer ID/RUC/Código exacto verificado | `IDENTIDAD_PENDIENTE` |
| Contrato | Distrito | `execution_district` publicado | `DISTRITO_NO_PUBLICADO` |

Embeddings pueden priorizar una revisión humana, pero no crean ninguno de estos enlaces.

## 6. Contratos de salida

### 6.1 Ficha sectorial de terminal

Comando propuesto:

```powershell
npm run ficha:sector -- --sector TRANSPORTE --departamento "LA LIBERTAD" --anio 2026
npm run ficha:entidad -- --entity-code <SEC_EJEC> --anio 2026
```

Salida mínima:

```json
{
  "entidad": { "nombre": "...", "tipo": "MINISTERIO", "nivel": "GOBIERNO NACIONAL" },
  "sector": { "id": "TRANSPORTE", "estadoVinculo": "VERIFICADO" },
  "alcance": {
    "regla": "META_DEPARTAMENTO",
    "departamento": "LA LIBERTAD",
    "estadoCobertura": "NO_VERIFICADA",
    "cortesUsados": []
  },
  "presupuesto": { "pia": 0, "pim": 0, "devengado": 0, "saldo": 0 },
  "inversiones": { "cuiVerificados": [], "sinVinculoPresupuestalOficial": [] },
  "obras": [],
  "contrataciones": { "procesos": [], "cobertura": "NO_DISPONIBLE" },
  "limitaciones": []
}
```

### 6.2 Comparación nacional–regional

```powershell
npm run comparativo:sectores -- --departamento "LA LIBERTAD" --anio 2026 --sectores SALUD,TRANSPORTE,VIVIENDA
```

La tabla tendrá, como mínimo: `sector`, `entidad`, `tipo de responsabilidad`, `regla territorial`, `PIM`, `devengado`, `fecha_corte`, `CUI/obra verificables`, `contratos disponibles`, `estado de cobertura`.

No habrá una columna “mejor/peor entidad” ni una puntuación agregada.

## 7. Métricas de aceptación

| Métrica | Criterio de aceptación |
|---|---|
| Identidad | 100% de las entidades incluidas en agregados sectoriales tiene vínculo MEF verificable y fuente registrada. |
| Temporalidad | Cada fila presupuestal devuelve su partición y corte; no hay suma de versiones históricas. |
| Territorio | Todo gasto nacional incluido cumple la regla `META_DEPARTAMENTO`; todo distrito publicado tiene fuente de ejecución o proyecto. |
| Prudencia | Ningún CUI, obra o contrato se vincula por nombre, coincidencia de fecha o embedding. |
| Operación | Un comando reproduce ficha de entidad y comparativo sectorial sin requerir UI. |
| Calidad | Fila con clave faltante se conserva con estado `NO_PUBLICADO`/`PENDIENTE`, no se descarta ni inventa. |

## 8. Backlog ejecutable en orden estratégico

La estimación es relativa (`S`, `M`, `L`) y no supone capacidad ni fecha de entrega. El orden bloquea deliberadamente los agregados antes de validar identidad y cobertura.

### Fase 0 — Fundaciones reutilizables

| ID | Prioridad | Ticket | Est. | Dependencia | Criterio de cierre |
|---|---|---|---|---|---|
| SGR-01 | P0 | Inventariar `SEC_EJEC` nacionales dirigidos a La Libertad y unidades del GORE presentes en MEF. | S | Ninguna | CSV/consulta reproducible con literal, código, nivel, partición y corte; sin asignar sector aún. |
| SGR-02 | P0 | Crear `sector_entity_registry` con procedencia, vigencia y estados de verificación. | M | SGR-01 | Migración idempotente, índices, contrato de datos y prueba de integridad. |
| SGR-03 | P0 | Sembrar solo entidades verificadas: GORE y cohorte nacional inicial. | M | SGR-02 | Cada vínculo tiene fuente/campo/fecha; candidatos separados; ningún código MEF se infiere por nombre. |
| SGR-04 | P0 | Extender el reporte de integridad con cobertura por sector y entidades no clasificadas. | S | SGR-02 | `integrity:report` declara verificados, candidatos, no clasificados y cortes por sector. |

### Fase 1 — Presupuesto comparable, no artificialmente unificado

| ID | Prioridad | Ticket | Est. | Dependencia | Criterio de cierre |
|---|---|---|---|---|---|
| SGR-05 | P0 | Implementar consulta presupuestal sectorial por `META_DEPARTAMENTO` y `SEDE_EJECUTORA`. | M | SGR-03 | Dos universos separados, corte por partición y salida JSON/terminal. |
| SGR-06 | P0 | Implementar ficha de entidad por `SEC_EJEC`. | M | SGR-03, SGR-05 | PIA/PIM/devengado, fuente, corte, regla territorial y limitaciones. |
| SGR-07 | P1 | Implementar comparativo nacional–regional por sector. | M | SGR-05 | Tabla sin score; orden reproducible; no suma universos ni cambia su regla territorial. |
| SGR-08 | P1 | Añadir control de cobertura por año, mes y lotes MEF. | S | SGR-05 | Distingue “cero publicado”, “sin filas”, “fuente no reingerida” y “cobertura no verificada”. |

### Fase 2 — Inversión, obras y contratación sin cruces ficticios

| ID | Prioridad | Ticket | Est. | Dependencia | Criterio de cierre |
|---|---|---|---|---|---|
| SGR-09 | P1 | Incorporar CUI/obra a la ficha cuando exista llave oficial. | M | SGR-06 | Muestra CUI, fuente, distrito publicado y estado del puente a MEF. |
| SGR-10 | P1 | Crear cola de revisión de puentes CUI–actividad y entidad–compras. | M | SGR-09, SGR-03 | Candidatos solo visibles para revisión; decisión, evidencia y auditoría append-only. |
| SGR-11 | P1 | Incorporar contratación sectorial por identidad OECE/RUC/buyer verificada. | L | SGR-03 | Procesos, adjudicaciones y postores quedan separados; cobertura OECE declarada. |
| SGR-12 | P2 | Relacionar contratos menores por territorio de ejecución con la ficha. | M | SGR-11 | No sustituye el distrito de ejecución por sede o domicilio; muestra fuente y año. |

### Fase 3 — Operación y extensión responsable

| ID | Prioridad | Ticket | Est. | Dependencia | Criterio de cierre |
|---|---|---|---|---|---|
| SGR-13 | P1 | Añadir comandos `ficha:sector`, `ficha:entidad` y `comparativo:sectores`. | M | SGR-06, SGR-07 | CLI documentada, salida humana/JSON, validación de parámetros y pruebas. |
| SGR-14 | P1 | Publicar contratos de datos y catálogo de fuentes por sector. | S | SGR-04, SGR-13 | Cada campo identifica fuente, periodicidad, extracción, transformación y límite. |
| SGR-15 | P2 | Añadir prueba de regresión contra mezcla de cortes, CUI inferido y distrito sustituido. | M | SGR-09 a SGR-13 | Fixtures fallan si vuelve cualquiera de los tres errores. |
| SGR-16 | P2 | Protocolo de incorporación de un nuevo ministerio/organismo. | S | SGR-14 | Checklist: identidad, regla territorial, cobertura, llave de proyecto, datos de contratación y aprobación humana. |

## 9. Plan de sprint sugerido

Sin capacidad declarada, el compromiso recomendado es una primera iteración de cuatro tickets P0: **SGR-01 a SGR-04**. Su objetivo es que ALSOL pueda decir, antes de cualquier comparativo: “estas son las entidades verificadas, estas son las que faltan clasificar y estos son los cortes aplicables”.

El segundo bloque comprometible es **SGR-05 y SGR-06**. SGR-07 y todo puente hacia CUI, obra o compra es trabajo posterior; no debe adelantarse si la identidad institucional o la cobertura temporal siguen incompletas.

## 10. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Nombre institucional ambiguo o cambia en el tiempo | Unión equivocada de entidades | Exigir código/publicación, vigencia y revisión humana. |
| Corte MEF distinto por cobertura | Falsa variación presupuestal o doble conteo | Reutilizar `budget_coverage_snapshots` y devolver `cortesUsados`. |
| Ministerio con sede fuera de La Libertad | Confundir sede con destino de gasto | Para Gobierno Nacional usar exclusivamente `META_DEPARTAMENTO`. |
| Falta de CUI en actividad de gasto | Atribución no demostrable | Mantener `SIN_VINCULO_OFICIAL`; usar embeddings solo para cola. |
| Cobertura OECE incompleta | Conclusiones falsas sobre compra o competencia | Exponer periodo, lote, método de recorrido y estado de cobertura. |
| Comparar GORE y ministerio como iguales | Lectura política incorrecta | Etiquetar tipo de responsabilidad y no generar score. |

## 11. Definición de terminado

- [ ] Migraciones aplicadas y reversibles mediante nueva migración, nunca por borrado de evidencia.
- [ ] Pruebas de identidad, corte, territorio y no-vínculo CUI pasan.
- [ ] Comandos de terminal funcionan sobre una instancia local documentada.
- [ ] Todo resultado contiene fuente, corte, alcance y limitación.
- [ ] Documentación y catálogo MCP reflejan los nuevos contratos.
- [ ] Revisión de producto confirma que ninguna salida acusa o califica conducta.
