# appsperu — monorepo de Rastro

> **RASTRO** convierte señales dispersas en inteligencia clara para decidir mejor.
> *Cada señal deja un rastro. Nosotros lo hacemos visible.*

Repo: https://github.com/Treevu-ai/appsperu

Monorepo con 14 apps backend (APIs Express + Postgres por app) que exponen datos abiertos
del Estado peruano (presupuesto, contrataciones, inversiones, obras públicas) cruzados por
claves compartidas o matching difuso de nombres de entidad. La capa de lectura pública para
humanos y agentes IA es **Rastro** (`apps/rastro-web/`, publicada en `rastro.pages.dev`); el
servidor MCP (`mcp-server/`) expone las 14 APIs como tools de solo lectura para Claude Code,
Claude Desktop, Cursor, Windsurf, Cline y Continue.dev.

Rastro es una plataforma de inteligencia que ayuda a equipos y organizaciones a encontrar, conectar y entender las señales que importan. Transformamos información dispersa en contexto accionable, con foco en trazabilidad, claridad y decisiones más seguras. Porque detrás de cada cambio, oportunidad o riesgo hay un rastro, y verlo a tiempo cambia lo que viene después.

## Apps

| App | Dominio | API |
|---|---|---|
| `radar-ejecucion` | Presupuesto/ejecución (MEF) + benchmark territorial | 4000 |
| `compras-publicas` | Contrataciones (OECE/OCDS) + proveedores/concentración | 4001 |
| `radar-inversiones` | Inversiones (Invierte.pe) | 4002 |
| `infobras` | Obras públicas (Contraloría) | 4003 |
| `ceplan-estrategico` | Planificación estratégica (ObservaPerú) | 4004 |
| `ceplan-geo` | GeoServer (capas territoriales/infraestructura) | 4005 |
| `identidad-fiscal` | Padrón RUC (SUNAT) + cruces | 4006 |
| `salud-institucional` | Score compuesto (agrega otras fuentes, sin BD propia) | 4007 |
| `proveedores-sancionados` | Inhabilitaciones/multas RNP/OECE | 4008 |
| `actividad-agraria` | Series MIDAGRI regionales (jornal, tractor, yunta) | 4009 |
| `seguridad-ciudadana` | Denuncias policiales SIDPOL (MININTER) | 4010 |
| `bcrp-comercio-exterior` | Comercio exterior agregado nacional (BCRP) | 4011 |

## Levantar una app

```bash
cd apps/<nombre>/api
docker compose up -d
cp .env.example .env
npm run migrate
npm run dev
```

`salud-institucional/api` no tiene Postgres propio — solo `.env` con las connection strings
de las otras bases y `npm run dev`.

## Servidor MCP (Model Context Protocol)

[`mcp-server/`](mcp-server/) expone las 14 APIs como **82 tools de solo lectura** para
agentes IA vía MCP (transporte stdio). Compatible con Claude Code, Claude Desktop,
Cursor, Windsurf, Cline y Continue.dev. Una vez conectado, el agente encadena los
tools, razona sobre los resultados y entrega respuestas con citas verificables.
Requiere que las apps ya estén corriendo — ver [`mcp-server/README.md`](mcp-server/README.md).

Para conectar Rastro desde un agente: ver [`apps/rastro-web/DEPLOY.md`](apps/rastro-web/DEPLOY.md)
y la página pública `/docs/api` en [rastro.pages.dev/docs/api](https://rastro.pages.dev/docs/api).

## Documentación

- [`docs/ESTADO.md`](docs/ESTADO.md) — estado actual, cruces entre apps, pendientes.
- [`docs/conectores.md`](docs/conectores.md) — ficha técnica por conector: qué hace, cómo,
  con qué frecuencia y de qué fuente.
- [`docs/data-contracts/`](docs/data-contracts/) — un archivo por fuente externa (MEF, OECE,
  Invierte.pe, INFOBRAS) con lo confirmado en vivo.
- [`docs/adr/`](docs/adr/) — decisiones arquitectónicas con su razón.
- [`docs/PRD_Seguimiento_Sectores_y_GORE_La_Libertad_v1.md`](docs/PRD_Seguimiento_Sectores_y_GORE_La_Libertad_v1.md)
  — seguimiento terminal de ministerios, organismos y Gobierno Regional La Libertad con cortes y vínculos verificables.

## Consultas sectoriales por terminal

```bash
cd apps/radar-ejecucion/api
npm run sectors:inventory -- --anio 2026 --limite 50
npm run ficha:sector -- --sector TRANSPORTE --anio 2026
npm run ficha:entidad -- --entity-code 831 --anio 2026
npm run comparativo:sectores -- --sectores SALUD,TRANSPORTE,VIVIENDA --anio 2026
npm run movimiento:presupuesto -- --anio 2026
npm run servicios:cuidados -- --tipo ALIMENTACION
```

Las entidades nacionales se consultan solo por gasto dirigido al departamento
(`META_DEPARTAMENTO`); las regionales, por la unidad ejecutora con sede en La
Libertad. CUI, obra y compra requieren una clave oficial exacta: Rastro muestra
el vacío de vínculo cuando no la tiene.

`servicios:cuidados` es el registro terminal de infraestructura y alimentación: CUI→obra únicamente por igualdad exacta y proveedor→cumplimiento únicamente por RUC documentado. Cuando no existe lote, entrega o RUC oficial, Rastro muestra el vacío en vez de inferirlo.

## Ingesta completa La Libertad

```bash
bash scripts/ingest-la-libertad-completo.sh
```

Orquesta MEF (meta departamental), Invierte (CSV nacional), INFOBRAS, OECE segmentado, ObservaPerú y BCRP. Requiere Postgres de cada app levantado y `.env` configurados.
