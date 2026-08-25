# PRD — Cobertura territorial verificable de ALSOL

**Versión:** 1.0
**Estado:** implementación parcial verificada; corte nacional de Invierte completado y otras fuentes pendientes
**Ámbito:** las nueve aplicaciones de ALSOL; consulta por terminal, sin cambios de interfaz.

## 1. Problema

ALSOL puede recibir una región como filtro y, aun así, no tener evidencia suficiente para decir que está cubierta. Una fuente puede ser nacional pero estar ingerida solo en un rango parcial; otra puede depender de una tabla territorial incompleta; una tercera puede ser un cruce derivado. Hoy esos estados no se expresan con una semántica común.

El riesgo no es solo técnico: presentar una ausencia de filas como ausencia de actividad, o un filtro aceptado como cobertura real, induciría conclusiones equivocadas sobre entidades, proveedores o territorios.

## 2. Objetivo

Construir un libro de cobertura territorial consultable por terminal que, para cada jurisdicción y aplicación, pruebe el estado de la evidencia del corte y bloquee las afirmaciones de cobertura que no estén respaldadas.

La unidad territorial inicial será el catálogo de **25 jurisdicciones**: 24 departamentos y Callao. Una jurisdicción posterior deberá pasar la misma validación antes de incorporarse al catálogo activo.

## 3. Resultado esperado

Para una combinación `app + fuente + jurisdicción + corte`, ALSOL devolverá:

| Campo | Significado |
|---|---|
| `jurisdiccion` | Nombre canónico del catálogo; no texto libre. |
| `solicitada` | La corrida la incluyó explícitamente. |
| `hallada_en_fuente` | La fuente devolvió registros asociados a ella. |
| `normalizada` | Registros que superaron las reglas de normalización. |
| `persistida` | Registros materializados en la base de la app. |
| `rechazada` | Registros descartados y razón trazable. |
| `corte` | Fecha/hora de extracción y lote fuente. |
| `completitud` | `COMPLETA_VERIFICADA`, `PARCIAL`, `SIN_DATOS_EN_FUENTE`, `BLOQUEADA` o `NO_APLICA`. |
| `dependencias` | Otras capas requeridas por un cruce derivado. |
| `restriccion` | Qué no se puede afirmar con ese corte. |

Una región será **cubierta** solo si tiene lote, conteos persistidos, corte identificable y una regla de completitud cumplida para la fuente. `0` registros no es cobertura por sí mismo.

## 4. Principios

1. **Evidencia antes que etiqueta.** Un filtro aceptado no certifica una región.
2. **Fuente, transformación y corte visibles.** Cada conteo debe llevar lote y fecha.
3. **Sin inferencia territorial por nombre parecido.** Los cruces usan CUI, RUC, OCID, UBIGEO, código SEACE o la etiqueta de confianza declarada.
4. **Separar universos.** Presupuesto, adjudicación, proveedor, obra y resultado físico no son equivalentes.
5. **Sin acusaciones automáticas.** Falta de datos, patrón atípico o señal de revisión no prueban irregularidad.
6. **Terminal primero.** El primer entregable es CLI/JSON reproducible; no se modifica ninguna interfaz.

## 5. Alcance por aplicación

| App | Plano | Situación actual | Regla de cobertura objetivo |
|---|---|---|---|
| `radar-ejecucion` | Presupuesto MEF | GR/GL con offsets confirmados para La Libertad; GN por meta es controlado. | No marcar otra región como completa hasta escanear/validar secciones y conciliar `MES_EJE=0` con devengado. |
| `radar-inversiones` | CUI e inversión | CSV nacional por rangos. | Completa solo si los rangos cubren el archivo publicado, sin huecos, y hay CUI persistidos por región. |
| `infobras` | Obra y avance | XLSX nacional; carga multirregional pendiente de corrida persistente. | Lote nacional, conteo por jurisdicción, normalización y persistencia confirmados. |
| `compras-publicas` | OCDS, adjudicaciones, postores y 8 UIT | Fuentes paginadas/interfaz SEACE. | Página terminal, registros por región, fallas de detalle y alcance temporal registrados. |
| `identidad-fiscal` | RUC y domicilio | Padrón nacional; territorio mediante UBIGEO. | RUC nacional vigente + catálogo UBIGEO verificable; no usar domicilio del proveedor como ubicación de ejecución. |
| `proveedores-sancionados` | Sanciones | Fuente nacional; cruce depende de compras. | Estado fuente nacional separado de cobertura territorial heredada de adjudicaciones. |
| `actividad-agraria` | Jornal MIDAGRI | Serie por departamento. | Cada departamento/año/mes debe registrar disponibilidad, nulos reportados y corte. |
| `salud-institucional` | Score derivado | Lee otras bases; default histórico La Libertad. | `NO_APTA` si faltan las capas mínimas que usa el score para esa jurisdicción. |
| `ceplan-estrategico` | Indicadores por nivel | Nacional por nivel de gobierno. | `NO_APLICA` territorial hasta contar con llave geográfica verificable; no simular cobertura regional. |

## 6. Requisitos funcionales

### RF-01. Catálogo territorial canónico

