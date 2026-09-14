# Lo que los datos abiertos dicen —y no dicen— sobre La Libertad, a un mes de las urnas

*Una nota de Rastro sobre contrataciones públicas, sanciones y candidatos en La Libertad, construida en vivo el 10 de septiembre de 2026 cruzando cuatro fuentes oficiales. Sin acusaciones: solo evidencia, con sus límites explícitos, para que cada lector saque su propia conclusión.*

---

## Por qué esta nota existe

Hace unos días nos hicimos una pregunta simple, del tipo que cualquier ciudadano informado se hace en época electoral: si cruzamos lo que el Estado peruano ya publica sobre contrataciones, sanciones y autoridades en La Libertad, ¿aparece algún patrón, o es solo ruido? No partimos de una sospecha ni de un nombre en particular. Partimos de las fuentes —OECE/SEACE, el Tribunal de Contrataciones del Estado, la conformación societaria que registra OSCE, y ahora también el padrón de candidatos a las Elecciones Regionales y Municipales 2026— y dejamos que los datos hablaran.

Lo que sigue es el recuento completo de ese ejercicio: qué cruzamos, qué encontramos, qué no pudimos verificar, y qué revela todo esto sobre la infraestructura misma de transparencia que hace —o no hace— posible responder esa pregunta. Es una nota larga a propósito. Cada cifra que aparece aquí fue verificada contra una base de datos real, no estimada, y cada hallazgo trae su límite explícito al lado. Si algo no se pudo confirmar, lo decimos así de claro, en vez de dejar que el silencio se lea como confirmación.

## El método: cuatro fuentes, un mismo identificador

Todo el ejercicio se sostiene sobre un principio simple: cruzar bases distintas por un identificador único —el RUC de una empresa, o el DNI de una persona— en vez de comparar nombres escritos a mano, que es donde normalmente se cuelan los errores (homónimos, apellidos mal digitados, empresas con razones sociales parecidas). Las cuatro fuentes que usamos son:

1. **OECE/SEACE, vía el estándar OCDS**, para contrataciones públicas: quién ganó, cuánto, cuándo, con qué entidad.
2. **El Tribunal de Contrataciones del Estado (OSCE/RNP)**, para el registro de proveedores inhabilitados y multados. Esta fuente tiene una virtud poco común: cubre desde 1993 hasta 2026, más de tres décadas de historia, y es consultable por RUC.
3. **OSCE — perfilprov**, el buscador de proveedores del Estado, que expone la conformación societaria de una empresa: quiénes son sus socios, representantes y gerentes, y con qué documento de identidad.
4. **El padrón de candidatos a las Elecciones Regionales y Municipales (ERM) 2026**, derivado de las hojas de vida que cada candidato declara bajo juramento ante el JNE.

Con esas cuatro piezas, hicimos tres ejercicios de cruce distintos, que se cuentan mejor por separado.

---

## Ejercicio 1: ¿alguien contrató con el Estado mientras estaba sancionado?

### El universo: 3,365 contratos, S/ 421 millones

Empezamos por lo más directo: cruzar, contrato por contrato, todas las adjudicaciones públicas de La Libertad que Rastro tiene ingeridas contra el registro de inhabilitaciones del Tribunal de Contrataciones. El universo resultante fue de **3,365 contratos** —314 procesos mayores vía OCDS y 3,051 órdenes de compra menores vía SEACE— por un total de **S/ 421,356,864**.

Una advertencia necesaria desde el inicio: esto no es "todo lo que La Libertad ha contratado alguna vez". Es todo lo que estas dos fuentes específicas tienen registrado, y la fuente de contrataciones mayores solo cubre desde enero de 2024 en adelante. No podemos verificar nada anterior a esa fecha, para ningún proveedor. Es una limitación de la fuente, no una conclusión sobre lo que pasó antes.

### Lo que sí se pudo comprobar, y lo que no

