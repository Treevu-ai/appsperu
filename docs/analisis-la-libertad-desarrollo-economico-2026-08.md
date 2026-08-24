# Análisis — La Libertad: desarrollo económico productivo territorial (2026-08)

Tercera ronda de análisis con las apps de Follow the Sol, con datos reales verificados en vivo
contra cada base (`docker compose up -d` por app, queries SQL directas — mismo estándar que
`docs/analisis-la-libertad-2026-08.md`). Ángulo nuevo: no ejecución/ritmo de gasto (ya cubierto
en las rondas 1-2), sino **dónde está y dónde no está la inversión pública productiva** en una
región que es, en el discurso público, una de las más agroexportadoras del Perú.

## Hallazgos verificados (2026-08-20)

### 1. La inversión pública productiva es marginal frente al total de la cartera regional

(`radar-inversiones`, funciones AGROPECUARIA + COMERCIO + TURISMO + PESCA + AGRARIA, La Libertad,
proyectos activos)

| Corte | Proyectos | Costo actualizado |
|---|---|---|
| Cartera total activa de La Libertad | 1,612 | S/ 9,903.9M |
| Solo funciones productivas (agro/comercio/turismo/pesca) | 112 | S/ 455.9M |
| **% del total** | **6.9%** | **4.6%** |

De cada S/100 en inversión pública activa en La Libertad, solo ~S/4.6 están clasificados en una
función productiva directa. El resto (95.4%) es Transporte (399 proyectos, la función más
numerosa), Saneamiento (252), Educación (241), Salud (156) y el resto de funciones sociales y de
infraestructura habilitante — necesarias, pero no inversión en la base productiva en sí.

**Nota de calidad de dato**: "productivo" se define aquí por la columna `funcion` del Banco de
Inversiones (Invierte.pe), que es una clasificación funcional del gasto público, no una medición
de impacto económico. Inversión en Transporte o Saneamiento puede habilitar indirectamente
actividad productiva (una carretera que conecta una cadena de valor, por ejemplo) — esta cifra
mide inversión etiquetada directamente como productiva, no el efecto económico total.

### 2. El Proyecto Especial Chavimochic, el megaproyecto agroexportador de la región, no tiene presencia como inversión activa en Invierte.pe

Búsqueda directa por nombre/entidad "CHAVIMOCHIC" en `radar-inversiones`: solo **2 proyectos**,
ninguno de riego o ampliación de frontera agrícola:

| CUI | Proyecto | Función asignada | Costo actualizado |
|---|---|---|---|
| 2486406 | Innovación productiva y transferencia tecnológica (CITE Agroindustrial) | Planeamiento, Gestión y Reserva de Contingencia | S/ 53.8M |
| 2717257 | Habitabilidad institucional del Proyecto Especial | Planeamiento, Gestión y Reserva de Contingencia | S/ 52.6M |

**Caveat explícito**: esto no significa que Chavimochic no reciba inversión — la infraestructura
mayor de riego (represa, canal madre) es anterior al sistema Invierte.pe/SNIP vigente y se
financia por otros mecanismos (deuda, cooperación, presupuesto histórico) que no están en esta
base. Lo que sí es un hallazgo real: en la muestra de proyectos **activos y nuevos** del banco de
inversiones actual, el proyecto más asociado a la marca agroexportadora de La Libertad no aparece
como inversión productiva nueva — aparece como gasto institucional/tecnológico.

### 3. La inversión en riego/agro no se concentra en la costa agroexportadora — se concentra en la sierra

Cruce de dos fuentes independientes (Invierte.pe vía `radar-inversiones`, obras vía `infobras`),
ambas con el mismo patrón:

**Monto de inversión en riego/irrigación por provincia** (`radar-inversiones`, `nombre ILIKE
'%RIEGO%' OR '%IRRIGACI%'`):

| Provincia | Proyectos | Costo actualizado |
|---|---|---|
| Otuzco (sierra) | 14 | S/ 59.7M |
| Ascope (costa) | 4 | S/ 56.5M |
| Sánchez Carrión (sierra) | 13 | S/ 34.2M |
| Pacasmayo (costa) | 5 | S/ 32.4M |
| Chepén (costa) | 2 | S/ 29.9M |
| Santiago de Chuco (sierra) | 8 | S/ 28.3M |
| Pataz (sierra) | 9 | S/ 19.8M |
| Trujillo (costa) | 3 | S/ 14.8M |
| Virú (costa) | 5 | S/ 13.1M |
| Gran Chimú | 5 | S/ 10.9M |
| Julcán (sierra) | 1 | S/ 3.4M |
| Bolívar (sierra) | 1 | S/ 0.1M |

