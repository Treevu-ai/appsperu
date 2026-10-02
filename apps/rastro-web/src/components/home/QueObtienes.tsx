// Qué obtienes con tu sk-rastro — reemplaza a la vieja tarjeta "Para agentes
// IA" del fondo de la página: acá es el argumento de venta central, no un
// bloque más entre nueve.
import { Link } from "react-router-dom";
import counts from "../../data/catalog-counts.json" with { type: "json" };

export function QueObtienes() {
  return (
    <section className="relative max-w-5xl mx-auto px-6 py-16 md:py-24">
      <div className="max-w-3xl mb-10 md:mb-14">
        <p className="text-xs font-mono text-accent uppercase tracking-[0.18em] mb-4 md:mb-5">02 — Qué obtienes</p>
        <h2 className="text-fg font-semibold text-2xl md:text-3xl leading-tight tracking-tight">
          Una key. {counts.toolCount} tools de solo lectura. Fuente y fecha en cada dato.
        </h2>
        <p className="mt-4 text-fg-soft leading-relaxed text-sm md:text-base">
          Tu <code className="text-fg">sk-rastro-*</code> conecta tu agente IA al servidor MCP de Rastro en{" "}
          <code className="text-fg">mcp.rastro.fyi</code>, en producción. {counts.toolCount} tools buscables desde 2
          meta-tools —<code className="text-fg">rastro_buscar_tools</code> y <code className="text-fg">rastro_llamar</code>—
          en vez de {counts.toolCount} registrados uno por uno. Compatible con Claude Code, Claude Desktop, Cursor,
          Windsurf, Cline y Continue.dev.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <p className="text-xs text-muted font-mono mb-2">Setup (Cursor / Claude Code)</p>
          <pre className="text-[10px] sm:text-xs bg-ink-950 border border-line rounded-md p-3 overflow-x-auto text-fg-soft whitespace-pre-wrap break-words sm:whitespace-pre">
            <code>{`{
  "mcpServers": {
    "rastro": {
      "url": "https://mcp.rastro.fyi/mcp",
      "headers": {
        "x-api-key": "sk-rastro-..."
      }
    }
  }
}`}</code>
          </pre>
        </div>
        <div className="card">
          <p className="text-xs text-muted font-mono mb-2">Una sola query</p>
          <pre className="text-xs bg-ink-950 border border-line rounded-md p-3 overflow-x-auto text-fg-soft">
            <code>{`"Para los últimos 12 meses: lista proveedores
sancionados por la OECE que también ganaron
contratos del GORE La Libertad en el sector
transporte, con valor total adjudicado y % de
concentración. Cita cada RUC y cada OCID."`}</code>
          </pre>
          <p className="text-xs text-muted mt-2">
            Tu agente busca los tools con <code className="text-fg">rastro_buscar_tools</code> y los ejecuta con{" "}
            <code className="text-fg">rastro_llamar</code>, encadenando resultados — sin que tú toques la terminal.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/solicitar-acceso" className="btn-primary">
          Solicitar acceso sk-rastro
        </Link>
        <Link to="/docs/api" className="btn-ghost">
          Ver los {counts.toolCount} tools
        </Link>
      </div>
    </section>
  );
}
