import { NavLink, Outlet } from "react-router-dom";

const SUB_NAV = [
  { to: "/gore/la-libertad/ficha", label: "Ficha" },
  { to: "/gore/la-libertad/comparativo", label: "Comparativo" },
  { to: "/gore/la-libertad/benchmark", label: "Benchmark" },
];

export function LaLibertadLayout() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs text-muted font-mono">LECTOR GORE · LA LIBERTAD</p>
      <h1 className="font-serif text-3xl text-fg mt-2">Análisis sectorial</h1>
      <p className="text-fg-soft mt-2 max-w-3xl">
        Ejecución presupuestal del sector verificado, dirigida al departamento o ejecutada por la sede regional. La
        ausencia de un dato se declara como vacío, no como conclusión.
      </p>

      <nav className="mt-6 flex items-center gap-1 text-sm border-b border-line">
        {SUB_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `px-3 py-2 rounded-t-md transition border-b-2 -mb-px ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-fg-soft hover:text-fg hover:border-line-soft"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
