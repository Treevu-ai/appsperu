import { Link } from "react-router-dom";

export function Home() {
  return (
    <div className="relative overflow-hidden radial-glow">
      <div className="absolute inset-0 grid-bg opacity-60 pointer-events-none" />

      {/* Hero */}
      <section className="relative max-w-5xl mx-auto px-6 py-20">
        <p className="text-xs tracking-widest text-accent font-mono">RASTRO · ALPHA</p>
        <h1 className="font-serif text-5xl md:text-6xl text-fg mt-3 leading-tight">
          Cada señal deja un <span className="text-accent">rastro</span>.
          <br />
          Nosotros lo hacemos visible.
        </h1>
        <p className="mt-6 text-fg-soft text-lg max-w-3xl">
          <strong className="text-fg">Rastro</strong> convierte señales dispersas en inteligencia clara para decidir
          mejor. Plataforma de trazabilidad sobre datos abiertos del Estado peruano — accesible desde el navegador y
          desde agentes IA vía MCP.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/gore/la-libertad/ficha" className="btn-primary">
            Empezar por La Libertad
          </Link>
          <Link to="/docs/api" className="btn-ghost">
            Conectar desde un agente IA
          </Link>
        </div>
      </section>

      {/* Acerca de */}
      <section className="relative max-w-5xl mx-auto px-6 pb-16">
        <div className="card">
          <h2 className="text-fg font-semibold text-lg">Acerca de</h2>
          <p className="text-fg-soft mt-3 leading-relaxed">
            Rastro es una plataforma de inteligencia que ayuda a equipos y organizaciones a encontrar, conectar y
            entender las señales que importan. Transformamos información dispersa en contexto accionable, con foco en
            trazabilidad, claridad y decisiones más seguras.
          </p>
          <p className="text-fg-soft mt-3 leading-relaxed">
            Porque detrás de cada cambio, oportunidad o riesgo hay un rastro. Y verlo a tiempo cambia lo que viene
            después.
          </p>
        </div>
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
            <span className="text-xs text-muted">MCP · 82 tools · stdio</span>
          </div>
          <h2 className="text-fg font-semibold text-lg mt-2">
            Una sola query. Ochenta y dos tools a tu disposición.
          </h2>
          <p className="text-fg-soft mt-3">
            Rastro expone un servidor MCP (Model Context Protocol) con 82 herramientas de solo lectura. Compatible con
            Claude Code, Claude Desktop, Cursor, Windsurf, Cline y Continue.dev. Tu agente encadena los tools, razona
            sobre los resultados y entrega respuestas con citas verificables — todo desde un único prompt.
          </p>

          <div className="mt-5 grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted font-mono mb-2">Setup (Claude Code)</p>
              <pre className="text-xs bg-ink-950 border border-line rounded-md p-3 overflow-x-auto text-fg-soft">
                <code>{`# Una línea
claude mcp add rastro \\
  -- node /ruta/al/repo/mcp-server/dist/index.js

# O vía .mcp.json en el repo
{
  "mcpServers": {
    "rastro": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"]
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
                <code className="text-fg">compras_publicas_supplier_by_id</code> y los encadena — sin que tú
                toques la terminal.
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
