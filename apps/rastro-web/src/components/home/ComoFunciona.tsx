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
    titulo: "Recolectamos",
    desc: "Traemos la información pública de 10 fuentes oficiales del Estado: presupuesto, obras, contratistas, sanciones y más. La actualizamos a mano, en tandas — no en vivo — y siempre decimos cuándo fue la última vez.",
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
    titulo: "Emparejamos",
    desc: "Confirmamos que la obra o entidad de una fuente es la misma que en otra. Cuando hay un código oficial exacto (RUC, código de obra) lo usamos; si no, avisamos que el cruce es aproximado.",
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
    titulo: "Etiquetamos",
    desc: "A cada número lo acompañamos con de dónde salió y cuándo se actualizó. Es una regla técnica que nuestro propio sistema obliga a cumplir — ningún dato se puede publicar sin esa etiqueta.",
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
    titulo: "Detectamos señales",
    desc: "Marcamos cuando una obra cuesta más de lo planeado, avanza más lento de lo prometido, o está paralizada. Mostramos el hecho — no decimos por qué pasó ni quién tiene la culpa.",
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
    titulo: "Te lo mostramos",
    desc: "Gobierno regional, prensa y ciudadanía, auditores: cada uno ve la misma información, ordenada según lo que necesita ver. Sin registrarte, sin pedirte el correo.",
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
          Ningún dato aparece solo — siempre con su origen y su fecha.
        </h2>
        <p className="mt-4 text-fg-soft leading-relaxed text-sm md:text-base">
          Juntamos la información de 10 fuentes oficiales del Estado peruano en un solo lugar, fácil de revisar.
          Nuestro propio sistema no deja publicar un número si no dice de dónde salió, qué tan completo está y a
          qué fecha corresponde.
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

      {/* Explicación en palabras simples del contrato de metadata (WithMetadata<T>, apps/rastro-web/src/lib/types.ts) */}
      <div className="mt-8 md:mt-10 rounded-2xl border border-line bg-ink-900/60 p-5 md:p-7">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <p className="text-xs font-mono text-muted uppercase tracking-[0.18em]">
            Qué acompaña a cada número
          </p>
          <span className="text-xs font-mono text-accent">siempre</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-accent mt-1 shrink-0">▸</span>
            <span className="text-fg-soft">
              <strong className="text-fg">De dónde salió</strong> — qué fuente oficial lo publicó (ej. MEF).
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-accent mt-1 shrink-0">▸</span>
            <span className="text-fg-soft">
              <strong className="text-fg">Cuándo se actualizó</strong> — la fecha exacta del último corte.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-accent mt-1 shrink-0">▸</span>
            <span className="text-fg-soft">
              <strong className="text-fg">Qué tan completo está</strong> — si es todo el dato o solo una parte.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-accent mt-1 shrink-0">▸</span>
            <span className="text-fg-soft">
              <strong className="text-fg">Cómo se identificó</strong> — si el cruce entre fuentes fue exacto o
              aproximado.
            </span>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted">
          ¿Eres desarrollador o auditor? La forma técnica exacta de esta etiqueta está documentada en{" "}
          <a href="/docs/api" className="text-accent underline-offset-2 hover:underline">/docs/api</a>.
        </p>
      </div>
    </section>
  );
}
