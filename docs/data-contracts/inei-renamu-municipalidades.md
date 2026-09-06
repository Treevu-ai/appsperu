# Data contract — INEI (RENAMU: Registro Nacional de Municipalidades)

> Ficha técnica del conector: [`docs/conectores.md#renamu`](../conectores.md#renamu).
> **Construido y verificado en vivo el 2026-09-06** — app standalone `renamu` (API puerto 4020,
> Postgres 5451). Este documento se mantiene como registro de la investigación original (Fase 0)
> más las correcciones encontradas durante la construcción; ver la sección "Actualización
> post-construcción" al final para lo que cambió respecto a la Fase 0 inicial.

Investigación en vivo: 2026-09-06.

## Fuente confirmada

- **Portal**: Plataforma Nacional de Datos Abiertos (`www.datosabiertos.gob.pe`), publicador
  Instituto Nacional de Estadística e Informática (INEI). Un dataset por año, patrón CKAN
  (`package_show` disponible).
- **Descarga directa real, confirmada 2026-09-06**:
  `https://www.inei.gob.pe/media/DATOS_ABIERTOS/RENAMU/DATA/2024.zip` — sin login, sin API key.
  `Content-Type: application/zip`, descargado completo en vivo.
- **Diccionario de variables**: `https://www.inei.gob.pe/media/DATOS_ABIERTOS/RENAMU/DICCIONARIO/2022/Diccionario.pdf`
  (PDF, 52 páginas para el corte 2022; el ZIP 2024 trae su propio diccionario embebido, ver
  abajo) — necesario para mapear los ~300 códigos de pregunta antes de normalizar.
- **Datasets por año en la PNDA**: 2011, 2014, 2017, 2018, 2019, 2020, 2022, 2023, 2024
  confirmados existentes (slugs `registro-nacional-de-municipalidades-renamu-<año>-...`). 2024
  es el corte más reciente publicado; la recolección de RENAMU 2025 ya se hizo (jun-jul 2025
  según prensa de INEI) pero no se confirmó su publicación en la PNDA en esta pasada.
- **Frecuencia real de la fuente**: anual, con rezago de publicación de varios meses respecto al
  cierre de la recolección (patrón similar a INFOMIDIS).

## Qué es (confirmado por descripción oficial + estructura real)

Encuesta censal anual del INEI a **todas** las municipalidades provinciales, distritales y de
centro poblado del país — no es una muestra. Objetivo declarado: "generar indicadores
municipales que apoyen la gestión regional y local". A diferencia de todo lo que el catálogo
actual ingiere (que mide *gasto/ejecución/obras* de una entidad), RENAMU mide **capacidad
institucional declarada por la propia municipalidad**: personal, infraestructura, servicios
prestados, TIC, gestión de residuos sólidos, seguridad ciudadana municipal, instrumentos de
gestión, entre otros módulos.

## Descarga y schema confirmados (2026-09-06)

Contenido real del ZIP 2024 descomprimido:

```
928-Modulo1814/2.Diccionario de VariablesF01-RENAMU 2024.pdf   (996 KB)
928-Modulo1814/Base-Datos_2024_f.csv                           (6.67 MB)
```

- **Formato del CSV**: delimitado por `;`, **BOM UTF-8** (mismo patrón que MIDAGRI/SBN/SIDPOL —
  no requiere el manejo Latin-1 que sí necesitan INFOMIDIS/CEM/Chat100).
- **1,892 filas** (una por municipalidad) — cuadra exactamente con el universo nacional de
  distritos que ya reportan `programas-sociales` (INFOMIDIS, ~1,892 distritos) y
  `actividad-empresarial` (MTPE, 1,510-1,892 según año). Confirma que este es el mismo universo
  territorial que el resto del catálogo, sin sorpresas de cobertura.
- **Columnas de identificación**: `Año`, `idmunici`, `ccdd`, `ccpp`, `ccdi`, `Ubigeo`,
  `Departamento`, `Provincia`, `Distrito`, `Tipomuni` — `Ubigeo` en el mismo formato de 6 dígitos
  que usa `territories.ubigeo` en el resto del monorepo (cruce directo esperado, no confirmado
  con una fila real todavía).
- **Resto de columnas (~300)**: códigos de pregunta de encuesta (`P04_1`, `P05_CC`, `P11A_1`,
  `P19D_T`, `P22_C1`, etc.) — requieren el diccionario de variables para interpretarse; no son
  auto-descriptivas por nombre de columna, a diferencia de la mayoría del catálogo actual.
- **Sin PII**: no hay columnas de nombre, DNI ni ningún identificador de persona natural en el
  header confirmado — es información institucional de la municipalidad como entidad, no de sus
  funcionarios.

## Lo que esto habilitaría (hipótesis, no confirmado con datos reales todavía)

1. **Cruce por UBIGEO contra `radar-ejecucion`/`budget_execution`**: comparar capacidad
   institucional declarada (¿tiene la municipalidad personal, equipo, sistemas?) contra ejecución
   presupuestal real — señal que ningún conector actual mide (todos miden gasto/resultado, no
   capacidad de gestión).
2. **Serie temporal por municipalidad**: al existir cortes 2011-2024, permitiría ver evolución de
   capacidad institucional en el tiempo para una misma municipalidad — útil para La Libertad
   específicamente.
3. Módulos de "seguridad ciudadana municipal" (serenazgo, cámaras) podrían cruzar con
   `seguridad-ciudadana` (SIDPOL) — hipótesis sin verificar contra el diccionario real.

## Pendiente antes de construir el conector

1. **Decodificar el diccionario de variables** (`Diccionario de VariablesF01-RENAMU 2024.pdf`,
   ya descargado) para mapear los ~300 códigos de pregunta a nombres legibles — trabajo de
   normalización no trivial, análogo a lo que ya se hizo con INFOMIDIS (columnas por palabra
   clave) pero con volumen de columnas mayor.
2. **Confirmar formato exacto de `Ubigeo`** con una fila real (¿6 dígitos con cero inicial
   preservado, como debería, o se pierde como pasó con SIDPOL/`UBIGEO_HECHO`?) — no verificado
   en esta pasada, solo el nombre de la columna.
3. **Decidir arquitectura de app**: ¿app standalone nueva (`renamu` o similar) o extensión de una
   app existente? El dato es municipal/institucional, sin overlap directo con ninguna app actual
   — favorece app standalone, siguiendo el patrón `PROTOCOLO_Alta_Sector_Entidad_Rastro.md`.
4. **Verificar si RENAMU 2025 ya está publicado** en la PNDA (la recolección ya ocurrió según
   prensa de INEI) — si existe, preferirlo sobre 2024 como corte inicial de ingesta.
5. **Confirmar patrón de descarga por año**: el ZIP de 2024 vino de `inei.gob.pe/media/...` (no
   `datosabiertos.gob.pe/sites/default/files/...`, que es el patrón que sí usan otros
   conectores) — confirmar si esto es estable entre años o cambia de host, ya que afecta el
   diseño del conector (¿URL fija por año, o hay que resolverla vía `package_show` como en
   RENIPRESS/INFOMIDIS?).
6. Sin WAF detectado en la descarga directa desde `inei.gob.pe` en esta pasada — a confirmar con
   una descarga real desde el conector (headers de `User-Agent` por si acaso, mismo patrón
   defensivo que ya usa el resto del catálogo contra `gob.pe`).

## Actualización post-construcción (2026-09-06)

Todos los pendientes de la lista anterior quedaron resueltos o superados durante la
construcción:

1. **Diccionario decodificado parcialmente, no en su totalidad**: se extrajo el texto del PDF de
   52 páginas (`pdf-parse`) y se mapeó con confianza alta el Módulo II (equipamiento y TIC:
   vehículos `P11A`, telefonía `P12`, internet `P14`). El **Módulo I** (datos generales) resultó
   mezclar campos institucionales con datos de persona natural del alcalde (nombre, apellidos,
   sexo, teléfono y correo personal) en el mismo bloque de columnas (`P04`-`P10`), y el layout de
   tabla del PDF se linealiza fuera de orden al extraer texto — no fue posible mapear con certeza
   qué código exacto corresponde a cada campo del alcalde. **Decisión: excluir el Módulo I
   completo de la ingesta**, nunca leído ni persistido. Maquinaria pesada (`P11B`), computadoras
   por procesador (`P13`) y equipos de oficina (`P15`) tampoco se ingirieron en esta primera
   versión — quedan como trabajo futuro con el mismo nivel de rigor de verificación contra filas
   reales antes de mapear cualquier código nuevo.
2. **Formato de `Ubigeo` confirmado con filas reales**: 6 dígitos con cero inicial preservado
   (ej. `010101`), igual que el resto del catálogo — sin la pérdida de cero inicial que sí tuvo
   `seguridad-ciudadana`/SIDPOL.
3. **Arquitectura resuelta**: app standalone `renamu` (puerto 4020, Postgres 5451), mismo patrón
   que `mindef`/`mimp`.
4. **RENAMU 2025 no verificado** — se ingirió 2024 (el corte confirmado disponible), sin bloquear
   la construcción. Verificar en una corrida futura si 2025 ya está publicado.
5. **Patrón de descarga confirmado real y estable para 2024**: `inei.gob.pe/media/DATOS_ABIERTOS/RENAMU/DATA/<año>.zip`,
   sin necesidad de resolver vía `package_show` — a diferencia de RENIPRESS/INFOMIDIS, el nombre
   del archivo ZIP sí es predecible por año. El nombre de la carpeta *dentro* del ZIP sí cambia
   (`928-Modulo1814` en 2024) — el conector busca el primer `.csv` en vez de asumir una ruta fija
   dentro del ZIP.
6. **Sin WAF confirmado**: la descarga real desde el conector (`User-Agent` de navegador) funcionó
   sin bloqueo.

**Hallazgo adicional no anticipado en la Fase 0**: una lectura ingenua del diccionario de
variables sugería que `P14A_1` era el código de tipo de conexión a internet y `P14A_2` la
cantidad de computadoras con acceso. Verificado contra filas reales del CSV, **el orden es el
inverso**: `P14A_1` = cantidad de computadoras (valores reales observados: 135, 4, 6), `P14A_2` =
código de tipo de conexión (1-5). Lección de ingeniería para el catálogo: el diccionario en PDF
no es una fuente confiable para el orden exacto de columnas relacionadas cuando su tabla se
extrae como texto plano — solo las filas de datos reales lo son.
