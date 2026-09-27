# territorio-inteligencia — PROTOTIPO, sin ingesta real

**No está en el catálogo MCP y no debe estarlo hasta que esto cambie.** Ver
"Por qué está fuera del MCP" más abajo.

## Qué es

App Express que cruza catastro (minero y forestal) con sanciones y
emergencias para responder cuatro preguntas: qué titulares tienen riesgo
sancionador, si la superficie de un departamento está concentrada en pocas
manos, si un proyecto público se superpone a un derecho minero, y el riesgo
EUDR de un título forestal.

Las rutas existen y el código compila. **Los datos no.**

## Por qué está fuera del MCP

`src/services/` consulta fuentes que **no existen en ninguna base de datos del
monorepo**, y lo hace en silencio:

| Consulta | Dónde vive de verdad | Estado |
|---|---|---|
| `inhabilitaciones`, `inhabilitaciones_judiciales`, `multas` | base de `proveedores-sancionados` (5439) | no replicada |
| `catastro_forestal_titulos` | base de `catastro-forestal` (4034) | no replicada |
| `minam_deforestacion` | **no existe** | el propio código lo admite |
| `catastro_minero_derechos` | base de `catastro-minero` (4031) | sí, es el único `DATABASE_URL` real |

`.env.example` apunta el único pool a `catastro_minero`, así que las consultas
forestales y de sanciones no pueden funcionar: es una sola conexión, y las otras
bases están en servidores distintos.

Además:

- **Columnas que el catastro forestal real no tiene.** Los servicios piden
  `f.titular_ruc`, `f.titular_nombre`, `f.superficie`, `f.provincia`,
  `f.distrito`, `f.codigo_concesion`. El esquema real
  (`apps/catastro-forestal/api/src/db/migrations/001_init.sql`) tiene `capa`,
  `objectid`, `nom_dep`, `nom_pro`, `nom_dis`, `sup_sig`, `sup_apr` — y ningún
  titular, porque SERFOR publica el título, no su dueño.
- **Un nombre disfrazado de RUC.** En la rama minera, `ruc` se llenaba con
  `titular`, que es el *nombre* del titular. El catastro minero no tiene columna
  de RUC. Cualquier consumidor que use ese campo para cruzar con sanciones
  está cruzando un nombre contra un RUC.
- **`riesgo-eudr.service.ts` convierte un error en "no hay riesgo".** El
  `catch` final devuelve `[]` ante cualquier fallo, incluido "la tabla no
  existe". Para un agente, `[]` significa "no encontramos riesgo", que es lo
  contrario de "no pudimos preguntar". Es el peor default posible para una
  herramienta de fiscalización.
- **Los `.cjs` de la raíz crean una tabla falsa.** `create_table.cjs` y los
  `seed_*.cjs` ejecutan `CREATE TABLE IF NOT EXISTS catastro_forestal_titulos`
  con las columnas inventadas y la llenan con datos fabricados (La Libertad,
  Huánuco). En local eso hace que la app "funcione" y esconde que en
  cualquier otro entorno las consultas revientan.

## Qué falta para encenderla

1. **Conectores de ingesta reales.** O se replica cada fuente a la base de esta
   app, o —lo más barato y ya es el patrón del repo— se agregan pools por
   fuente siguiendo lo que ya hace `proveedores-sancionados`
   (`CATASTRO_FORESTAL_DATABASE_URL`, `SANCIONES_DATABASE_URL`, etc.) y se
   resuelven los cruces en aplicación.
2. **Un esquema propio** bajo `src/db/migrations/`, si se replica algo.
3. **Corregir las columnas** contra los esquemas reales, o cambiar el contrato
   de salida para dejar de prometer un RUC que la fuente no tiene.
4. **Que `riesgo-eudr` deje de tragarse los errores.**
5. **Tests.** No tiene ninguno.

Solo entonces se agrega a `APP_KEYS` en `mcp-server/src/apps.ts`, y CX-15
exigirá que sus 4 rutas GET estén mapeadas 1:1 en el catálogo.

## Nota sobre los scripts de la raíz

Los `.cjs` (`create_table.cjs`, `create_int_mining.cjs`, `create_proyectos.cjs`,
`seed_*.cjs`, `check_*.cjs`, `fix_cols.cjs`) son exploración de una sesión
anterior, no parte de la app: crean un esquema que ninguna migración declara y
lo llenan con datos inventados. No son parte del pipeline. Si se los borra, esta
app no pierde nada real.
