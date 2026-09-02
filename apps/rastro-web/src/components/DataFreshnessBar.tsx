// DataFreshnessBar — modo local estático.
//
// El backend público (api.rastro.pe) está apagado. La barra ya no fetchea
// `/api/meta/sources`; muestra un cutoff manual y un mensaje honesto sobre el modo.
//
// Para volver al modo "live":
//   1. Restaurar el bloque useEffect con la llamada a getRadarEjecucionMetaSources().
//   2. Volver a marcar `apisPublishedForBrowser()` para que retorne true cuando las
//      VITE_API_BASE_URL_* apunten a un backend público (no localhost).
//   3. Quitar este comentario y la constante STATIC_CUTOFF.
// El PRD exige honestidad con la frescura (P3); este modo la preserva declarando
// un cutoff conocido en vez de pretender datos en vivo.

const STATIC_CUTOFF = "2026-08-28";

export function DataFreshnessBar() {
  return (
    <div className="border-t border-line-soft bg-ink-900/40">
      <div className="mx-auto max-w-6xl px-6 py-2 text-xs flex items-center gap-3 flex-wrap">
        <span className="px-2 py-0.5 rounded border border-accent/30 text-accent bg-accent/10 inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
          modo local · corte {STATIC_CUTOFF}
        </span>
        <span className="text-muted">
          datos fijos a este corte · sin backend público · ingesta manual
        </span>
      </div>
    </div>
  );
}
