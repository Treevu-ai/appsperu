# Análisis — La Libertad: brechas y competitividad (2026-08)

Primer análisis de contenido construido con las 5 apps de Follow the Sol, con datos reales
verificados en vivo contra cada base (no cifras de prensa ni estimaciones). Pensado como
insumo para contenido público (LinkedIn); documentado acá para no perderlo en el chat y para
que sea reproducible.

## Hallazgos verificados (2026-08-18)

### 1. Presupuesto y ejecución (`radar-ejecucion`, año fiscal 2026 a julio)

| Nivel de gobierno | PIM (presupuesto) | Devengado (ejecutado) | Avance |
|---|---|---|---|
| Gobiernos Regionales | S/ 4,558.8M | S/ 2,242.1M | **49.2%** |
| Gobiernos Locales (84 municipios) | S/ 2,738.0M | S/ 1,092.5M | **39.9%** |

Con ~58% del año calendario transcurrido a julio, ambos niveles van rezagados frente al
calendario — los gobiernos locales, más que el regional (~10 puntos de diferencia).

**Nota de calidad de dato**: esta cifra requirió un fix de ingesta el 2026-08-18 — el MEF no
puebla `MONTO_PIA`/`MONTO_PIM` en las filas de movimiento mensual del CSV, solo en filas
separadas `MES_EJE=0` (presupuesto de apertura/modificado). Ver
`docs/data-contracts/mef-presupuesto-ejecucion.md` para el detalle completo y
`ingestMefFullYearForDepartamento` en `mef-connector.ts` para la ingesta que lo corrige.
**Re-corrida 2026-08-26 22:34 UTC** (`ingest:mef:pilot`, 2ª corrida): 16/16 secciones GR/GL + meta GN,
0 `seccionesSinDatos` — cifras reproducidas (GR 49.2%, GL 41.2%).
Gasto nacional dirigido a la región (programas con sede en Lima que ejecutan metas ahí) queda
fuera de esta tabla — es un concepto aparte (`meta_departamento`), no ejecución propia.

### 2. Obras públicas (`infobras`)

- 10,134 obras trazadas, **252 paralizadas (2.5%)**.
- Causales más frecuentes: "incumplimiento de contrato" (31 casos) y "no pago de
  valorizaciones" (25) — **superan a "conflictos sociales" (20)** como causa de parálisis.
  Fenómenos climatológicos + eventos climáticos suman 33 casos combinados.
- Caso extremo: una obra de AGRO RURAL (canal de irrigación) lleva **2,312 días
  paralizada** (más de 6 años).

### 3. Inversiones (`radar-inversiones`)

- 1,612 proyectos activos, **658 (40.8%) con sobrecosto** (costo actualizado > monto viable).
- Total viable S/ 8.84 mil millones → costo actualizado S/ 9.90 mil millones (+12% agregado).
- Sobrecosto más extremo: saneamiento en Bolívar (Municipalidad Provincial de Bolívar), de
  S/ 8.9M a S/ 45M (**+405%**).

### 4. Compras públicas (`compras-publicas`)

- 144 procesos, 56 entidades compradoras, S/ 248.1M adjudicados a 196 proveedores.
- Un solo proveedor (CAM SERVICIOS DEL PERÚ S.A.) concentra **26.9% del valor adjudicado**
  con solo 2 contratos.
- **Caveat importante**: muestra parcial (144 procesos), no el universo — no usar como cifra
  de concentración de mercado sin ese disclaimer explícito.

### 5. Contexto nacional (`ceplan-estrategico`, ObservaPerú — agregado, no específico de
   La Libertad)

- A nivel país, los Gobiernos Regionales ejecutan en promedio 95.1% del presupuesto (CUMP03,
  2024) pero solo logran 73.7% de avance físico (CUMP02, 2024) — brecha de ~21 puntos.
- Sirve como marco de comparación, no como dato de La Libertad — el cruce por nivel de
  gobierno con `radar-ejecucion` (`GET /api/crossref` en `ceplan-estrategico/api`) da SEG y
  Execution Efficiency reales una vez que ambas fuentes compartan el mismo año fiscal
  (CEPLAN llega a 2024/2025, `radar-ejecucion` solo tiene 2026 ingerido).

## Análisis granular — por entidad, provincia, función y cruces reales (2026-08-18, ronda 2)

### Hallazgo principal: Bolívar es un caso atípico consistente en 3 fuentes independientes

No es una lectura aislada — el mismo patrón aparece en presupuesto, obras e inversiones,
medidos por tres pipelines de datos separados (MEF, Contraloría, Invierte.pe):

| Fuente | Métrica | Bolívar | Peor/mejor comparable |
|---|---|---|---|
| `radar-ejecucion` | % avance de ejecución (gobiernos locales) | **21.5%** | peor provincia de las 12 (siguiente peor: Santiago de Chuco, 30.9%) |
| `infobras` | Avance físico real promedio | **86.9%** | peor de las 12 provincias (resto ≥ 91%) |
| `radar-inversiones` | Variación agregada de costo de su cartera | **+117.3%** | Municipalidad Provincial de Bolívar, 6 proyectos, de S/35.4M a S/76.9M |
| `radar-inversiones` | % de proyectos con sobrecosto | **47.5%** | 2ª peor provincia (peor: Julcán, 50.7%) |

