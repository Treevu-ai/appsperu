import type { Cobertura } from "./types.js";

export function formatCorteFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function ageInDays(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / (24 * 60 * 60 * 1000);
}

export function colorForAge(daysOld: number, cobertura: Cobertura): "green" | "amber" | "red" {
  if (cobertura === "BLOQUEADA") return "red";
  if (daysOld > THIRTY_DAYS_MS / (24 * 60 * 60 * 1000)) return "red";
  if (daysOld > SEVEN_DAYS_MS / (24 * 60 * 60 * 1000)) return "amber";
  return "green";
}

export function colorClassForFreshness(color: "green" | "amber" | "red"): string {
  return color === "red"
    ? "text-danger bg-danger/10 border-danger/30"
    : color === "amber"
      ? "text-warn bg-warn/10 border-warn/30"
      : "text-accent bg-accent/10 border-accent/30";
}
