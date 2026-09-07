# Marco legal de gobierno subnacional (regional / provincial / distrital) — La Libertad

**Nivel distinto al resto de `docs/normas/`**: los demás archivos de esta carpeta documentan el ROF
de las entidades *nacionales* dueñas de cada fuente de datos de Rastro. Este documento cubre el
**marco legal habilitante** que rige a los gobiernos subnacionales en sí (regional, provincial,
distrital) — el nivel donde vive el foco geográfico de Rastro (La Libertad) — más los instrumentos
propios del Gobierno Regional de La Libertad (GORE LL).

**Alcance deliberado**: no se descargó el ROF de cada una de las ~83 municipalidades distritales de
La Libertad — no es factible ni el nivel de detalle que un cruce de Rastro necesita. Lo que se
documenta aquí es la ley orgánica nacional que define qué puede/debe hacer *cualquier* gobierno
regional o municipal, más los instrumentos de gestión propios del GORE La Libertad (el único
gobierno regional que Rastro ya cubre).

## 1. Ley N° 27867 — Ley Orgánica de Gobiernos Regionales (LOGR)

**Fuente**: `https://cdn.www.gob.pe/uploads/document/file/2446552/451.pdf.pdf` (copia oficial
redistribuida en `gob.pe/institucion/regionloreto`). Texto real extraído (123,057 caracteres).
**Limitación importante**: es la publicación original de El Peruano del 18 de noviembre de 2002,
**sin las actualizaciones posteriores incorporadas** (la LOGR ha sido modificada varias veces desde
entonces — ej. por leyes de descentralización fiscal y las reformas de 2022/2023 que también
tocaron la Ley 27972, ver más abajo). El otro candidato descargado en esta pasada
(`leyes.congreso.gob.pe/.../27867-LEY.pdf`, 20MB) resultó ser un escaneo sin capa de texto — se
descartó. Tratar los artículos citados abajo como el texto base histórico, no como "texto vigente
consolidado 2026" — para eso se requeriría el compendio actualizado del Congreso o SPIJ, no
localizado con texto extraíble en esta pasada.

### Naturaleza y objeto (Artículo 1, texto real)

> "La presente Ley Orgánica establece y norma la estructura, organización, competencias y
> funciones de los gobiernos regionales. Define la organización democrática, descentralizada y
> desconcentrada del Gobierno Regional conforme a la Constitución y a la Ley de Bases de la
> Descentralización."

### Principio de subsidiariedad (Artículo 8.10, texto real)

> "El gobierno más cercano a la población es el más idóneo para ejercer las distintas funciones que
> le competen al Estado. Por consiguiente, el Gobierno Nacional no debe asumir competencias que
> pueden ser cumplidas eficientemente por los Gobiernos Regionales y éstos, a su vez, no deben
> involucrarse en realizar acciones que pueden ser ejecutadas eficientemente por los gobiernos
> locales, evitando la duplicidad de funciones."

Este principio es la base legal exacta de por qué Rastro debe distinguir "quién ejecuta" en sus
cruces (mismo patrón ya documentado en `mtc-rof.md` para la competencia exclusiva vs. compartida) —
la LOGR y la LOM (ver abajo) reparten la misma materia entre 3 niveles, nunca la duplican por diseño.

### Competencias constitucionales (Artículo 9, texto real, selección)

Los gobiernos regionales son competentes para: aprobar su organización interna y presupuesto;
formular y aprobar el plan de desarrollo regional concertado; administrar sus bienes y rentas;
"promover y regular actividades y/o servicios en materia de agricultura, pesquería, industria,
agroindustria, comercio, turismo, energía, minería, vialidad, comunicaciones, educación, salud y
medio ambiente, conforme a Ley" (inciso g) — el ancla legal directa de por qué un Gobierno
Regional (no solo el Ejecutivo nacional) puede tener competencia sobre datos que Rastro ya cruza
(vialidad → `red-vial-subnacional`; educación → `instituciones-educativas`; ambiente →
`residuos-solidos`/`infracciones-ambientales`).

### Competencias exclusivas vs. compartidas (Artículo 10, texto real)

