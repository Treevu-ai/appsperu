# Data contract — Poder Judicial: Procesos judiciales principales (estadística jurisdiccional)

> Ficha técnica del conector: [`docs/conectores.md#poder-judicial`](../conectores.md#poder-judicial)

Investigación en vivo: 2026-09-20.

## Por qué esta fuente y no CEJ

Se investigó como parte de un mapeo de fuentes de justicia/seguridad (Poder Judicial, Ministerio
Público, MINJUS, Marina de Guerra, PNP). El sistema interactivo del Poder Judicial (**CEJ —
Consulta de Expedientes Judiciales**, `cej.pj.gob.pe`) está protegido con Radware Bot Manager
(pasa el challenge automáticamente en navegador real, sin captcha visible) pero **desde 2026
exige N° de expediente exacto además del nombre de las partes** — cambio explícito pedido por la
Autoridad Nacional de Protección de Datos Personales / MINJUSDH ("medida técnica de protección,
para que solo las partes puedan acceder a sus expedientes"). No es enumerable por nombre/DNI ni
bulk-queryable: no sirve como fuente de ingesta.

En su lugar se encontró que el propio Poder Judicial publica un dataset **agregado/estadístico**
en `datosabiertos.gob.pe` — "Procesos judiciales principales a nivel nacional, a partir del
2023". No trae expedientes individuales ni nombres de partes, solo conteos por año/mes/órgano
jurisdiccional. Sin PII.

## Fuente

- Página del dataset: `https://www.datosabiertos.gob.pe/dataset/procesos-judiciales-principales-nivel-nacional-partir-del-2023-poder-judicial`
- Descarga directa: `https://www.datosabiertos.gob.pe/sites/default/files/dataset_jurisdiccional_a-partir-del-2024.csv`
- **A diferencia del resto del catálogo, este dataset NO se resuelve vía CKAN `package_show`**:
  el enlace de descarga es un archivo estático servido desde `/sites/default/files/`, no un
  recurso indexado por la API `api/3/action/package_show` de esta instancia DKAN (confirmado en
  vivo: `package_show`/`package_search` devuelven 404/HTML para este portal — este DKAN
  únicamente expone la búsqueda vía su interfaz web, no una API CKAN estándar). Se referencia la
  URL de descarga directamente.
- Publicador declarado: "Poder Judicial - PJ". Fecha de lanzamiento del dataset: 2026-06-08.
  Última modificación: 2026-09-11.
- Confirmado en vivo (`curl` con User-Agent de navegador, mismo WAF/CloudWAF que el resto de
  `datosabiertos.gob.pe`): HTTP 200, `Content-Length` 15,014,079 bytes, sin autenticación.

## Schema real confirmado — 59 columnas (12 de dimensión + 47 de conteo)

```
ANIO,MES,DISTRITO_JUDICIAL,PROVINCIA,DISTRITO,CODIGODEP,DEPENDENCIA,ESTADO,TIPO_ORGANO,ESPEC_EXP,
ESPEC_DEP,CONDICION,PENDIENTET,PPLAZOIMPUG,PENDIENTEE,PENDIENTE,IMPROCEDENTEI,NADMITIDO,
APE_INSINFERIOR,APE_INSSUPERIORANULADA,INGRESOT_SIN,DEOTRADEPENT,INGRESOT_CON,RESCONSENTIDA,
APE_CONFIRMADAI,APE_REVOCADAI,INGRESOE_SIN,DEOTRADEPENE,INGRESOE_CON,INGRESO_SIN,INGRESO_CON,
IMPROCEDENTER,SENTENCIA,AUTODEFINITIVO,CONCILIADO,INFORMEFINAL,APE_CONFIRMADAR,APE_REVOCADAR,
APE_ANULADAR,APE_RESUELTA,RESUELTOT,OTROSEGRESOST,RESUELTOE,OTROSEGRESOSE,RESUELTO,
CONFIRMADA_ADEF,REVOCADA_ADEF,RDEV_CONFIRMADA,RDEV_ANULADA,RDEV_REVOCADA,PENDIENTECALF,
INGRESOCALF,RESUELTOCALF,PENDIENTECUAD,INGRESOCUAD,RESUELTOCUAD,PENDIENTEEXH,INGRESOEXH,
RESUELTOEXH
```

- **Encoding Latin-1** — confirmado en vivo: "Apurímac", "Cañete", "Extinción de Dominio" llegan
  corruptos ("Apur�mac", etc.) bajo lectura UTF-8 ingenua.
- **Sin diccionario de variables publicado** — a diferencia de otros datasets del catálogo (ej.
  MINDEF, que trae un recurso "Diccionario_..." aparte), no se encontró ningún recurso que
  explique el significado exacto de las columnas abreviadas (`PENDIENTET` vs `PENDIENTEE` vs
  `PENDIENTE`, `INGRESOT_SIN`/`INGRESOT_CON`, `RDEV_*`, etc.). Se preservan los nombres tal cual
  el CSV fuente (solo en minúsculas) en vez de reinterpretarlos — no se adivina su semántica.
  Lectura razonable por el patrón de los nombres (no confirmada oficialmente): los sufijos `T`/`E`
  parecen distinguir etapa de "Trámite" vs "Ejecución", y las columnas sin sufijo (`PENDIENTE`,
  `RESUELTO`) son el total de ambas — consistente con que `PENDIENTE = PENDIENTET + PENDIENTEE`
  y `RESUELTO = RESUELTOT + RESUELTOE` en la fila de ejemplo verificada en vivo.
- `MES` viene como nombre de mes en español (`Enero`, ..., `Setiembre` con esa grafía, no
  `Septiembre`), no como número — se preserva tal cual.

## Clave natural — verificada en vivo contra el CSV completo (2026-09-20)

`(ANIO, MES, CODIGODEP, TIPO_ORGANO, ESPEC_EXP, ESPEC_DEP, CONDICION)` es única sobre las
**58,568 filas** reales del archivo: 58,568 claves únicas, 0 colisiones. `CODIGODEP` identifica
1:1 al órgano jurisdiccional — verificado que ninguno de los 3,041 códigos distintos tiene más
de un nombre de `DEPENDENCIA` asociado en toda la muestra.

## Verificado en vivo (2026-09-20)

Corrida completa contra el archivo real: **58,568/58,568 filas insertadas, 0 rechazadas**.
Ejemplo real (La Libertad, Trujillo, Enero 2024, "10° Juzgado de Familia - Subespecialidad en
Violencia contra la Mujer e Integrantes del Grupo Familiar"): `PENDIENTE=4312`,
`RESUELTO=29`. Resumen agregado por `distritoJudicial` para 2024 reproduce cifras plausibles a
nivel nacional (ej. Arequipa: 3,253 filas, 197,026 pendientes acumulados en el año).

## Pendiente / fuera de alcance de este contrato

1. **Semántica exacta de las 47 columnas de conteo no confirmada oficialmente** — ver nota de
   encoding/diccionario arriba. Si se necesita una interpretación certera (ej. para un reporte
   público), contrastar con el Poder Judicial o su Oficina de Estadística antes de publicar una
   afirmación basada en el nombre de una columna específica.
2. **Solo cubre desde 2023** (el propio dataset lo declara así) — no hay serie histórica anterior
   en esta fuente.
3. **CEJ (expedientes individuales) queda fuera de alcance permanentemente** — no por dificultad
   técnica sino por la protección de datos personales explícita que el propio Poder Judicial
   implementó en 2026; no se investiga evadirla.
4. **REDAM (deudores alimentarios morosos)** — aunque lo administra el Poder Judicial, se
   investigó por separado: al momento de la investigación el sistema estaba caído por
   mantenimiento, y su propio comunicado indica que el acceso institucional real es vía **PIDE**
   (interoperabilidad Estado-Estado), no un endpoint público de scraping. No se construyó
   conector para REDAM en este ticket.
