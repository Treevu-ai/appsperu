// Hallazgos recientes — prueba social: cruces de riesgo institucional que los
// conectores nuevos de septiembre 2026 hicieron posibles por primera vez.
// Cifras como strings literales (no .toLocaleString()) — no dispara AL3-13.

type Hallazgo = {
  code: string;
  titulo: string;
  cifra: string;
  cifraLabel: string;
  desc: string;
  fuente: string;
};

const HALLAZGOS: Hallazgo[] = [
  {
    code: "OEFA × COMPRAS PÚBLICAS",
    titulo: "Una empresa estatal siguió contratando con cientos de infracciones ambientales activas",
    cifra: "S/ 205 millones",
    cifraLabel: "en contratos vigentes",
    desc: "El cruce automático entre el registro de infracciones de OEFA y las contrataciones del Estado detectó una empresa estatal con 468 infracciones ambientales activas y más de S/205M en contratos públicos vigentes al mismo tiempo.",
    fuente: "Fuente: OEFA + SEACE/OECE · corte 2026-09",
  },
  {
    code: "OECE × PODER JUDICIAL",
    titulo: "Doble inhabilitación: administrativa y judicial, antes invisibles juntas",
    cifra: "2 vías",
    cifraLabel: "cruzadas por primera vez",
    desc: "Antes solo se veía la inhabilitación administrativa de OECE. Con el nuevo conector de Poder Judicial se cruza con mandatos judiciales para exponer proveedores inhabilitados por ambas vías a la vez.",
    fuente: "Fuente: OECE + Poder Judicial · corte 2026-09",
  },
  {
    code: "VELOCIDAD SANCIÓN → CONTRATO",
    titulo: "Medimos cuánto tarda una empresa sancionada en volver a ganar un contrato",
    cifra: "—",
    cifraLabel: "señal de gobernanza, no acusación",
    desc: "Cuando ese tiempo es corto, deja de ser coincidencia. El detector no dice por qué pasó — solo lo hace visible, con fuente y fecha.",
    fuente: "Fuente: OECE + SEACE",
  },
];

export function HallazgosRecientes() {
  return (
    <section className="relative max-w-5xl mx-auto px-6 py-16 md:py-24">
      <div className="max-w-3xl mb-10 md:mb-14">
        <p className="text-xs font-mono text-accent uppercase tracking-[0.18em] mb-4 md:mb-5">
          01 — Lo que encontramos
        </p>
        <h2 className="text-fg font-semibold text-2xl md:text-3xl leading-tight tracking-tight">
          No es solo un catálogo de datos. Es una infraestructura que sigue mirando.
        </h2>
        <p className="mt-4 text-fg-soft leading-relaxed text-sm md:text-base">
          En septiembre sumamos conectores nuevos y cruces de riesgo institucional que antes eran
          imposibles de ver juntos. Esto es lo que ya encontramos.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {HALLAZGOS.map((h) => (
          <div key={h.code} className="card flex flex-col">
            <p className="text-xs font-mono text-accent mb-2">{h.code}</p>
            <h3 className="text-fg font-semibold mb-2">{h.titulo}</h3>
            <p className="mono-num text-2xl text-fg mb-1">{h.cifra}</p>
            <p className="text-xs text-muted mb-3">{h.cifraLabel}</p>
            <p className="text-sm text-fg-soft leading-relaxed flex-1">{h.desc}</p>
            <p className="text-xs text-muted mt-4">{h.fuente}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