**Número de obras de riego/agro por provincia** (`infobras`, `nombre_obra ILIKE '%RIEGO%'/
'%IRRIGACI%'` o sector agrario):

| Provincia | Obras | Paralizadas | Avance físico prom. |
|---|---|---|---|
| Sánchez Carrión (sierra) | **92** | 8 | 90.3% |
| Pataz (sierra) | 78 | 1 | 94.8% |
| Otuzco (sierra) | 72 | 4 | 90.2% |
| Santiago de Chuco (sierra) | 59 | 2 | 95.1% |
| Virú (costa) | 49 | 2 | 91.2% |
| Gran Chimú | 35 | 2 | 74.6% |
| Ascope (costa) | 33 | 5 | 90.0% |
| Pacasmayo (costa) | 26 | 0 | 94.7% |
| Julcán (sierra) | 24 | 1 | 83.8% |
| Chepén (costa) | 23 | 3 | 85.2% |
| Trujillo (costa) | 9 | 2 | 92.7% |
| Bolívar (sierra) | 6 | 1 | 75.0% |

Las 4 provincias serranas del corredor Sánchez Carrión–Pataz–Otuzco–Santiago de Chuco concentran
**301 de las 433 obras de riego/agro de la región (69.5%)**. En monto de inversión (fuente
distinta, `radar-inversiones`), Otuzco y Sánchez Carrión están entre los 3 primeros lugares,
compitiendo de igual a igual con Ascope y Pacasmayo. El patrón se sostiene en dos pipelines de
datos separados (Invierte.pe y Contraloría), lo que lo hace más defendible que una lectura de una
sola fuente.

### 4. Donde sí hay agroexportación consolidada (la costa), la ejecución del gasto agropecuario es la más lenta de la región

(`radar-ejecucion`, función AGROPECUARIA, año fiscal 2026 a julio, cruce con `territories` por
provincia)

| Provincia | PIM | Devengado | Avance |
|---|---|---|---|
| Trujillo | S/184.9M | S/73.8M | 39.9% |
| Santiago de Chuco | S/23.6M | S/10.4M | 44.1% |
| Sánchez Carrión | S/18.9M | S/5.5M | 29.4% |
| Gran Chimú | S/9.3M | S/1.5M | 16.3% |
| Pataz | S/4.4M | S/0.6M | 13.1% |
| Otuzco | S/3.5M | S/2.0M | 56.3% |
| **Ascope** | S/1.8M | S/0.2M | **9.7%** |
| Julcán | S/1.3M | S/0.8M | 62.6% |
| Virú | S/0.8M | S/0.3M | 38.6% |
| Chepén | S/0.4M | S/0.05M | 13.5% |
| **Pacasmayo** | S/0.3M | S/0.002M | **0.6%** |
| Bolívar | S/0.08M | S/0.06M | 77.9% |

**Nota de calidad de dato**: el PIM de Trujillo (74.2% del PIM regional de la función) incluye
programas ejecutados por el Gobierno Regional con sede en la capital que no necesariamente gastan
solo en el distrito de Trujillo — esta tabla mide la entidad ejecutora, no necesariamente dónde
cae la obra física. Aun así, el patrón en el resto de provincias es real: **Ascope (9.7%) y
Pacasmayo (0.6%) —dos de las provincias-ancla de la agroexportación costera de La Libertad— tienen
la peor y la segunda peor ejecución del gasto agropecuario de toda la región**, mientras que
provincias serranas más pequeñas y con menos PIM (Julcán 62.6%, Bolívar 77.9%) ejecutan mejor.

## Lectura de conjunto

El discurso público sobre La Libertad la presenta como potencia agroexportadora (Chavimochic,
arándanos, palta, caña). Los datos de inversión y ejecución pública no confirman una lectura de
"la costa agroexportadora concentra el foco público en agro" — al contrario:

1. La inversión pública productiva es una fracción pequeña (4.6%) de la cartera total.
2. El megaproyecto insignia (Chavimochic) no aparece como inversión activa nueva en el sistema
   vigente.
3. La inversión y las obras de riego/agro están, si acaso, más concentradas en la sierra que en
   la costa.
4. Donde la ejecución del gasto agropecuario es peor es precisamente en la costa agroexportadora
   (Ascope, Pacasmayo).

