# Memo — La Libertad: inversión pública + obras + inversión privada PROINVERSIÓN, por sector

> Sigue `docs/plantilla-memo-regional-alsol-v1.md`, con una sección nueva (§4) para
> `inversion-privada` (VERTIX APP/PA y OxI) que la plantilla v1 todavía no cubre.
>
> **Actualización 2026-08-28 (misma fecha, corrida posterior):** la sección OxI de §4 y el
> cruce por código con Invierte.pe (§6) se implementaron después de la primera versión de
> este memo — ver `docs/adr/0012-inversion-privada-oxi-y-cruce-snip-con-radar-inversiones.md`.
> Las cifras de OxI abajo son reales, extraídas del endpoint ya en producción.
>
> **Segunda actualización 2026-08-28:** la §2 original se calculó sobre una muestra de 1000
> filas de `GET /api/investments`, porque ese endpoint truncaba sin avisar aunque la base ya
> tuviera **7,998 filas** ingeridas para La Libertad. Se corrigió el endpoint (paginación real
> con `limit`/`offset`/`total`, ver `docs/data-contracts/invierte-detalle-inversiones.md`) y
> se recalculó §2 con el universo completo. También se agregó GIS de VERTIX (§4.3, §6) — ver
> `docs/adr/0013-inversion-privada-gis-vertix-geometria-sin-postgis.md`.

## Metadatos

| Campo | Valor |
|---|---|
| Departamento | LA LIBERTAD |
| UBIGEO prefijo | 13 |
| Fecha de corte | 2026-08-28 |
| Preflight territorial | PARCIAL (ver §6) |
| Fuentes | `radar-inversiones` (4002), `infobras` (4003), `inversion-privada` (4012) |
| Autor / corrida | Sesión interactiva, datos re-extraídos en vivo el 2026-08-28 |

## 1. Resumen ejecutivo

- **Inversión pública** (Invierte.pe, universo completo ya ingerido de La Libertad — 7,998
  proyectos activos, no una muestra): S/ 56,421 millones en costo actualizado, liderada por
  Transporte (S/ 13,694M, 2,074 proyectos), Salud (S/ 9,656M) y Saneamiento (S/ 8,246M).
- **Obras públicas** (INFOBRAS, universo completo): 10,134 obras en La Libertad, 2.49%
  paralizadas (252), 81.29% con avance físico reportado. Gobiernos Locales concentran el
  87% de las obras (8,828) pero no necesariamente el mayor monto viable.
- **Inversión privada PROINVERSIÓN** (VERTIX, cartera APP/PA): 22 proyectos en La Libertad
  de 340 a nivel nacional, US$ 3,916 millones en conjunto. Telecomunicaciones domina en
  número de proyectos (8, todos PA), Agua y saneamiento en monto (US$ 809M en un solo
  proyecto: PTAR Trujillo).
- **Cruce por sector es descriptivo, no una clave exacta**: las tres fuentes usan
  taxonomías distintas (`funcion` de Invierte, `sectorEntidad` de INFOBRAS, `Sector` de
  VERTIX) y **monedas distintas** (soles vs. dólares). No se suman montos entre fuentes en
  este memo — ver §5.
- **OxI (Obras por Impuestos, VERTIX)**: 55 proyectos en La Libertad de 761 a nivel nacional.
  De esos, 52 traen código de referencia y **45 matchean exactamente** un `codigo_snip` de
  `radar-inversiones` — cruce ahora implementado (`GET /api/crossref/oxi`, ver §6). El
  mensaje de producto del 2026-08-28 que anticipó este cruce estaba adelantado al código en
  el momento en que se escribió; ya no lo está.

## 2. Inversión pública (`radar-inversiones`, Invierte.pe) — por función

Fuente: `GET /api/investments?departamento=LA+LIBERTAD` paginado (`limit=5000` × 2 páginas),
**7,998 filas — el universo completo ya ingerido para el departamento**, confirmado por el
campo `total` de la respuesta (`hasMore: false` en la última página). Todas las filas están
en estado `ACTIVO`.

