import { Link } from "react-router-dom";

export function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Hero banner (marca) */}
      <section className="relative border-b border-line">
        <img
          src="/hero-banner.png"
          alt="RASTRO convierte señales dispersas en inteligencia clara para decidir mejor. Cada señal deja un rastro. Nosotros lo hacemos visible."
          className="w-full h-auto max-h-[min(520px,70vh)] object-cover object-center"
          width={1920}
          height={520}
          fetchPriority="high"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/80 to-transparent px-6 pb-8 pt-16">
          <div className="max-w-5xl mx-auto flex flex-wrap gap-3">
            <Link to="/gore/la-libertad/ficha" className="btn-primary">
              Empezar por La Libertad
            </Link>
            <Link to="/docs/api" className="btn-ghost">
              Conectar desde un agente IA
            </Link>
          </div>
        </div>
      </section>

      {/* Acerca de */}
      <section className="relative max-w-5xl mx-auto px-6 py-16">
        <p className="text-xs tracking-widest text-accent font-mono">RASTRO · ALPHA</p>
        <p className="mt-4 text-fg-soft text-lg max-w-3xl leading-relaxed">
          Plataforma de trazabilidad sobre datos abiertos del Estado peruano — accesible desde el navegador y desde
          agentes IA vía MCP. Cada cifra lleva fuente, corte y cobertura; lo que falta se declara vacío, no se rellena
          con suposiciones.
        </p>
      </section>

      {/* Lectores */}
      <section className="relative max-w-5xl mx-auto px-6 pb-16 grid md:grid-cols-3 gap-4">
        <Link to="/gore/la-libertad/ficha" className="card block">
          <p className="text-xs text-muted font-mono">LECTOR 1</p>
          <h3 className="text-fg font-semibold mt-1">GORE La Libertad</h3>
          <p className="text-sm text-fg-soft mt-2">
            Ficha, comparativo y benchmark de entidades sectoriales. Todo con la misma regla territorial.
          </p>
        </Link>
        <Link to="/buscar" className="card block">
          <p className="text-xs text-muted font-mono">LECTOR 2</p>
          <h3 className="text-fg font-semibold mt-1">Prensa de datos</h3>
          <p className="text-sm text-fg-soft mt-2">
            Perfil de proveedor por RUC: identidad, contrataciones, sanciones, observaciones.
          </p>
        </Link>
        <Link to="/distrito/130101" className="card block">
          <p className="text-xs text-muted font-mono">LECTOR 3</p>
          <h3 className="text-fg font-semibold mt-1">Auditoría / OCI</h3>
          <p className="text-sm text-fg-soft mt-2">
            Obras y activos por distrito, integridad de evidencia, sin score de calidad.
          </p>
        </Link>
      </section>

      {/* Para agentes IA */}
      <section className="relative max-w-5xl mx-auto px-6 pb-24">
        <div className="card border-accent/30">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs text-accent font-mono">PARA AGENTES IA</p>
            <span className="text-xs text-muted">MCP · 82 tools · stdio · local</span>
          </div>
          <h2 className="text-fg font-semibold text-lg mt-2">Una sola query. Ochenta y dos tools a tu disposición.</h2>
          <p className="text-fg-soft mt-3">
            Rastro expone un servidor MCP (Model Context Protocol) con 82 herramientas de solo lectura. Compatible con
            Claude Code, Claude Desktop, Cursor, Windsurf, Cline y Continue.dev. Las APIs corren en localhost; el MCP las
            agrega para tu agente.
          </p>

          <div className="mt-5 grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted font-mono mb-2">Setup (Cursor / Claude Code)</p>
              <pre className="text-xs bg-ink-950 border border-line rounded-md p-3 overflow-x-auto text-fg-soft">
                <code>{`# 1. Stack local
bash scripts/dev-local.sh

# 2. MCP en ~/.cursor/mcp.json
{
  "mcpServers": {
    "rastro": {
      "command": "node",
      "args": ["<repo>/mcp-server/dist/index.js"]
    }
  }
}`}</code>
              </pre>
            </div>
            <div>
              <p className="text-xs text-muted font-mono mb-2">Una sola query</p>
              <pre className="text-xs bg-ink-950 border border-line rounded-md p-3 overflow-x-auto text-fg-soft">
                <code>{`"Para los últimos 12 meses: lista proveedores
sancionados por la OECE que también ganaron
contratos del GORE La Libertad en el sector
transporte, con valor total adjudicado y % de
concentración. Cita cada RUC y cada OCID."`}</code>
              </pre>
              <p className="text-xs text-muted mt-2">
                El agente invoca <code className="text-fg">proveedores_sancionados_sanciones</code>,{" "}
                <code className="text-fg">compras_publicas_suppliers</code>,{" "}
                <code className="text-fg">compras_publicas_supplier_by_id</code> y los encadena — sin que tú toques la
                terminal.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/docs/api" className="btn-ghost">
              Ver los 82 tools
            </Link>
            <a
              href="https://github.com/Treevu-ai/appsperu/tree/master/mcp-server"
              className="btn-ghost"
              target="_blank"
              rel="noopener"
            >
              Código del MCP server ↗
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
