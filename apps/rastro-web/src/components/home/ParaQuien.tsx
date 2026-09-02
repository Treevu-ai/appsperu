// Para quién — 4 lentes: gobierno regional (primario), ciudadanos, auditores, contratistas

type Lente = {
  code: string;
  primario?: boolean;
  titulo: string;
  bajada: string;
  bullets: string[];
};

const LENTES: Lente[] = [
  {
    code: "GOB-001 · Gobierno regional y municipal",
    primario: true,
    titulo: "El gerente de obras, con control real.",
    bajada:
      "Visibilidad sobre toda la cartera bajo su responsabilidad. Detección de cuellos de botella antes de que se traduzcan en adicionales, ampliaciones de plazo o noticias.",
    bullets: [
      "Tablero de cartera por fase, costo y tiempo",
      "Alertas configurables por tipo de riesgo",
      "Exportación directa a MEF y consejo regional",
    ],
  },
  {
    code: "SOC-002 · Ciudadanos y prensa",
    titulo: "Vigilancia accesible, sin pedir información.",
    bajada:
      "Una vista pública del avance de cada obra en su distrito, con foto, monto y plazo. La transparencia como defecto, no como excepción.",
    bullets: [
      "Mapa de obras por distrito",
      "Línea de tiempo con evidencia pública",
      "Compatible con la Ley 27806",
    ],
  },
  {
    code: "AUD-003 · Auditores y OCI",
    titulo: "Trazabilidad lista para informe.",
    bajada:
      "Cruce automático entre lo planificado, lo certificado y lo ejecutado. La Contraloría pasa de reaccionar a prevenir.",
    bullets: [
      "Reportes de auditoría pre-armados",
      "Detección de patrones de riesgo",
    ],
  },
  {
    code: "CON-004 · Próximamente",
    titulo: "Para contratistas y supervisores.",
    bajada:
      "Expediente digital firmado, valorizaciones con hash encadenado y notificaciones de hitos. Esta lente está en construcción — todavía no hay lector público.",
    bullets: [
      "En construcción",
      "Sin ETA pública",
      "Si lo necesitas, abre un issue en github.com/Treevu-ai/appsperu",
    ],
  },
];

export function ParaQuien() {
  return (
    <section className="relative max-w-5xl mx-auto px-6 py-16 md:py-24">
      <div className="max-w-3xl mb-10 md:mb-14">
        <p className="text-xs font-mono text-accent uppercase tracking-[0.18em] mb-4 md:mb-5">
          04 — Para quién
        </p>
        <h2 className="text-fg font-semibold text-2xl md:text-3xl leading-tight tracking-tight">
          Un mismo proyecto, cuatro lentes diferentes.
        </h2>
        <p className="mt-4 text-fg-soft leading-relaxed text-sm md:text-base">
          El dato es el mismo. Lo que cambia es la pregunta. Rastro entrega a cada actor la vista
          que necesita — sin login, sin formularios, sin pedirte el correo.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4">
        {LENTES.map((l, i) => {
          // GOB-001 ocupa 7 cols (primario, primera)
          // SOC-002 ocupa 5 cols
          // AUD-003 ocupa 5 cols
          // CON-004 ocupa 7 cols
          const colSpan =
            i === 0 ? "md:col-span-7" : i === 1 ? "md:col-span-5" : i === 2 ? "md:col-span-5" : "md:col-span-7";
          const cardClass = l.primario
            ? "card relative overflow-hidden border-accent/30 bg-ink-900/70 p-6 md:p-8"
            : "card p-6 md:p-7";

          return (
            <div key={l.code} className={colSpan}>
              <div className={cardClass}>
                {l.primario && (
                  <div className="absolute top-0 right-0 px-3 py-1 text-[10px] font-mono text-accent bg-accent/10 border-l border-b border-accent/30 rounded-bl-lg">
                    PRIMARIO
                  </div>
                )}
                <p className="text-xs font-mono text-muted mb-2">{l.code}</p>
                <h3
                  className={`text-fg font-semibold mb-3 ${l.primario ? "text-xl md:text-2xl" : "text-lg md:text-xl"}`}
                >
                  {l.titulo}
                </h3>
                <p
                  className={`leading-relaxed mb-4 md:mb-5 ${l.primario ? "text-fg-soft text-sm md:text-base" : "text-fg-soft text-sm"}`}
                >
                  {l.bajada}
                </p>
                <ul className="space-y-2 text-sm">
                  {l.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <span className="text-accent mt-1 shrink-0">▸</span>
                      <span className="text-fg-soft">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
