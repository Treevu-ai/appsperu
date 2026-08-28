# Data contract — MIDAGRI: Estadística agraria (SIEA / Plataforma Nacional de Datos Abiertos)

> Ficha técnica: `docs/adr/0007-research-spike-midagri-mincetur-actividad-economica.md`
  (investigación) y `docs/adr/0008-actividad-agraria-app-standalone-y-connector-midagri.md`
  (decisión de app standalone, connector propuesto).

- Fuente oficial: Ministerio de Desarrollo Agrario y Riego (MIDAGRI) — Sistema Integrado de
  Estadística Agraria (SIEA), `https://siea.midagri.gob.pe/portal/`, y datasets propios en la
  Plataforma Nacional de Datos Abiertos, `https://datosabiertos.gob.pe`.
- Owner del conector: app `actividad-agraria` (propuesta en ADR-0008, no construida todavía).
- **Confirmado en vivo el 2026-08-21 vía Chrome real**, incluida la PNDA
  (`www.datosabiertos.gob.pe` — nota: **el dominio sin `www.` no resuelve, con `www.` sí**;
  el "no accesible" de la primera pasada de este spike era eso, no una caída real del portal).

## Estado: CONFIRMADO — dataset real, descargable, con columna de región

### Hallazgo decisivo (2026-08-21, segunda pasada con Chrome): `MIDAGRI-03.03` es el dataset correcto

Dataset: `MIDAGRI-03. Reportes de Insumos y Servicios Agropecuarios`
(`www.datosabiertos.gob.pe/dataset/midagri-03-reportes-de-insumos-y-servicios-agropecuarios-ministerio-de-desarrollo-agrario-y`),
5 recursos CSV. El relevante para el proyecto:

> **`MIDAGRI-03.03: Valor de Jornal Agrícola por región 2018-2026`** — archivo
> `Valor de Jornal.xlsx - C.102.csv`, **16.36 KB**, `mimetype: text/csv`, `resource type: file
> upload`, última actualización `2026-05-26`. Licencia: Open Data Commons Attribution License.
> Botón "Descargar" presente y funcional (no se ejecutó la descarga en este spike, solo
> "Previsualizar", que renderiza el dato completo vía el visor propio del portal).

**Columnas confirmadas por previsualización en vivo**: `Región`, `Año`, `Ene`, `Feb`, `Mar`,
`Abr`, `May`, `Jun`, `Jul`, `Ago`, `Set`, `Oct`, `Nov`, `Dic` — **210 registros**, cobertura
2018-2026, granularidad **mensual por región**.

**LA LIBERTAD confirmada en vivo (2026-08-21, filtro `q=La Libertad` sobre el grid)** — 9 filas,
una por año 2018-2026, sin huecos:

| Año | Ene | Feb | Mar | Abr | May | Jun | Jul | Ago | Set | Oct | Nov | Dic |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2018 | 34 | 35 | 34 | 34 | 34 | 34 | 34 | 34 | 34 | 34 | 34 | 34 |
| 2019 | 35 | 35 | 35 | 35 | 35 | 35 | 35 | 36 | 40 | 38 | 35 | 38 |
| 2020 | 38 | – | – | – | – | – | 35 | 30 | 38 | 38 | 40 | 40 |
| 2021 | 45 | 43 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 |
| 2022 | 42.5 | 42.5 | 45 | 45 | 45 | 45 | 45 | 45 | 45 | 47.5 | 45 | 47.5 |
| 2023 | 47.5 | 50 | 50 | 50 | 50 | 50 | 48 | 48 | 48 | 45 | 50 | 50 |
| 2024 | 51 | 59 | 50 | 45 | 45 | 45 | 45 | 50 | 49 | 48.5 | 47 | 45.5 |
| 2025 | 48 | 49 | 47 | 48 | 48 | 48 | 48 | 49 | 49 | 43 | 49 | 49 |
| 2026 | 48 | 48.76 | | | | | | | | | | |

