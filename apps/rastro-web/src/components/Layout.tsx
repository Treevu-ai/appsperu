import { NavLink, Outlet } from "react-router-dom";
import { DataFreshnessBar } from "./DataFreshnessBar.js";

const NAV = [
  { to: "/gore/la-libertad", label: "GORE La Libertad" },
  { to: "/buscar", label: "Buscar" },
  { to: "/estado", label: "Estado" },
  { to: "/docs/api", label: "Docs API" },
];

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line bg-ink-900/70 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
          <NavLink to="/" className="flex items-center gap-3">
            <img src="/rastro-logo.png" alt="" className="h-8 w-8 rounded-sm" width={32} height={32} />
            <span className="font-mono text-sm tracking-widest text-fg">Rastro</span>
            <span className="text-xs text-muted hidden sm:inline">/ Trazabilidad de la inversión pública</span>
          </NavLink>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md transition ${
                    isActive
                      ? "bg-accent/10 text-accent border border-accent/30"
                      : "text-fg-soft hover:text-fg hover:bg-ink-800"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <DataFreshnessBar />
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line mt-16">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p>
            Rastro v0.1.0 · La Libertad ·{" "}
            <a href="/citar-rastro.md" className="text-fg-soft hover:text-accent underline-offset-2 hover:underline">
              cómo citar
            </a>
          </p>
          <p className="text-xs">
            Las cifras se muestran con su fuente, cobertura y corte. La ausencia de un dato se declara como vacío, no
            como conclusión.
          </p>
        </div>
      </footer>
    </div>
  );
}
