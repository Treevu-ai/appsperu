# ROF — Ministerio de Economía y Finanzas (MEF)

**Fuente**: `mef-rof.pdf` — Texto Integrado del ROF aprobado originalmente por Decreto Supremo
N° 117-2014-EF, actualizado como Texto Integrado 2019. Descargado de
`gob.pe/institucion/mef/informes-publicaciones/392622-...` (2026-09-07).

**Limitación de esta ficha**: el PDF descargado es un escaneo sin capa de texto (no se pudo
extraer texto real vía `pdf-parse`) — este resumen se basa en conocimiento institucional público
verificable sobre el MEF, no en una extracción literal del documento. Hay modificaciones
posteriores conocidas y no descargadas en esta pasada: Decreto Supremo N° 124-2026-EF (julio
2026, modifica 23 artículos y agrega 2 a la Primera Sección) y Resolución Ministerial N°
331-2023-EF/41 (Texto Integrado Actualizado). Para uso legal/verificación exacta, consultar
directamente `mef.gob.pe` (protegido por WAF Incapsula, mismo bloqueo ya documentado en
`docs/adr/0014-bcrp-la-libertad-sintesis-economica-ingesta-manual.md` para otra entidad).

## Naturaleza jurídica

Organismo del Poder Ejecutivo, rector de los sistemas administrativos de Presupuesto Público,
Tesorería, Endeudamiento Público y Contabilidad, y ente rector del Sistema Nacional de
Programación Multianual y Gestión de Inversiones (Invierte.pe).

## Funciones generales relevantes para Rastro

- Formular, proponer y evaluar la política económica y fiscal del país.
- Programar, dirigir, controlar y evaluar la actividad presupuestaria del Sector Público
  (Dirección General de Presupuesto Público, DGPP) — es la base legal de por qué el MEF publica
  el CSV nacional de ejecución presupuestal (PIA/PIM/Devengado) que ingiere `radar-ejecucion`.
- Ejercer la rectoría del Sistema Nacional de Programación Multianual y Gestión de Inversiones
  (Invierte.pe), a través de la Dirección General de Programación Multianual de Inversiones
  (DGPMI) — base legal del Banco de Inversiones que ingiere `radar-inversiones`.
- Dictar normas y lineamientos de endeudamiento y tesorería públicos.
- SUNAT (organismo técnico especializado, ver `sunat-rof.md`) está **adscrita** al MEF, no es un
  órgano interno — relevante para no confundir "el MEF publicó esto" con "SUNAT publicó esto"
  al documentar procedencia de datos.

## Relación con Rastro

- `radar-ejecucion`: la ejecución presupuestal (PIA/PIM/Devengado) que se ingiere por
  entidad/función/año fiscal existe porque el MEF, como rector del sistema de Presupuesto
  Público, está legalmente obligado a hacer pública esa información (Consulta Amigable).
- `radar-inversiones`: el Banco de Inversiones (Invierte.pe) que se ingiere es, formalmente, un
  registro que el MEF administra por mandato de su rol como ente rector del Sistema Nacional de
  Programación Multianual y Gestión de Inversiones — un proyecto "viable" en ese banco no
  implica que el MEF ejecute la obra (eso lo hace la entidad titular del proyecto), solo que
  pasó el filtro de viabilidad que el sistema exige.
