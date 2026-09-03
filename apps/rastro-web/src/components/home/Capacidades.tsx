// Capacidades — 1 capacidad núcleo + 4 capacidades secundarias

type Cap = {
  titulo: string;
  desc: string;
  icon: React.ReactNode;
};

const NUCLEO: Cap = {
  titulo: "10 fuentes oficiales, un solo lugar",
  desc: "Juntamos presupuesto (MEF), inversión pública (Invierte.pe), contrataciones (OECE/RNP), obras (INFOBRAS), planeamiento (CEPLAN), identidad fiscal (SUNAT), agro (MIDAGRI), economía (BCRP), seguridad (MININTER) e inversión privada (PROINVERSIÓN). Actualizamos a mano, en tandas — cada página muestra la fecha exacta de su último corte.",
  icon: (
    <svg className="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
};

const SECUNDARIAS: Cap[] = [
  {
    titulo: "Nunca un número sin explicación",
    desc: "De dónde salió, qué tan completo está y de cuándo es. Si falta un dato, lo decimos vacío — no lo rellenamos.",
    icon: (
      <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    titulo: "Alertas sobre las obras",
    desc: "Te avisamos cuando una obra cuesta más de lo planeado, avanza más lento de lo prometido o está paralizada — con la fecha exacta del dato, sin adivinar el porqué.",
    icon: (
      <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    titulo: "Una vista para cada tipo de usuario",
    desc: "Gobierno regional, prensa y ciudadanía, auditores. El mismo dato, mostrado como cada uno lo necesita.",
    icon: (
      <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    ),
  },
  {
    titulo: "Abierto para quien quiera consultarlo",
    desc: "Todo el detalle técnico está documentado y disponible en /docs/api, sin pedir permiso ni credenciales.",
    icon: (
      <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 2v6h6V2" />
        <path d="M5 8h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" />
      </svg>
    ),
  },
];

export function Capacidades() {
  return (
    <section className="relative max-w-5xl mx-auto px-6 py-16 md:py-24">
      <div className="max-w-3xl mb-10 md:mb-14">
        <p className="text-xs font-mono text-accent uppercase tracking-[0.18em] mb-4 md:mb-5">
          03 — Capacidades
        </p>
        <h2 className="text-fg font-semibold text-2xl md:text-3xl leading-tight tracking-tight">
          Hecho para la gente que de verdad necesita esta información.
        </h2>
        <p className="mt-4 text-fg-soft leading-relaxed text-sm md:text-base">
          No es un tablero más. Empezamos por La Libertad, probando bien el proceso completo, antes de
          extenderlo a otras regiones.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {/* Núcleo: ancho completo en md, ocupa 2/3 en lg */}
        <div className="md:col-span-3 lg:col-span-2 card relative">
          <div className="flex items-start gap-4 md:gap-5">
            <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center shrink-0">
              {NUCLEO.icon}
            </div>
            <div>
              <p className="text-xs font-mono text-accent mb-1">Capacidad núcleo</p>
              <h3 className="text-fg font-semibold text-lg md:text-xl">{NUCLEO.titulo}</h3>
              <p className="mt-3 text-fg-soft leading-relaxed text-sm md:text-base">
                {NUCLEO.desc}
              </p>
            </div>
          </div>
        </div>

        {/* 4 secundarias */}
        {SECUNDARIAS.map((c) => (
          <div key={c.titulo} className="card flex flex-col">
            <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center mb-3 md:mb-4">
              {c.icon}
            </div>
            <h3 className="text-fg font-semibold mb-2">{c.titulo}</h3>
            <p className="text-sm text-muted leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
