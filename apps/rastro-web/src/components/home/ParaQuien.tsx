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
    code: "Gobierno regional y municipal",
    primario: true,
    titulo: "El presupuesto de tu sector, claro y comparable.",
    bajada:
      "Cuánto se aprobó, cuánto se gastó y cómo va cada sector, comparado con otros sectores y con regiones parecidas — todo con la fecha exacta del dato.",
    bullets: [
      "Cuánto se aprobó y cuánto se ha gastado, por sector",
      "Comparación entre sectores, con la misma regla para todos",
      "Cómo está una entidad frente a otras parecidas",
    ],
  },
  {
    code: "Ciudadanos y prensa",
    titulo: "Vigilancia accesible, sin pedir información.",
    bajada:
      "Busca cualquier proveedor del Estado por su RUC y mira quién es, si tiene sanciones y con quién ha contratado — sin registrarte, sin formularios.",
    bullets: [
      "Ficha de cualquier proveedor: quién es, sanciones, contratos",
      "Ranking de proveedores que más contratos ganan",
      "Búsqueda libre por RUC, nombre de obra o de proveedor",
    ],
  },
  {
    code: "Auditores y OCI",
    titulo: "Trazabilidad lista para informe.",
    bajada:
      "Obras por distrito con sus alertas de costo y avance, qué tan documentada está cada una, y el cruce entre presupuesto y obra física con su nivel de confianza a la vista.",
    bullets: [
      "Obras por distrito con alertas de sobrecosto y retraso",
      "Qué tan completa está la documentación de cada obra",
      "Cruce entre presupuesto y obra física, con su confiabilidad",
    ],
  },
  {
    code: "Próximamente · Contratistas y supervisores",
    titulo: "Para contratistas y supervisores.",
    bajada:
      "Vista de expediente y avances de pago por proveedor. Esta vista está en construcción — todavía no está disponible para el público.",
    bullets: [
      "En construcción",
      "Sin fecha pública todavía",
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
          La misma información, vista según lo que tú necesitas.
        </h2>
        <p className="mt-4 text-fg-soft leading-relaxed text-sm md:text-base">
          El dato es el mismo para todos. Lo que cambia es la pregunta que quieres responder. Rastro te
          muestra la vista que te sirve — sin registrarte, sin formularios, sin pedirte el correo.
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
