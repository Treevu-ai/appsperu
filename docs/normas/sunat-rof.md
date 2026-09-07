# ROF — SUNAT (Superintendencia Nacional de Aduanas y de Administración Tributaria)

**Fuente**: `sunat-rof.pdf` — texto real extraído vía `pdf-parse` (39 páginas, aprobado por
Decreto Supremo N° 040-2023-EF). Descargado de
`sunat.gob.pe/institucional/quienessomos/igo/rof/2023/ROF_SUNAT_DS040_2023EF.pdf` (2026-09-07).

## Naturaleza jurídica (Artículos 1-3, texto real)

Organismo Técnico Especializado, personería jurídica de derecho público, autonomía funcional,
técnica, económica, financiera, presupuestal y administrativa. **Adscrito al MEF** (no es un
órgano interno del MEF — ver `mef-rof.md`). Ejerce funciones a nivel nacional.

## Competencias y funciones generales (Artículo 4, texto real)

Competencias por materia:
1. Administración de tributos del gobierno nacional y conceptos no tributarios encargados por
   ley o convenio.
2. Implementación, inspección y control de la política aduanera (comercio exterior).
3. Control y fiscalización del ingreso/transporte/salida de productos de actividad minera e
   insumos químicos usables en minería ilegal o elaboración de drogas ilícitas.

Funciones generales (selección relevante):
a) Administrar los tributos internos del Gobierno Nacional.
b) Proponer al MEF la reglamentación de normas tributarias/aduaneras.
c) Expedir disposiciones en materia tributaria y aduanera.
j) Controlar y fiscalizar el tráfico de mercancías a nivel nacional.
k) Inspeccionar agencias de aduanas, depósitos autorizados, almacenes fiscales.

## Relación con Rastro

- `identidad-fiscal`: el Padrón RUC (razón social, estado del contribuyente —
  ACTIVO/BAJA/SUSPENDIDO—, condición de domicilio, ubigeo) que se ingiere es un registro que
  SUNAT administra por mandato directo del Artículo 4 (administración tributaria nacional). El
  estado del contribuyente (`estado_contribuyente`) es un dato tributario oficial, no una
  inferencia — pero su cambio a través del tiempo (una empresa que estuvo ACTIVA al momento de
  un contrato y luego pasó a BAJA) requiere el mismo tipo de rigor temporal que
  `proveedores-sancionados` ya resolvió con `temporal-status.ts` (ver
  `docs/PRD_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md`, hallazgo 2).
- No hay mandato de SUNAT sobre sanciones a proveedores del Estado por incumplimiento
  contractual — eso es competencia de OECE (RNP), no de SUNAT. Un RUC "ACTIVO/HABIDO" en SUNAT
  no dice nada sobre si esa empresa está inhabilitada para contratar con el Estado; son dos
  fuentes de irregularidad legalmente independientes, ya cruzadas por separado en
  `identidad_fiscal_crossref_proveedores` y `proveedores_sancionados_crossref`.
