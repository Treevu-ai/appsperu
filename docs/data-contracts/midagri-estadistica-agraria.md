# Data contract — MIDAGRI: Estadística agraria (SIEA / Plataforma Nacional de Datos Abiertos)

> Ficha técnica: `docs/adr/0007-research-spike-midagri-mincetur-actividad-economica.md`

- Fuente oficial: Ministerio de Desarrollo Agrario y Riego (MIDAGRI) — Sistema Integrado de
  Estadística Agraria (SIEA), `https://siea.midagri.gob.pe/portal/`, y datasets propios en la
  Plataforma Nacional de Datos Abiertos, `https://datosabiertos.gob.pe`.
- Owner del conector: sin asignar — este data contract nace de un research spike (ADR-0007),
  no de una app en construcción.
- **No confirmado en vivo** — a diferencia del resto de data contracts del proyecto (todos
  navegados en vivo), este viene de resultados de búsqueda indexados. `datosabiertos.gob.pe`
  no resolvió por DNS en ningún intento de este spike (2026-08-21). Verificar con browser real
  antes de implementar cualquier conector.

## Estado: PARCIALMENTE CONFIRMADO — por listado del portal, no por descarga directa

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
   `/api/3/action/datastore_search`, o solo botón de descarga como MEF/CEPLAN?).
2. Formato real de archivo (CSV/XLSX) y separador.
3. Si `Insumos y Servicios Agropecuarios` (el único con "por región" confirmado en el título)
   incluye La Libertad y con qué frecuencia se actualiza.
4. Si el monitoreo satelital distrital es exportable o solo visual.
5. Columnas exactas — ninguna se confirmó contra un diccionario real (a diferencia del CSV del
   MEF, donde sí se leyó `Gastos_Diccionario.csv` en vivo).

## Cautelas

- Nivel de confianza más bajo que el resto de este proyecto — toda la información viene de
  snippets de búsqueda, no de navegación directa. No usar como base de una migración de schema
  sin antes repetir el mismo proceso de verificación en vivo que se hizo para CEPLAN/ObservaPerú
  (`docs/data-contracts/ceplan-strategic-planning.md`).
- `datosabiertos.gob.pe` no resolvió por DNS en este entorno de investigación (mismo problema ya
  visto al investigar ANIN, ver ADR-0006) — probar desde un entorno de red distinto antes de
  concluir que el portal no es accesible programáticamente.
