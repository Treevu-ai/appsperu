import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_CATALOG } from "../lib/types.js";

interface SearchResultado {
  tipo: "inversion" | "ruc" | "obra";
  identificador: string;
  descripcion: string;
  puntaje: number;
  fuente: string;
}

interface SearchResponse {
  q: string;
  departamentoAlcance: string;
  resultados: SearchResultado[];
  corteUsado: string | null;
  fuentesNoDisponibles: string[];
  limitacion: string;
}

const TIPO_LABEL: Record<SearchResultado["tipo"], string> = {
  inversion: "Inversión",
  ruc: "RUC",
  obra: "Obra",
};

function formatCorteFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function resultHref(r: SearchResultado): string | null {
  if (r.tipo === "ruc") return `/proveedor/${r.identificador}`;
  return null; // inversión y obra no tienen ficha propia en rastro-web todavía.
}

export function Buscar() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);

  async function runFreeTextSearch(text: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(text)}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        setError(`Demasiadas búsquedas. Intenta de nuevo en ${retryAfter ?? "unos"} segundos.`);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Error HTTP ${res.status} en /api/search.`);
        return;
      }
      const body = (await res.json()) as SearchResponse;
      setResult(body);
    } catch {
      setError("No se pudo conectar a /api/search. Si estás en desarrollo local, corre `npm run dev:local` (Pages Functions requieren wrangler pages dev, no vite dev).");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    if (/^\d{11}$/.test(trimmed)) {
      navigate(`/proveedor/${trimmed}`);
      return;
    }
    if (/^\d{6}$/.test(trimmed)) {
      navigate(`/distrito/${trimmed}`);
      return;
    }
    if (trimmed.length < 3) {
      setError("Escribe al menos 3 caracteres para buscar por texto.");
      return;
    }
    void runFreeTextSearch(trimmed);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <p className="text-xs text-muted font-mono">BÚSQUEDA</p>
      <h1 className="font-serif text-3xl text-fg mt-2">Busca un proveedor, un distrito o una obra</h1>
      <p className="text-fg-soft mt-2">
        Pega un RUC (11 dígitos) o un código UBIGEO (6 dígitos) si ya lo tienes, o simplemente escribe un nombre —
        buscamos entre proveedores, proyectos de inversión y obras públicas de La Libertad.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex gap-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="RUC, UBIGEO, o nombre de proveedor/proyecto/obra"
          className="flex-1 bg-ink-900 border border-line rounded-md px-4 py-3 text-fg mono-num"
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error ? <p className="text-danger mt-4 text-sm">{error}</p> : null}

      {result ? (
        <div className="mt-8">
          {result.corteUsado ? (
            <p className="text-fg-soft text-xs mb-3">
              Algunos resultados son del corte semanal ({formatCorteFecha(result.corteUsado)}), no en vivo.
            </p>
          ) : null}
          {result.fuentesNoDisponibles.length > 0 ? (
            <p className="text-warn text-xs mb-3">{result.fuentesNoDisponibles.join(" · ")}</p>
          ) : null}

          {result.resultados.length === 0 ? (
            <p className="text-fg-soft">
              Sin resultados para "{result.q}" (alcance de búsqueda por texto: {result.departamentoAlcance}).
            </p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="text-xs text-muted text-left">
                <tr>
                  <th className="py-2 pr-3 whitespace-nowrap">Tipo</th>
                  <th className="py-2 pr-3 whitespace-nowrap">Identificador</th>
                  <th className="py-2 pr-3">Descripción</th>
                  <th className="py-2 pr-3 whitespace-nowrap">Fuente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {result.resultados.slice(0, 50).map((r) => {
                  const href = resultHref(r);
                  return (
                    <tr key={`${r.tipo}-${r.identificador}`}>
                      <td className="py-2 pr-3 text-fg-soft whitespace-nowrap">{TIPO_LABEL[r.tipo]}</td>
                      <td className="py-2 pr-3 mono-num text-fg whitespace-nowrap">
                        {href ? (
                          <a href={href} className="text-accent underline-offset-2 hover:underline">
                            {r.identificador}
                          </a>
                        ) : (
                          r.identificador
                        )}
                      </td>
                      <td className="py-2 pr-3 text-fg max-w-sm truncate" title={r.descripcion}>{r.descripcion}</td>
                      <td className="py-2 pr-3 text-xs text-muted whitespace-nowrap">{r.fuente}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}

          <p className="text-xs text-muted mt-4">{result.limitacion}</p>
        </div>
      ) : null}

      <section className="mt-12">
        <h2 className="text-fg font-semibold">Fuentes que consulta esta búsqueda</h2>
        <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
          {Object.entries(APP_CATALOG).map(([k, m]) => (
            <li key={k} className="flex items-center justify-between text-fg-soft">
              <span>{m.label}</span>
              {import.meta.env.DEV ? (
                <span className="mono-num text-muted text-xs">:{m.port}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
