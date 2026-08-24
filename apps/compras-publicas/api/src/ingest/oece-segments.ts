const SEGMENT_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function segmentToIndex(segment: string): number {
  const match = SEGMENT_RE.exec(segment);
  if (!match) throw new Error("Cada segmento debe tener el formato YYYY-MM.");
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function indexToSegment(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Lista inclusiva de particiones mensuales que admite el API de OECE. */
export function monthlySegments(startSegment: string, endSegment: string): string[] {
  const start = segmentToIndex(startSegment);
  const end = segmentToIndex(endSegment);
  if (end < start) throw new Error("--end-segment debe ser igual o posterior a --start-segment.");
  return Array.from({ length: end - start + 1 }, (_, offset) => indexToSegment(start + offset));
}
