# Data contract — JNE (Autoridades Electas)

> Ficha técnica del conector: pendiente de construir (app propuesta `autoridades-electas` o
> nombre similar — decisión de arquitectura pendiente). Fase 0 registrada en la conversación de
> sesión 2026-09-06.

Investigación en vivo: 2026-09-06.

## Fuente confirmada

- **No usar la SPA de Infogob** (`infogob.jne.gob.pe`): confirmado en vivo que la SPA no
  devuelve contenido a un fetch directo sin ejecutar JavaScript — mismo tipo de obstáculo que
  ya se documentó para el botón "Descargar" de ObservaPerú/CEPLAN (el dato real vive en un
  asset o dataset separado, no en la página que lo muestra).
- **El mismo dato sí está publicado en la Plataforma Nacional de Datos Abiertos**, fuera de la
  SPA: dataset `autoridades-electas-jne`
  (`https://www.datosabiertos.gob.pe/dataset/autoridades-electas-jne`), publicador Jurado
  Nacional de Elecciones (JNE). Licencia: Open Data Commons Public Domain Dedication (PDDL).
- **Descarga directa confirmada 2026-09-06**:
  `https://www.datosabiertos.gob.pe/sites/default/files/autoridades_electas_20260730.xls`
  — `.xls` legado (Composite Document File V2, confirmado por firma de archivo real, no solo por
  extensión), **102.5 KB**, última modificación **2026-07-30** (metadato del archivo:
  `Last Saved By: Pedro Antonio Guevara Reyes`, `Last Saved Time: 2026-07-30 17:13:50`).
- **Recurso complementario**: `autoridades_electas_20251113.xls` (13.37 MB, corte anterior) —
  confirma que el dataset se actualiza periódicamente reemplazando/agregando cortes, sin
  patrón de nombre de archivo estable entre actualizaciones (mismo problema de nombre inestable
  que ya resolvió `infomidis-connector.ts` resolviendo por `package_show`/CKAN en vez de URL
  fija).
- **Diccionario de datos**: `Formato_Diccionario Datos_AutoridadesElectas.xlsx` (10.3 KB) —
  descargado, confirma nombres de columna oficiales.
- **API CKAN confirmada**: `package_show` responde JSON completo con URLs de recurso, fechas de
  creación/modificación y tamaños — mismo patrón que ya usan `renipress-connector.ts` /
  `infomidis-connector.ts` para resolver "el recurso más reciente" sin depender de un nombre de
  archivo fijo.

## Qué es (confirmado por estructura real del archivo)

Registro de autoridades que han resultado electas en procesos electorales peruanos — el mismo
dato que Infogob muestra en su buscador web, pero exportado en bruto. El corte 2026-07-30
coincide con el proceso de Elecciones Regionales y Municipales 2026 en curso (confirmado por
búsqueda web de la misma semana).

## Columnas confirmadas (lectura directa del `.xls`, 2026-09-06)

```
TXNOMBRES, TXAPELLIDOPATERNO, TXAPELLIDOMATERNO, TXORGANIZACIONPOLITICA, NUPOSICION,
TXCARGO, TXREGION, TXPROVINCIA, TXDISTRITO, FEINICIOVIGENCIA, FEFINVIGENCIA,
TXPROCESOELECTORAL, TXANIOELECCION, TXPRONUNCIAMIENTO, FEPUBLICACION, TXAMBITO,
TXGENERO, NUEDAD, TXPERIODO, TXTIPOORGPOLITICA
```

- `TXREGION`/`TXPROVINCIA`/`TXDISTRITO` vienen como **texto**, no como código UBIGEO — requeriría
  el mismo tipo de matcher/normalización por nombre que ya usa `informes-control-connector.ts`
  contra `radar-ejecucion`, no un cruce exacto directo.
- **Sin número de documento (DNI/CE)** en las columnas confirmadas — a diferencia de
  `perfilprov-conformacion-connector.ts` (que sí captura DNI, enmascarado en la API), este
  dataset solo trae nombre completo, sin identificador único de persona. Esto **limita** un
  cruce por DNI (como el que ya existe entre `proveedores-sancionados` y `supplier_conformacion`)
  — el cruce candidato tendría que ser por **nombre completo normalizado**, con el riesgo de
  falsos positivos/negativos que eso implica (nombres homónimos son comunes en Perú).