| Función | Proyectos | Monto viable (S/ M) | Costo actualizado (S/ M) |
|---|---:|---:|---:|
| Transporte | 2,074 | 12,075 | 13,694 |
| Salud | 740 | 8,260 | 9,656 |
| Saneamiento | 1,109 | 7,410 | 8,246 |
| Educación | 1,219 | 6,167 | 7,384 |
| Orden público y seguridad | 135 | 2,198 | 4,040 |
| Agraria | 10 | 1,891 | 4,135 |
| Agropecuaria | 511 | 1,937 | 2,125 |
| Planeamiento, gestión y reserva de contingencia | 343 | 1,510 | 1,680 |
| Cultura y deporte | 707 | 1,224 | 1,352 |
| Energía | 247 | 850 | 1,003 |
| Ambiente | 150 | 718 | 889 |
| Vivienda y desarrollo urbano | 510 | 482 | 517 |
| Otras (Comunicaciones, Justicia, Salud y saneamiento, Comercio, Administración, Turismo, Pesca, Protección social, Educación y cultura, Industria, Asistencia social, Energía y minerales) | 243 | ~734 | ~1,700 |
| **Total** | **7,998** | **45,955** | **56,421** |

Cada fila trae `codigoSnip` y `cui` — es la clave que `infobras` usa para su cruce confirmado
con `radar-inversiones` (ver `docs/ESTADO.md`, sección "Cruces entre apps").

**Corrección respecto a la primera versión de este memo**: la versión original de esta tabla
se calculó sobre 1000/7998 filas (12.5% del universo real) porque el endpoint truncaba sin
paginación. Los totales por función cambiaron sustancialmente (ej. Transporte pasó de 291 a
2,074 proyectos) — no se debe citar la tabla original.

## 3. Obras públicas (`infobras`) — universo completo, por sector de la entidad

Fuente: `GET /api/public-works?departamento=LA+LIBERTAD` (10,134 obras, sin muestreo).

| Sector entidad | Obras | Paralizadas | Monto viable (S/ M) |
|---|---:|---:|---:|
| Gobiernos Locales | 8,828 | 176 | 15,456 |
| Gobiernos Regionales | 289 | 26 | 15,288 |
| Presidencia Consejo Ministros | 42 | 3 | 24,998 |
| Transportes y Comunicaciones | 89 | 2 | 7,821 |
| Agricultura | 158 | 21 | 4,819 |
| Saneamiento | 198 | 1 | 839 |
| Salud | 28 | 3 | 1,310 |
| FONAFE | 127 | 1 | 1,311 |
| Educación | 109 | 7 | 1,277 |
| Energía y Minas | 40 | 3 | 256 |
| Vivienda Construcción y Saneamiento | 83 | 0 | 65 |

**Causales de paralización (top 5, de 252 obras paralizadas):** Otras causales (73),
Incumplimiento de contrato (31), Incumplimiento del pago de valorizaciones u otros (25), sin
causal registrada (23), Conflictos sociales (20).

Cada obra paralizada trae `cui` cuando existe — clave del cruce `infobras ↔
radar-inversiones` ya construido y verificado en el proyecto.

## 4. Inversión privada PROINVERSIÓN (`inversion-privada`)

### 4.1 Cartera APP/PA (VERTIX)

Fuente: `GET /api/projects?departamento=LA+LIBERTAD`. `recordsTotalFuente: 340` (nacional),
`isPartial: true` (el batch nacional trae 340/340, la bandera es del lote, no de la muestra
departamental — los 22 registros de La Libertad son el universo completo del filtro
`DepartamentoList=13` verificado en el data contract).

| Sector VERTIX | Proyectos | APP | PA | Monto (US$ M) |
|---|---:|---:|---:|---:|
| Telecomunicaciones | 8 | 0 | 8 | 977 |
| Agua y saneamiento | 1 | 1 | 0 | 809 |
| Electricidad | 2 | 2 | 0 | 701 |
| Transporte | 2 | 2 | 0 | 692 |
| Agricultura e irrigación | 5 | 1 | 4 | 460 |
| Hidrocarburos | 1 | 1 | 0 | 145 |
| Minería | 1 | 0 | 1 | 118 |
| Mercado de Capitales | 2 | 0 | 2 | 14 |
| **Total** | **22** | **7** | **15** | **3,916** |

Ningún registro trae `CUI` (0/340 a nivel nacional, confirmado en el data contract) — no hay
cruce exacto posible con `radar-inversiones` ni `infobras` para APP/PA. El proyecto de mayor
monto es la PTAR Trujillo (Agua y saneamiento, US$ 808.67M, fase "Estructuración", aún no
adjudicado).

### 4.2 OxI — Obras por Impuestos en promoción (VERTIX)

Fuente: `GET /api/oxi?departamento=LA+LIBERTAD` (implementado 2026-08-28, ver ADR-0012).
`recordsTotalFuente: 761` (nacional), 55 filas para La Libertad — universo completo del
filtro por `departamento` (texto literal, no código INEI, a diferencia de APP/PA).

