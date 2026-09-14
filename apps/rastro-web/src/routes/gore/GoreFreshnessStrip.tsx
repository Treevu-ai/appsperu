import { useEffect, useState } from "react";
import {
  getComprasPublicasMetaFreshness,
  getInfobrasMetaSources,
  type ComprasFreshnessSource,
  type MetaSource,
} from "../../lib/api-client.js";
import { apisPublishedForBrowser, APIS_NOT_PUBLISHED_MESSAGE } from "../../lib/api-config.js";
import {
  ageInDays,
  colorClassForFreshness,
  colorForAge,
  formatCorteFecha,
} from "../../lib/freshness-utils.js";
import { AppUnavailableError, type Cobertura } from "../../lib/types.js";
import snapshot from "../../data/snapshot.json" with { type: "json" };
import { Modal } from "../../components/Modal.js";
import { NumberWithMetadata, metaNumber } from "../../components/NumberWithMetadata.js";

type SourceTrack = {
  appKey: "infobras" | "compras-publicas";
  label: string;
  corte: string;
  cobertura: Cobertura;
  restriccion: string;
  modalTitle: string;
};

type FreshnessState =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "snapshot"; corte: string }
  | { status: "ok"; tracks: SourceTrack[]; infobrasItems: MetaSource[]; comprasSources: ComprasFreshnessSource[] };

function latestInfobras(items: MetaSource[]): MetaSource | null {
  if (items.length === 0) return null;
  return [...items].sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt))[0] ?? null;
}

function latestCompras(sources: ComprasFreshnessSource[]): ComprasFreshnessSource | null {
  if (sources.length === 0) return null;
  return [...sources].sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))[0] ?? null;
}

function trackFromInfobras(latest: MetaSource | null): SourceTrack | null {
  if (!latest) return null;
  return {
    appKey: "infobras",
    label: "infobras",
    corte: latest.runAt,
    cobertura: latest.cobertura ?? "PARCIAL",
    restriccion: "Ingesta manual, sin scheduler.",
    modalTitle: "infobras — lotes de ingesta (obras por CUI)",
  };
}

function trackFromCompras(latest: ComprasFreshnessSource | null): SourceTrack | null {
  if (!latest) return null;
  return {
    appKey: "compras-publicas",
    label: "compras-publicas",
    corte: latest.fetchedAt,
    cobertura: "PARCIAL",
    restriccion: latest.coverage,
    modalTitle: "compras-publicas — frescura por fuente ingerida",
  };
}

export function GoreFreshnessStrip() {
  const [state, setState] = useState<FreshnessState>({ status: "loading" });
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!apisPublishedForBrowser()) {
      if (snapshot.corte) {
        setState({ status: "snapshot", corte: snapshot.corte });
      } else {
        setState({ status: "unavailable", message: APIS_NOT_PUBLISHED_MESSAGE });
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [infobrasData, comprasData] = await Promise.all([
          getInfobrasMetaSources(),
          getComprasPublicasMetaFreshness(),
        ]);
        if (cancelled) return;

        const infobrasItems = infobrasData.items ?? [];
        const comprasSources = comprasData.sources ?? [];
        const tracks = [
          trackFromInfobras(latestInfobras(infobrasItems)),
          trackFromCompras(latestCompras(comprasSources)),
        ].filter((track): track is SourceTrack => track !== null);

        setState({ status: "ok", tracks, infobrasItems, comprasSources });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof AppUnavailableError
            ? err.kind === "network" || err.kind === "timeout"
              ? APIS_NOT_PUBLISHED_MESSAGE
              : err.message
            : (err as Error).message;
        setState({ status: "unavailable", message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <p className="mt-3 text-xs text-muted">Consultando frescura de INFOBRAS y compras públicas…</p>
    );
  }

  if (state.status === "unavailable") {
    return (
      <p className="mt-3 text-xs text-muted flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted" />
        {state.message}
      </p>
    );
  }

  if (state.status === "snapshot") {
    return (
      <p className="mt-3 text-xs text-fg-soft flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
        INFOBRAS + compras públicas · snapshot semanal · corte: {formatCorteFecha(state.corte)} — no en vivo.
      </p>
    );
  }

  if (state.tracks.length === 0) {
    return <p className="mt-3 text-xs text-muted">Sin corridas INFOBRAS/compras registradas todavía.</p>;
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Frescura de cruces:</span>
        {state.tracks.map((track) => {
          const color = colorForAge(ageInDays(track.corte), track.cobertura);
          return (
            <button
              key={track.appKey}
              type="button"
              onClick={() => setModalOpen(true)}
              className={`px-2 py-0.5 rounded border ${colorClassForFreshness(color)} hover:brightness-110 cursor-pointer`}
            >
              {track.label} · última corrida: {track.corte}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="text-accent underline-offset-2 hover:underline"
        >
          ver lotes →
        </button>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Frescura GORE — INFOBRAS y compras públicas">
        <div className="space-y-6 text-sm">
          <section>
            <h3 className="text-fg font-semibold">INFOBRAS (obras por CUI)</h3>
            {state.infobrasItems.length === 0 ? (
              <p className="text-muted mt-2">Sin lotes registrados.</p>
            ) : (
              <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {state.infobrasItems.map((item, i) => (
                  <li key={i} className="border-b border-line-soft pb-2 last:border-b-0 text-fg-soft">
                    {item.runAt} ·{" "}
                    <NumberWithMetadata
                      data={metaNumber(
                        item.records,
                        "infobras / infobras_meta_sources",
                        item.runAt,
                        item.cobertura ?? "PARCIAL",
                      )}
                    />{" "}
                    registros
                    {item.fuente ? ` · ${item.fuente}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="text-fg font-semibold">Compras públicas (identidad MEF ↔ compras)</h3>
            {state.comprasSources.length === 0 ? (
              <p className="text-muted mt-2">Sin fuentes registradas.</p>
            ) : (
              <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {state.comprasSources.map((row) => (
                  <li key={row.source} className="border-b border-line-soft pb-2 last:border-b-0 text-fg-soft">
                    <p className="text-fg">{row.source}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {row.fetchedAt} · {row.records} registros · {row.coverage}
                      {row.rejectedInLatestBatch != null ? ` · rechazados en lote: ${row.rejectedInLatestBatch}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Modal>
    </>
  );
}