De esos 3,365 contratos, solo **14** tenían simultáneamente una fecha de adjudicación completa y un rango de inhabilitación (con fecha de inicio y fin) contra el cual comparar. En esos 14 casos —los únicos donde la pregunta "¿estaba sancionado cuando ganó?" se puede responder con certeza— **ninguno** coincidió con un periodo de inhabilitación vigente.

El otro 91% del universo, **3,051 contratos**, no tiene fecha de adjudicación registrada en la fuente SEACE menor. No es que revisamos esos 3,051 y salieron limpios: es que, sin una fecha con la cual comparar, la pregunta simplemente no se puede hacer. Confundir "no verificable" con "verificado y limpio" sería el tipo de error que esta nota quiere evitar activamente.

### Tres empresas que hoy tienen una inhabilitación vigente

Entre los 14 casos verificables, **tres empresas —cuatro contratos— tienen hoy una inhabilitación vigente del Tribunal de Contrataciones**, pero en los tres casos la sanción empezó *después* de que el contrato fue adjudicado, no antes ni durante:

- **Agustina Servicios Generales S.A.C.** (empresa activa desde 2014): un contrato de S/ 344,000 con el Gobierno Regional La Libertad – Unidad de Gestión Educativa de Chepén, adjudicado en abril de 2024. Su inhabilitación actual corre de marzo a septiembre de 2026.
- **Qubits Consulting S.A.C.** (activa desde 2016): dos contratos con la Universidad Nacional de Trujillo, por S/ 852,280 en conjunto, adjudicados en 2024. Su inhabilitación corre de enero de 2026 a enero de 2028.
- **Carlos Chávez Minchola**, persona natural: un contrato de S/ 49,164 con la Municipalidad Distrital de La Esperanza, adjudicado en febrero de 2024. Su inhabilitación corre de diciembre de 2025 a diciembre de 2027.

Un dato que refuerza la lectura no acusatoria: revisamos el registro completo de sanciones del Tribunal —que cubre desde 1993— y ninguno de los tres tenía un antecedente *antes* de estos contratos de 2024. Es su primera y única observación conocida, y llegó meses o casi dos años después de ganar el contrato, no antes. Tampoco encontramos, ni en La Libertad ni a nivel nacional, algún contrato posterior a la fecha en que empezó cada inhabilitación —es decir, no hay indicio de que alguno de los tres haya seguido contratando con el Estado después de quedar inhabilitado.

¿Qué significa esto? Que el patrón visible en los datos es el inverso al que uno imaginaría de entrada: proveedores que ganaron un contrato, y **después** —no antes— fueron sancionados. Eso es compatible con la hipótesis de que la sanción esté relacionada con el desempeño en ese mismo contrato, pero los datos no prueban esa relación causal. Es una pregunta abierta, no una conclusión.

### Un patrón distinto: geografía y tiempo, sin sanción vigente

Hay un cuarto caso que vale la pena mirar aparte, porque no tiene una sanción activa hoy, pero exhibe un patrón geográfico-temporal que sí merece atención.

**Corporación Empresarial Zasojari S.A.C.**, RUC 20602387888, empresa activa desde 2017, ganó **seis contratos por S/ 1,228,658** en **cuatro municipios distintos** de La Libertad —Florencia de Mora, Pacasmayo–San Pedro de Lloc, Ascope y Pataz–Tayabamba— en una ventana de apenas **61 días**, entre el 31 de enero y el 1 de abril de 2024. Sus dos socios, Roberto Eusebio y Johnny Richard Vega Zavaleta (registrados desde 2017; Roberto Eusebio además como Gerente General y representante desde 2020), tuvieron una inhabilitación anterior de cinco meses entre agosto de 2021 y enero de 2022, ya vencida y sin relación temporal con estos seis contratos de 2024.

Buscamos si estos dos socios aparecen vinculados a alguna otra empresa que también haya ganado contratos públicos, revisando tanto la base de conformación societaria (1,358 RUC ingeridos a nivel nacional) como los nombres de todos los proveedores con adjudicaciones registradas. No encontramos ninguna otra empresa asociada a ellos. Eso hay que leerlo con precisión: es un límite del dato —esa base no cubre el universo completo de RUC del país—, no una conclusión de que no existan otras empresas vinculadas.