Confirma la misma arquitectura de dos niveles que ya se documentó para el MTC en `mtc-rof.md`:
"Los gobiernos regionales ejercen las competencias exclusivas y compartidas que les asigna la
Constitución, la Ley de Bases de la Descentralización y la presente Ley" — con las exclusivas
listadas en el Artículo 10.1 (planificar el desarrollo integral de su región, formular el PDRC,
aprobar su organización/presupuesto, "promover y ejecutar las inversiones públicas de ámbito
regional en proyectos de infraestructura vial, energética, de comunicaciones y de servicios básicos
de ámbito regional", entre otras).

### Funciones generales (Artículo 45, texto real)

Función normativa y reguladora, de planeamiento, administrativa y ejecutora, de promoción de
inversiones, y de "supervisión, evaluación y control" — fiscalizando "la gestión administrativa
regional, el cumplimiento de las normas, los planes regionales y la calidad de los servicios". Esta
última función es la base legal de por qué el GORE La Libertad *debe* tener sus propios planes
(PDRC, PEI, POI — ver `inventario-pesem-pei-poi-2025-2026.md`) y rendir cuentas sobre ellos.

## 2. Ley N° 27972 — Ley Orgánica de Municipalidades (LOM)

**Fuente**: `https://cdn.www.gob.pe/uploads/document/file/9972022/8133550-ley-organica-de-municipalidades-ley-n-27972.pdf`
(vía `gob.pe/institucion/jne/normas-legales/8133550-...`). Texto real extraído (284,895
caracteres), **versión "Actualizado al: 24 de marzo de 2025"** publicada por el Sistema Peruano de
Información Jurídica (SPIJ) del Ministerio de Justicia — sí incorpora las modificatorias recientes
(Ley N° 31433 de 2022, Ley N° 31812 de 2023, Ley N° 32096 de 2024, Ley N° 32269 de marzo 2025).
Esta es la ley orgánica con el texto más actualizado de las dos localizadas en esta pasada.

### Naturaleza y autonomía (Artículos I, II, texto real)

> "Los gobiernos locales son entidades, básicas de la organización territorial del Estado y canales
> inmediatos de participación vecinal en los asuntos públicos... Las municipalidades provinciales y
> distritales son los órganos de gobierno promotores del desarrollo local, con personería jurídica
> de derecho público y plena capacidad para el cumplimiento de sus fines."
>
> "Los gobiernos locales gozan de autonomía política, económica y administrativa en los asuntos de
> su competencia."

### Subsidiariedad (Artículo V, texto real — mismo principio que la LOGR Art. 8.10)

> "En el marco del proceso de descentralización y conforme al criterio de subsidiariedad, el
> gobierno más cercano a la población es el más idóneo para ejercer la competencia o función; por
> consiguiente el gobierno nacional no debe asumir competencias que pueden ser cumplidas más
> eficientemente por los gobiernos regionales, y éstos, a su vez, no deben hacer aquello que puede
> ser ejecutado por los gobiernos locales."

### El reparto provincial vs. distrital (Artículo 73, texto real — el más relevante para Rastro)

> "Las funciones específicas municipales que se derivan de las competencias se ejercen con carácter
> exclusivo o compartido entre las municipalidades provinciales y distritales... Dentro del marco de
> las competencias y funciones específicas establecidas en la presente ley, el rol de las
> municipalidades **provinciales** comprende: (a) Planificar integralmente el desarrollo local y el
> ordenamiento territorial, en el nivel provincial... (b) Promover, permanentemente la coordinación
> estratégica de los planes integrales de desarrollo **distrital**..."

El Artículo 73 lista 7 materias de competencia municipal (organización del espacio físico/uso del
suelo, servicios públicos locales, protección y conservación del ambiente, desarrollo y economía
local, participación vecinal, servicios sociales locales, prevención de drogas) — cada una repartida
entre exclusiva/compartida según el nivel. Relevante directo para Rastro:

- **2.1 Saneamiento ambiental, salubridad y salud** y **2.5 Seguridad ciudadana** — servicios
  públicos locales explícitamente listados como materia de competencia municipal (no solo
  nacional/regional), relevante para `seguridad-ciudadana` (MININTER a nivel nacional coexiste con
  competencia municipal directa sobre seguridad ciudadana local).
- **1.7 Infraestructura urbana o rural básica** y **1.8 Vialidad** — la base legal municipal/provincial
  de `red-vial-subnacional`, distinta y más local que la competencia regional del Art. 10 LOGR o la
  competencia nacional del MTC (ver `mtc-rof.md`) — son **3 niveles**, no 2, todos con alguna
  competencia vial según su ámbito.
- **3.1-3.5 Protección y conservación del ambiente** — "formular, aprobar, ejecutar y monitorear los
  planes y políticas locales en materia ambiental" es competencia municipal explícita, un tercer nivel
  además de MINAM (rector nacional) y OEFA (fiscalizador delegado) ya documentados en
  `minam-rof.md`/`oefa-rof.md` — relevante para `residuos-solidos`/`infracciones-ambientales`.

### Ejercicio exclusivo de las competencias (Artículo 75, texto real)

> "Ninguna persona o autoridad puede ejercer las funciones específicas que son de competencia
> municipal exclusiva. Su ejercicio constituye usurpación de funciones."

## 3. Instrumentos propios del Gobierno Regional de La Libertad (GORE LL)

El GORE LL migró su sitio institucional a la plataforma unificada `gob.pe/regionlalibertad`
(confirmado: `regionlalibertad.gob.pe` → 301 a `gob.pe/regionlalibertad`; las rutas antiguas de
`transparencia/documentos-de-gestion/*` devuelven 404 hoy, 2026-09-07 — el portal de transparencia
propio sigue existiendo en `regionlalibertad.gob.pe/transparencia/...` pero con slugs distintos a
los indexados por buscadores).

- **ROF del GORE LL**: Ordenanza Regional N° 000017-2023-GRLL-CR — confirmada su existencia vía
  búsqueda (portal `regionlalibertad.gob.pe/transparencia/documentos-de-gestion/rof`), **no se
  descargó el PDF ni se verificó su texto en esta pasada** — vacío de evidencia declarado, no
  asumido. Pendiente para una pasada dedicada si se necesita citar su articulado exacto.
- **PEI 2025-2030** y **POI 2026**: ver `inventario-pesem-pei-poi-2025-2026.md`.

## Relación con Rastro

Este marco legal es el fundamento de por qué Rastro tiene, además de las 20 entidades nacionales de
`docs/normas/`, un foco regional propio (`bcrp-la-libertad`, y el filtro `departamento=LA LIBERTAD`
que atraviesa `radar-ejecucion`, `infobras`, `radar-inversiones`, etc.): la LOGR y la LOM no crean
una jerarquía donde el nivel nacional "hace todo" y el regional/local "ejecuta" — crean **tres
titulares de competencia distintos** (nacional exclusiva, regional exclusiva/compartida, provincial
exclusiva/compartida, distrital exclusiva/compartida) que coexisten por diseño legal, no por
omisión. Cualquier cruce futuro de Rastro que compare "ejecución nacional" vs. "ejecución regional"
para una misma materia (vialidad, ambiente, seguridad) debe verificar primero, con este documento,
si la ley realmente asigna esa materia a ambos niveles o es exclusiva de uno — el mismo principio
que ya aplica `mtc-rof.md` para la competencia vial nacional vs. subnacional.
