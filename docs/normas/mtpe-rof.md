# ROF — MTPE (Ministerio de Trabajo y Promoción del Empleo)

**Fuente**: `mtpe-rof.pdf` — Decreto Supremo N° 004-2010-TR (2010). Descargado de un espejo
(`sutamp.org`) ante indisponibilidad del PDF oficial vigente en esta pasada (2026-09-07).

**Limitación de esta ficha**: el PDF descargado es un escaneo sin capa de texto real (no se pudo
extraer vía `pdf-parse`) y además es una versión de 2010 — existe una versión más reciente
citada en búsquedas (Texto Integrado actualizado por Resolución Ministerial N° 194-2024-TR, con
modificaciones vía RM N° 190-2024-TR) que no se descargó en esta pasada. Este resumen se basa en
conocimiento institucional público del sector trabajo, no en extracción literal del documento.

## Funciones generales (conocimiento institucional, no transcripción literal)

MTPE es el ente rector de las políticas nacionales y sectoriales en materia de trabajo, promoción
del empleo, y fomento del empleo formal — incluye la regulación de las relaciones laborales, la
fiscalización laboral (a través de SUNAFIL, organismo técnico especializado adscrito), y la
promoción de la formalización empresarial y laboral.

## Relación con Rastro

- `actividad-empresarial`: las series de empresas del sector privado por distrito (formalización
  empresarial) que ingiere esta app existen porque MTPE tiene mandato de rectoría sobre la
  promoción del empleo formal — un registro de "empresas activas por distrito" es, en esencia,
  un indicador de la política de formalización que el ministerio está obligado a monitorear.
- SUNAFIL (fiscalización laboral) es un organismo **adscrito** a MTPE, no un órgano interno —
  relevante si en el futuro se ingiere un registro de infracciones laborales (paralelo a
  `infracciones-ambientales`/OEFA), ya que sería una fuente distinta con su propio ROF.