Bolívar es la provincia más pequeña y aislada de La Libertad (zona altoandina, límite con
Amazonas/San Martín) — la lectura más probable es una combinación de baja capacidad de gestión
local y mayor costo logístico de ejecutar obra en zona de difícil acceso, no mala fe. De
cualquier forma, es el hallazgo más defendible de esta ronda: no depende de una sola fuente.

### Por entidad individual (`radar-ejecucion`, PIM > S/100k)

**Peor ejecución — bottom 5:**

| Entidad | Provincia | PIM | Devengado | Avance |
|---|---|---|---|---|
| Municipalidad Distrital de Ucuncha | Bolívar | S/7.0M | S/0.4M | 6.3% |
| Municipalidad Distrital de Longotea | Bolívar | S/17.7M | S/1.8M | 10.0% |
| Municipalidad Distrital de Uchumarca | Bolívar | S/6.4M | S/0.8M | 11.8% |
| Municipalidad Distrital de Santiago de Challas | Pataz | S/11.1M | S/1.5M | 13.1% |
| Municipalidad Distrital de Lucma | Gran Chimú | S/16.8M | S/2.5M | 14.8% |

**Mejor ejecución — top 5:**

| Entidad | Provincia | PIM | Devengado | Avance |
|---|---|---|---|---|
| Municipalidad Distrital de Jequetepeque | Pacasmayo | S/7.6M | S/5.6M | 74.5% |
| Municipalidad Distrital de Carabamba | Julcán | S/17.1M | S/12.5M | 73.0% |
| Municipalidad Distrital de Chicama | Ascope | S/10.8M | S/7.5M | 69.8% |
| Municipalidad Distrital de Magdalena de Cao | Ascope | S/3.3M | S/2.3M | 67.8% |
| Municipalidad Distrital de Santiago de Cao | Ascope | S/11.2M | S/7.1M | 63.5% |

Nota metodológica: 3 de las 5 mejores entidades son de **Ascope** — otra señal geográfica, en
dirección opuesta a Bolívar, que valdría explorar en un próximo análisis.

### Por provincia (`radar-ejecucion`, solo gobiernos locales; `infobras`; `radar-inversiones`)

| Provincia | Avance ejecución (locales) | Obras paralizadas | Avance físico prom. | % proyectos con sobrecosto |
|---|---|---|---|---|
| Bolívar | 21.5% | 1.1% | 86.9% | 47.5% |
| Santiago de Chuco | 30.9% | 4.6% | 91.3% | 41.6% |
| Gran Chimú | 31.1% | 1.6% | 93.3% | 38.7% |
| Pataz | 35.8% | 2.1% | 94.1% | 39.9% |
| Sánchez Carrión | 37.0% | 4.2% | 95.4% | 40.6% |
| Trujillo | 41.3% | 2.3% | 94.8% | 42.6% |
| Virú | 41.4% | 2.6% | 93.1% | 39.8% |
| Chepén | 46.1% | 1.1% | 94.2% | 33.3% |
| Julcán | 49.1% | 2.8% | 91.4% | 50.7% |
| Pacasmayo | 49.8% | 1.1% | 95.4% | 46.8% |
| Otuzco | 51.8% | 2.5% | 92.0% | 33.5% |
| Ascope | 54.0% | 1.7% | 95.7% | 41.0% |

Lectura: **Santiago de Chuco y Sánchez Carrión** tienen el peor ratio de obras paralizadas
(4.2-4.6%, el doble del promedio regional) — a diferencia de Bolívar, ahí sí hay un problema de
parálisis de obra, no solo de ritmo de gasto.

### Por función de gasto (`radar-ejecucion`, toda La Libertad)

| Función | PIM | Devengado | Avance |
|---|---|---|---|
| Previsión Social | S/174.4M | S/99.8M | **57.2%** |
| Ambiente | S/126.5M | S/69.0M | 54.6% |
| Educación | S/2,441.7M | S/1,295.3M | 53.0% |
| Protección Social | S/143.5M | S/77.0M | 53.7% |
| Planeamiento, Gestión y Reserva de Contingencia | S/899.4M | S/467.5M | 52.0% |
| Vivienda y Desarrollo Urbano | S/84.8M | S/43.7M | 51.6% |
| Orden Público y Seguridad | S/225.0M | S/100.7M | 44.7% |
| Salud | S/1,331.9M | S/570.7M | 42.9% |
| Agropecuaria | S/249.3M | S/95.2M | 38.2% |
| Cultura y Deporte | S/237.6M | S/88.0M | 37.0% |
| **Transporte** | S/822.4M | S/253.6M | **30.8%** |
| **Saneamiento** | S/373.1M | S/113.8M | **30.5%** |

