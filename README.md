# Follow the Sol

Repo: https://github.com/Treevu-ai/appsperu

Apps standalone de datos abiertos del Estado peruano (presupuesto, contrataciones,
inversiones, obras públicas) que se cruzan entre sí por claves compartidas o matching
difuso de nombres de entidad. Cada app tiene su propio Postgres, API Express y frontend
Next.js.

## Apps

| App | Dominio | API | Web |
|---|---|---|---|
| `radar-ejecucion` | Presupuesto/ejecución (MEF) + benchmark territorial | 4000 | 3000 |
| `compras-publicas` | Contrataciones (OECE/OCDS) + proveedores/concentración | 4001 | 3001 |
| `radar-inversiones` | Inversiones (Invierte.pe) | 4002 | 3002 |
| `infobras` | Obras públicas (Contraloría) | 4003 | 3003 |
| `ceplan-estrategico` | Planificación estratégica (PEI/POI/Metas) — en construcción | 4004 | 3004 |

## Levantar una app

```bash
cd apps/<nombre>/api
docker compose up -d
cp .env.example .env
npm run migrate
npm run dev

cd apps/<nombre>/web
cp .env.example .env
npm run dev
```

## Agente MCP

[`mcp-server/`](mcp-server/) expone las 8 APIs como tools de solo lectura para un agente Claude
vía MCP (transporte stdio). Requiere que las apps ya estén corriendo — ver
[`mcp-server/README.md`](mcp-server/README.md).

## Documentación

- [`docs/ESTADO.md`](docs/ESTADO.md) — estado actual, cruces entre apps, pendientes.
- [`docs/conectores.md`](docs/conectores.md) — ficha técnica por conector: qué hace, cómo,
  con qué frecuencia y de qué fuente.
- [`docs/data-contracts/`](docs/data-contracts/) — un archivo por fuente externa (MEF, OECE,
  Invierte.pe, INFOBRAS) con lo confirmado en vivo.
- [`docs/adr/`](docs/adr/) — decisiones arquitectónicas con su razón.
