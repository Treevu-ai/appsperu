import { useEffect, useState } from "react";
import { APP_CATALOG, type AppKey } from "../lib/types.js";
import { formatApiErrorForUi } from "../lib/api-config.js";
import { getAppHealth } from "../lib/api-client.js";
import { NumberWithMetadata, metaNumber } from "../components/NumberWithMetadata.js";

interface AppState {
  appKey: AppKey;
  status: "loading" | "up" | "down";
  detail?: string;
}

const REFRESH_INTERVAL_MS = 60_000;

export function Estado() {
  const [states, setStates] = useState<AppState[]>(() =>
    (Object.keys(APP_CATALOG) as AppKey[]).map((k) => ({ appKey: k, status: "loading" })),
  );
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  // AL3-17: métrica pública de rate limit, servida por la Pages Function
  // functions/api/rate-limit-stats.ts (no una de las 14 APIs de appsperu).
  const [count429, setCount429] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/rate-limit-stats", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { count429Last24h: number };
        if (!cancelled) setCount429(body.count429Last24h);
      } catch {
        // Sin dato de rate limit no es un error de producto — se omite en silencio.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkAll() {
      const updates: AppState[] = [];
      await Promise.all(
        (Object.keys(APP_CATALOG) as AppKey[]).map(async (k) => {
          try {
            await getAppHealth(k);
            updates.push({ appKey: k, status: "up" });
          } catch (err) {
            updates.push({ appKey: k, status: "down", detail: formatApiErrorForUi(err) });
          }
        }),
      );
      if (!cancelled) {
        // Orden estable por appKey para que el re-render no baile.
        updates.sort((a, b) => a.appKey.localeCompare(b.appKey));
        setStates(updates);
        setLastRefresh(new Date());
      }
    }

    checkAll();
    // AL3-12: refresh automático cada 60s, sin caché (getAppHealth ya usa
    // cache: 'no-store'). El intervalo se limpia al desmontar la página.
    const intervalId = setInterval(checkAll, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const upCount = states.filter((s) => s.status === "up").length;
  const downCount = states.filter((s) => s.status === "down").length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs text-muted font-mono">ESTADO DEL PRODUCTO</p>
      <h1 className="font-serif text-3xl text-fg mt-2">14 APIs en vivo</h1>
      <p className="text-fg-soft mt-2">
        Health-check independiente por app. Refresh automático cada 60 s, sin caché.
        {lastRefresh ? ` Última actualización: ${lastRefresh.toLocaleTimeString("es-PE")}.` : ""}
      </p>

      <div className="mt-6 flex gap-3 text-sm">
        <span className="text-accent">{upCount} arriba</span>
        <span className="text-muted">·</span>
        <span className="text-danger">{downCount} caídas</span>
        {count429 !== null ? (
          <>
            <span className="text-muted">·</span>
            <span className="text-muted">
              429Count24h:{" "}
              <NumberWithMetadata
                data={metaNumber(count429, "rastro-web / functions/api/rate-limit-stats", "en vivo", "NO_APLICA")}
                className="text-fg-soft"
              />
            </span>
          </>
        ) : null}
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
