# ROF — MINAM (Ministerio del Ambiente)

**Fuente**: `minam-rof.pdf` — Texto Integrado del ROF (Resolución Ministerial N° 108-2023-MINAM),
base Decreto Supremo N° 022-2021-MINAM. Texto real extraído (181,178 caracteres). Descargado de
`gob.pe/institucion/minam/normas-legales/4033580-108-2023-minam` (2026-09-07).

## Naturaleza jurídica (Artículo 1, texto real)

Ministerio del Poder Ejecutivo, personería jurídica de derecho público, pliego presupuestal.

## Competencias y Funciones Generales (Artículo 3, texto real — completo, sin resumir)

Materias de competencia nacional: **Conservación y Uso Sostenible de los Recursos Naturales,
Diversidad Biológica y Áreas Naturales Protegidas, Calidad Ambiental, Cambio Climático,
Gestión y Manejo de Residuos Sólidos, Manejo de Suelos, Gobernanza Ambiental**.

Comprende explícitamente: "el establecimiento de la política, la normatividad específica, la
información, **la fiscalización, el control y la potestad sancionadora** por el incumplimiento
de las normas ambientales en el ámbito de su competencia, la misma que puede ser ejercida **a
través de sus organismos públicos adscritos correspondientes**" — base legal directa de la
delegación de fiscalización a OEFA (ver `oefa-rof.md`).

Funciones rectoras (Artículo 3.1, selección):
a) Formular, planificar, dirigir, coordinar, ejecutar, supervisar y evaluar la Política Nacional
   del Ambiente, aplicable a todos los niveles de gobierno.
b) Garantizar el cumplimiento de las normas ambientales.

## Relación con Rastro

- `residuos-solidos`: **"Gestión y Manejo de Residuos Sólidos" está listado textualmente como
  una de las materias de competencia nacional del MINAM** (Artículo 3) — el sistema SIGERSOL
  que ingiere esta app existe por mandato directo de esta competencia, no es un registro
  administrativo secundario.
- `infracciones-ambientales`: el texto real del Artículo 3 confirma explícitamente que la
  potestad sancionadora ambiental "puede ser ejercida a través de sus organismos públicos
  adscritos" — esta es la base legal exacta que conecta el mandato de MINAM con la ejecución
  real de OEFA/RUIAS, no una inferencia del proyecto.
- Ambas apps (`residuos-solidos` y `infracciones-ambientales`) comparten el mismo ministerio
  rector (MINAM) pero ejercido por vías distintas: `residuos-solidos` mide una competencia
  ejercida más directamente por el sector (vía SIGERSOL), mientras `infracciones-ambientales`
  mide la ejecución delegada a un organismo adscrito (OEFA) — un cruce futuro entre ambas
  debería reconocer esta diferencia de "quién ejecuta" antes de sumar ambos universos como si
  fueran la misma fuente.
