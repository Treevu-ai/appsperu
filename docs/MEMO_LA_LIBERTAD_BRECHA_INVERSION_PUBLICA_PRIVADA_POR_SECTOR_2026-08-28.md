# Memo — La Libertad: brecha inversión pública vs. privada, por sector

> Análisis derivado de `docs/MEMO_LA_LIBERTAD_INVERSION_PUBLICA_PRIVADA_2026-08-28.md` (§5),
> con foco exclusivo en la lectura de brecha por sector. Datos re-extraídos en vivo el
> 2026-08-28, sobre el universo completo ya ingerido (no muestras truncadas).
>
> **Actualización 2026-08-28 (corrida posterior):** se agregó §6, la serie mensual de
> inversión pública de BCRP Sucursal Trujillo (`bcrp-la-libertad`, nueva app) — ver
> `docs/adr/0014-bcrp-la-libertad-sintesis-economica-ingesta-manual.md`. Se corrigió además un
> bug de correctitud en el parser (ver §6, nota al final).
>
> **Segunda actualización 2026-08-28:** se agregó §6.1 con un corte más reciente de BCRP
> (abril 2026, formato "presentación" — extraído a mano, no vía el conector automatizado).

## Metadatos

| Campo | Valor |
|---|---|
| Departamento | LA LIBERTAD |
| Fecha de corte | 2026-08-28 |
| Fuentes | `radar-inversiones` (4002, Invierte.pe — pública), `infobras` (4003, obras), `inversion-privada` (4012, VERTIX APP/PA + OxI — privada), `bcrp-la-libertad` (4013, BCRP Sucursal Trujillo — serie mensual de ejecución presupuestal) |
| Universo | Invierte.pe: 7,998/7,998 filas (paginado completo). INFOBRAS: 10,134 obras (snapshot nacional completo). VERTIX APP/PA: 22/22 La Libertad. OxI: 55/55 La Libertad. BCRP (vía `bcrp-la-libertad`, automatizado): 13 meses (Ene-25 a Ene-26), Anexo 10 completo. BCRP abril 2026: 1 corte adicional, extraído a mano (formato distinto, no soportado por el conector — ver §6.1). |

## 1. Resumen ejecutivo

La brecha más clara **no es de monto, es de presencia**: hay sectores donde el Estado invierte
a gran escala y el capital privado promovido por PROINVERSIÓN no tiene ningún proyecto en
cartera (Salud, Educación), y sectores donde ocurre lo inverso — el privado ya apostó y no hay
una obra pública equivalente en ejecución (Telecomunicaciones, Minería).

- **Alineados** (ambos actores activos, mismo sector): Transporte, Agua y saneamiento,
  Energía, Agricultura/irrigación. Son los cuatro sectores donde tiene sentido leer inversión
  pública y privada como parte de una misma apuesta territorial.
- **Solo Estado, sin cartera privada VERTIX**: Salud (S/ 9,656M en Invierte.pe, 0 proyectos
  APP/PA/OxI... aunque OxI sí tiene 10 proyectos de Salud, ver §3), Educación (S/ 7,384M, 0 en
  VERTIX APP/PA), Ambiente, Cultura y deporte, Orden público y seguridad.
- **Solo privado, sin obra pública equivalente**: Telecomunicaciones (US$ 977M en 8 proyectos
  PA, 0 como función propia en Invierte.pe — el gasto en telecom queda diluido dentro de
  "Comunicaciones", que en la muestra completa de La Libertad solo tiene 4 proyectos y
  S/ 431M) y Minería (US$ 118M en VERTIX, sin función propia en Invierte.pe ni en INFOBRAS
  para La Libertad).
- **OxI es el puente que faltaba**: a diferencia de APP/PA (sin CUI/SNIP), OxI sí cruza con
  Invierte.pe por código — 45/55 proyectos OxI de La Libertad confirmados en la misma base de
  inversión pública. Eso permite ver Salud como un sector con actividad privada real (OxI,
  S/ 560M en 10 proyectos) aunque la cartera APP/PA de PROINVERSIÓN no tenga ningún proyecto
  de Salud ahí.

## 2. Metodología y límites de comparabilidad

