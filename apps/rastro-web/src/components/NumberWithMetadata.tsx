import type { Cobertura, MandatoLegal, WithMetadata } from "../lib/types.js";
import { mandatoLegalFromFuente } from "../lib/entidad-normas.js";

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
    // El "§" vive FUERA del <span> de abajo, no adentro: varios e2e (ej.
    // e2e/distrito.spec.ts) matchean el número con getByText(exact: true) —
    // si el link comparte el span, su texto se suma al del número y el
    // match exacto deja de encontrar nada. Un fragment mantiene ambos
    // visualmente adyacentes sin tocar el contenido de texto del span.
    <>
      <span className={`mono-num ${className ?? ""}`} title={`Fuente: ${data.fuente} · Corte: ${data.corte} · Cobertura: ${data.cobertura}`}>
        {format(data.value)}
        {suffix ? <span className="text-muted text-xs ml-1">{suffix}</span> : null}
      </span>
      {data.mandatoLegal ? (
        <a
          href={data.mandatoLegal.url}
          target="_blank"
          rel="noopener"
          title={`Mandato legal: ${data.mandatoLegal.entidad} (ROF)`}
          aria-label={`Mandato legal: ${data.mandatoLegal.entidad} (ROF)`}
          className="ml-0.5 text-muted text-[10px] align-super hover:text-accent hover:underline transition"
        >
          §
        </a>
      ) : null}
    </>
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

/**
 * Atajo para construir un `WithMetadata` inline sin repetir campos.
 *
 * `mandatoLegal` se deriva automáticamente de `fuente` (ver
 * `lib/entidad-normas.ts`) si no se pasa explícito — todo call site
 * existente gana el link al ROF de la entidad sin tener que tocarlo, para
 * las 20 entidades que ya tienen ficha en `docs/normas/`. Pasar `null`
 * explícito lo suprime a propósito (ej. una fuente sin entidad única,
 * como `salud-institucional`, un score compuesto).
 */
export function metaNumber(
  value: number,
  fuente: string,
  corte: string,
  cobertura: Cobertura,
  matcher?: string,
  restriccion?: string,
  mandatoLegal?: MandatoLegal | null,
): WithMetadata<number> {
  const out: WithMetadata<number> = { value, fuente, corte, cobertura };
  if (matcher !== undefined) out.matcher = matcher;
  if (restriccion !== undefined) out.restriccion = restriccion;
  const legal = mandatoLegal === null ? undefined : (mandatoLegal ?? mandatoLegalFromFuente(fuente));
  if (legal !== undefined) out.mandatoLegal = legal;
  return out;
}
