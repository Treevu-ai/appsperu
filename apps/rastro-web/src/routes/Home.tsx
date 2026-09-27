import { Link } from "react-router-dom";
import { HallazgosRecientes } from "../components/home/HallazgosRecientes.js";
import { QueObtienes } from "../components/home/QueObtienes.js";
import { ComoSePide } from "../components/home/ComoSePide.js";

export function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Hero: promesa + 1 CTA dominante. Todo lo demás (metodología,
          cobertura completa, 4 lentes de audiencia) vive abajo o en
          /docs/api — no compite acá por atención. */}
      <section className="relative border-b border-line">
        <img
          src="/hero-banner.png"
          alt="RASTRO convierte señales dispersas en inteligencia clara para decidir mejor. Cada señal deja un rastro. Nosotros lo hacemos visible."
          className="w-full h-auto sm:max-h-[min(520px,70vh)] object-cover object-center"
          width={1920}
          height={520}
          fetchPriority="high"
        />
        <div className="bg-ink-950 sm:bg-transparent sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-gradient-to-t sm:from-ink-950 sm:via-ink-950/80 sm:to-transparent px-4 sm:px-6 pb-6 sm:pb-8 pt-4 sm:pt-16">
          <p className="max-w-5xl mx-auto mb-4 text-fg-soft text-sm sm:text-base">
            Presupuesto, obras y contratistas del Estado peruano, cruzados y verificados, servidos a tu agente IA vía
            MCP — con{" "}
            <span className="text-accent bg-accent/15 px-1.5 py-0.5 rounded">fuente y fecha verificables</span>.
          </p>
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <Link to="/solicitar-acceso" className="btn-primary w-full sm:w-auto justify-center">
              Solicitar acceso sk-rastro
            </Link>
            <Link to="/docs/api" className="btn-ghost w-full sm:w-auto justify-center">
              Ver documentación técnica
            </Link>
          </div>
        </div>
      </section>

      {/* 01 — prueba social: lo que ya se encontró, antes de explicar cómo. */}
      <HallazgosRecientes />

      {/* 02 — qué obtienes con la key */}
      <QueObtienes />

      {/* 03 — cómo se pide (honesto: revisión manual, no autoservicio) */}
      <ComoSePide />

      {/* Cierre — a quién sirve, en 1 línea, no 4 tarjetas. */}
      <section className="relative max-w-5xl mx-auto px-6 pb-24">
        <div className="card">
          <p className="text-sm text-fg-soft leading-relaxed">
            Lo usan gobiernos regionales y municipales, prensa de datos, auditores y desarrolladores de agentes IA —
            todos contra el mismo catálogo, cada uno con su propia pregunta. Si prefieres explorar antes de pedir
            acceso, revisa el{" "}
            <Link to="/docs/api" className="text-accent underline-offset-2 hover:underline">
              catálogo completo de tools
            </Link>{" "}
            o el{" "}
            <a
              href="https://github.com/Treevu-ai/appsperu/tree/master/mcp-server"
              className="text-accent underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener"
            >
              código del MCP server ↗
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