Valor del jornal agrícola en La Libertad: S/34 (ene-2018) → S/48-49 (2025-2026), ~42% de alza
nominal en 8 años. Los guiones (`–`) en 2020 (abr-jul) coinciden con el inicio de la pandemia —
consistente con un hueco real de reporte, no un error de lectura.

Los otros 4 recursos del mismo dataset (mismo patrón, no previsualizados individualmente en
este spike, pero mismo dataset padre y misma estructura esperada):
- `MIDAGRI-03.01`: Importación de Insumos Agropecuarios 2015-2026 (nacional, no por región)
- `MIDAGRI-03.02`: Producción de Guano de la Isla 2015-2026 (nacional, no por región)
- `MIDAGRI-03.04`: Precio de Alquiler de Tractor Agrícola por Región 2018-2026 (S/.)
  — URL confirmada 2026-08-27:
  `https://www.datosabiertos.gob.pe/sites/default/files/Precio%20de%20Alquiler%20de%20Tractor.csv`
  (misma estructura `Región;Año;Ene..Dic` que 03.03).
- `MIDAGRI-03.05`: Precio de Alquiler de Yunta por Región 2018-2026 (S/.)
  — URL confirmada 2026-08-27:
  `https://www.datosabiertos.gob.pe/sites/default/files/precioxyunta.csv`

### Corrección sobre `MIDAGRI-02` (VBP) — no es regional

El dataset `MIDAGRI-02.01: VBP Agropecuario, Agrícola y Pecuario, 2020-2026` (el primero que se
investigó en este spike) **es una serie nacional mensual, sin columna de región** — columnas
confirmadas: `AÑOS`, `mes`, `VBP_Agropecuario_%`, `VBP_Agricolacola_%` (sic, typo del dataset
original), `VBP_Pecuario_%`. El VBP regional que se ve en el dashboard Power BI del SIEA
("Perfil Productivo Departamental") **no corresponde a este dataset de la PNDA** — es otra
fuente, probablemente `MIDAGRI - Información Estadística Agrícola` (sin previsualizar todavía,
ver pendientes) o un cálculo propio del dashboard sin dataset público equivalente.

### Estado previo del portal operacional (SIEA, Power BI) — sin cambios

### Hallazgo en vivo (2026-08-21): dashboard Power BI, sin exportación de datos

`siea.midagri.gob.pe/herramientas/estadistica-agropecuarias` → **"Perfil Productivo
Departamental"** abre un reporte de **Power BI público** (`app.powerbi.com/view?r=...`) con un
slicer de `Departamento` que sí incluye LA LIBERTAD y filtra correctamente. Datos reales
observados para La Libertad, 2024 (fuente propia: "SIEA-MIDAGRI, IV CENAGRO 2012, SUNAT"):

- VBP: Agropecuario +6.2%, Agrícola +10.4%, Pecuario +0% (var. interanual)
- Principales productos (%VBP): Ave 26%, Arándano 15%, Espárrago 9%, Arroz 7%, Palta 7%, Papa 6%
- Rendimiento/superficie cosechada por cultivo (maíz chala, maíz amarillo duro, cebada, maíz
  amiláceo, frijol/haba/arveja grano seco, chocho o tarhui) — región vs. nacional
- Agroexportaciones 2020-2024 (miles US$ FOB) por producto y país destino: Arándano 49.35%,
  Palta 16.26%, Espárrago 13.65%, Preparaciones 11.78%, Uva 4.96%, hacia EE.UU. (45%), Ecuador
  (11%), Holanda (16%), España (8%)
- Superficie agrícola: 2,524,943 ha (25% del total nacional), 116 mil productores

**No hay opción de exportar datos**: clic derecho sobre cualquier visual del reporte muestra
solo `Expandir / Contraer / Mostrar como tabla / Incluir / Excluir / Borrar selecciones` — sin
`Exportar datos` (restricción típica de los reportes Power BI en modo "publicar en la web"
público). "Mostrar como tabla" sí existe pero solo expone la tabla de dimensión del propio
slicer (lista de departamentos), no la tabla de hechos detrás del visual — no sirve como método
de extracción masiva.

