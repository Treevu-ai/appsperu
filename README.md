# Follow the Sol

Repo: https://github.com/Treevu-ai/appsperu

Apps standalone de datos abiertos del Estado peruano (presupuesto, contrataciones,
inversiones, obras públicas) que se cruzan entre sí por claves compartidas o matching
difuso de nombres de entidad. Cada app tiene su propio Postgres y API Express (API-only,
sin frontends web).

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
| `actividad-agraria` | Serie MIDAGRI jornal agrícola | 4009 |
| `seguridad-ciudadana` | Denuncias policiales SIDPOL (MININTER) | 4010 |

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

## Agente MCP

[`mcp-server/`](mcp-server/) expone las 11 APIs como tools de solo lectura para un agente Claude
vía MCP (transporte stdio). Requiere que las apps ya estén corriendo — ver
[`mcp-server/README.md`](mcp-server/README.md).

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
Libertad. CUI, obra y compra requieren una clave oficial exacta: ALSOL muestra
el vacío de vínculo cuando no la tiene.

`servicios:cuidados` es el registro terminal de infraestructura y alimentación: CUI→obra únicamente por igualdad exacta y proveedor→cumplimiento únicamente por RUC documentado. Cuando no existe lote, entrega o RUC oficial, ALSOL muestra el vacío en vez de inferirlo.
