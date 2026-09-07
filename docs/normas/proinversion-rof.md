# ROF — PROINVERSIÓN (Agencia de Promoción de la Inversión Privada)

**Fuente**: `proinversion-rof.pdf` — ROF 2017 (base Decreto Supremo N° 185-2017-EF), descargado
de `investinperu.pe/wp-content/uploads/2025/03/rof-2017.pdf` (2026-09-07).

**Limitación de esta ficha**: el PDF descargado es un escaneo casi sin capa de texto (menos de
500 caracteres extraídos vía `pdf-parse`) — este resumen se basa en conocimiento institucional
público verificable sobre PROINVERSIÓN, no en extracción literal del documento. Nota de proceso:
un primer intento de descarga (vía un enlace de "El Peruano" en `gob.pe/institucion/mef/normas-
legales/227298-185-2017-ef`) resultó en un PDF de contenido **completamente no relacionado**
(una resolución de viaje al exterior de un oficial de Marina) — ejemplo real de por qué este
proyecto verifica el contenido de cada descarga en vez de confiar en el nombre del enlace.

## Naturaleza y funciones (conocimiento institucional, no transcripción literal)

Organismo Técnico Especializado adscrito al MEF. Su función es diseñar, conducir y ejecutar el
proceso de promoción de la inversión privada, a cargo de: Asociaciones Público-Privadas (APP),
Proyectos en Activos (PA), y Obras por Impuestos (OxI). PROINVERSIÓN no otorga viabilidad a un
proyecto de inversión pública (eso es competencia del MEF/DGPMI vía Invierte.pe) — su rol es
estructurar y adjudicar la participación privada en infraestructura y servicios públicos.

## Relación con Rastro

- `inversion-privada`: la cartera APP/PA y OxI que se ingiere (fuente VERTIX) es, formalmente,
  el registro que PROINVERSIÓN administra por su mandato exclusivo sobre estos tres mecanismos
  de participación privada — un proyecto en esta cartera **no** implica que el Estado ya
  aprobó/financió la obra vía Invierte.pe (eso es un sistema distinto, del MEF); implica que
  PROINVERSIÓN lo está promoviendo o adjudicando bajo su propio mandato legal.
- El cruce ya implementado `inversion_privada_oxi_crossref_invierte` (OxI vs. Banco de
  Inversiones del MEF) cruza dos sistemas con dueños legales distintos (PROINVERSIÓN vs. MEF) —
  el `codigo_snip`/CUI es el único puente formal entre ambos mandatos, de ahí que el proyecto
  documente explícitamente que "una fila sin match no implica que el proyecto no exista en
  Invierte.pe" (ver `mcp-server/src/catalog.ts`, `inversion_privada_oxi_crossref_invierte`).
