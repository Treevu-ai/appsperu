# appsperu — monorepo de Rastro

> **El Estado peruano deja más datos abiertos de los que nadie está usando. Nosotros los estamos conectando.**

Repo: https://github.com/Treevu-ai/appsperu

Monorepo que conecta datos abiertos del Estado peruano — presupuesto, contrataciones, inversiones, obras públicas, catastro minero, títulos forestales, transporte, infraestructura, supervisión ambiental, **macro BCRP (tipo de cambio, inflación, PBI, tasas de interés)** — en un pipeline de ingestión manual con conectores estándar y rate limits respetuosos.

## Arquitectura actual

```
Agentes IA (Claude Code, Cursor, Claude Desktop)
    → MCP Worker (Cloudflare Workers — rastro.fyi/mcp)
        → Neon: 1 proyecto Postgres, 36 bases (una por app)
                ↑
    Scripts de ingestión (locales, on-demand → Neon con pg)
```

- **MCP Server** (`mcp-server/`): Worker de Cloudflare que expone **209 tools de solo lectura** vía 3 meta-tools (`rastro_buscar_tools` + `rastro_llamar` + `rastro_health`).
- **Data layer**: Neon (Postgres 17 serverless) — un proyecto, 36 bases, un rol. Se eligió Neon sobre D1: D1 no tiene PostGIS, ni transacciones, ni advisory locks, y el repo los usa. Ver [`docs/adr/0024-neon-en-lugar-de-d1.md`](docs/adr/0024-neon-en-lugar-de-d1.md).
- **Ingreso de datos**: scripts locales (`apps/<app>/api/src/ingest/*`) que corren a demanda y escriben a Neon con `pg` de siempre. No cambian.
- **Provisioning**: [`mcp-server/RUNBOOK_NEON.md`](mcp-server/RUNBOOK_NEON.md).

## Apps

| App | Dominio | Base Neon |
|---|---|---|
| `radar-ejecucion` | Presupuesto/ejecución (MEF) + benchmark territorial | `radar_ejecucion` |
| `compras-publicas` | Contrataciones (OECE/OCDS) + proveedores/concentración | `compras_publicas` |
| `radar-inversiones` | Inversiones (Invierte.pe) | `radar_inversiones` |
| `infobras` | Obras públicas (Contraloría) | `infobras` |
| `ceplan-estrategico` | Planificación estratégica (ObservaPerú) | `ceplan_estrategico` |
| `ceplan-geo` | GeoServer (capas territoriales/infraestructura) | `ceplan_geo` |
| `identidad-fiscal` | Padrón RUC (SUNAT) + cruces | `identidad_fiscal` |
| `salud-institucional` | Score compuesto (agrega otras fuentes, sin BD propia) | comparte DBs de otras apps |
| `proveedores-sancionados` | Inhabilitaciones/multas RNP/OECE | `proveedores_sancionados` |
| `actividad-agraria` | Series MIDAGRI regionales (jornal, tractor, yunta) | `actividad_agraria` |
| `seguridad-ciudadana` | Denuncias policialas SIDPOL (MININTER) | `seguridad_ciudadana` |
| `bcrp-comercio-exterior` | Comercio exterior + macro BCRP | `bcrp_comercio_exterior` |
| `inversion-privada` | Cartera APP/PA + Obras por Impuestos | `inversion_privada` |
| `bcrp-la-libertad` | Síntesis económica de La Libertad (BCRP Trujillo) | `bcrp_la_libertad` |
| `servicios-salud` | Establecimientos de salud (RENIPRESS/SUSALUD) | `servicios_salud` |
| `programas-sociales` | Cobertura de programas sociales (INFOMIDIS/MIDIS) | `programas_sociales` |
| `actividad-empresarial` | Empresas del sector privado por distrito (MTPE) | `actividad_empresarial` |
| `informes-control` | Informes de control (Contraloría) | `informes_control` |
| `mindef` | Convenios offset, capacitación, misiones de paz | `mindef` |
| `mimp` | Violencia contra la mujer (CEM) + Chat 100 | `mimp` |
| `renamu` | Capacidad institucional municipal | `renamu` |
| `autoridades-electas` | Autoridades proclamadas (JNE) | `autoridades_electas` |
| `instituciones-educivas` | Padrón nacional de instituciones educativas | `instituciones_educativas` |
| `infracciones-ambientales` | Infractores ambientales sancionados (OEFA/RUIAS) | `infracciones_ambientales` |
| `red-vial-subnacional` | Intervenciones en redes viales (MTC/Provías) | `red_vial_subnacional` |
| `residuos-solidos` | Residuos sólidos por distrito (MINAM/SIGERSOL) | `residuos_solidos` |
| `infraestructura-mtc` | Terminales portuarios, aeródromos, peajes (MTC) | `infraestructura_mtc` |
| `riesgo-fiscal-isds` | Pasivos contingentes ISDS/APP (MEF/MMM) | `riesgo_fiscal_isds` |
| `candidatos-erm` | Candidatos a Elecciones Regionales/Municipales 2026 (JNE/Datapol) | `candidatos_erm` |
| `poder-judicial` | Estadística jurisdiccional (Poder Judicial) | `poder_judicial` |
| `violencia-escolar` | Casos reportados a SíseVe (MINEDU) | `violencia_escolar` |
| `legislativo-congreso` | Proyectos de ley del Congreso | `legislativo_congreso` |
| `catastro-minero` | Derechos mineros (INGEMMET) | `catastro_minero` |
| `areas-protegidas` | Áreas naturales protegidas (SERNANP) | `areas_protegidas` |
| `senace-cartera-proyectos` | Cartera de proyectos ambientales (SENACE) | `senace_cartera_proyectos` |
| `catastro-forestal` | Catastro forestal (SERFOR) | `catastro_forestal` |
| `emergencias-indeci` | Emergencias y daños (INDECI/SINPAD) | `emergencias_indeci` |
| `geo-intersections` | Cruce geográfico de capas territoriales | `geo_intersections` |