**No se suman montos entre columnas.** Invierte.pe e INFOBRAS están en soles; VERTIX APP/PA
en dólares; OxI en soles pero con una base de cálculo distinta ("monto de inversión
referencial" vs. "monto viable"/"costo actualizado"). Cada columna se lee por separado.

**Las taxonomías de sector no son la misma taxonomía.** `funcion` de Invierte.pe es la
clasificación funcional del gasto público (MEF); `sectorEntidad` de INFOBRAS es más bien el
ministerio/nivel de gobierno responsable de la obra, no un sector económico limpio (por eso
"Gobiernos Locales" y "Gobiernos Regionales" concentran la mayoría de obras — no se incluyen en
la tabla de §3, ver `docs/MEMO_LA_LIBERTAD_INVERSION_PUBLICA_PRIVADA_2026-08-28.md` §3 para el
detalle completo); `Sector` de VERTIX es una clasificación económica de PROINVERSIÓN. El
agrupamiento de §3 es una aproximación editorial para hacer la comparación legible, no un
cruce por clave.

**Ningún cruce implica que sea el mismo proyecto.** Que Transporte tenga actividad en las
cuatro fuentes no significa que la ejecución de obras esté financiando la cartera privada de
ese sector, ni que sean los mismos kilómetros de vía.

## 3. Tabla maestra por sector

| Sector | Invierte.pe pública (S/ M, proyectos) | INFOBRAS (obras, paralizadas, S/ M viable) | VERTIX APP/PA privada (US$ M, proyectos) | OxI privado-impuestos (S/ M, proyectos) |
|---|---|---|---|---|
| Transporte | 13,694 (2,074) | 89 obras, 2 paraliz., 7,821 | 692 (2) | 416 (26) |
| Agua y saneamiento | 8,246 (1,109) | 198 obras, 1 paraliz., 839 | 809 (1) | 11 (1) |
| Energía | 1,003 (247) | 40 obras, 3 paraliz., 256 | 701 electricidad + 145 hidrocarburos (3) | — |
| Agricultura / agropecuaria / irrigación | 6,260 (521) | 158 obras, 21 paraliz., 4,819 | 460 (5) | — |
| Salud | 9,656 (740) | 28 obras, 3 paraliz., 1,310 | — | 560 (10) |
| Educación | 7,384 (1,219) | 109 obras, 7 paraliz., 1,277 | — | 203 (9) |
| Telecomunicaciones | 431 (4, como "Comunicaciones") | incluido en "Transportes y Comunicaciones" | 977 (8) | — |
| Minería | — (sin función propia) | — (sin sector propio) | 118 (1) | — |
| Ambiente | 889 (150) | — | — | — |
| Cultura y deporte | 1,352 (707) | — | — | — |
| Orden público y seguridad | 4,040 (135) | — | — | 26 (1) |
| Vivienda y desarrollo urbano | 517 (510) | 65 obras (Vivienda Construcción y Saneamiento) | — | — |
| Mercado de capitales | — | — | 14 (2) | — |

(`—` significa cero proyectos con esa clave en esa fuente para La Libertad en este corte, no
ausencia de datos.)

## 4. Lectura de brecha, sector por sector

### 4.1 Alineados — Estado y privado apostando al mismo sector

- **Transporte**: el sector con más actividad en las cuatro fuentes. Invierte.pe lidera por
  monto (S/ 13,694M en 2,074 proyectos, mayoritariamente obra vial local/regional pequeña);
  VERTIX APP/PA aporta 2 concesiones grandes (US$ 692M — probablemente corredores viales
  nacionales, fuera del alcance de la ejecución local); OxI suma 26 proyectos de vías urbanas
  municipales (S/ 416M) — el nivel más fino de los tres, y el único con cruce confirmado
  contra Invierte.pe.
- **Agua y saneamiento**: Invierte.pe domina en volumen (1,109 proyectos, mayoría obra
  municipal pequeña de agua potable/alcantarillado). VERTIX APP/PA tiene un solo proyecto pero
  de gran escala (PTAR Trujillo, US$ 809M, aún en fase de estructuración — no adjudicado). OxI
  aporta solo 1 proyecto (S/ 11M) — el sector con menor tracción OxI de los cuatro alineados.
- **Energía**: el más chico de los cuatro en monto público (S/ 1,003M), pero con presencia
  privada relevante (US$ 846M combinando electricidad e hidrocarburos, 3 proyectos APP). Sin
  actividad OxI — probablemente porque los proyectos energéticos grandes no encajan en el
  perfil de OxI (obras de menor escala, financiadas vía impuestos de empresas locales).
- **Agricultura/agropecuaria/irrigación**: monto público relevante (S/ 6,260M) con la mayor
  tasa de paralización de obras de los cuatro sectores alineados (21/158 obras INFOBRAS,
  13.3%) — posible foco de seguimiento aparte. VERTIX aporta 5 proyectos (US$ 460M).

### 4.2 Solo Estado — sin cartera APP/PA, candidatos a promoción

- **Salud** (S/ 9,656M público) y **Educación** (S/ 7,384M público) son los dos sectores con
  mayor inversión pública de La Libertad que **no tienen ningún proyecto en la cartera APP/PA
  de PROINVERSIÓN**. Salud sí tiene actividad OxI (10 proyectos, S/ 560M, incluyendo el mayor
  monto individual OxI del corte: Hospital Provincial de Tayabamba, S/ 231.7M) — es decir, el
  capital privado en Salud entra por la vía tributaria (Obras por Impuestos), no por concesión.
  Educación no tiene actividad privada en ninguna de las dos vías VERTIX salvo OxI (9
  proyectos, S/ 203M).
- **Ambiente** (S/ 889M) y **Cultura y deporte** (S/ 1,352M) — sin actividad privada VERTIX
  en ninguna modalidad en este corte.
- **Orden público y seguridad** (S/ 4,040M, el tercer mayor rubro público) — solo 1 proyecto
  OxI (S/ 26M), sin APP/PA.

### 4.3 Solo privado — sin obra pública equivalente identificable

- **Telecomunicaciones**: US$ 977M en 8 proyectos PA (todos concesiones de espectro/redes) es
  el segundo monto privado más alto del departamento, pero Invierte.pe no tiene una función
  "Telecomunicaciones" propia — el gasto queda mezclado dentro de "Comunicaciones" (solo 4
  proyectos, S/ 431M) o dentro de "Transportes y Comunicaciones" en INFOBRAS, sin poder
  aislar la parte de telecom. Es una limitación de comparabilidad, no evidencia de que no haya
  gasto público en telecom — solo que la taxonomía no permite verlo por separado.
- **Minería**: US$ 118M en 1 proyecto PA, sin función propia en Invierte.pe ni sector propio
  en INFOBRAS para La Libertad en este corte.

## 5. Límites honestos

- **La tabla de §3 es una lectura editorial, no un cruce por clave.** Los únicos cruces
  exactos del ecosistema son: `infobras ↔ radar-inversiones` (CUI), `inversion-privada` OxI
  `↔ radar-inversiones` (codigo_snip, 45/55 confirmado en La Libertad — ver ADR-0012), e
  `inversion-privada` GIS `↔ private_investment_projects` (IDPROYECTO=vertix_id, 151/156
  confirmado — ver ADR-0013). La cartera APP/PA **no tiene cruce exacto** con ninguna otra
  fuente — su presencia en la tabla es solo agregación por nombre de sector.
- **INFOBRAS "sector entidad" no es sector económico** — es en gran parte nivel de gobierno
  (Gobiernos Locales/Regionales concentran el 90%+ de las obras). La columna de §3 usa las
  categorías ministeriales que sí se mapean razonablemente a un sector (Transportes y
  Comunicaciones, Agricultura, Saneamiento, Salud, Educación, Energía y Minas, Vivienda) y
  omite el resto — ver el memo base (§3) para la tabla completa sin ese filtro.
- **"Sin actividad" no es "sin inversión"** — un sector sin proyectos APP/PA/OxI en este corte
  puede tener inversión privada fuera del universo VERTIX (inversión privada no promovida por
  PROINVERSIÓN, que este ecosistema no captura en absoluto).
- **No se convirtió dólares a soles** — cualquier tipo de cambio usado para "sumar" la tabla
  de §3 sería una cifra inventada, no proveniente de ninguna fuente ya ingerida en el
  ecosistema (no hay conector de tipo de cambio BCRP en el proyecto). Si se necesita esa
  comparación, hay que ingerir esa serie primero, no asumir un valor.
- **Invierte.pe (7,998 filas) es todo el universo ya ingerido para La Libertad**, pero eso no
  certifica el universo administrativo externo completo — ver
  `docs/data-contracts/invierte-detalle-inversiones.md`.

## 6. Serie mensual de inversión pública (BCRP Sucursal Trujillo) — completado 2026-08-28

Fuente nueva desde la última versión de este memo: `bcrp-la-libertad`
(`GET /api/indicadores?anexo=10`), que parsea el ANEXO 10 del reporte mensual "LA LIBERTAD:
Síntesis de Actividad Económica" del BCRP. A diferencia de `radar-ejecucion` (que da un
*snapshot acumulado* del año fiscal a la fecha de corte de la última corrida), BCRP publica
una **serie mensual real**, mes a mes — algo que ninguna otra fuente del ecosistema tiene para
La Libertad.

