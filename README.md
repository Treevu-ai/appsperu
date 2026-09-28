# appsperu — monorepo de Rastro

> **El Estado peruano deja más datos abiertos de los que nadie está usando. Nosotros los estamos conectando.**

Repo: https://github.com/Treevu-ai/appsperu

Monorepo que conecta datos abiertos del Estado peruano — presupuesto, contrataciones, inversiones, obras públicas, catastro minero, títulos forestales, transporte, infraestructura, supervisión ambiental, **macro BCRP (tipo de cambio, inflación, PBI, tasas de interés)** — en un pipeline de ingestión manual con conectores estándar y rate limits respetuosos.

## Arquitectura actual

```
Agentes IA (Claude Code, Cursor, Claude Desktop)
    → MCP Worker (Cloudflare Workers — rastro.fyi/mcp)
        → D1 databases (38 bindings, una por app)
                ↑
    Scripts de ingestión (locales, on-demand → D1 HTTP API)
```

- **MCP Server** (`mcp-server/`): Worker de Cloudflare que expone **209 tools de solo lectura** vía 3 meta-tools (`rastro_buscar_tools` + `rastro_llamar` + `rastro_health`).
- **Data layer**: 38 D1 databases (SQLite), una por app backend.
- **Ingreso de datos**: scripts locales (`apps/<app>/api/src/ingest/*`) que corren a demanda y escriben a D1 vía `wrangler d1 execute` o la D1 HTTP API.

## Apps

| App | Dominio | D1 Binding |
|---|---|---|
| `radar-ejecucion` | Presupuesto/ejecución (MEF) + benchmark territorial | `RASTRO_DB_RADAR_EJECUCION` |
| `compras-publicas` | Contrataciones (OECE/OCDS) + proveedores/concentración | `RASTRO_DB_COMPRAS_PUBLICAS` |
| `radar-inversiones` | Inversiones (Invierte.pe) | `RASTRO_DB_RADAR_INVERSIONES` |
| `infobras` | Obras públicas (Contraloría) | `RASTRO_DB_INFOBRAS` |
| `ceplan-estrategico` | Planificación estratégica (ObservaPerú) | `RASTRO_DB_CEPLAN_ESTRATEGICO` |
| `ceplan-geo` | GeoServer (capas territoriales/infraestructura) | `RASTRO_DB_CEPLAN_GEO` |
| `identidad-fiscal` | Padrón RUC (SUNAT) + cruces | `RASTRO_DB_IDENTIDAD_FISCAL` |
| `salud-institucional` | Score compuesto (agrega otras fuentes, sin BD propia) | comparte DBs de otras apps |
| `proveedores-sancionados` | Inhabilitaciones/multas RNP/OECE | `RASTRO_DB_PROVEEDORES_SANCIONADOS` |
| `actividad-agraria` | Series MIDAGRI regionales (jornal, tractor, yunta) | `RASTRO_DB_ACTIVIDAD_AGRARIA` |
| `seguridad-ciudadana` | Denuncias policialas SIDPOL (MININTER) | `RASTRO_DB_SEGURIDAD_CIUDADANA` |
| `bcrp-comercio-exterior` | Comercio exterior + macro BCRP | `RASTRO_DB_BCRP_COMERCIO_EXTERIOR` |
| `inversion-privada` | Cartera APP/PA + Obras por Impuestos | `RASTRO_DB_INVERSION_PRIVADA` |
| `bcrp-la-libertad` | Síntesis económica de La Libertad (BCRP Trujillo) | `RASTRO_DB_BCRP_LA_LIBERTAD` |
| `servicios-salud` | Establecimientos de salud (RENIPRESS/SUSALUD) | `RASTRO_DB_SERVICIOS_SALUD` |
| `programas-sociales` | Cobertura de programas sociales (INFOMIDIS/MIDIS) | `RASTRO_DB_PROGRAMAS_SOCIALES` |
| `actividad-empresarial` | Empresas del sector privado por distrito (MTPE) | `RASTRO_DB_ACTIVIDAD_EMPRESARIAL` |
| `informes-control` | Informes de control (Contraloría) | `RASTRO_DB_INFORMES_CONTROL` |
| `mindef` | Convenios offset, capacitación, misiones de paz | `RASTRO_DB_MINDEF` |
| `mimp` | Violencia contra la mujer (CEM) + Chat 100 | `RASTRO_DB_MIMP` |
| `renamu` | Capacidad institucional municipal | `RASTRO_DB_RENAMU` |
| `autoridades-electas` | Autoridades proclamadas (JNE) | `RASTRO_DB_AUTORIDADES_ELECTAS` |
| `instituciones-educivas` | Padrón nacional de instituciones educativas | `RASTRO_DB_INSTITUCIONES_EDUCATIVAS` |
| `infracciones-ambientales` | Infractores ambientales sancionados (OEFA/RUIAS) | `RASTRO_DB_INFRACCIONES_AMBIENTALES` |
| `red-vial-subnacional` | Intervenciones en redes viales (MTC/Provías) | `RASTRO_DB_RED_VIAL_SUBNACIONAL` |
| `residuos-solidos` | Residuos sólidos por distrito (MINAM/SIGERSOL) | `RASTRO_DB_RESIDUOS_SOLIDOS` |
| `infraestructura-mtc` | Terminales portuarios, aeródromos, peajes (MTC) | `RASTRO_DB_INFRAESTRUCTURA_MTC` |
| `riesgo-fiscal-isds` | Pasivos contingentes ISDS/APP (MEF/MMM) | `RASTRO_DB_RIESGO_FISCAL_ISDS` |
| `candidatos-erm` | Candidatos a Elecciones Regionales/Municipales 2026 (JNE/Datapol) | `RASTRO_DB_CANDIDATOS_ERM` |
| `poder-judicial` | Estadística jurisdiccional (Poder Judicial) | `RASTRO_DB_PODER_JUDICIAL` |
| `violencia-escolar` | Casos reportados a SíseVe (MINEDU) | `RASTRO_DB_VIOLENCIA_ESCOLAR` |
| `legislativo-congreso` | Proyectos de ley del Congreso | `RASTRO_DB_LEGISLATIVO_CONGRESO` |
| `catastro-minero` | Derechos mineros (INGEMMET) | `RASTRO_DB_CATASTRO_MINERO` |
| `areas-protegidas` | Áreas naturales protegidas (SERNANP) | `RASTRO_DB_AREAS_PROTEGIDAS` |
| `senace-cartera-proyectos` | Cartera de proyectos ambientales (SENACE) | `RASTRO_DB_SENACE_CARTERA_PROYECTOS` |
| `catastro-forestal` | Catastro forestal (SERFOR) | `RASTRO_DB_CATASTRO_FORESTAL` |
| `emergencias-indeci` | Emergencias y daños (INDECI/SINPAD) | `RASTRO_DB_EMERGENCIAS_INDECI` |
| `geo-intersections` | Cruce geográfico de capas territoriales | `RASTRO_DB_GEO_INTERSECTIONS` |

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

Ver [`mcp-server/wrangler.toml`](mcp-server/wrangler.toml) para la configuración D1.

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
