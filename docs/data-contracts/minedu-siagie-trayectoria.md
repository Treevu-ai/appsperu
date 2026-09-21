# Data contract — MINEDU/SIAGIE (Matriculación y Trayectoria Estudiantil 2021-2024)

> Ficha técnica del conector: [`docs/conectores.md#instituciones-educativas`](../conectores.md#instituciones-educativas).
> **Construido y verificado en vivo el 2026-09-21** — extiende la app `instituciones-educativas`
> ya existente (mismo Postgres, puerto 5453), no una app nueva.

Investigación en vivo: 2026-09-20/21 (búsqueda de endpoints MINEDU no explorados, a pedido
explícito del usuario).

## Fuente confirmada — descarga directa, sin login, sin API key

- **Portal**: `datosabiertos.gob.pe`, dataset "Matriculación y Trayectoria Estudiantil
  2021-2024" (id CKAN `b8088aac-87aa-41be-80c5-2dcc0c344ecb`), publicado por Ministerio de
  Educación — Unidad de Estadística.
- **`package_show` de CKAN funciona** para este dataset (a diferencia de RUIAS/OEFA, que no
  resuelve por slug) — pero el WAF del portal (CloudWAF) bloquea `curl` sin cabecera
  `User-Agent` de navegador real con un 418 "访问被拦截" (acceso bloqueado); con UA de Chrome
  responde normal. Mismo patrón defensivo que ya usan otros conectores del catálogo.
- **4 recursos CSV, uno por año lectivo** (2021, 2022, 2023, 2024), ~56-60 MB cada uno,
  descarga directa sin autenticación:
  `https://www.datosabiertos.gob.pe/sites/default/files/Matriculaci%C3%B3n%20y%20Trayectoria%20Estudiantil%20<AÑO>.csv`
- El metadato de CKAN marca el dataset como `"private": true` pese a que los 4 CSVs se
  descargan sin ningún error de permisos — inconsistencia del portal, no bloqueante.

## Contenido (confirmado en vivo, cabecera real de cada año)

Agregado por **servicio educativo** (código modular + anexo) — **no hay alumno individual en
la fuente**, sin PII de estudiantes que excluir (a diferencia del Padrón Web, que sí trae datos
del director).

### Desvío de esquema real entre años — hallazgo genuino, no error de ingesta

```
2021: ...,Aprobado,PromocionGuiada,Retirado,Fallecido,RequiereRecuperacion,Matriculado,PostergaEvaluacion,tot_atraso
2022: ...,Aprobado,PromocionGuiada,Retirado,Fallecido,RequiereRecuperacion,Matriculado,PostergaEvaluacion,tot_atraso
2023: ...,Aprobado,Desaprobado,   Retirado,Fallecido,RequiereRecuperacion,Matriculado,PostergaEvaluacion,tot_atraso
2024: ...,Aprobado,Desaprobado,   Retirado,Fallecido,RequiereRecuperacion,Matriculado,PostergaEvaluacion,tot_atraso
```

`PromocionGuiada` (2021-2022) fue reemplazada por `Desaprobado` (2023-2024) — cambio de
metodología/terminología del MINEDU entre cortes, confirmado leyendo las 4 cabeceras reales.
Ambas columnas se persisten como nullable; cada fila solo trae una de las dos según su año de
origen (la otra queda `NULL`, no `0` — `0` significaría "cero estudiantes en esa categoría",
que es un dato distinto de "esta columna no existía ese año").

### Clave natural real (no obvia sin ver filas reales)

`cod_mod` + `anexo` + `id_nivel` + `Edad` **no es suficiente** — el mismo servicio educativo,
mismo nivel, misma edad, puede repetirse varias veces cuando hay estudiantes con distinto
`TipoDiscaIntegrada` (tipo de discapacidad integrada). Verificado en vivo contra el CSV 2024,
código modular `1000058`, nivel Primaria, edad 6: una fila sin discapacidad (4 estudiantes) y
otra fila aparte con `TipoDiscaIntegrada = "TEA"` (1 estudiante). Clave real usada en la tabla:
`(anio, cod_mod, anexo, id_nivel, edad, tipo_disca_integrada)`.

### Columnas relevantes

```
cod_mod, anexo, Nombre, gestion, id_nivel, dsc_nivel, Edad, TipoDiscaIntegrada,
TotalEstudiantes, Discapacidad, Mujer, Hombre, Venezolanos, Peruanos, Extranjeros,
DNI_validado, DNI_SinValidar, No_DNI, Aprobado, Desaprobado|PromocionGuiada, Retirado,
Fallecido, RequiereRecuperacion, Matriculado, PostergaEvaluacion, tot_atraso
```

- **`tot_atraso`**: conteo de estudiantes con atraso escolar (edad por encima de la esperada
  para el grado) — indicador de trayectoria educativa que no existía antes en el catálogo.
- **`Retirado`**: estudiantes que se retiraron durante el año lectivo — proxy de deserción
  escolar intra-anual (no captura deserción entre años, que requeriría comparar cortes).
- **`cod_mod`/`anexo`**: misma clave que ya usa `instituciones_educativas` (Padrón Web/ESCALE,
  ver `minedu-padron-iiee.md`) — join directo sin matcher difuso.

## Cobertura real ingerida (verificado en vivo, 2026-09-21)

| Año | Filas origen | Filas insertadas | Filas rechazadas |
|---|---|---|---|
| 2021 | 566,359 | 566,359 | 0 |
| 2022 | 558,785 | 558,785 | 0 |
| 2023 | 544,834 | 544,834 | 0 |
| 2024 | 535,137 | 535,137 | 0 |
| **Total** | **2,205,115** | **2,205,115** | **0** |

## Lo que esto habilita

1. **Deserción y atraso escolar reales por escuela**, año a año — nada parecido existe hoy en
   Rastro; todo lo demás mide presupuesto/obras/compras, no trayectoria educativa real.
2. **Cruce directo por `cod_mod`+`anexo`** contra `instituciones_educativas` (padrón, con
   ubigeo/departamento/provincia/distrito) — expuesto en `GET /api/trayectoria` vía `LEFT JOIN`.
3. **Candidato de cruce futuro**: atraso/deserción por distrito × ejecución presupuestal
   educativa (`radar-ejecucion`, `FUNCION = EDUCACIÓN`) o × infraestructura de riesgo
   (`PRONIED`, ver hallazgos de la investigación de endpoints MINEDU 2026-09-21).

## No explorado en esta pasada (fuera de alcance deliberado)

- **PRONABEC (Beca 18/Crédito 18)**: API REST propia con 39 datasets, requiere solicitar API
  key (`datosabiertos@pronabec.gob.pe`) antes de poder verificar nada en vivo — mayor fricción,
  quedó fuera de esta construcción.
- **PRONIED (infraestructura educativa)**: 4 datasets en `datosabiertos.gob.pe` (inspecciones
  de obra SISMON, módulos prefabricados, mobiliario, asistencia técnica) — datasets chicos
  (98KB-420KB), confirmados descargables, no construidos todavía.
- **Nexus (plazas docentes/reforma magisterial)**: no es datos abiertos estructurado, son PDFs
  por proceso de contratación/reasignación en `minedu.gob.pe` — requeriría scraping de PDF,
  descartado por ahora.