**Formación bruta de capital (inversión pública), por nivel de gobierno, S/ millones:**

| Mes | Total | Gob. Nacional | Gob. Regional | Gob. Locales |
|---|---:|---:|---:|---:|
| Ene-25 | 347 | 296 | 11 | 41 |
| Feb-25 | 201 | 125 | 20 | 56 |
| Mar-25 | 219 | 123 | 29 | 68 |
| Abr-25 | 266 | 104 | 99 | 63 |
| May-25 | 206 | 109 | 34 | 63 |
| Jun-25 | 226 | 62 | 73 | 91 |
| Jul-25 | 196 | 24 | 88 | 84 |
| Ago-25 | 178 | 28 | 67 | 83 |
| Set-25 | 203 | 48 | 76 | 79 |
| Oct-25 | 192 | 29 | 80 | 83 |
| Nov-25 | 292 | 141 | 59 | 92 |
| Dic-25 | 437 | 124 | 118 | 194 |
| **Ene-26** | **198** | **114** | **27** | **56** |

**Gasto no financiero total** (gastos corrientes + formación bruta de capital), S/ millones:
806 (Ene-25) → 1,349 (Dic-25, pico de cierre de año fiscal) → 757 (Ene-26).

**Lectura**: el Gobierno Nacional concentra la mayor parte de la inversión pública en los
meses de arranque del año fiscal (Ene-25: 296/347 = 85%) y cae fuerte a mitad de año (Jun-Oct
2025: entre 24 y 48 de los ~200 mensuales), mientras Gobierno Regional y Locales toman más
peso relativo en esos meses — un patrón de estacionalidad que ninguna de las otras fuentes de
este memo (Invierte.pe, INFOBRAS, VERTIX) puede mostrar, porque ninguna trae resolución
mensual consistente para La Libertad.

