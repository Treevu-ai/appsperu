// /solicitar-acceso — formulario de solicitud de sk-rastro-*.
// Flujo: llenar → revisar (resumen editable) → enviar → confirmación.
// No hay emisión automática: el equipo de Rastro revisa cada solicitud y
// responde por correo, mismo flujo manual que ya usa mcp.rastro.fyi (ver
// docs/FLY_DEPLOY_MCP.md).
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

interface FormState {
  nombre: string;
  correo: string;
  telefono: string;
  motivo: string;
}

const VACIO: FormState = { nombre: "", correo: "", telefono: "", motivo: "" };
const MOTIVO_MIN = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Paso = "formulario" | "revisar" | "enviado";

function validar(f: FormState): string | null {
  if (f.nombre.trim().length < 3) return "Ingresa tu nombre completo.";
  if (!EMAIL_RE.test(f.correo.trim())) return "Ingresa un correo válido.";
  if (f.telefono.trim().length < 6) return "Ingresa un teléfono de contacto válido.";
  if (f.motivo.trim().length < MOTIVO_MIN) return `Cuéntanos el motivo con al menos ${MOTIVO_MIN} caracteres.`;
  return null;
}

export function SolicitarAcceso() {
  const [paso, setPaso] = useState<Paso>("formulario");
  const [form, setForm] = useState<FormState>(VACIO);
  const [campoTrampa, setCampoTrampa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function handleContinuar(e: FormEvent) {
    e.preventDefault();
    const problema = validar(form);
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setPaso("revisar");
  }

  async function handleConfirmar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/solicitud-acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, campoTrampa }),
      });
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        setError(`Demasiadas solicitudes. Intenta de nuevo en ${retryAfter ?? "unos"} segundos.`);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "No pudimos enviar tu solicitud. Intenta de nuevo.");
        return;
      }
      setPaso("enviado");
    } catch {
      setError("No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (paso === "enviado") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <p className="text-xs text-accent font-mono">SOLICITUD ENVIADA</p>
        <h1 className="font-serif text-3xl text-fg mt-3">Ya recibimos tu solicitud.</h1>
        <p className="text-fg-soft mt-4 leading-relaxed">
          El equipo de Rastro va a revisar tu pedido y va a enviar la información —incluida tu API key{" "}
          <code className="text-fg">sk-rastro-*</code>— a la cuenta de correo que indicaste (
          <strong className="text-fg">{form.correo}</strong>).
        </p>
        <Link to="/" className="btn-ghost mt-8 inline-flex">
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (paso === "revisar") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16">
        <p className="text-xs text-accent font-mono">SOLICITAR ACCESO · PASO 2 DE 2</p>
        <h1 className="font-serif text-3xl text-fg mt-3">Revisa tus datos antes de enviar</h1>
        <p className="text-fg-soft mt-3">
          Verifica que todo esté correcto — vamos a responder a este correo con tu <code className="text-fg">sk-rastro-*</code>.
        </p>

        <dl className="mt-8 card divide-y divide-line-soft">
          <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
            <dt className="text-xs text-muted font-mono">Nombre completo</dt>
            <dd className="text-fg text-sm sm:text-right">{form.nombre}</dd>
          </div>
          <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
            <dt className="text-xs text-muted font-mono">Correo</dt>
            <dd className="text-fg text-sm sm:text-right">{form.correo}</dd>
          </div>
          <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
            <dt className="text-xs text-muted font-mono">Teléfono</dt>
            <dd className="text-fg text-sm sm:text-right">{form.telefono}</dd>
          </div>
          <div className="py-3 flex flex-col gap-1">
            <dt className="text-xs text-muted font-mono">Motivo de la solicitud</dt>
            <dd className="text-fg text-sm whitespace-pre-wrap">{form.motivo}</dd>
          </div>
        </dl>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => setPaso("formulario")} className="btn-ghost" disabled={enviando}>
            Editar
          </button>
          <button type="button" onClick={handleConfirmar} className="btn-primary" disabled={enviando}>
            {enviando ? "Enviando…" : "Confirmar y enviar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <p className="text-xs text-accent font-mono">SOLICITAR ACCESO · PASO 1 DE 2</p>
      <h1 className="font-serif text-3xl text-fg mt-3">Solicita tu acceso sk-rastro</h1>
      <p className="text-fg-soft mt-3 leading-relaxed">
        Con tu API key conectas tu agente IA al servidor MCP de Rastro en producción (
        <code className="text-fg">mcp.rastro.fyi</code>). No hay autoservicio: revisamos cada solicitud a mano y
        respondemos por correo.
      </p>

      <form onSubmit={handleContinuar} className="mt-8 flex flex-col gap-5">
        <div>
          <label htmlFor="nombre" className="block text-sm text-fg-soft mb-1.5">
            Nombre completo
          </label>
          <input
            id="nombre"
            type="text"
            required
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-ink-900 border border-line text-fg placeholder:text-muted text-sm focus:outline-none focus:border-accent/50"
            placeholder="Nombre y apellidos"
          />
        </div>

        <div>
          <label htmlFor="correo" className="block text-sm text-fg-soft mb-1.5">
            Correo
          </label>
          <input
            id="correo"
            type="email"
            required
            value={form.correo}
            onChange={(e) => setForm({ ...form, correo: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-ink-900 border border-line text-fg placeholder:text-muted text-sm focus:outline-none focus:border-accent/50"
            placeholder="tu@correo.com"
          />
          <p className="text-xs text-muted mt-1.5">Tu sk-rastro-* se envía a esta dirección.</p>
        </div>

        <div>
          <label htmlFor="telefono" className="block text-sm text-fg-soft mb-1.5">
            Teléfono
          </label>
          <input
            id="telefono"
            type="tel"
            required
            value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-ink-900 border border-line text-fg placeholder:text-muted text-sm focus:outline-none focus:border-accent/50"
            placeholder="+51 9xx xxx xxx"
          />
        </div>

        <div>
          <label htmlFor="motivo" className="block text-sm text-fg-soft mb-1.5">
            Motivo de la solicitud
          </label>
          <textarea
            id="motivo"
            required
            rows={4}
            value={form.motivo}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            className="w-full px-3 py-2 rounded-md bg-ink-900 border border-line text-fg placeholder:text-muted text-sm focus:outline-none focus:border-accent/50"
            placeholder="Para qué vas a usar los datos de Rastro (proyecto, medio, investigación, entidad)."
          />
        </div>

        {/* Honeypot anti-spam: oculto para una persona, visible para un bot que rellena todo campo del form. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="campoTrampa">No llenar este campo</label>
          <input
            id="campoTrampa"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={campoTrampa}
            onChange={(e) => setCampoTrampa(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button type="submit" className="btn-primary self-start">
          Revisar solicitud
        </button>
      </form>
    </div>
  );
}