- Sample rows confirmadas: candidatos a Diputado ("Juntos por el Perú") y Senador ("Partido
  Cívico Obras") para el proceso "Elecciones Generales 2026" — **nota importante**: el nombre
  del dataset dice "Autoridades Electas" pero al menos algunas filas de la muestra corresponden a
  **candidatos**, no necesariamente a electos/proclamados. Esto requiere verificación adicional
  antes de construir: revisar si `TXPRONUNCIAMIENTO`/`FEINICIOVIGENCIA` distingue candidatura de
  proclamación real, o si el dataset mezcla ambos estados y hay que filtrar.

## Evaluación de riesgo legal (preliminar, mismo marco que `docs/COBERTURA_Y_CUMPLIMIENTO.md`)

- **Base legal**: Ley 27806 — el propio JNE publica este dato con fin de fiscalización ciudadana,
  vía su propio portal Infogob y ahora también vía la PNDA. Ser autoridad electa (o candidato a
  serlo) es, por definición, ejercer o buscar ejercer una función pública — el estándar de
  expectativa de privacidad es distinto al de cualquier persona natural del resto del catálogo.
- **Riesgo estimado**: **bajo** — más bajo que `proveedores-sancionados` (que si expone nombre de
  persona natural con base en un registro de sanción) y considerablemente más bajo que
  `perfilprov-conformacion` (que expone DNI, aunque enmascarado). Aquí no hay documento de
  identidad ni dato oculto: nombre, cargo y organización política son exactamente lo que el
  cargo/candidatura implica hacer público.
- **Pendiente de confirmar**: si el dataset mezcla candidatos con electos (ver arriba), un
  candidato no electo tiene un estándar de exposición pública distinto (más débil) que uno que sí
  ejerce el cargo — a resolver antes de decidir si se ingiere el universo completo o se filtra a
  proclamados/vigentes únicamente.

## Lo que esto habilitaría (hipótesis, cruce de mayor valor identificado)

**Cruce autoridad electa ↔ proveedor del Estado / persona sancionada**, por nombre completo
normalizado, contra:
- `supplier_conformacion` (`compras-publicas`) — detectaría si una autoridad electa es o fue
  socio/representante/miembro de órgano de administración de una empresa que contrata con el
  Estado (señal de conflicto de interés).
- `proveedores-sancionados` (inhabilitaciones/multas) — detectaría si una autoridad electa tiene
  una sanción vigente o histórica del Tribunal de Contrataciones.

Sería el primer cruce del catálogo entre "quién gobierna" y "quién contrata" — ningún conector
actual conecta estas dos dimensiones. Limitación real: sin DNI en esta fuente, el cruce depende
de matching por nombre (falsos positivos por homonimia son un riesgo real a mitigar, ej. exigir
coincidencia de región/provincia como señal adicional de confianza, similar al patrón
`confirmada`/`candidata` que ya usa el resto del catálogo para cruces difusos).

## Pendiente antes de construir el conector

1. **Resolver la ambigüedad candidato vs. electo** (ver arriba) — crítico para la decisión de
   alcance de ingesta y para la evaluación de riesgo legal.
2. **Decodificar el diccionario de datos** (`Formato_Diccionario Datos_AutoridadesElectas.xlsx`,
   ya descargado) para confirmar los valores posibles de `TXCARGO`, `TXAMBITO`,
   `TXTIPOORGPOLITICA` antes de normalizar.
3. **Diseñar el matcher de nombre** para el cruce con `supplier_conformacion`/
   `proveedores-sancionados` — no existe hoy un matcher de personas naturales en el catálogo
   (el matcher difuso existente, `@appsperu/entity-matcher`, está diseñado para nombres de
   entidad/empresa, no de persona).
4. **Confirmar si hay un corte histórico consolidado** (autoridades de gestiones anteriores, no
   solo el proceso 2026 en curso) o si cada actualización del dataset reemplaza el corte
   anterior — el archivo de noviembre 2025 (13.37 MB) vs. julio 2026 (102.5 KB) sugiere que el
   contenido varía mucho de tamaño entre cortes, a investigar antes de asumir snapshot completo
   vs. incremental.
5. Sin WAF detectado en la descarga directa desde `datosabiertos.gob.pe` en esta pasada.