**Por qué no se cruza numéricamente contra `radar-ejecucion` todavía**: se verificó en vivo —
`radar-ejecucion` solo tiene cortes de agosto 2026 (22, 24 y 26 de agosto), acumulado del año
fiscal 2026 a esa fecha; el PDF de BCRP ya ingerido es de enero 2026, un mes puntual. No hay
un mes en común entre ambas fuentes con los datos actualmente cargados — el cruce requeriría
descargar manualmente el PDF de BCRP de julio o agosto 2026 (bloqueado por WAF, ver
ADR-0014) o esperar un corte de `radar-ejecucion` que cubra enero 2026 específicamente. Se
deja como pendiente real, no fabricado.

### 6.1 Corte adicional: abril 2026 (`docs/presentacion-la-libertad-04-2026.pdf`) — extraído manualmente, no vía el conector

El usuario descargó un segundo reporte de BCRP más reciente que enero: **abril 2026**, en un
**formato distinto** ("presentación" tipo diapositivas, 10 páginas, publicado 28-jun-2026).
No tiene la estructura `ANEXO N` con series de 13 meses que sí tiene el reporte "Síntesis"
completo — trae solo el mes actual y el acumulado del año, en tablas de 2 columnas de período.
`bcrp-la-libertad` (`pdf-connector.ts`) **no reconoce este formato** — `splitByAnexo` no
encontraría ningún encabezado `ANEXO N` y fallaría explícitamente (comportamiento diseñado, no
un bug). Los valores de abajo se transcribieron a mano de la página 10 del PDF, no vía el
conector — deben tratarse como una lectura puntual, no como parte de la serie automatizada.

**Inversión pública (formación bruta de capital), MEF — S/ millones:**

| Nivel de gobierno | Abr-25 | Abr-26 | Var.% real | Ene-Abr 2025 | Ene-Abr 2026 | Var.% real |
|---|---:|---:|---:|---:|---:|---:|
| Gobierno Nacional | 104 | 79 | -27,0 | 648 | 436 | -34,4 |
| Gobierno Regional | 84 | 58 | -33,8 | 158 | 167 | +2,6 |
| Gobiernos Locales | 63 | 66 | *(ilegible en la extracción — el PDF muestra ",3", probablemente un dígito recortado)* | 227 | 261 | +11,6 |
| **Total** | **251** | **202** | **-22,5** | **1,034** | **865** | **-18,6** |

