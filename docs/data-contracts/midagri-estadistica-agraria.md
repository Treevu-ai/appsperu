# Data contract — MIDAGRI: Estadística agraria (SIEA / Plataforma Nacional de Datos Abiertos)

> Ficha técnica: `docs/adr/0007-research-spike-midagri-mincetur-actividad-economica.md`

- Fuente oficial: Ministerio de Desarrollo Agrario y Riego (MIDAGRI) — Sistema Integrado de
  Estadística Agraria (SIEA), `https://siea.midagri.gob.pe/portal/`, y datasets propios en la
  Plataforma Nacional de Datos Abiertos, `https://datosabiertos.gob.pe`.
- Owner del conector: sin asignar — este data contract nace de un research spike (ADR-0007),
  no de una app en construcción.
- **Confirmado en vivo el 2026-08-21 vía Chrome real** (`siea.midagri.gob.pe`, navegación
  directa con filtro aplicado) — pero `datosabiertos.gob.pe` **sigue sin resolver ni siquiera
  desde un browser real** (no es limitación de WebFetch, es la red/máquina de este entorno):
  la existencia y granularidad regional de los datos quedó confirmada, la estructura exacta de
  descarga (CSV/API) de la PNDA sigue pendiente.

## Estado: PARCIALMENTE CONFIRMADO — portal operacional navegado en vivo, PNDA aún sin acceso

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

### Datasets identificados (Plataforma Nacional de Datos Abiertos, grupo MIDAGRI) — estructura sin confirmar

### Datasets identificados (Plataforma Nacional de Datos Abiertos, grupo MIDAGRI)

| Dataset | Contenido reportado | Cobertura temporal | Regional |
|---|---|---|---|
| `VBP Agropecuario, Agrícola y Pecuario` | Valor Bruto de Producción agropecuaria/agrícola/pecuaria | 2019–2025 | No confirmado |
| `MIDAGRI - Información Estadística Agrícola` | Superficie sembrada, superficie cosechada, producción, rendimiento, precio en chacra por cultivo | No confirmado | No confirmado (es la fuente base del SIEA, que sí tiene reportes por región) |
| `MIDAGRI - Información Estadística Pecuaria` | Producción, población pecuaria, precios al productor, rendimientos | No confirmado | No confirmado |
| `Datos Agroindustriales 2023-2025` | Producción y venta de productos terminados, ingreso y utilización de materia prima | 2023–2025 | No confirmado |
| `Insumos y Servicios Agropecuarios` | Importación de insumos, producción de guano, **valor de jornal agrícola por región**, **precio de alquiler de tractor agrícola por región** | 2018–2024 | **Sí, explícito ("por región") según el título del dataset** |
| `MIDAGRI: Estudios Económicos` | Sin detalle | — | No confirmado |
| `MIDAGRI: Catálogo de datasets publicados` | Meta-dataset (catálogo de los anteriores) | — | N/A |

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

1. URL de descarga directa (¿API CKAN estándar de `datosabiertos.gob.pe`, tipo
   `/api/3/action/datastore_search`, o solo botón de descarga como MEF/CEPLAN?) — **bloqueado
   en este entorno**: `datosabiertos.gob.pe` no resolvió ni desde Chrome real el 2026-08-21,
   reintentar desde otra red/máquina.
2. Formato real de archivo (CSV/XLSX) y separador.
3. Si `Insumos y Servicios Agropecuarios` (el único con "por región" confirmado en el título)
   incluye La Libertad y con qué frecuencia se actualiza.
4. Si el monitoreo satelital distrital es exportable o solo visual.
5. Columnas exactas — ninguna se confirmó contra un diccionario real (a diferencia del CSV del
   MEF, donde sí se leyó `Gastos_Diccionario.csv` en vivo).

Lo que **ya no** hace falta confirmar (resuelto en vivo 2026-08-21): que el portal existe, que
tiene datos reales y actualizados para La Libertad, y que la granularidad regional es real (no
solo agregados nacionales) — visto directamente en el Power BI del SIEA.

## Cautelas

- Nivel de confianza más bajo que el resto de este proyecto — toda la información viene de
  snippets de búsqueda, no de navegación directa. No usar como base de una migración de schema
  sin antes repetir el mismo proceso de verificación en vivo que se hizo para CEPLAN/ObservaPerú
  (`docs/data-contracts/ceplan-strategic-planning.md`).
- `datosabiertos.gob.pe` no resolvió por DNS en este entorno de investigación (mismo problema ya
  visto al investigar ANIN, ver ADR-0006) — probar desde un entorno de red distinto antes de
  concluir que el portal no es accesible programáticamente.