Ganar en cuatro municipios geográficamente dispersos en dos meses es, como mínimo, inusual para una empresa de ese tamaño. No es, por sí solo, evidencia de irregularidad.

---

## Ejercicio 2: lo que encontró el propio detector de señales del sistema

Rastro tiene construido, desde hace más de dos semanas, un detector automatizado de señales de riesgo para contrataciones menores (identificadas como S01 a S13: recurrencia contractual, concentración de mercado, tiempos de cotización, montos cercanos al límite legal, similitud léxica entre objetos de contratación, y patrones de fraccionamiento). El problema es que, hasta esta semana, **nunca se había ejecutado**: tenía cero registros a nivel nacional, no solo para La Libertad, sino para el país entero.

Lo corrimos nosotros mismos, manualmente, específicamente para este ejercicio. El resultado: sobre las 2,021 órdenes de contratación menor de La Libertad para 2026, el sistema generó **21,293 señales**, todas ellas con severidad "INFO" —el propio detector está diseñado para no calificar nada como "alto riesgo" automáticamente; solo preselecciona candidatos para que un humano los revise.

De ese universo, dos casos concretos destacan:

### Un nombre que ya conocíamos, confirmado por un camino distinto

**Comercializadora Veguz E.I.R.L.** concentra **15 de los 78 contratos (19%)** adjudicados por la Unidad de Gestión Educativa Local de Santiago de Chuco. Es la mayor recurrencia contractual detectada por el sistema en todo el universo de La Libertad. Y es, además, el mismo proveedor que ya había aparecido en nuestro primer ejercicio de cruce: 45 contratos en seis entidades distintas de la región, con un antecedente registrado en el Tribunal de Contrataciones. Dos métodos de análisis completamente independientes —un cruce por RUC contra sanciones, y un detector estadístico de recurrencia— señalaron al mismo nombre. Eso no prueba irregularidad, pero sí es una coincidencia que un análisis de seguimiento no debería ignorar.

### El patrón que el propio sistema llama "candidato a fraccionamiento"

Dos casos calzan con la señal S08 —mismo proveedor, mismo objeto de contratación, ventana temporal corta—, que el sistema define como el indicador más fuerte de un posible fraccionamiento de compras (dividir una necesidad en varios contratos pequeños para evitar los controles de un proceso mayor):

- **Heder Osbeth Caruajulca Bernal** ganó cuatro contratos con objeto **idéntico** (similitud léxica de 1.00) con la Gerencia Regional de Transporte y Comunicaciones de La Libertad, separados por apenas 14 días, por un monto conjunto de S/ 87,961.92.
- **Elmer Ponce Quiroz** ganó cuatro contratos con objeto muy similar (similitud de 0.82) el mismo día, con la Municipalidad Distrital de Sarín, por S/ 87,970 en conjunto.

El propio sistema es explícito sobre el alcance de esta señal: "patrón recurrente proveedor–objeto identificado por comparación léxica exploratoria; no determina favorecimiento ni fraccionamiento". Lo reproducimos tal cual porque es la actitud correcta frente a este tipo de dato: una preselección para revisión humana, no un veredicto.

---

## Lo que este ejercicio revela sobre el sistema, no sobre las personas

Hay una lectura que se repite en cada uno de los hallazgos anteriores, y que probablemente importa más que cualquier nombre individual: **la infraestructura de transparencia que hizo posible este ejercicio también tiene huecos estructurales**, y esos huecos no son culpa de ningún proveedor ni candidato.

Lo que sí funciona, y vale la pena reconocerlo: el Tribunal de Contrataciones publica su registro de inhabilitaciones con una profundidad histórica real —más de tres décadas— en un formato consultable por RUC. Sin esa decisión de publicar así, ninguno de los cruces de esta nota habría sido posible.

