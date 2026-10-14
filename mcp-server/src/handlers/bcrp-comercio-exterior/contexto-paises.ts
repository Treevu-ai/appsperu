import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handlers para `bcrp_comercio_exterior_wdi` y `..._wdi_indicadores` — panel
 * país × año de World Development Indicators (Banco Mundial), ingerido por
 * `src/ingest/wdi-contexto.ts`.
 *
 * No tienen ruta Express equivalente: la fuente se ingiere y se sirve solo por
 * MCP (ver `routes-vs-catalog.test.ts`, lista MCP_ONLY_PATHS). Escribe y lee en
 * la base de `bcrp-comercio-exterior` (dominio comercio exterior / macro).
 *
 * @fidelity: precomputado — este módulo NO es el port de ningún route Express:
 * la fuente (WDI del Banco Mundial) es nueva y se sirve solo por MCP, así que
 * su SQL no tiene origen del cual replicarse. Todas sus consultas son
 * intencionalmente nuevas y están declaradas una a una según el protocolo del
 * test de fidelidad, que verifica además que ninguna declaración sobre.
 */

interface WdiRow extends NeonRow {
  pais_codigo: string;
  pais_iso3: string;
  pais_nombre: string;
  indicador_codigo: string;
  indicador_nombre: string;
  anio: number;
  valor: number | string | null;
  fuente_actualizada: string;
}

/** Valores por país × indicador × año, con filtros. */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const limit = Math.min(args.limit ? Number(args.limit) : 500, 2000);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const values: unknown[] = [];
  const push = (cond: string, value: unknown) => {
    values.push(value);
    conditions.push(cond.replace("$$", `$${values.length}`));
  };

  if (args.pais) {
    const p = String(args.pais).toUpperCase();
    push("(UPPER(pais_iso3) = $$ OR UPPER(pais_codigo) = $$)", p);
  }
  if (args.indicador) push("indicador_codigo = $$", String(args.indicador));
  const anio = args.anio ? Number(args.anio) : null;
  const desde = args.desde ? Number(args.desde) : null;
  const hasta = args.hasta ? Number(args.hasta) : null;
  if (anio !== null) push("anio = $$", anio);
  if (desde !== null) push("anio >= $$", desde);
  if (hasta !== null) push("anio <= $$", hasta);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await db.query<WdiRow>(
    // @nuevo: lectura filtrada de la tabla nueva de WDI (sin route Express).
    `SELECT pais_codigo, pais_iso3, pais_nombre, indicador_codigo, indicador_nombre,
            anio, valor, fuente_actualizada
     FROM wdi_indicadores
     ${where}
     ORDER BY indicador_codigo, pais_iso3, anio
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        paisCodigo: r.pais_codigo,
        paisIso3: r.pais_iso3,
        paisNombre: r.pais_nombre,
        indicadorCodigo: r.indicador_codigo,
        indicadorNombre: r.indicador_nombre,
        anio: r.anio,
        valor: r.valor === null ? null : Number(r.valor),
      })),
      total: rows.length,
      fuenteUltimaActualizacion: rows[0]?.fuente_actualizada ?? null,
      fuente: "Banco Mundial — World Development Indicators (api.worldbank.org)",
      ingesta: "manual, sin scheduler — refleja la última corrida del conector",
    },
  };
}

/** Catálogo de indicadores efectivamente ingeridos, con su cobertura de años. */
export async function indicadores(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;
  const { rows } = await db.query<{
    indicador_codigo: string;
    indicador_nombre: string;
    paises: string;
    anio_min: number;
    anio_max: number;
    valores: string;
  }>(
    // @nuevo: catálogo de indicadores sobre la tabla nueva de WDI (sin route Express).
    `SELECT indicador_codigo, MIN(indicador_nombre) AS indicador_nombre,
            COUNT(DISTINCT pais_iso3) AS paises,
            MIN(anio) AS anio_min, MAX(anio) AS anio_max,
            COUNT(*) FILTER (WHERE valor IS NOT NULL) AS valores
     FROM wdi_indicadores
     GROUP BY indicador_codigo
     ORDER BY indicador_codigo`
  );
  return {
    status: 200,
    body: {
      indicadores: rows.map((r) => ({
        codigo: r.indicador_codigo,
        nombre: r.indicador_nombre,
        paises: Number(r.paises),
        anioMin: r.anio_min,
        anioMax: r.anio_max,
        valoresNoNulos: Number(r.valores),
      })),
      total: rows.length,
      fuente: "Banco Mundial — World Development Indicators (api.worldbank.org)",
    },
  };
}
