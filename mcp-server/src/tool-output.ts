const MAX_TOOL_OUTPUT_CHARS = 100_000;

/** Marks truncation in-band so agents do not mistake a partial body for a complete response. */
export function serializeToolResponse(status: number, body: unknown): string {
  const serialized = JSON.stringify({ status, body }, null, 2);
  if (serialized.length <= MAX_TOOL_OUTPUT_CHARS) return serialized;
  return JSON.stringify({
    status,
    truncated: true,
    outputChars: serialized.length,
    limitChars: MAX_TOOL_OUTPUT_CHARS,
    bodyPreview: serialized.slice(0, MAX_TOOL_OUTPUT_CHARS),
    limitation: "La respuesta excedió el límite del tool. Use filtros, paginación o un endpoint de detalle.",
  }, null, 2);
}
