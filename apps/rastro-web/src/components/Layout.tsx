import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { DataFreshnessBar } from "./DataFreshnessBar.js";

// "/catalogo" (índice nacional de datosabiertos.gob.pe, PNDA) y "/docs/api"
// (los 142 tools MCP propios de Rastro) son contenidos sin relación entre
// sí — "Catálogo" a secas en el nav confundía cuál es cuál. El label deja
// claro que este es el índice externo, no el catálogo de Rastro.
const NAV = [
  { to: "/gore/la-libertad", label: "GORE La Libertad" },
  { to: "/buscar", label: "Buscar" },
  { to: "/prensa/proveedores", label: "Proveedores" },
  { to: "/auditoria/entidades-infobras", label: "Auditoría" },
  { to: "/catalogo", label: "Datos abiertos PE" },
];

const FOOTER_LINKS = [
  { to: "/estado", label: "Estado" },
  { to: "/docs/api", label: "Docs API" },
];

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Cierra el menú móvil al cambiar de ruta
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line bg-ink-900/70 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <NavLink to="/" className="flex items-center gap-3 min-w-0">
            <img
              src="/rastro-logo.png"
              alt=""
              className="h-8 w-8 rounded-sm shrink-0"
              width={32}
              height={32}
            />
            <span className="font-mono text-sm tracking-widest text-fg shrink-0">Rastro</span>
            {/* Alterna junto con el nav desktop (lg), no antes — si aparece sola en 768-1023px
                deja un hueco vacío entre ella y la hamburguesa. */}
            <span className="text-xs text-muted hidden lg:inline truncate">
              / Trazabilidad de la inversión pública
            </span>
          </NavLink>

          {/* Nav desktop: ≥ lg — a `sm` (640px) 5 ítems con "GORE La Libertad" desbordan
              el header (confirmado visualmente, no solo en teoría); el corte sube a `lg`
              (1024px) para que el rango 640-1023px use el menú hamburguesa en vez de
              apretar 5 links en una fila sin wrap. */}
          <nav className="hidden lg:flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md transition whitespace-nowrap ${
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

          {/* Botón hamburguesa: < lg (ver comentario del nav desktop) */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="lg:hidden p-2 rounded-md text-fg-soft hover:text-fg hover:bg-ink-800 transition"
          >
            {menuOpen ? (
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>

        {/* Menú móvil: < lg */}
        {menuOpen && (
          <nav
            id="mobile-nav"
            className="lg:hidden border-t border-line bg-ink-900/95 backdrop-blur"
          >
            <div className="px-4 py-3 flex flex-col gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `px-3 py-2.5 rounded-md text-sm transition ${
                      isActive
                        ? "bg-accent/10 text-accent border border-accent/30"
                        : "text-fg-soft hover:text-fg hover:bg-ink-800 border border-transparent"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}

        <DataFreshnessBar />
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line mt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 text-sm text-muted flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p>
            Rastro v0.1.0 · La Libertad ·{" "}
            <a
              href="/citar-rastro.md"
              className="text-fg-soft hover:text-accent underline-offset-2 hover:underline"
            >
              cómo citar
            </a>
          </p>
          <nav className="flex items-center gap-4 text-xs">
            {FOOTER_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className="text-fg-soft hover:text-accent underline-offset-2 hover:underline"
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <p className="text-xs">
            Las cifras se muestran con su fuente, cobertura y corte. La ausencia de un dato se declara como vacío, no
            como conclusión.
          </p>
        </div>
      </footer>
    </div>
  );
}
