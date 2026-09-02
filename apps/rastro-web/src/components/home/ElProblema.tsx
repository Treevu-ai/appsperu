// El problema — embudo de fuga de la inversión pública
// Datos validados del piloto (cifras declaradas como reales, sin disclaimer).

type Fila = {
  pct: string;
  label: string;
  value: string;
  barClass: string; // bg-accent/XX (rojo de marca)
  textClass: string; // color del texto sobre la barra
  valueClass: string; // color del texto a la derecha
};

const FILAS: Fila[] = [
  {
    pct: "100%",
    label: "Presupuesto asignado (PIA + PIM)",
    value: "S/ 54.8 mil M",
    barClass: "bg-accent/85",
    textClass: "text-white",
    valueClass: "text-muted-soft",
  },
  {
    pct: "72%",
    label: "Expediente técnico aprobado",
    value: "Demora 11 meses prom.",
    barClass: "bg-accent/70",
    textClass: "text-white",
    valueClass: "text-muted-soft",
  },
  {
    pct: "48%",
    label: "Ejecución iniciada en plazo",
    value: "+ 34% con adicionales",
    barClass: "bg-accent/50",
    textClass: "text-white",
    valueClass: "text-warn",
  },
  {
    pct: "18%",
    label: "Culminado a tiempo y dentro del costo",
    value: "Sobrecosto + 67% en los que se retrasan",
    barClass: "bg-accent/30",
    textClass: "text-fg",
    valueClass: "text-danger",
  },
  {
    pct: "3%",
    label: "Liquidado y en operación",
    value: "82% de obras cerradas sin liquidación formal",
    barClass: "bg-accent/15 border border-accent/30",
    textClass: "text-fg",
    valueClass: "text-muted-soft",
  },
];

type Stat = {
  value: string;
  suffix?: string;
  suffixClass?: string;
  caption: string;
};

const STATS: Stat[] = [
  { value: "S/ 7.3", suffix: "mil M", suffixClass: "text-muted text-base", caption: "Presupuesto PIM La Libertad, jul 2026 — fuente: MEF" },
  { value: "252", caption: "Obras paralizadas en La Libertad (de 10,134) — fuente: INFOBRAS" },
  { value: "49%", caption: "Avance Gobiernos Regionales La Libertad, jul 2026 — fuente: MEF" },
  { value: "+22.8%", caption: "Sobrecosto agregado en La Libertad (S/ 10.5 mil M) — fuente: Invierte.pe" },
];

export function ElProblema() {
  return (
    <section className="relative max-w-5xl mx-auto px-6 py-16 md:py-24">
      <div className="grid md:grid-cols-12 gap-8 md:gap-10">
        {/* Columna izquierda: titulo */}
        <div className="md:col-span-4">
          <p className="text-xs font-mono text-accent uppercase tracking-[0.18em] mb-4 md:mb-5">
            01 — El problema
          </p>
          <h2 className="text-fg font-semibold text-2xl md:text-3xl leading-tight tracking-tight">
            La inversión pública se pierde en el camino.
          </h2>
          <p className="mt-4 text-fg-soft leading-relaxed text-sm">
            Miles de proyectos, cientos de miles de millones de soles, y casi cero visibilidad operativa
            entre el momento en que un expediente se aprueba y el último sol ejecutado.
          </p>
        </div>

        {/* Columna derecha: funnel + stats */}
        <div className="md:col-span-8">
          <div className="rounded-2xl border border-line bg-ink-900/60 p-5 md:p-7">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-mono text-muted uppercase tracking-[0.18em]">
                Embudo de fuga
              </p>
              <span className="text-[10px] font-mono text-muted-soft">
                marco nacional referencial · datos La Libertad abajo
              </span>
            </div>
            {/* Embudo de fuga */}
            <div className="space-y-2.5 md:space-y-3">
              {FILAS.map((f, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 items-center gap-2 md:gap-3 text-xs md:text-sm"
                >
                  <div className="col-span-3 md:col-span-2 font-mono text-muted text-right pr-1">
                    {f.pct}
                  </div>
                  <div
                    className={`col-span-9 md:col-span-7 h-9 md:h-12 rounded-md ${f.barClass} flex items-center px-3 md:px-4 font-medium ${f.textClass} truncate`}
                  >
                    {f.label}
                  </div>
                  <div
                    className={`col-span-12 md:col-span-3 font-mono text-[10px] md:text-xs ${f.valueClass} md:text-right`}
                  >
                    {f.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="mt-6 md:mt-8 pt-5 md:pt-6 border-t border-line grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 text-xs md:text-sm">
              {STATS.map((s, i) => (
                <div key={i}>
                  <div className="font-mono text-xl md:text-2xl text-fg">
                    {s.value}
                    {s.suffix && (
                      <span className={s.suffixClass ?? "text-muted text-base"}> {s.suffix}</span>
                    )}
                  </div>
                  <div className="text-muted mt-1 text-[11px] md:text-xs leading-snug">
                    {s.caption}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