| Función OxI | Proyectos | Monto referencial (S/ M) |
|---|---:|---:|
| Salud | 10 | 560 |
| Transporte | 26 | 416 |
| Educación | 9 | 203 |
| Pesca | 1 | 52 |
| Planeamiento, gestión y reserva de contingencia | 3 | 45 |
| Orden público y seguridad | 1 | 26 |
| Saneamiento | 1 | 11 |
| Turismo | 2 | 10 |
| Comercio | 1 | 4 |
| Justicia | 1 | 2 |
| **Total** | **55** | **1,330** |

Mayor monto individual: Hospital Provincial de Tayabamba (Salud, S/ 231.7M). El total de S/
1,330M de esta tabla es "monto de inversión referencial" OxI — no debe sumarse con los
montos "S/" de §2/§3 (que son "monto viable"/"costo actualizado" de Invierte.pe/INFOBRAS,
una base de cálculo distinta) ni con los "US$" de §4.1.

**Cruce con Invierte.pe (`GET /api/crossref/oxi?departamento=LA+LIBERTAD`):** de las 55, 52
traen `codigoReferencia` numérico; **45 confirman match exacto** con `codigo_snip` de
`radar-inversiones`, con nombres de proyecto casi idénticos entre ambas fuentes (no es
coincidencia numérica). 3 proyectos OxI no traen código; 7 con código no matchean ningún
`codigo_snip` de la muestra PARCIAL de `radar-inversiones` (§6) — un "no match" no prueba que
el proyecto no exista en Invierte.pe, solo que no se confirmó en este corte.

### 4.3 GIS — geometría descargable (VERTIX)

Fuente: `GET /api/gis/geojson?departamento=LA+LIBERTAD` (implementado 2026-08-28, ver
ADR-0013). Devuelve un GeoJSON `FeatureCollection` real y descargable — el visor GIS oficial
de PROINVERSIÓN exige sesión, este endpoint no.

**13 features en La Libertad** (de 473 nacional), con geometría de tipo Punto en la muestra
revisada. Cruce con `private_investment_projects` por `IDPROYECTO = vertix_id`: **151/156**
`IDPROYECTO` únicos del feed nacional confirmados — verificado con el ejemplo del data
contract (Red vial Nº 5, `vertix_id 509`, `GET /api/gis/projects/509` devuelve su punto).

Esto **ya no es un límite honesto** — antes el memo tenía que decir "sin mapa descargable";
ahora hay un endpoint que sí lo sirve. Sigue habiendo un límite real, distinto: solo 156 de
los 340 proyectos APP/PA tienen geometría en este feed (no los 340 completos).

## 5. Lectura conjunta por sector (descriptiva — sin sumar monedas)

| Sector (agrupación aproximada) | Invierte.pe (S/ M, proyectos) | INFOBRAS (obras, paralizadas) | VERTIX APP/PA (US$ M, proyectos) |
|---|---|---|---|
| Transporte | 13,694 (2,074) | 89 obras, 2 paralizadas | 692 (2) |
| Agua y saneamiento | 8,246 (1,109) | 198 obras, 1 paralizada | 809 (1) |
| Energía | 1,003 (247) | 40 obras, 3 paralizadas | 701 electricidad + 145 hidrocarburos (3) |
| Agricultura/agropecuaria | 6,260 (521) | 158 obras, 21 paralizadas | 460 (5) |
| Telecomunicaciones | 431 (4) | incluido en "Transportes y Comunicaciones" | 977 (8) |
| Minería | no aparece como función propia en la muestra | no aparece como sector propio | 118 (1) |

(Cifras de Invierte.pe recalculadas sobre el universo completo de 7,998 filas — ver §2. La
tabla original de §5 usaba la muestra truncada de 1000 filas; no citar esa versión.)

**Cómo leer esta tabla:** las tres columnas son series independientes por diseño del
proyecto (mismo patrón que `actividad-agraria ↔ radar-ejecucion` en `docs/ESTADO.md`) — no
implican que un proyecto Invierte.pe y un proyecto VERTIX del mismo sector sean el mismo
proyecto, ni que la ejecución de obras en un sector financie la cartera privada de ese
sector. Sirve para ver dónde el Estado y el capital privado están apostando al mismo tiempo
(Transporte, Saneamiento, Energía), y dónde solo hay una de las dos fuentes activa
(Telecomunicaciones y Minería, exclusivamente privadas en este corte; Educación y Salud,
exclusivamente públicas).

## 6. Límites honestos

