// Cómo se pide la key — honesto sobre que no hay autoservicio: 3 pasos,
// revisión manual, respuesta por correo. Nada de fingir un flujo instantáneo
// que el backend no tiene (ver functions/api/solicitud-acceso.ts).
import { Link } from "react-router-dom";

const PASOS = [
  {
    n: "01",
    titulo: "Llenas el formulario",
    desc: "Nombre completo, correo, teléfono y el motivo de tu solicitud. Un minuto.",
  },
  {
    n: "02",
    titulo: "Revisamos tu solicitud",
    desc: "El equipo de Rastro la revisa a mano — no hay emisión automática de sk-rastro-*.",
  },
  {
    n: "03",
    titulo: "Recibes tu key por correo",
    desc: "Te escribimos a la cuenta que indicaste con tu API key y cómo empezar a usarla.",
  },
];

export function ComoSePide() {
  return (
    <section className="relative max-w-5xl mx-auto px-6 pb-16 md:pb-24">
      <div className="max-w-3xl mb-10 md:mb-14">
        <p className="text-xs font-mono text-accent uppercase tracking-[0.18em] mb-4 md:mb-5">03 — Cómo se pide</p>
        <h2 className="text-fg font-semibold text-2xl md:text-3xl leading-tight tracking-tight">
          Sin autoservicio. Pides acceso, un humano lo revisa.
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PASOS.map((p) => (
          <div key={p.n} className="card">
            <span className="font-mono text-xs text-accent">{p.n}</span>
            <h3 className="text-fg font-semibold mt-2 mb-2">{p.titulo}</h3>
            <p className="text-sm text-muted leading-relaxed">{p.desc}</p>
          </div>
        ))}
      </div>

      <Link to="/solicitar-acceso" className="btn-primary mt-6 inline-flex">
        Solicitar acceso sk-rastro
      </Link>
    </section>
  );
}
