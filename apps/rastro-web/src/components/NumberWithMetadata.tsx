import type { Cobertura, WithMetadata } from "../lib/types.js";

/**
 * Componente "puerta" para renderizar un número con sus metadatos.
 *
 * Regla de uso (vinculada al linter AL3-13):
 *   Si una vista quiere mostrar un número, debe pasar por este componente
 *   o por el helper `formatNumber` con un objeto `WithMetadata<number>`.
 *   El linter rompe el build si detecta un número "pelado" (sin la metadata
 *   adyacente o sin pasar por aquí).
 */
export function NumberWithMetadata({
  data,
  format = (n) => n.toLocaleString("es-PE"),
  suffix,
  className,
}: {
  data: WithMetadata<number>;
  format?: (n: number) => string;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={`mono-num ${className ?? ""}`} title={`Fuente: ${data.fuente} · Corte: ${data.corte} · Cobertura: ${data.cobertura}`}>
      {format(data.value)}
      {suffix ? <span className="text-muted text-xs ml-1">{suffix}</span> : null}
    </span>
  );
}

/**
 * Helper para cuando el número se renderiza inline en un texto o tabla
 * sin necesidad del componente completo. El linter verifica que el
 * caller haya anotado un bloque `@alsol-meta` con `fuente`, `corte` y
 * `cobertura` adyacente.
 */
export function formatNumber(data: WithMetadata<number>): string {
  return data.value.toLocaleString("es-PE");
}

/** Atajo para construir un `WithMetadata` inline sin repetir campos. */
export function metaNumber(
  value: number,
  fuente: string,
  corte: string,
  cobertura: Cobertura,
  matcher?: string,
  restriccion?: string,
): WithMetadata<number> {
  const out: WithMetadata<number> = { value, fuente, corte, cobertura };
  if (matcher !== undefined) out.matcher = matcher;
  if (restriccion !== undefined) out.restriccion = restriccion;
  return out;
}