**Conclusión de arquitectura**: este dashboard **no es la vía de ingesta** — confirma que el
dato existe y tiene la granularidad regional que el proyecto necesita, pero el conector real
tendría que ir contra los datasets CSV de la Plataforma Nacional de Datos Abiertos listados
abajo (la fuente subyacente de este mismo Power BI), no contra el iframe de Power BI. Mismo
patrón de decisión que CEPLAN: el botón/dashboard visual no es el punto de integración, el
dataset descargable sí.

### Corrección (2026-08-21): "MIDAGRI - Información Estadística Agrícola" no existe como tal

Se revisó el catálogo **completo** de datasets con la etiqueta MIDAGRI en la PNDA — 23 datasets
en 3 páginas, listado exhaustivo vía `www.datosabiertos.gob.pe/search/type/dataset?query=MIDAGRI`.
El dataset "MIDAGRI - Información Estadística Agrícola" (superficie sembrada/cosechada,
rendimiento, precio en chacra) que aparecía en el primer pase de este spike (vía snippet de
búsqueda, no navegación directa) **no corresponde a ningún dataset real actual del portal** —
era una referencia desactualizada o mal indexada por el buscador externo, no un hallazgo válido.

**Catálogo completo confirmado (23 datasets, numeración `MIDAGRI-01` a `MIDAGRI-17` + varios sin
numerar)**: cobertizos/PMHF, `MIDAGRI-01` Desarrollo ganadero, `MIDAGRI-02` VBP (nacional, ver
arriba) **y también un `MIDAGRI-02` distinto: "Datero Agrario"** (mismo prefijo numérico
reutilizado — inconsistencia de catalogación del propio portal, no error de esta
investigación), `MIDAGRI-03` Insumos y Servicios Agropecuarios (el confirmado arriba),
`MIDAGRI-04` Calendario de Eventos, `MIDAGRI-06` Secigra Agrario, `MIDAGRI-11` Normas legales,
`MIDAGRI-12` Estudios de Suelos 2024-25, `MIDAGRI-15` Ejecución Presupuesto Pliego 013,
`MIDAGRI-16` Plan Anual de Transferencias, `MIDAGRI-17` Seguro Agrícola Catastrófico (SAC),
Núcleos Ejecutores, Catastro Forestal (SERFOR), Registro Nacional de Infractores (SERFOR),
Ejecución física presupuestal SENASA 2021-2026 (desagregado regionalmente), presupuesto Sector
13 Agrario 2014-2022, Estudios de Suelos aprobados julio 2026 (PDF). **Ninguno trae
superficie sembrada/cosechada/rendimiento/precio en chacra por cultivo** con ese nivel de
detalle — esa promesa específica del primer pase de este spike queda descartada.

### Descartado (2026-08-21): `MIDAGRI-02: Datero Agrario` no es lo que su descripción sugiere

Previsualizado en vivo el último de los 42 recursos (`Reporte de Transacciones 2020 Mayo`,
`Mayo20_5.xlsx`). El título del dataset promete "precios promedio de productos agropecuarios
comercializados en los mercados mayoristas de Lima Metropolitana y 26 principales ciudades del
país" — pero el contenido real es otra cosa: **estadísticas de uso del propio servicio
telefónico de consulta**, no precios. Columnas confirmadas: `AÑO`, `MES`, `CONSULTAS`,
`USUARIO`, `MODULOS` (valores vistos: `PRECIOS`, `SENAMHI`, `ANA` — el módulo consultado, no el
precio en sí), `OPERADOR` (`Movistar Peru`, `Bitel Peru` — el operador telefónico). Solo 4
registros para mayo 2020, sin ciudad ni región.

Dos problemas adicionales que descartan esta fuente por completo:
1. **Sin dato de precio real** — es telemetría de uso de un IVR/servicio de mensajería, no la
   serie de precios que el nombre del dataset sugiere.
