// /admin/solicitudes — lista las solicitudes de sk-rastro-* pendientes de
// revisión. Protegido por Cloudflare Access (www.rastro.fyi/admin/*), no
// por lógica de esta app — sin sesión válida de Access, el navegador nunca
// llega a cargar este bundle. NO se agrega a STATIC_ROUTES (scripts/
// prerender.mjs): esta vista no debe existir como HTML estático, ni
// siquiera vacío.
import { useEffect, useState } from "react";

interface Solicitud {
  key: string;
  nombre: string;
  correo: string;
  telefono: string;
  motivo: string;
  // Opcionales: solicitudes guardadas antes de agregar estos 2 campos
  // (2026-09-22) no los tienen — no gatean el acceso, son insumo para
  // pricing, así que su ausencia en solicitudes viejas no es un error.
  tipoUso?: string;
  frecuenciaUso?: string;
  ip: string;
  creadoEn: string;
  expiraEn: number | null;
}

const TIPO_USO_LABEL: Record<string, string> = {
  prensa: "Prensa / periodismo",
  funcion_publica: "Función pública",
  academia: "Academia",
  comercial: "Comercial",
};

const FRECUENCIA_USO_LABEL: Record<string, string> = {
  puntual: "Puntual",
  ocasional: "Ocasional",
  recurrente: "Recurrente/automatizado",
};

function formatFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // toLocaleDateString/toLocaleTimeString, no toLocaleString: el lint AL3-13
  // (scripts/lint-meta.mjs) marca cualquier .toLocaleString( como cifra sin
  // metadata — falso positivo acá (es una fecha, no un número de negocio),
  // pero el checker no distingue por receptor. Mismo patrón que Buscar.tsx.
  return `${d.toLocaleDateString("es-PE", { dateStyle: "medium" })} ${d.toLocaleTimeString("es-PE", { timeStyle: "short" })}`;
}

export function AdminSolicitudes() {
  const [items, setItems] = useState<Solicitud[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  async function cargar() {
    setError(null);
    try {
      const res = await fetch("/api/admin/solicitudes", { headers: { Accept: "application/json" } });
      if (!res.ok) {
        setError(res.status === 403 ? "No autorizado." : `Error ${res.status} al cargar.`);
        return;
      }
      const body = (await res.json()) as { items: Solicitud[] };
      setItems(body.items);
    } catch {
      setError("No se pudo conectar con el servidor.");
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function marcarAtendida(key: string) {
    setBorrando(key);
    try {
      const res = await fetch(`/api/admin/solicitudes?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev?.filter((s) => s.key !== key) ?? null);
      }
    } finally {
      setBorrando(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs text-accent font-mono">ADMIN · SOLO USO INTERNO</p>
      <h1 className="font-serif text-3xl text-fg mt-2">Solicitudes de acceso sk-rastro</h1>
      <p className="text-fg-soft mt-2">
        {items ? `${items.length} solicitud(es) pendiente(s).` : "Cargando…"} Marca una como atendida después de
        responder por correo — se borra de acá, no envía nada automáticamente.
      </p>

      {error && <p className="mt-6 text-sm text-danger">{error}</p>}

      {items && items.length === 0 && <p className="mt-8 text-muted text-sm">No hay solicitudes pendientes.</p>}

      <div className="mt-8 flex flex-col gap-4">
        {items?.map((s) => (
          <div key={s.key} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-fg font-semibold">{s.nombre}</h2>
                <p className="text-sm text-fg-soft">
                  {s.correo} · {s.telefono}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted font-mono">{formatFecha(s.creadoEn)}</p>
                <p className="text-xs text-muted">IP: {s.ip}</p>
              </div>
            </div>
            {(s.tipoUso || s.frecuenciaUso) && (
              <div className="flex flex-wrap gap-2 mt-3">
                {s.tipoUso && (
                  <span className="text-xs text-accent bg-accent/10 border border-accent/30 rounded px-2 py-0.5">
                    {TIPO_USO_LABEL[s.tipoUso] ?? s.tipoUso}
                  </span>
                )}
                {s.frecuenciaUso && (
                  <span className="text-xs text-muted bg-ink-900 border border-line rounded px-2 py-0.5">
                    {FRECUENCIA_USO_LABEL[s.frecuenciaUso] ?? s.frecuenciaUso}
                  </span>
                )}
              </div>
            )}
            <p className="text-sm text-fg-soft mt-3 whitespace-pre-wrap">{s.motivo}</p>
            <button
              type="button"
              onClick={() => marcarAtendida(s.key)}
              disabled={borrando === s.key}
              className="btn-ghost mt-4"
            >
              {borrando === s.key ? "Marcando…" : "Marcar atendida"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