Pero el mismo ejercicio expuso tres huecos concretos:

1. **El 91% de los contratos no tiene fecha de adjudicación verificable.** Sin fecha, no hay manera de saber si una contratación ocurrió antes, durante o después de una sanción. Es la brecha más simple de cerrar —agregar un campo obligatorio— y probablemente la de mayor impacto.
2. **No hay evidencia de ningún chequeo automático contra el Tribunal de Contrataciones en el momento de adjudicar.** La verificación que hicimos hoy —cruzar por RUC contra el registro de sanciones— es exactamente el tipo de control que podría ejecutarse antes de firmar un contrato, no reconstruirse a mano meses o años después.
3. **El detector de señales de riesgo del propio sistema estuvo inactivo hasta que alguien externo lo encendió, una sola vez, para escribir esta nota.** Una herramienta de alerta que no corre de forma rutinaria no es, en la práctica, un sistema de control: es un experimento que nadie revisa.

---

## Ejercicio 3: candidatos, a un mes de la elección

Este último cruce es el que motivó, en parte, escribir esta nota completa. Faltando poco más de tres semanas para las Elecciones Regionales y Municipales de octubre de 2026, quisimos responder una pregunta distinta: ¿alguno de los candidatos que hoy compiten por un cargo en La Libertad tiene, él mismo o alguna empresa que representa, un vínculo con el registro de sanciones del Tribunal de Contrataciones?

### Cómo se construyó este cruce

A diferencia de los ejercicios anteriores, este no partió de una fuente que Rastro ya tuviera integrada: no existe todavía, en el portal nacional de datos abiertos, un conjunto de datos descargable de candidatos para esta elección. Las plataformas oficiales del JNE que sí tienen esta información —`votoinformado.jne.gob.pe` y `plataformaelectoral.jne.gob.pe`— están protegidas contra automatización (Cloudflare Turnstile), y respetamos esa protección: no la intentamos evadir.

Encontramos, en cambio, un conjunto de datos derivado y de acceso público, publicado por un tercero (Datapol) a partir de las mismas hojas de vida que el JNE hace públicas, generado el 6 de septiembre de 2026 —justo después de que cerrara la lista definitiva de candidatos—. Antes de usar cualquiera de sus datos, verificamos **uno por uno**, contra la propia plataforma oficial del JNE, cada caso que terminamos citando en esta nota: nombre, DNI, cargo, distrito y organización política, confirmados de forma independiente. No publicamos ningún nombre sin esa doble verificación.

El universo filtrado a La Libertad fue de **4,637 candidatos inscritos** —Gobernador y Vicegobernador Regional, Consejeros Regionales, Alcaldes y Regidores Provinciales y Distritales, repartidos en 1 circunscripción regional, 12 provincias y 72 distritos—. Cruzamos el DNI de cada uno contra dos cosas: (a) si aparece como socio, representante o gerente de alguna empresa con conformación societaria ingerida en nuestra base, y (b) si tiene, directamente, una sanción del Tribunal de Contrataciones como persona natural.

### Tres candidatos vinculados a una empresa, sin sanciones en ellas

Tres candidatos aparecen como socios, gerentes o representantes de una empresa dentro de nuestra base de conformación societaria: Susana Aracelli Burmester Silva, María Luz Angélica Ramos Ojeda y Edinson Ferry Escobedo Espinola. Los mencionamos por completitud metodológica —el mismo cruce que encontró a los otros tres candidatos también revisó estos casos—, pero ninguna de las tres empresas vinculadas a ellos tiene sanciones registradas en el Tribunal de Contrataciones. No hay hallazgo aquí, y es importante decirlo con la misma claridad con la que reportamos lo que sí se encontró.

### Tres candidatos con sanción directa, ya vencida, verificados contra el JNE

Tres candidatos tienen, como persona natural, una sanción registrada por el Tribunal de Contrataciones —todas hoy sin vigencia—. Los tres fueron confirmados nombre por nombre, DNI por DNI, contra la plataforma oficial del JNE:

