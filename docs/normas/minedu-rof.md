# ROF — MINEDU (Ministerio de Educación)

**Fuente**: `minedu-rof.pdf` — Decreto Supremo N° 001-2015-MINEDU (30 de enero de 2015), aprueba
el ROF vigente (194 artículos, 10 capítulos, 4 títulos, deroga el DS 006-2012-ED anterior).
Descargado de `gob.pe/institucion/minedu/informes-publicaciones/5411001-...` (2026-09-07).

**Limitación de esta ficha**: el PDF extraído vía `pdf-parse` solo trae texto real del decreto de
aprobación (portada legal) — el anexo de 194 artículos con el detalle de funciones por órgano
está escaneado sin capa de texto, no se pudo extraer literal. Este resumen se basa en
conocimiento institucional público del sector educación peruano, no en extracción del anexo.

## Confirmado en el texto real del decreto

- El ROF fue aprobado con voto aprobatorio del Consejo de Ministros, vigente a los 30 días de su
  publicación en El Peruano.
- Deroga expresamente el DS N° 006-2012-ED.
- Modifica de paso el Reglamento del PRONABEC (Programa Nacional de Becas y Crédito Educativo) y
  del **PRONIED** (Programa Nacional de Infraestructura Educativa) — el Artículo 2 modificado de
  PRONIED confirma su función de "formular planes de intervención... para la construcción,
  mejoramiento, rehabilitación, sustitución, mantenimiento y equipamiento de la infraestructura
  educativa pública a nivel nacional".

## Funciones generales (conocimiento institucional, no transcripción literal)

MINEDU es el ente rector del sector Educación — formula, planifica, dirige, ejecuta, supervisa
y evalúa la política nacional educativa, en todos sus niveles y modalidades (educación básica,
superior pedagógica/tecnológica, técnico-productiva). Administra directamente el Padrón de
Instituciones Educativas (a través de ESCALE/UEE), la asignación de códigos modulares, y la
autorización/registro de funcionamiento de instituciones educativas públicas y privadas.

## Relación con Rastro

- `instituciones-educativas`: el Padrón Web (código modular, nivel/modalidad, gestión,
  ubicación, estado operativo) que se ingiere es, formalmente, el registro que MINEDU/ESCALE
  administra por su rol de ente rector — un `estado: "Activo"` es un dato administrativo
  oficial del ministerio, no una inferencia de terceros.
- La función de PRONIED sobre infraestructura educativa (confirmada en el texto real del
  decreto) es relevante como candidato de cruce futuro: una IE con obra de infraestructura
  reportada en `infobras` (naturaleza "Educación") podría cruzarse contra el padrón de
  `instituciones-educativas` por código modular/ubigeo — no implementado hoy, pero el mandato
  legal de PRONIED (ejecutar/mantener infraestructura educativa) es la base para justificar ese
  cruce si se construye.