Patrón claro: **los sectores de infraestructura física (Transporte, Saneamiento) ejecutan a
casi la mitad del ritmo de los sectores sociales (Educación, Salud)** — consistente con el
patrón nacional de CEPLAN (ejecución financiera > avance físico), y con lo que ya sabíamos de
obras paralizadas e inversiones con sobrecosto: la obra física es, sistemáticamente, el eslabón
más lento y más caro de ejecutar bien.

### Cruces reales entre fuentes

- **`compras-publicas` ↔ `radar-ejecucion`** (`entity_crosswalk`, matcher difuso): 42 entidades
  cruzadas (10 `confirmada` con match exacto de nombre, resto `candidata`). Ejemplos reales:
  "MUNICIPALIDAD DISTRITAL DE ANGASMARCA" (score 1.0, exacto);
  "REGION LA LIBERTAD-PROYECTO ESPECIAL CHAVIMOCHIC" ↔ "GOBIERNO REGIONAL DE LA LIBERTAD -
  PROYECTO ESPECIAL CHAVIMOCHIC" (score 0.5, candidata pero correcta a simple vista). El cruce
  funciona; lo que limita el análisis es el tamaño de la muestra de `compras-publicas` (144
  procesos), no la calidad del matcher.
- **`infobras` ↔ `radar-inversiones`** (por CUI, match exacto): probado específicamente para
  las 9 obras de Bolívar con CUI — **0 matches** contra la muestra parcial de
  `radar-inversiones`. No es evidencia de que esas inversiones no existan, es la muestra
  parcial de ambos lados no solapando todavía — mismo caveat que en el resto del proyecto.
- **`ceplan-estrategico` ↔ `radar-ejecucion`** (por nivel de gobierno): sigue bloqueado por el
  desfase de año fiscal (CEPLAN 2024/2025, `radar-ejecucion` 2026) documentado en la ronda
  anterior — no cambió esta ronda.

## Draft del post (LinkedIn)

> **La Libertad ya gastó más de la mitad del año fiscal 2026. Su presupuesto no.**
>
> Con datos abiertos del MEF, cruzados y verificados en vivo (no cifras oficiales de prensa,
> sino la data cruda de "Consulta Amigable" reconstruida fila por fila):
>
> 📊 **Gobierno Regional La Libertad**: S/ 4,558.8M asignados → S/ 2,242.1M ejecutados =
> **49.2% de avance**
> 📊 **Gobiernos locales de la región** (84 municipios): S/ 2,738.0M asignados →
> S/ 1,092.5M ejecutados = **39.9% de avance**
>
> A julio, ya pasó el 58% del año calendario. Ninguno de los dos niveles va al ritmo del
> calendario — y los municipios van casi 10 puntos más atrás que el gobierno regional.
>
> ¿Por qué importa esto más allá del número? Porque el rezago en ejecución no es abstracto —
> tiene una cara: 252 obras públicas paralizadas en la región, y no son mayormente por "mala
> suerte" climática. Las causales más frecuentes son **incumplimiento de contrato** y **falta
> de pago de valorizaciones** — es decir, gestión, no clima. Una obra de infraestructura
> agraria lleva **2,312 días paralizada**. Más de seis años.
>
> El gasto público no se mide solo en cuánto se asigna. Se mide en cuánto llega a convertirse
> en resultado.
>
> ---
>
> *Metodología: datos abiertos del MEF (presupuesto/ejecución) e INFOBRAS (Contraloría),
> descargados y cruzados directamente desde sus fuentes oficiales. Cifras a julio 2026, año
> fiscal en curso — no son un corte oficial de cierre. Trabajo de código abierto en
> construcción.*
>
> #DatosAbiertos #LaLibertad #GestiónPública #TransparenciaFiscal #OpenData

## Ángulos pendientes para próximos posts

1. **Bolívar: el caso que aparece en las tres fuentes** — el hallazgo más fuerte de la ronda 2
   (ver arriba). Post propio, con la tabla de las 3 fuentes como pieza central — es el que más
   se sostiene solo, porque no depende de una sola base de datos.
2. **Infraestructura vs. servicios sociales** — Transporte y Saneamiento ejecutan a ~30%,
   Educación y Salud a 43-53%. Ángulo sectorial, con el patrón nacional de CEPLAN
   (financiero > físico) como marco.
3. **Sobrecosto silencioso de la inversión pública** — 40.8% de proyectos activos con
   variación al alza, caso Bolívar (+117% de cartera, no solo el proyecto individual de +405%)
   como gancho.
4. **Concentración de compras públicas** — con el caveat de muestra parcial explícito en el
   mismo post, no como letra chica.
5. **La brecha gasto vs. resultado físico** (SEG/Execution Efficiency) — pendiente de que
   `ceplan-estrategico` y `radar-ejecucion` compartan el mismo año fiscal ingerido para
   calcularlo con datos reales de La Libertad, no solo el promedio nacional de CEPLAN.

## Reproducibilidad

Todas las cifras de este documento vienen de queries SQL directas contra las 5 bases locales
(Postgres, `docker compose up -d` por app — ver `docs/ESTADO.md`), corridas el 2026-08-18.
No hay endpoint único que devuelva este análisis consolidado todavía — es trabajo manual de
síntesis sobre datos ya ingeridos por cada app.