**Paul Antonio Misael Flores Robles**, candidato a Alcalde Distrital de Laredo (provincia de Trujillo) por el Partido Democrático Somos Perú, tiene una inhabilitación del Tribunal de Contrataciones (Resolución 3684-2025-TCP-S1) que corrió de junio a septiembre de 2025, ya vencida. Es arquitecto de profesión, con maestría en gestión pública, y ha sido Gerente Municipal de Laredo entre 2024 y 2025 y regidor distrital entre 2019 y 2022. Su hoja de vida ante el JNE, revisada en la propia plataforma oficial, declara explícitamente: *"No tiene sentencias firmes según su declaración jurada de hoja de vida"*.

**Hernán Wilfredo Aquino Dionisio**, candidato a Alcalde Distrital de Víctor Larco Herrera (provincia de Trujillo) por Podemos Perú, tiene una inhabilitación (Resolución 1488-2026-TCP-S3) que corrió de marzo a junio de 2026 —venció hace apenas tres meses—. Es abogado, con estudios de maestría en docencia universitaria, y fue Gerente Municipal de Florencia de Mora entre 2024 y 2026, además de regidor provincial en dos periodos previos con Alianza Para el Progreso. Su hoja de vida ante el JNE también declara: *"No tiene sentencias firmes"*.

**Loyla Rodríguez Dávila**, candidata a Regidora Distrital de Florencia de Mora por Acción Popular, tiene una multa del Tribunal de Contrataciones (Resolución 2926-2022-TCE-S1) que corrió de septiembre a diciembre de 2022, ya vencida. A diferencia de los otros dos casos, su hoja de vida ante el JNE sí declara una sentencia penal —por sustracción, del año 2021, con expediente archivado y "pena cumplida"—, pero se trata de un antecedente judicial distinto y separado de la multa administrativa que encontramos nosotros en el registro de OSCE.

### La brecha que este cruce deja más clara que ninguna otra

Este es, probablemente, el hallazgo más importante de toda la nota, y no tiene que ver con ningún candidato en particular: **en los tres casos, la sanción del Tribunal de Contrataciones no aparece en absoluto en la hoja de vida oficial que el JNE muestra a cualquier votante que la consulte hoy.**

No es que los candidatos hayan ocultado algo. La sección "Declaración de Sentencias Firmes" del formulario de hoja de vida del JNE está diseñada, por ley, para capturar sentencias judiciales —penales y civiles—, no sanciones administrativas de un organismo distinto como OSCE. Un votante de Laredo o de Víctor Larco Herrera que revise hoy la hoja de vida oficial de su candidato a alcalde vería, en ambos casos, "sin antecedentes" —porque, para efectos de ese formulario específico, es literalmente cierto—. La inhabilitación existe, está documentada, es pública, y sin embargo no llega al mismo lugar donde un votante normalmente buscaría esa información.

Esto es exactamente el mismo patrón que encontramos en los dos ejercicios anteriores, ahora aplicado a personas que buscan gobernar, no solo a empresas que contratan con el Estado que ya gobiernan otros: la información pública existe, en más de una fuente oficial, pero esas fuentes no conversan entre sí. La responsabilidad de cruzarlas termina recayendo en un ejercicio manual, hecho una sola vez, por alguien externo al sistema.

---

## Lo que estos datos no prueban

Antes de cerrar, vale la pena ser tan explícito sobre los límites como lo fuimos sobre los hallazgos.

Esta nota **no** muestra ninguna adjudicación pública otorgada mientras el proveedor estaba, en ese momento exacto, formalmente inhabilitado. Tampoco muestra que algún candidato haya cometido un delito, ni que exista una relación causal entre ganar un contrato público y ser sancionado después —esa relación es plausible, pero no está probada por estos datos, y queda como pregunta abierta—. No muestra que las tres empresas vinculadas a candidatos tengan ningún problema —de hecho, muestra lo contrario—. Y no muestra que Corporación Empresarial Zasojari, Comercializadora Veguz, Heder Osbeth Caruajulca Bernal o Elmer Ponce Quiroz hayan incurrido en alguna irregularidad: muestra patrones que, según el propio lenguaje de las herramientas que los generaron, "requieren revisión humana" y "no determinan favorecimiento ni fraccionamiento".