2. **Congelado desde mayo 2020** — el último de los 42 recursos es "Mayo 2020"; los 42 archivos
   cubren exactamente 2015 (1) + 2016 (1) + 2017 (12) + 2018 (12) + 2019 (11, falta agosto) +
   2020 (5, hasta mayo) = 42, sin nada posterior en más de 6 años, pese a que la metadata del
   dataset dice "Fecha modificada: 2026-06-15" (ese timestamp es de la ficha, no de datos
   nuevos).

**Conclusión**: no hay segundo dataset viable identificado en este spike. `MIDAGRI-03.03`
queda como el único recurso confirmado y listo para ingerir.

### Otros datasets identificados (grupo MIDAGRI, PNDA) — estructura aún sin previsualizar

| Dataset | Contenido reportado | Regional |
|---|---|---|
| `Ejecución física presupuestal SENASA 2021-2026` | Acciones de sanidad agraria, desagregado regionalmente | Sí, según descripción del dataset |
| `Datos Agroindustriales 2023-2025` | Producción y venta de productos terminados, ingreso y utilización de materia prima | No confirmado |

`MIDAGRI-02: Datero Agrario` se retira de esta tabla — descartado (ver arriba). `MIDAGRI: Estudios
Económicos` tampoco aparece en la tabla — no apareció en el catálogo completo de 23 datasets
revisado, probablemente tampoco existe con ese nombre exacto.

### Portal operacional SIEA (`siea.midagri.gob.pe/portal/`)

Distinto de los datasets de la PNDA (probablemente la misma información, presentada como
dashboard en vez de CSV descargable). Módulos identificados por el propio sitio:
- Dashboards Power BI de estadísticas agropecuarias/agrícolas a nivel nacional.
- Boletín estadístico mensual **"El Agro en Cifras"** — probablemente PDF, mismo patrón que
  otros compendios de `gob.pe/institucion/midagri/informes-publicaciones`.
- **Monitoreo satelital mensual de superficies sembradas y cosechadas a nivel distrital** —
  el hallazgo más prometedor de este spike si resulta descargable: sería la granularidad
  geográfica más fina de cualquier fuente que el proyecto haya evaluado (por debajo de
  departamento). No confirmado si es visualización únicamente o dato exportable.
- Padrón de Productores (registro nacional).
- Resultados de la Encuesta Nacional Agropecuaria.

### Lo que falta confirmar antes de escribir el ADR de app + conector

1. URL real de descarga del archivo (patrón CKAN de `datosabiertos.gob.pe`, ej.
   `/dataset/<slug>/resource/<id>/download/<archivo>.csv` — no confirmado el patrón exacto
   todavía, solo que el botón "Descargar" existe y la previsualización sí trae el dato completo
   vía la API interna del portal).
2. Si el VBP/rendimiento regional visto en el dashboard Power BI del SIEA tiene *algún*
   dataset público equivalente en la PNDA — no localizado en el catálogo completo revisado
   (23 datasets); puede que ese cálculo no tenga fuente CSV pública propia.
4. Si el monitoreo satelital distrital de siembras (SIEA) es descargable o solo visual — no
   explorado en ninguna de las tres pasadas.
5. Separador real del CSV (coma vs. `;`) y encoding — no confirmado sin descargar el archivo.

Lo que **ya está confirmado y no requiere más spike**: `MIDAGRI-03.03` (estructura, columnas,
La Libertad presente con 9 años de datos) es suficiente por sí solo para justificar el ADR de
app standalone — los pendientes de arriba son de profundización, no bloqueantes.

## Cautelas

- Uno de los cinco recursos del dataset (`MIDAGRI-03.03`) quedó confirmado con el mismo nivel de
  rigor que el resto del proyecto (navegación en vivo, columnas reales, no snippets de
  búsqueda). Los otros datasets de la tabla de arriba siguen sin ese nivel de confirmación —
  no asumir que tienen la misma estructura solo por pertenecer al mismo grupo MIDAGRI.
- Recordar para cualquier investigación futura contra `datosabiertos.gob.pe`: **usar el
  subdominio `www.`** — el dominio raíz no resuelve en esta red, lo cual generó una falsa
  alarma de "portal caído" en la primera pasada de este spike.
