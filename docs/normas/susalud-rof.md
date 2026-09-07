# ROF — SUSALUD (Superintendencia Nacional de Salud)

**Fuente**: `susalud-rof.pdf` — texto real extraído (85,580 caracteres), publicado en El Peruano
el 10 de junio de 2014, base Decreto Legislativo N° 1158. Descargado de
`portal.susalud.gob.pe/wp-content/uploads/doc/ROF.pdf` (2026-09-07). Puede existir una versión
posterior (modificatorias vía Resoluciones de Superintendencia 2026, ej. RS 043/045/050-2026)
no descargada en esta pasada — las funciones de fondo (supervisión IAFAS/IPRESS) son estables.

## Naturaleza jurídica (Artículo 1, texto real)

Organismo técnico especializado **adscrito al Ministerio de Salud (MINSA)**, autonomía técnica,
funcional, administrativa, económica y financiera.

## Finalidad (Artículo 2, texto real)

> "SUSALUD tiene por finalidad promover, proteger y defender los derechos de las personas al
> acceso a los servicios de salud, supervisando que las prestaciones sean otorgadas con
> calidad, oportunidad, disponibilidad y aceptabilidad, con independencia de quien las
> financie."

## Ámbito de competencia (Artículo 3, texto real)

Entidad desconcentrada, competencias de **alcance nacional**. Bajo su ámbito: **todas** las
Instituciones Administradoras de Fondos de Aseguramiento en Salud (IAFAS), **todas** las
Instituciones Prestadoras de Servicios de Salud (IPRESS) y sus Unidades de Gestión. Su
competencia sobre Empresas de Seguros (incluido SOAT/AFOCAT) se limita a los procesos de
prestación de servicios de salud, no al negocio asegurador en sí.

## Relación con Rastro

- `servicios-salud`: el registro RENIPRESS (establecimientos de salud) que ingiere esta app es,
  formalmente, un registro que existe por mandato del Artículo 3 — SUSALUD tiene competencia
  sobre **todas** las IPRESS del país, lo que confirma por qué la cobertura de RENIPRESS es
  nacional completa, no una muestra parcial. El `estado` operativo (`ACTIVO` u otro) de un
  establecimiento es un dato de fiscalización oficial de SUSALUD, no una etiqueta descriptiva.
- La distinción IAFAS (financiador) vs. IPRESS (prestador) del Artículo 2 es relevante para no
  confundir universos si en el futuro se ingiere un registro de aseguradoras/EPS — son
  entidades reguladas bajo mandatos distintos dentro del mismo ROF.
