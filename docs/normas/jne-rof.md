# ROF — JNE (Jurado Nacional de Elecciones)

**Fuente**: `jne-rof.pdf` — Texto Integrado del ROF, modificado el 17 de junio de 2025
(Resolución N° 000108-2025-P-JNE). Texto real extraído (143,507 caracteres). Descargado de
`gob.pe/institucion/jne/informes-publicaciones/7068465-...` (2026-09-07).

## Naturaleza (Artículo 4, texto real)

Organismo **autónomo de carácter constitucional**, personería jurídica de derecho público,
plena autonomía funcional, administrativa, técnica, económica y financiera, pliego
presupuestal propio.

## Competencias (Artículo 6, texto real — completo)

Administra justicia en materia electoral; fiscaliza la legalidad del sufragio, de los procesos
electorales, del referéndum y de la elaboración de padrones electorales; **mantiene y custodia
el Registro de Organizaciones Políticas**; **proclama los resultados** del referéndum o consulta
popular; **proclama y expide la credencial de los candidatos elegidos** en los procesos
electorales; declara la nulidad de procesos electorales en los casos que señala la Constitución;
absuelve consultas de otros organismos del Sistema Electoral.

## Ámbitos funcionales (Artículo 7, texto real)

Jurisdiccional, Fiscalizador, Educativo, Normativo, Administrativo y **Registral**.

## Relación con Rastro

- `autoridades-electas`: el dataset que ingiere esta app (autoridades **proclamadas**, no
  candidatos) tiene base legal directa en el Artículo 6 — "proclama y expide la credencial de
  los candidatos elegidos" es exactamente la competencia que distingue una proclamación oficial
  (dato que ingiere Rastro) de una candidatura o postulación (dato que Rastro deliberadamente
  **no** ingiere, ver `docs/data-contracts/jne-autoridades-electas.md`). Esta distinción no es
  una decisión de diseño del proyecto — refleja la competencia legal real del JNE, que solo
  proclama resultados finales, no gestiona candidaturas (eso es competencia de la ONPE en la
  organización del proceso y del propio JNE en la calificación de candidaturas, pero la
  "proclamación" es un acto jurídico distinto y posterior).