Avance de ejecución a abril 2026: 26,0% del PIM (vs. 28,5% a abril 2025).

**Esto tampoco cierra el cruce con `radar-ejecucion`** — Ene-Abr 2026 (BCRP) sigue sin
coincidir con el corte de `radar-ejecucion` (acumulado a agosto 2026). Sí acota más el
pendiente: con dos cortes de BCRP (enero puntual, abril puntual + acumulado Ene-Abr) la
brecha de fechas con `radar-ejecucion` se redujo de "ningún dato posterior a enero" a "datos
hasta abril", pero sigue faltando el tramo mayo-agosto 2026 para empatar con el corte actual
de `radar-ejecucion`.

**Nota de diseño no resuelta**: si BCRP publica el formato "presentación" con más frecuencia
o más rápido que el "Síntesis" completo (este de abril salió el 28 de junio, ~2 meses de
rezago; el de enero salió con un rezago similar), podría valer la pena construir un segundo
parser para ese formato — pero es un formato con menos detalle (solo 2 columnas de período,
sin la serie de 13 meses) y una estructura completamente distinta (sin `ANEXO N`, tablas
mezcladas con texto narrativo en la misma página). No se construyó en esta sesión; queda como
decisión pendiente, no una limitación técnica confirmada.

**Corrección aplicada durante esta revisión**: al construir esta serie se encontró que el
parser de `bcrp-la-libertad` pisaba entre sí las filas "Gobierno nacional/regional/locales"
del ANEXO 10 (se repiten 6 veces bajo distintas categorías de gasto — Gastos Corrientes,
Remuneraciones, Formación Bruta de Capital, etc. — y la clave única no las distinguía). Se
corrigió el parser y el esquema (`seccion` ahora es parte de la clave única) y se re-ingirió
el PDF; los valores de la tabla de arriba ya están verificados contra el CUADRO N°09 original
del PDF (Ene-26: GN=114, GR=27, GL=56 — coincide exacto).

## 7. Reproducibilidad

```bash
# Inversión pública, paginada completa (agregación por función en cliente)
curl "http://localhost:4002/api/investments?departamento=LA+LIBERTAD&limit=5000&offset=0"
curl "http://localhost:4002/api/investments?departamento=LA+LIBERTAD&limit=5000&offset=5000"

# Obras públicas
curl "http://localhost:4003/api/public-works?departamento=LA+LIBERTAD"

# Cartera privada VERTIX APP/PA
curl "http://localhost:4012/api/projects?departamento=LA+LIBERTAD"

# Serie mensual de inversión pública (BCRP Sucursal Trujillo, ejecución presupuestal)
curl "http://localhost:4013/api/indicadores?anexo=10"

# OxI y su cruce con Invierte.pe
curl "http://localhost:4012/api/oxi?departamento=LA+LIBERTAD"
curl "http://localhost:4012/api/crossref/oxi?departamento=LA+LIBERTAD"
```

## 8. Próximos pasos sugeridos

1. Si se quiere aislar el gasto público en Telecomunicaciones dentro de "Comunicaciones"/
   "Transportes y Comunicaciones", habría que revisar la subfunción o el nombre del proyecto
   fila por fila — no está disponible como filtro directo.
2. La brecha Salud/Educación (alto gasto público, cero APP/PA) es candidata natural para un
   memo de "oportunidad de promoción de inversión" dirigido a PROINVERSIÓN — fuera de alcance
   de este memo, que es descriptivo.
3. Agricultura tiene la tasa de paralización de obras más alta de los sectores alineados
   (13.3%) — candidato a un memo de seguimiento de ejecución aparte.
4. ~~Agregar la serie mensual de BCRP como validación de la inversión pública.~~ Hecho — ver
   §6. El cruce numérico exacto contra `radar-ejecucion` (mismo mes en ambas fuentes) sigue
   pendiente: requiere descargar manualmente un PDF de BCRP más reciente (jul/ago 2026, para
   que coincida con el corte actual de `radar-ejecucion`) — bloqueado por el mismo WAF de
   ADR-0014, no por falta de datos.
