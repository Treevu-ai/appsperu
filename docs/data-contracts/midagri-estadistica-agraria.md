# Data contract — MIDAGRI: Estadística agraria (SIEA / Plataforma Nacional de Datos Abiertos)

> Ficha técnica: `docs/adr/0007-research-spike-midagri-mincetur-actividad-economica.md`

- Fuente oficial: Ministerio de Desarrollo Agrario y Riego (MIDAGRI) — Sistema Integrado de
  Estadística Agraria (SIEA), `https://siea.midagri.gob.pe/portal/`, y datasets propios en la
  Plataforma Nacional de Datos Abiertos, `https://datosabiertos.gob.pe`.
- Owner del conector: sin asignar — este data contract nace de un research spike (ADR-0007),
  no de una app en construcción.
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
2018-2026, granularidad **mensual por región**. Filas verificadas en vivo para Amazonas,
Apurímac, Ancash, Arequipa, Ayacucho, Cajamarca, Cusco (no se llegó a confirmar la fila exacta
de La Libertad por scroll, pero el dataset es evidentemente el universo completo de regiones,
no una muestra — La Libertad es una región agrícola grande, altamente improbable que falte).

Los otros 4 recursos del mismo dataset (mismo patrón, no previsualizados individualmente en
este spike, pero mismo dataset padre y misma estructura esperada):
- `MIDAGRI-03.01`: Importación de Insumos Agropecuarios 2015-2026 (nacional, no por región)
- `MIDAGRI-03.02`: Producción de Guano de la Isla 2015-2026 (nacional, no por región)
- `MIDAGRI-03.04`: Precio de Alquiler de Tractor Agrícola por Región 2018-2026 (S/.)
- `MIDAGRI-03.05`: Precio de Alquiler de Yunta por Región 2018-2026 (S/.)

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

### Otros datasets identificados (grupo MIDAGRI, PNDA) — estructura aún sin previsualizar

| Dataset | Contenido reportado | Regional |
|---|---|---|
| `MIDAGRI - Información Estadística Agrícola` | Superficie sembrada/cosechada, producción, rendimiento, precio en chacra por cultivo | No confirmado — candidato a ser la fuente real del VBP regional del dashboard SIEA |
| `MIDAGRI - Información Estadística Pecuaria` | Producción, población pecuaria, precios al productor, rendimientos | No confirmado |
| `Datos Agroindustriales 2023-2025` | Producción y venta de productos terminados, ingreso y utilización de materia prima | No confirmado |
| `MIDAGRI: Estudios Económicos` | Sin detalle | No confirmado |

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

1. Confirmar la fila exacta de LA LIBERTAD en `MIDAGRI-03.03` (se verificó la estructura y
   varias regiones, no se hizo scroll hasta esa fila específica — el grid de previsualización
   tiene su propio scroll interno, no el de la página).
2. URL real de descarga del archivo (patrón CKAN de `datosabiertos.gob.pe`, ej.
   `/dataset/<slug>/resource/<id>/download/<archivo>.csv` — no confirmado el patrón exacto
   todavía, solo que el botón "Descargar" existe y la previsualización sí trae el dato completo
   vía la API interna del portal).
3. Previsualizar `MIDAGRI - Información Estadística Agrícola` (candidata a ser la fuente real
   del VBP/rendimiento regional que se ve en el dashboard SIEA — el dataset `MIDAGRI-02` VBP
   resultó ser nacional, no esa fuente).
4. Si el monitoreo satelital distrital de siembras (SIEA) es descargable o solo visual — no
   explorado en ninguna de las dos pasadas.
5. Separador real del CSV (coma vs. `;`) y encoding — no confirmado sin descargar el archivo.

## Cautelas

- Uno de los cinco recursos del dataset (`MIDAGRI-03.03`) quedó confirmado con el mismo nivel de
  rigor que el resto del proyecto (navegación en vivo, columnas reales, no snippets de
  búsqueda). Los otros datasets de la tabla de arriba siguen sin ese nivel de confirmación —
  no asumir que tienen la misma estructura solo por pertenecer al mismo grupo MIDAGRI.
- Recordar para cualquier investigación futura contra `datosabiertos.gob.pe`: **usar el
  subdominio `www.`** — el dominio raíz no resuelve en esta red, lo cual generó una falsa
  alarma de "portal caído" en la primera pasada de este spike.
