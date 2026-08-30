import { useEffect, useState } from "react";
import { APP_CATALOG, type AppKey } from "../lib/types.js";
import { getAppHealth } from "../lib/api-client.js";

interface AppState {
  appKey: AppKey;
  status: "loading" | "up" | "down";
  detail?: string;
}

export function Estado() {
  const [states, setStates] = useState<AppState[]>(() =>
    (Object.keys(APP_CATALOG) as AppKey[]).map((k) => ({ appKey: k, status: "loading" })),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const updates: AppState[] = [];
      await Promise.all(
        (Object.keys(APP_CATALOG) as AppKey[]).map(async (k) => {
          try {
            await getAppHealth(k);
            updates.push({ appKey: k, status: "up" });
          } catch (err) {
            updates.push({ appKey: k, status: "down", detail: (err as Error).message });
          }
        }),
      );
      if (!cancelled) {
        // Orden estable por appKey para que el re-render no baile.
        updates.sort((a, b) => a.appKey.localeCompare(b.appKey));
        setStates(updates);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const upCount = states.filter((s) => s.status === "up").length;
  const downCount = states.filter((s) => s.status === "down").length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs text-muted font-mono">ESTADO DEL PRODUCTO</p>
      <h1 className="font-serif text-3xl text-fg mt-2">14 APIs en vivo</h1>
      <p className="text-fg-soft mt-2">
        Health-check independiente por app. Refresh manual al recargar la página.
      </p>

      <div className="mt-6 flex gap-3 text-sm">
        <span className="text-accent">{upCount} arriba</span>
        <span className="text-muted">·</span>
        <span className="text-danger">{downCount} caídas</span>
      </div>

      <table className="mt-8 w-full text-sm">
        <thead className="text-xs text-muted text-left">
          <tr>
            <th className="py-2 pr-3">App</th>
            <th className="py-2 pr-3">Puerto</th>
            <th className="py-2 pr-3">Estado</th>
            <th className="py-2 pr-3">Detalle</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {states.map((s) => {
            const meta = APP_CATALOG[s.appKey];
            const color =
              s.status === "up" ? "text-accent" : s.status === "down" ? "text-danger" : "text-muted";
            return (
              <tr key={s.appKey}>
                <td className="py-2 pr-3 text-fg">{meta.label}</td>
                <td className="py-2 pr-3 mono-num text-fg-soft">{meta.port}</td>
                <td className={`py-2 pr-3 font-mono ${color}`}>
                  {s.status === "loading" ? "…" : s.status.toUpperCase()}
                </td>
                <td className="py-2 pr-3 text-fg-soft text-xs">{s.detail ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