Lo que sí muestra, con la solidez que da cruzar identificadores únicos contra fuentes oficiales y verificar cada hallazgo contra la fuente primaria antes de publicarlo, es esto: en La Libertad hay proveedores y candidatos con antecedentes documentados en el Tribunal de Contrataciones que no aparecen —o no aparecen completos— en los lugares donde un ciudadano normalmente buscaría esa información. Y hay, además, herramientas ya construidas dentro del propio Estado —un detector de señales de riesgo, un registro histórico de sanciones, un cruce de conformación societaria— que podrían cerrar esa brecha, y que hoy funcionan solo cuando alguien de afuera decide encenderlas.

## Preguntas abiertas

¿Debería un sistema de contrataciones públicas cruzar automáticamente contra el registro del Tribunal antes de firmar, en vez de que ese cruce dependa de un ejercicio periodístico o ciudadano hecho después? ¿Debería la hoja de vida de un candidato a un cargo público incluir, junto a las sentencias judiciales, las sanciones administrativas de organismos como OSCE, dado que ambas son igual de públicas pero hoy viven en sistemas que no se hablan? Y si una herramienta de alerta temprana ya existe dentro del Estado, pero nunca se ejecuta, ¿es realmente un sistema de control, o es solo código que nadie revisa?

No tenemos la respuesta. La tienen, en todo caso, quienes diseñan estas plataformas —y quienes, en un mes, decidan con su voto quién administra los contratos que este mismo ejercicio podría seguir auditando.

---

## Nota metodológica y fuentes

**Fecha del ejercicio**: 10 de septiembre de 2026. Todos los cruces se hicieron en vivo, contra bases propias actualizadas —no son estimaciones, muestreos ni proyecciones.

**Fuentes primarias utilizadas**:
- OECE/SEACE, vía el estándar de datos abiertos de contrataciones OCDS (procesos mayores y órdenes de compra menores).
- Tribunal de Contrataciones del Estado, a través del Registro Nacional de Proveedores (OSCE/RNP) — inhabilitaciones y multas, registro histórico 1993–2026.
- OSCE — Buscador de Proveedores del Estado (perfilprov), para conformación societaria: socios, representantes y órganos de administración por RUC.
- Padrón de candidatos a las Elecciones Regionales y Municipales 2026, derivado de las hojas de vida declaradas ante el JNE, con verificación individual de cada caso citado contra la plataforma oficial `votoinformado.jne.gob.pe`.

**Límites declarados en esta nota** (repetidos aquí para que no se pierdan en la lectura):
- La fuente de contrataciones cubre solo desde enero de 2024; no hay forma de verificar años anteriores.
- El 91% de los contratos del universo analizado no tiene fecha de adjudicación registrada, y por tanto no pudo verificarse contra el registro de sanciones.
- La base de conformación societaria cubre 1,358 RUC a nivel nacional, no el universo completo de empresas del país; "no encontrado" no equivale a "no existe".
- El detector de señales de riesgo (S01–S13) clasifica todo como severidad informativa; ninguna señal, por diseño, constituye una conclusión de irregularidad.
- Todos los datos de candidatos citados con nombre fueron verificados de forma independiente contra la plataforma oficial del JNE antes de su publicación en esta nota; los datos que no pudieron verificarse de esa forma no se incluyeron.

**Sobre el tono de esta nota**: cada hallazgo se presentó junto con lo que efectivamente prueba y lo que no. Donde los datos permitían una lectura acusatoria y una lectura neutral igualmente válidas, se optó explícitamente por la neutral, dejando la interpretación al lector. Ese fue un criterio editorial deliberado, no una limitación del análisis.

*— Rastro, datos abiertos de gestión pública en La Libertad.*
