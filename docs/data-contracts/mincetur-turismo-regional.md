# Data contract — MINCETUR: Turismo regional (Datos Turismo)

> Ficha técnica: `docs/adr/0007-research-spike-midagri-mincetur-actividad-economica.md`

- Fuente oficial: Ministerio de Comercio Exterior y Turismo (MINCETUR) — sistema "Datos
  Turismo", `https://datosturismo.mincetur.gob.pe/`, y datasets propios en la Plataforma
  Nacional de Datos Abiertos, `https://datosabiertos.gob.pe`.
- Owner del conector: sin asignar — research spike (ADR-0007), no app en construcción.
- **Confirmado en vivo el 2026-08-21 vía Chrome real**: el bloqueo `418` que dio WebFetch contra
  `gob.pe` no se repitió con un browser real — la página cargó normal y reveló el hallazgo
  decisivo de este data contract (ver abajo).

## Estado: PARCIALMENTE CONFIRMADO — reporte regional es PDF, no dataset tabular

### Hallazgo en vivo (2026-08-21): "Reporte Regional de Turismo 2025" es un PDF por departamento

`gob.pe/institucion/mincetur/informes-publicaciones/6659083-...` es un compendio de **26 PDFs
individuales**, uno por departamento (incluidos Lima y Callao por separado) más un consolidado
nacional. Confirmado el recurso exacto para el piloto:

> **Reporte Regional de Turismo LA LIBERTAD - Año 2025** — PDF, 845.8 KB, publicado el
> 2026-04-10 (fecha del portal, revisar si corresponde a datos de 2025 o si "2025" es el año
> del reporte y no del dato).

Esto **cambia la prioridad frente a MIDAGRI**: no es un dataset CSV/XLSX descargable ni una API
— es un documento narrativo/tabular en PDF, mismo tipo de fuente que INFOBRAS (XLSX, más
fácil) no, más parecido en fricción a tener que extraer tablas de un PDF (no hay precedente de
ese tipo de conector en el proyecto todavía — ninguna de las 8 apps existentes parsea PDF). Un
conector viable requeriría extracción de tablas desde PDF (librería tipo `pdf-parse` +
heurística de tablas, o revisar si el PDF trae datos en formato consistente entre regiones) en
vez de un `csv-parse` directo — mayor esfuerzo de implementación que cualquier otra fuente ya
integrada en el proyecto.

### Portal operacional (`datosturismo.mincetur.gob.pe`) — sin explorar en este spike

No se repitió la navegación de este portal en el pase con Chrome real (foco del spike fue
confirmar el reporte regional, que resultó ser el hallazgo decisivo). Sigue pendiente: explorar
si "Estadísticas"/"Reportes regionales" dentro de ese portal expone algo distinto al compendio
de PDFs de `gob.pe` — mismo tipo de dashboard vs. dataset real que se encontró para MIDAGRI.

### Portal operacional (`datosturismo.mincetur.gob.pe`)

Módulos confirmados por navegación de la página raíz:
- **Estadísticas** — datos agregados (sin explorar la estructura interna).
- **Investigaciones** — publicaciones y estudios.
- **Reportes regionales** — análisis por departamento/región (el módulo más relevante para
  este proyecto, sin confirmar si expone tablas descargables o solo texto/gráficos).
- **Artesanía** — Registro Nacional del Artesano.
- **Indicadores turísticos**.
- **Mapa de recursos** — geolocalización de atractivos turísticos.
- **Observatorio** — plataforma de monitoreo.

Series confirmadas por descripción institucional (no por navegación directa del dato):
flujo de turistas internacionales por país de residencia (receptivo) y de peruanos por país de
destino (emisivo) — fuente subyacente: Superintendencia Nacional de Migraciones; movimiento de
pasajeros en aeropuertos; llegadas/pernoctaciones/capacidad ofertada en establecimientos de
hospedaje, vía **"Estadística Mensual de Turismo para Establecimientos de Hospedaje"**.

### Publicación específica: "Reporte Regional de Turismo 2025"

`gob.pe/institucion/mincetur/informes-publicaciones/6659083-reportes-de-turismo-reporte-regional-de-turismo-2025`
— existencia confirmada por resultado de búsqueda, contenido no verificable en este spike
(`418` al intentar leerlo). Sin confirmar si es:
(a) un documento narrativo/PDF por región (patrón más común en `gob.pe/informes-publicaciones`,
como el boletín "El Agro en Cifras" de MIDAGRI), o
(b) un dataset tabular exportable.

### Plataforma Nacional de Datos Abiertos (grupo MINCETUR)

Datasets mencionados en resultados de búsqueda, sin verificar estructura: Inventario de
Recursos Turísticos, estadísticas de oferta/uso de hospedaje a nivel nacional y regional,
Directorios de Prestadores de Servicios Turísticos.

### Lo que falta confirmar antes de escribir el ADR de app + conector

1. Abrir el "Reporte Regional de Turismo 2025" y determinar si es PDF narrativo o dataset.
2. Explorar el módulo "Reportes regionales" de `datosturismo.mincetur.gob.pe` — ¿hay
   selector por departamento con exportación, o es un dashboard sin descarga?
3. Confirmar si "Estadística Mensual de Turismo para Establecimientos de Hospedaje" (dataset
   PNDA) trae La Libertad y con qué desagregación (departamento/provincia/distrito).
4. Formato real de descarga (CSV/XLSX/API) — sin confirmar en este spike.

## Cautelas

- Mismo nivel de confianza reducido que `midagri-estadistica-agraria.md` — basado en snippets
  de búsqueda, no en navegación directa completa. No implementar conector sin repetir el
  proceso de verificación en vivo (patrón CEPLAN/ObservaPerú).
- El bloqueo `418` de `gob.pe` en este entorno sugiere que cualquier conector futuro contra ese
  dominio necesitará headers/User-Agent cuidadosos (mismo tipo de fricción ya documentado para
  ObservaPerú y el RNP/OECE en `proveedores-sancionados.md`) — no asumir que un `fetch` simple
  bastará.