## Uso del MCP Server (Worker)

### Desarrollo local (stdio)

```bash
cd mcp-server
npm ci
npm run dev          # transporte stdio — para usar desde Claude Code/Cursor local
```

Configura el cliente MCP (`.mcp.json` o `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "rastro": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"]
    }
  }
}
```

### Producción (Cloudflare Worker)

El MCP server está desplegado como un Worker de Cloudflare en `https://rastro.fyi/mcp` (Streamable HTTP, autenticado con API key `x-api-key`).

El secret `NEON_DATABASE_URL` apunta a una base cualquiera del proyecto; el resolver reescribe el nombre por app. Ver [`mcp-server/src/db/neon-env.ts`](mcp-server/src/db/neon-env.ts) y el runbook de provisioning.

## Ingesta de datos (on-demand)

Todo es manual — no hay scheduler. Cada conector es un script CLI:

```bash
# Ingesta completa para La Libertad (MEF + Invierte + INFOBRAS + OECE + ObservaPerú + BCRP)
bash scripts/ingest-la-libertad-completo.sh

# Ingesta individual por app
cd apps/<app>/api
npm run dev          # inicia server local
# en otra terminal:
npm run ingest:*      # según los scripts que declare cada app
```

Ver [`docs/conectores.md`](docs/conectores.md) — ficha técnica por conector.

## Documentación

- [`docs/ESTADO.md`](docs/ESTADO.md) — estado actual, historial de trabajo, pendientes.
- [`docs/conectores.md`](docs/conectores.md) — qué hace cada conector, cómo, fuente y frecuencia.
- [`docs/data-contracts/`](docs/data-contracts/) — un archivo por fuente externa.
- [`docs/adr/`](docs/adr/) — decisiones arquitectónicas.
- [`mcp-server/README.md`](mcp-server/README.md) — arquitectura interna del servidor MCP.
