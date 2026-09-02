// Cómo funciona — 5 pasos de la cadena de evidencia + JSON de muestra

type Paso = {
  n: string;
  titulo: string;
  desc: string;
  icon: React.ReactNode;
};

const PASOS: Paso[] = [
  {
    n: "01",
    titulo: "Ingesta",
    desc: "Conectores API nativos a MEF, Invierte.pe, OECE, INFOBRAS, CEPLAN, SUNAT, RNP, MIDAGRI y BCRP. Ingesta regular con corte visible.",
    icon: (
      <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
  {
    n: "02",
    titulo: "Normalización",
    desc: "Catálogo único de proyectos, componentes, metas y partidas. Misma CUI, misma lectura.",
    icon: (
      <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
  },
  {
    n: "03",
    titulo: "Trazabilidad",
    desc: "Cada hito con timestamp, fuente oficial, cobertura y corte.",
    icon: (
      <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    n: "04",
    titulo: "Alertas",
    desc: "Reportes comparativos por sector, distrito y proveedor. Lo descriptivo, no lo causal.",
    icon: (
      <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    n: "05",
    titulo: "Visibilidad",
    desc: "Dashboards por actor. Gobierno, contratista, auditor y ciudadano, cada uno con su lente.",
    icon: (
      <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

export function ComoFunciona() {
  return (
    <section className="relative max-w-5xl mx-auto px-6 py-16 md:py-24">
      <div className="max-w-3xl mb-10 md:mb-14">
        <p className="text-xs font-mono text-accent uppercase tracking-[0.18em] mb-4 md:mb-5">
          02 — Cómo funciona
        </p>
        <h2 className="text-fg font-semibold text-2xl md:text-3xl leading-tight tracking-tight">
          Una cadena de evidencia inmutable, del planeamiento a la liquidación.
        </h2>
        <p className="mt-4 text-fg-soft leading-relaxed text-sm md:text-base">
          Conectamos los sistemas nacionales y construimos una capa de trazabilidad que ningún actor
          puede alterar sin dejar huella. Lo que hoy está disperso en 14 APIs sobre 7 fuentes oficiales, mañana vive
          en una sola línea de tiempo.
        </p>
      </div>

      {/* 5 pasos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-3">
        {PASOS.map((p) => (
          <div
            key={p.n}
            className="card flex flex-col h-full"
          >
            <div className="flex items-center gap-3 mb-3 md:mb-4">
              <span className="font-mono text-xs text-accent">{p.n}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center mb-3 md:mb-4">
              {p.icon}
            </div>
            <h3 className="text-fg font-semibold mb-2">{p.titulo}</h3>
            <p className="text-sm text-muted leading-relaxed">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* JSON de evidencia */}
      <div className="mt-8 md:mt-10 rounded-2xl border border-line bg-ink-900/60 p-5 md:p-7">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <p className="text-xs font-mono text-muted uppercase tracking-[0.18em]">
            Modelo de evidencia
          </p>
          <span className="text-xs font-mono text-accent">inmutable</span>
        </div>
        <pre className="font-mono text-[10.5px] sm:text-[11.5px] md:text-[12.5px] leading-relaxed text-fg-soft overflow-x-auto whitespace-pre-wrap break-words sm:whitespace-pre">
{`{`}
{`  "cui": "245891",`}
{`  "fase": "ejecucion",`}
{`  "hito": "valorizacion-14",`}
{`  "ts": "2026-08-27T20:14:08Z",`}
{`  "actor": "supervisor-externo",`}
{`  "hash_prev": "0x9f4a…b21c",`}
{`  "hash": "0xc12e…7a4f",`}
{`  "evidencia": ["acta.pdf", "foto-meta-7.jpg"]`}
{`}`}
        </pre>
      </div>
    </section>
  );
}