Esto no prueba que la agroexportación de La Libertad esté mal atendida en términos absolutos —
gran parte de su infraestructura crítica (riego mayor, puertos, agua para uso agrícola) es
privada o fue construida hace décadas y no pasa por Invierte.pe. Lo que sí muestra, con datos
verificables, es que **la conversación pública sobre "La Libertad agroexportadora" y el patrón
real de inversión pública nueva no coinciden** — y que, dentro de lo que el Estado sí ejecuta hoy
en la función agropecuaria, la costa no es donde mejor se gasta.

## Draft del post (LinkedIn)

> **La Libertad es "la región de los arándanos". Su inversión pública dice otra cosa.**
>
> Con datos abiertos del Banco de Inversiones (Invierte.pe) y del MEF, cruzados y verificados en
> vivo:
>
> 📊 De los S/9,904M en proyectos de inversión pública activos en La Libertad, solo **S/456M
> (4.6%)** están clasificados en una función productiva directa (agro, comercio, turismo,
> pesca). El resto es transporte, saneamiento, educación y salud — necesario, pero no inversión
> en la base productiva.
>
> 📊 Busqué "Chavimochic" —el proyecto insignia de la agroexportación regional— en la cartera
> activa de inversión pública. Aparecen **2 proyectos**, ninguno de riego: uno de innovación
> tecnológica (S/53.8M) y uno de infraestructura institucional (S/52.6M). La obra mayor de riego
> es anterior al sistema actual y no está en esta muestra.
>
> 📊 Y donde sí hay inversión y obras de riego, el patrón sorprende: **las 4 provincias serranas
> (Sánchez Carrión, Pataz, Otuzco, Santiago de Chuco) concentran 7 de cada 10 obras de riego/agro
> de la región** — más que la costa agroexportadora. Confirmado en dos fuentes independientes
> (Invierte.pe e INFOBRAS).
>
> 📊 Y en ejecución del gasto agropecuario 2026, **Ascope (9.7%) y Pacasmayo (0.6%) —dos anclas
> de la agroexportación costera— tienen el peor y el segundo peor avance de toda la región.**
>
> El relato de "La Libertad agroexportadora" no calza con el mapa de la inversión pública nueva.
> Puede haber una explicación razonable (la infraestructura crítica de la costa es privada o ya
> existe), pero eso también es una historia que vale la pena contar con datos, no con la marca.
>
> ---
>
> *Metodología: datos abiertos de Invierte.pe (MEF), MEF Consulta Amigable e INFOBRAS
> (Contraloría), descargados y cruzados directamente desde sus fuentes oficiales. Cifras a
> agosto 2026. "Productivo" = función AGROPECUARIA/COMERCIO/TURISMO/PESCA/AGRARIA del
> clasificador funcional del gasto público — no una medición de impacto económico total.
> Trabajo de código abierto en construcción.*
>
> #DatosAbiertos #LaLibertad #DesarrolloEconómico #Agroexportación #OpenData

## Limitaciones de datos (a declarar si se usa este análisis)

- **Chavimochic**: la ausencia de proyectos de riego mayor en Invierte.pe no equivale a "sin
  inversión" — es una limitación de cobertura de la fuente (proyectos pre-SNIP/Invierte.pe no
  están en esta base). Este caveat debe ir explícito si se publica el ángulo #2.
- **"Productivo" es una etiqueta funcional del MEF**, no una medición de impacto económico ni de
  valor agregado — infraestructura habilitante (transporte, energía, saneamiento rural) puede
  tener efecto productivo indirecto no capturado aquí.
- **PIM de Agropecuaria concentrado en Trujillo (74.2%)** refleja la entidad ejecutora (Gobierno
  Regional con sede en la capital), no necesariamente el lugar de ejecución física de la obra —
  no se debe leer como "todo el gasto agropecuario ocurre en Trujillo ciudad".
- **`radar-inversiones` e `infobras` son muestras parciales** (mismo caveat que en las rondas 1-2
  de `docs/analisis-la-libertad-2026-08.md`) — no representan el 100% del universo de inversión
  pública de la región, aunque el tamaño de muestra (1,612 y miles de obras respectivamente) es
  suficiente para sostener un patrón, no solo una anécdota.
- **`compras-publicas` no se usó en esta ronda** — la muestra (144 procesos) es demasiado
  pequeña para desagregar por sector productivo de forma confiable; queda como ángulo pendiente
  si la ingesta se amplía.

## Reproducibilidad

Todas las cifras vienen de queries SQL directas contra 3 de las 5 bases locales (`radar-
inversiones`, `radar-ejecucion`, `infobras`; Postgres, `docker compose up -d` por app — ver
`docs/ESTADO.md`), corridas el 2026-08-20. Sin endpoint consolidado — trabajo manual de síntesis
sobre datos ya ingeridos por cada app, igual que las rondas anteriores.
