# Data contract — MINEDU (Padrón de Instituciones y Programas Educativos, ESCALE)

> Ficha técnica del conector: [`docs/conectores.md#instituciones-educativas`](../conectores.md#instituciones-educativas).
> **Construido y verificado en vivo el 2026-09-06** — app standalone `instituciones-educativas`
> (API puerto 4022, Postgres 5453). Ver "Actualización post-construcción" al final para dos
> hallazgos reales que no estaban previstos en la Fase 0.

Investigación en vivo: 2026-09-06.

## Fuente confirmada — descarga directa, sin login, sin email

- **Portal**: `escale.minedu.gob.pe/listadosrie/` (Unidad de Estadística Educativa, MINEDU) — un
  listado de Liferay con 4 cortes recientes (ago-2026), cada uno un ZIP.
- **Descarga real confirmada 2026-09-06**:
  `https://escale.minedu.gob.pe/documents/10156/958881/Padron_web_<AAAAMMDD>.zip`
  (verificado con el corte `Padron_web_20260828.zip`, 15.7 MB, `Content-Type: application/zip`,
  sin autenticación).
- **Importante — no usar `escale.minedu.gob.pe/padron-de-iiee`** (el buscador web con filtros):
  ese formulario exige correo electrónico para exportar resultados masivos. El ZIP de
  `listadosrie/` es la vía correcta, sin ese gate.
- **Frecuencia real de la fuente**: se publican cortes nuevos cada ~1 semana (05, 13, 20, 28 de
  agosto de 2026 confirmados en el listado) — la más alta frecuencia de actualización de
  cualquier fuente ya evaluada en el catálogo (RENIPRESS es mensual, INFOMIDIS mensual con
  rezago).
- **Patrón de descubrimiento de URL**: el nombre de archivo trae la fecha del corte
  (`Padron_web_AAAAMMDD.zip`) — a diferencia de RENIPRESS/INFOMIDIS, no hace falta resolver vía
  `package_show`/CKAN; basta con listar `listadosrie/` (HTML simple, sin JS) y extraer el
  `href` más reciente que apunta a `escale.minedu.gob.pe/documents/10156/958881/Padron_web_*.zip`.

## Contenido del ZIP (confirmado 2026-09-06)

```
Especificacion de la tabla de datos padron web.xlsx   (15.9 KB — diccionario real)
Instituciones_apoyo.dbf                                (390 KB — tabla secundaria, no explorada)
Padron_web.dbf                                         (287 MB descomprimido — el padrón principal)
```

- **Formato DBF (dBase)**, no CSV/XLSX — único conector de este tipo en el catálogo. Se leyó con
  la librería `dbffile` (Node).
- **Encoding real confirmado: `cp850`** (code page DOS/OEM), no Latin-1 ni UTF-8 — decodificado
  ingenuamente, "Jardín" aparece como "Jard¡n", "Pública" como "P£blica", "gestión" como
  "gesti¢n". Con `cp850` decodifica correcto. Ningún otro conector del catálogo usa este
  encoding — todos los demás son UTF-8 BOM o Latin-1/ISO-8859-1.
- **180,828 filas** (instituciones y programas educativos, nacional completo, verificado por
  conteo real de registros del DBF).

## Schema real confirmado (44 columnas) — columnas relevantes

```
CODINST, COD_MOD, ANEXO, CODLOCAL, CEN_EDU (nombre IE), NIV_MOD, D_NIV_MOD, D_FORMA,
TIPSSEXO, D_TIPSSEXO, GESTION, D_GESTION, GES_DEP, D_GES_DEP, DIRECTOR, TELEFONO, EMAIL,
PAGWEB, DIR_CEN (dirección), LOCALIDAD, CODCP_INEI, CODCCPP, CEN_POB, AREA_CENSO,
DAREACENSO, CODGEO (ubigeo, 6 dígitos), D_DPTO, D_PROV, D_DIST, D_REGION, CODOOII,
D_DREUGEL, NLAT_IE, NLONG_IE, TIPOPROG, D_TIPOPROG, COD_TUR, D_COD_TUR, NRORUC, RZSOCIAL,
PROMOTOR, ESTADO, D_ESTADO, FECHAREG, FECHA_ACT
```

- **`CODGEO`**: ubigeo de 6 dígitos, mismo formato que `territories.ubigeo` en el resto del
  monorepo — cruce directo esperado (no confirmado con una fila real de `radar-ejecucion`
  todavía, pero mismo patrón que ya usan RENIPRESS/INFOMIDIS/RENAMU).
- **`NLAT_IE`/`NLONG_IE`**: coordenadas reales por institución — ninguna otra fuente del
  catálogo trae georreferenciación a nivel de establecimiento individual (RENIPRESS/programas
  sociales son agregados por UBIGEO, `ceplan-geo` es a nivel de capas territoriales, no de
  punto). Habilitaría un mapa de escuelas real, si se decide exponerlo.
- **`ESTADO`/`D_ESTADO`**: `1`/"Activo" vs. inactivo — permite distinguir instituciones
  operativas de las dadas de baja, mismo patrón de "estado operativo real" que RENIPRESS.
- **`NIV_MOD`/`D_NIV_MOD`**: nivel educativo (Inicial-Jardín, Primaria, Secundaria, etc.).
- **`GESTION`/`D_GESTION`**: pública de gestión directa / pública de gestión privada / privada.
- **`NRORUC`/`RZSOCIAL`**: RUC y razón social del operador — solo poblado para instituciones
  privadas; mismo tipo de dato (identidad de entidad) que ya cruza `identidad-fiscal` en el
  resto del catálogo.

### Campos de persona natural — EXCLUIR de la ingesta (decisión de diseño, no pendiente)

- **`DIRECTOR`** (nombre completo del director/a de la IE) — dato de persona natural.
- **`TELEFONO`**, **`EMAIL`** — ambiguos entre contacto institucional y personal en esta fuente;
  se excluyen por precaución, mismo criterio que ya aplicó `renamu` con los datos de contacto
  del alcalde.
- **`PROMOTOR`** — para instituciones privadas pequeñas, puede ser el nombre de una persona
  natural (no siempre una razón social). Se excluye; **`RZSOCIAL`/`NRORUC`** sí se ingieren
  (identidad de entidad, mismo tratamiento que proveedores en `compras-publicas`/
  `identidad-fiscal`).

Estas cuatro columnas nunca deben leerse del DBF hacia el modelo canónico — mismo patrón que
`informes-control` (excluye `Funcionarios`/`Responsabilidad` del objeto crudo, no solo del
API).

## Cobertura real para La Libertad (verificado en vivo, 2026-09-06)

**9,391 instituciones educativas** (6,217 con `ESTADO = Activo`), en las **12 provincias**
completas de La Libertad y **84 distritos distintos**:

| Provincia | Instituciones |
|---|---|
| Trujillo | 3,352 |
| Sánchez Carrión | 1,094 |
| Otuzco | 773 |
| Pataz | 737 |
| Ascope | 576 |
| Santiago de Chuco | 546 |
| Virú | 486 |
| Gran Chimú | 415 |
| Pacasmayo | 421 |
| Chepén | 361 |
| Julcán | 388 |
| Bolívar | 242 |

Universo nacional completo (180,828 filas) trae La Libertad íntegra — no hay necesidad de
filtrar en origen, la fuente ya es censal completa.

## Lo que esto habilitaría

1. **Cruce por UBIGEO (`CODGEO`) contra `radar-ejecucion`** (`FUNCION = EDUCACIÓN`) — mismo
   patrón exacto ya usado por `servicios-salud`/`programas-sociales` contra `radar-inversiones`.
2. **Densidad/cobertura educativa por distrito** — conteo de IIEE activas por distrito de La
   Libertad, cruzable con población escolar (si se encuentra fuente) o con inversión en
   infraestructura educativa (`radar-inversiones`, `FUNCION = EDUCACIÓN`).
3. **Mapa real de escuelas** — único dataset del catálogo con lat/long por establecimiento
   individual.
4. **Instituciones privadas identificadas por RUC** — cruzable con `identidad-fiscal` para
   verificar estatus tributario del operador educativo privado.

## Pendiente antes de construir el conector

1. **Confirmar semántica exacta de `TELEFONO`/`EMAIL`** si en el futuro se decide que son
   institucionales (no personales) y por tanto ingeribles — no resuelto en esta pasada, se
   optó por excluir por precaución en vez de investigar más a fondo.
2. **`Instituciones_apoyo.dbf`** (390 KB, segunda tabla del ZIP) — no explorada, contenido
   desconocido.
3. **Confirmar si el nombre de archivo (`Padron_web_AAAAMMDD.zip`) es 100% predecible** o si
   requiere listar `listadosrie/` en cada corrida para descubrir el más reciente (recomendado
   por seguridad — mismo patrón defensivo que INFOMIDIS ante nombres de archivo inestables,
   aunque aquí el patrón de nombre ya se ve consistente en las 4 fechas observadas).
4. Sin WAF detectado en la descarga directa desde `escale.minedu.gob.pe` en esta pasada.

**A diferencia de otras Fase 0 del catálogo, este dataset no tiene ambigüedades sin resolver
que bloqueen construir** — los 4 puntos de arriba son profundización opcional, no
prerrequisitos.

## Actualización post-construcción (2026-09-06)

Dos hallazgos reales encontrados al construir, ninguno anticipado en la Fase 0:

1. **El HTML de `listadosrie/` codifica algunos enlaces como entidades hexadecimales**
   (`&#x3a;` = `:`, `&#x2f;` = `/`, etc.) en vez de `href` planos — un regex directo sobre el
   HTML crudo nunca matcheaba nada (`No se encontró ninguna página de corte`), hasta decodificar
   las entidades primero. El conector resuelve el corte más reciente en dos saltos: lista
   `listadosrie/`, extrae los `id` numéricos de las páginas intermedias de Liferay (crecientes
   en el tiempo — se toma el mayor), y de esa página intermedia extrae el link real del ZIP.
2. **El DBF rellena algunos campos de texto de ancho fijo con bytes NUL (`\0`) en vez de
   espacios.** Postgres rechazó la ingesta a mitad de camino
   (`invalid byte sequence for encoding "UTF8": 0x00`) en la fila ~120,000 de 180,828 — un
   `trim()` ingenuo no lo detecta porque el byte NUL no es whitespace. Corregido limpiando
   bytes NUL explícitamente en `toText()` antes de persistir, con test de regresión.

**Ingesta real verificada, ambos hallazgos ya corregidos**: 180,826 filas insertadas, 2
rechazadas (`CEN_EDU` ausente), 0 errores. La Libertad: 9,391 instituciones, 12 provincias, 84
distritos — cuadra exacto con el conteo de la Fase 0 original.

Los 4 puntos de "Pendiente antes de construir" arriba (semántica de TELEFONO/EMAIL, tabla
`Instituciones_apoyo.dbf`, estabilidad del nombre de archivo, WAF) siguen siendo profundización
opcional — no bloquearon la construcción ni afectan la cobertura real ya verificada.
