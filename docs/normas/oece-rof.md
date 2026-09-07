# ROF — OECE (Organismo Especializado para las Contrataciones Públicas Eficientes)

**Fuente**: `oece-rof.pdf` — texto real extraído vía `pdf-parse` (21 páginas, con contenido).
Descargado de `gob.pe/institucion/oece/informes-publicaciones/6668942-...`, publicado
2025-04-12.

**Hallazgo importante para el catálogo de Rastro**: la entidad que administra las
contrataciones públicas **ya no se llama OSCE** (Organismo Supervisor de las Contrataciones del
Estado) — fue reorganizada como **OECE**. El ROF de OSCE que aparece en búsquedas está marcado
explícitamente "(NO VIGENTE)" en `gob.pe`. `docs/APRENDIZAJES_INGENIERIA_INVERSA_OSCE.md` (ya
existente en el repo) y las `description` de `compras_publicas_*`/`proveedores_sancionados_*`
en `mcp-server/src/catalog.ts` ya usan "OECE" en el texto — este ROF confirma que el nombre
correcto y vigente de la entidad es OECE, no OSCE (que queda como el nombre histórico/legado
que aún aparece en RUC, contratos antiguos y en la sigla del RNP que administra).

## Naturaleza jurídica (Artículo 1, no transcrito literal — resumen)

Organismo técnico especializado adscrito al MEF, rector del sistema de contrataciones públicas,
sucesor de OSCE tras la reforma de la Ley N° 32069 (nueva Ley General de Contrataciones
Públicas).

## Funciones Generales (Artículo 5, texto real)

a) Brindar asistencia técnica y orientación en normativa de contratación pública.
b) **Supervisar de forma selectiva o aleatoria** la gestión de los procesos de contratación,
   **incluyendo los contratos menores** — base legal directa de por qué existe el universo de
   `minor_contracts`/contratos menores que `compras-publicas` (observatorio SEACE) reconstruye.
c) Orientar sobre la Plataforma Digital para las Contrataciones Públicas (Pladicop), **incluido
   el Registro Nacional de Proveedores (RNP)** — RNP es la fuente de `proveedores-sancionados`.
d)–e) Administrar, diseñar e **integrar datos** de las herramientas digitales (Pladicop), y
   **evaluar el desempeño de entidades y proveedores** a partir de esos datos — esto es
   literalmente el mandato legal detrás de las señales de sobrecosto/concentración/recurrencia
   que `compras-publicas` ya calcula (S01-S13), no una interpretación libre del proyecto.
f)–g) Diseñar directivas y **absolver consultas** sobre la normativa.
h) **Administrar el Registro Nacional de Proveedores (RNP)** — confirma que las sanciones que
   ingiere `proveedores-sancionados` son del RNP administrado por OECE, no de otra fuente.
j)–m) Administrar el Banco de Laudos Arbitrales, el Registro de Instituciones Arbitrales, y
   sancionarlas si corresponde.

## Relación con Rastro

- `compras-publicas`: OCDS/releases (procesos de contratación mayor cuantía) y el "observatorio"
  de contratos menores (SEACE) que ingiere están directamente dentro del mandato de supervisión
  del Artículo 5.b — incluyendo explícitamente "contratos menores".
- `proveedores-sancionados`: el RNP (fuente del conector) es administrado por OECE por mandato
  expreso del Artículo 5.c/h — una inhabilitación en el RNP es, legalmente, un acto de la
  autoridad rectora del sistema de contrataciones, no una lista informal.
- El poder de "sancionar a las instituciones arbitrales" (Artículo 5.m) es un mandato distinto
  al de sancionar proveedores — no confundir ambos universos si en el futuro se ingiere el
  Banco de Laudos Arbitrales.