- Contendrá las 25 jurisdicciones con nombre canónico, código de departamento/UBIGEO y alias fuente estrictamente documentados.
- Todo parámetro territorial será validado contra ese catálogo.
- Una adición requerirá fuente oficial del código, prueba de normalización y una corrida de verificación sin resultados ambiguos.

### RF-02. Registro de cobertura por lote

- Cada conector escribirá o actualizará un registro por jurisdicción solicitada.
- Debe diferenciar `0 hallados` de error, página no recorrida, fuente parcial y no aplicable.
- Debe conservar URL/recurso, parámetros, checksum cuando exista y versión del normalizador.

### RF-03. Verificador CLI transversal

- Comando `npm run cobertura:territorial -- --app <app> --jurisdiccion <nombre>` y opción `--todas`.
- Salida JSON y tabla terminal con estado, conteos, corte, restricciones y dependencias.
- Exit code distinto de cero cuando se solicite `--require-complete` y alguna jurisdicción no alcance `COMPLETA_VERIFICADA`.

### RF-04. Contrato de dependencias

- Los cruces derivados declararán sus fuentes mínimas y claves de enlace.
- Salud Institucional, Identidad Fiscal y Proveedores Sancionados expondrán cobertura heredada, no una cobertura inventada.

### RF-05. Controles específicos de fuente

- MEF: cobertura de bytes/secciones, meses, `MES_EJE=0`, devengado y nivel de gobierno.
- Invierte: continuidad de rangos frente a `Content-Length` y CUI distintos por jurisdicción.
- INFOBRAS: lote XLSX, filas leídas, normalizadas, persistidas y valores fuera de rango preservados como evidencia.
- OECE/SEACE: página terminal, ventanas de fechas, total de fuente, detalles fallidos y código territorial consultado.

## 7. Criterios de aceptación del producto

1. El catálogo devuelve exactamente 25 jurisdicciones y rechaza códigos/nombres no reconocidos.
2. Las nueve apps aparecen en el reporte con un estado explícito, incluido `NO_APLICA` cuando corresponda.
3. El reporte no etiqueta como completa una región sin lote, conteo y corte verificables.
4. Un cruce derivado muestra sus dependencias y pasa a `BLOQUEADA` si alguna no está cubierta.
5. Las corridas de INFOBRAS, Invierte, OECE y MEF conservan su límite de completitud: ningún resumen afirma universo nacional sin prueba específica.
6. Pruebas unitarias cubren catálogo, estados, transición de estado y al menos un caso `0 filas != cobertura` por fuente base.

## 8. Fuera de alcance

- Afirmar cobertura total de Perú antes de completar las corridas y verificaciones por fuente.
- Geocodificación inferida, acusaciones de corrupción o evaluación legal de proveedores.
- Cambios de interfaz visual, scheduler automático o alertas públicas durante esta fase.

## 9. Métricas de éxito

- 9/9 apps con fila de estado por jurisdicción o `NO_APLICA` documentado.
- 25/25 jurisdicciones validadas por catálogo antes de una corrida.
- 100% de filas del reporte con corte y restricción de completitud.
- 0 reportes que conviertan una falta de registro en conclusión sobre una entidad o proveedor.

## 10. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Descargas extensas interrumpidas | Rango reanudable, lotes transaccionales y estado `BLOQUEADA`, nunca cobertura parcial disfrazada. |
| Cambio de esquema fuente | Contrato de columnas, checksum y rechazo explícito. |
| Código territorial diferente por fuente | Tabla de alias por fuente; no normalizar sin prueba. |
| Dependencias incompletas | Propagar estado de cobertura a los cruces derivados. |
| Coste de SEACE/OECDS | Límites por región, paginación terminal registrada y ventana temporal explícita. |

## 11. Roadmap

- **Ahora:** catálogo, esquema de cobertura, CLI y fuente base INFOBRAS/Invierte/OECE.
- **Siguiente:** MEF con escaneo reproducible, proveedores/identidad y actividad agraria.
- **Después:** propagación a Salud/CEPLAN, corte de publicación y automatización controlada.

## 12. Avance de implementación (2026-08-25)

- Implementados: catálogo central de 25 jurisdicciones, tabla de cobertura, estados, verificador CLI, regresiones y registro desde INFOBRAS, Invierte, OECE `/releases`, OECE `/records` y SEACE menores 8 UIT.
- Verificado en código: una corrida limitada se registra como `PARCIAL`; una fuente sin filas solo puede ser `SIN_DATOS_EN_FUENTE` si el recorrido se completó; una capa sin corrida aparece como `BLOQUEADA`; CEPLAN es `NO_APLICA` mientras no exista llave territorial oficial.
- Verificado en datos: el corte completo de Invierte recorrió de forma continua los cinco rangos HTTP del CSV público (bytes `0` a `246344021`) y materializó cobertura `COMPLETA_VERIFICADA` para las 25 regiones. El verificador específico `--app radar-inversiones --require-complete` termina correctamente.
- Pendiente: completar la corrida persistente de INFOBRAS para las 25 regiones (el corte actual verificable cubre cinco), recorridos terminales OECE/SEACE y el escaneo reproducible MEF. El verificador global debe seguir fallando mientras esas capas no tengan un corte completo; el resultado de Invierte no certifica por sí solo el universo externo ni las demás fuentes.