- **La Libertad no es el universo completo de Invierte.pe (a nivel de fuente, no de API)**:
  `radar-inversiones` ya paginó correctamente (7,998 filas devueltas, `total: 7998`,
  `hasMore: false`) — el bug de truncado a 1000 sin avisar quedó corregido (ver
  `docs/data-contracts/invierte-detalle-inversiones.md`). Lo que sigue sin garantía es que el
  CSV del MEF en sí esté 100% cubierto por la ingesta (ventana de bytes, no confirmación
  independiente del universo administrativo externo) — dos límites distintos, no confundirlos.
- **INFOBRAS sí es universo completo** para La Libertad (10,134 obras, snapshot nacional del
  XLSX de Contraloría).
- **VERTIX APP/PA no tiene CUI** — el cruce con Invierte.pe/INFOBRAS en §5 es solo por
  nombre de sector, no por clave. Ninguna cifra de la tabla combinada debe sumarse entre
  columnas: dos están en soles, una en dólares.
- **OxI ya está implementado en `inversion-privada`** (ADR-0012, corrida posterior el mismo
  2026-08-28). El cruce con Invierte.pe **no es 100%**: de las 55 filas de La Libertad, 3 no
  traen código de referencia y 7 con código no matchean ningún `codigo_snip` de la muestra
  PARCIAL de `radar-inversiones` — un "no match" no prueba ausencia en Invierte.pe, solo que
  no se confirmó con los datos actuales de ambas fuentes. Tampoco se puede asumir que un
  proyecto OxI con código numérico en la columna L sea siempre un `codigo_snip` — el nombre
  real de esa columna en la fuente mezcla SNIP, Invierte.pe e IDEA; el 100% de cobertura de
  `codigoSnip` citado arriba es solo de la muestra de `radar-inversiones`, no de OxI.
- **GIS de VERTIX: ya no es un límite, es una capacidad nueva** (§4.3, ADR-0013) —
  `GET /api/gis/geojson` sirve un mapa descargable real, sin login. El límite que queda es
  distinto: solo 156/340 proyectos APP/PA tienen geometría en el feed.
- **Ingesta manual en las cuatro fuentes** (`radar-inversiones`, `infobras`,
  `inversion-privada` ×3 conectores) — sin scheduler. Las cifras de este memo son del corte
  indicado en cada sección, no del estado actual de las fuentes.

## 7. Reproducibilidad

```bash
# Inversión pública, universo completo (paginado — requiere agregación local, la API no
# expone /resumen por función). limit máximo 5000, repetir con offset hasta hasMore=false.
curl "http://localhost:4002/api/investments?departamento=LA+LIBERTAD&limit=5000&offset=0"
curl "http://localhost:4002/api/investments?departamento=LA+LIBERTAD&limit=5000&offset=5000"

# Obras públicas, universo completo
curl "http://localhost:4003/api/public-works?departamento=LA+LIBERTAD"
curl "http://localhost:4003/api/public-works/resumen?departamento=LA+LIBERTAD"

# Inversión privada PROINVERSIÓN (VERTIX APP/PA)
curl "http://localhost:4012/api/projects?departamento=LA+LIBERTAD"

# Inversión privada PROINVERSIÓN — OxI
curl "http://localhost:4012/api/oxi?departamento=LA+LIBERTAD"
curl "http://localhost:4012/api/crossref/oxi?departamento=LA+LIBERTAD"

# Inversión privada PROINVERSIÓN — GIS (mapa descargable)
curl "http://localhost:4012/api/gis/geojson?departamento=LA+LIBERTAD"
```

## 8. Próximos pasos sugeridos

1. ~~Parsear el XLSX de OxI y confirmar si trae SNIP por fila.~~ Hecho — ver §4.2, §6 y
   `docs/adr/0012-inversion-privada-oxi-y-cruce-snip-con-radar-inversiones.md`.
2. ~~Levantar el tope de 1000 filas en `radar-inversiones`.~~ Hecho — paginación real con
   `limit`/`offset`/`total`/`hasMore`, ver `docs/data-contracts/invierte-detalle-inversiones.md`.
   §2 de este memo se recalculó con el universo completo (7,998 filas, no 1,000).
3. ~~Explorar `gis-vertix` para geometría/enlace territorial.~~ Hecho — endpoint público sin
   login encontrado, cruce `IDPROYECTO = vertix_id` verificado (151/156). Ver §4.3 y
   `docs/adr/0013-inversion-privada-gis-vertix-geometria-sin-postgis.md`.
4. Investigar los 5 `IDPROYECTO` del feed GIS sin match en `private_investment_projects` — no
   se determinó si son proyectos fuera del snapshot APP/PA actual o algo distinto.
5. Corrida de regresión periódica para los tres conectores VERTIX (`RecordsTotal`/
   `feature_count`, hash del JSON) — sigue sin scheduler, mismo patrón que el resto del
   proyecto.
