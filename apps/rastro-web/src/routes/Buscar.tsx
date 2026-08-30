import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_CATALOG } from "../lib/types.js";

export function Buscar() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

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
    // En Sprint 12+ se conectará al endpoint /api/search unificado.
    // Por ahora, mensaje honesto.
    setQ("");
    alert("Búsqueda libre aún no implementada. Pega un RUC (11 dígitos) o un UBIGEO (6 dígitos).");
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <p className="text-xs text-muted font-mono">BÚSQUEDA</p>
      <h1 className="font-serif text-3xl text-fg mt-2">RUC, CUI, código INFOBRAS, UBIGEO</h1>
      <p className="text-fg-soft mt-2">
        Pega un identificador oficial. La búsqueda libre por texto se habilitará en Sprint 12 cuando exista el
        endpoint <code className="text-fg mono-num">/api/search</code>.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex gap-3">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="RUC (11 dígitos) o UBIGEO (6 dígitos)"
          className="flex-1 bg-ink-900 border border-line rounded-md px-4 py-3 text-fg mono-num"
        />
        <button type="submit" className="btn-primary">
          Buscar
        </button>
      </form>

      <section className="mt-12">
        <h2 className="text-fg font-semibold">Apps detrás de esta UI</h2>
        <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
          {Object.entries(APP_CATALOG).map(([k, m]) => (
            <li key={k} className="flex items-center justify-between text-fg-soft">
              <span>{m.label}</span>
              <span className="mono-num text-muted text-xs">:{m.port}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
