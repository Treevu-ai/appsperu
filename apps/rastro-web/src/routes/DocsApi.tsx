/**
 * Página /docs/api — catálogo de tools MCP de appsperu.
 *
 * AL3-15: generado en build-time desde `mcp-server/src/catalog.ts` por
 * `scripts/generate-mcp-catalog.mjs` (corre en `predev`/`prebuild`, ver
 * package.json) hacia `src/data/mcp-tools-catalog.json`. No hay copia
 * manual que mantener sincronizada — si agregas un tool al catálogo MCP,
 * el próximo `npm run dev`/`build` lo recoge solo.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import tools from "../data/mcp-tools-catalog.json" with { type: "json" };

interface Tool {
  name: string;
  app: string;
  description: string;
  pathTemplate: string;
  pathParams: string[];
  queryParams: string[];
  sinScheduler: boolean;
}

const TOOLS = tools as Tool[];
const DESCRIPTION_PREVIEW_LEN = 200;

export function DocsApi() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  }, [query]);

  const byApp = useMemo(() => {
    const grouped: Record<string, Tool[]> = {};
    for (const t of filtered) {
      if (!grouped[t.app]) grouped[t.app] = [];
      grouped[t.app].push(t);
    }
    return grouped;
  }, [filtered]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs text-accent font-mono">MCP · {TOOLS.length} TOOLS · SOLO LECTURA</p>
      <h1 className="font-serif text-3xl text-fg mt-2">Conectar Rastro desde un agente IA</h1>
      <p className="text-fg-soft mt-2 max-w-3xl">
        Rastro expone un servidor MCP (Model Context Protocol) con {TOOLS.length} tools de solo lectura. Compatible con
        Claude Code, Claude Desktop, Cursor, Windsurf, Cline y Continue.dev. Tu agente encadena los tools, razona sobre
        los resultados y entrega respuestas con citas verificables.
      </p>

      <section className="mt-8 grid md:grid-cols-2 gap-4">
        <div className="card">
          <p className="text-xs text-muted font-mono mb-2">Claude Code / Cursor / Windsurf</p>
          <pre className="text-xs bg-ink-950 border border-line rounded-md p-3 overflow-x-auto text-fg-soft">
            <code>{`# Desde el shell
claude mcp add rastro \\
  -- node /ruta/al/repo/mcp-server/dist/index.js

# O en .mcp.json del proyecto
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
        <div className="card">
          <p className="text-xs text-muted font-mono mb-2">Claude Desktop</p>
          <pre className="text-xs bg-ink-950 border border-line rounded-md p-3 overflow-x-auto text-fg-soft">
            <code>{`# ~/Library/Application Support/Claude/
#   claude_desktop_config.json
{
  "mcpServers": {
    "rastro": {
      "command": "node",
      "args": [
        "/ruta/al/repo/mcp-server/dist/index.js"
      ]
    }
  }
}`}</code>
          </pre>
        </div>
      </section>

      <section className="mt-8 card border-accent/30">
        <p className="text-xs text-accent font-mono mb-2">EJEMPLO · UNA SOLA QUERY</p>
        <p className="text-fg text-base">
          "Para los últimos 12 meses: lista proveedores sancionados por la OECE que también ganaron contratos del
          GORE La Libertad en el sector transporte, con valor total adjudicado y % de concentración. Cita cada RUC
          y cada OCID."
        </p>
        <p className="text-fg-soft text-sm mt-3">
          Tu agente invocará secuencialmente:{" "}
          <code className="text-accent">proveedores_sancionados_sanciones</code> →{" "}
          <code className="text-accent">compras_publicas_suppliers</code> (filtrado por La Libertad) →{" "}
          <code className="text-accent">compras_publicas_supplier_by_id</code> (uno por cada RUC) →
          posiblemente <code className="text-accent">compras_publicas_procurement</code> para los OCID. Y te devuelve
          una tabla con citas por RUC, OCID, fuente y corte.
        </p>
      </section>

      <h2 className="font-serif text-2xl text-fg mt-16">Catálogo de los {TOOLS.length} tools</h2>
      <p className="text-fg-soft mt-2 max-w-3xl">
        Generado en build-time desde <code className="text-fg">mcp-server/src/catalog.ts</code> — no es una copia
        manual. <strong className="text-warn">Pasa el cursor sobre "sin scheduler"</strong> para el detalle: ninguna
        fuente tiene ingesta programada, los datos reflejan la última corrida manual del conector.
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o descripción…"
        className="mt-6 w-full max-w-md px-3 py-2 rounded-md bg-ink-900 border border-line text-fg placeholder:text-muted text-sm focus:outline-none focus:border-accent/50"
      />
      <p className="text-xs text-muted font-mono mt-2">
        {filtered.length} de {TOOLS.length} tools
      </p>

      {Object.entries(byApp).map(([app, appTools]) => (
        <section key={app} className="mt-10">
          <h3 className="text-fg font-semibold text-lg">{app}</h3>
          <p className="text-xs text-muted">{appTools.length} tools</p>
          <ul className="mt-3 divide-y divide-line-soft">
            {appTools.map((t) => (
              <li key={t.name} className="py-3 flex flex-col gap-1">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                  <code className="text-accent mono-num text-xs sm:w-72 shrink-0">{t.name}</code>
                  <span className="text-fg-soft text-sm">
                    {t.description.slice(0, DESCRIPTION_PREVIEW_LEN)}
                    {t.description.length > DESCRIPTION_PREVIEW_LEN ? "…" : ""}
                    {t.sinScheduler ? (
                      <span
                        title="Ingesta manual, sin scheduler — los datos reflejan la última corrida del conector, no necesariamente el estado actual de la fuente."
                        className="ml-2 text-warn text-xs align-middle cursor-help"
                      >
                        SIN_SCHEDULER
                      </span>
                    ) : null}
                  </span>
                </div>
                <p className="text-xs text-muted font-mono pl-0 sm:pl-[calc(18rem+0.75rem)]">
                  {t.pathTemplate}
                  {t.queryParams.length > 0 ? ` · query: ${t.queryParams.join(", ")}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {filtered.length === 0 ? (
        <p className="mt-10 text-muted text-sm">Sin tools que coincidan con "{query}".</p>
      ) : null}

      <p className="mt-12 text-xs text-muted">
        ¿Falta un tool? → <Link to="/estado" className="text-fg-soft hover:text-accent">revisa el estado de la API</Link>{" "}
        y luego agrégalo en el catálogo MCP.
      </p>
    </div>
  );
}
