import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handlers para `sunat_aduanas_comercio_bienes` y `..._meta` — dataset
 * "Comercio Exterior de Bienes" de MINCETUR (DGIECE), ingerido por
 * `src/ingest/mincetur-comercio-bienes.ts`.
 *
 * @fidelity: precomputado — este módulo NO es el port de ningún route Express:
 * la fuente es nueva y se sirve solo por MCP, así que su SQL no tiene origen
 * del cual replicarse. Todas sus consultas son intencionalmente nuevas y están
 * declaradas una a una según el protocolo del test de fidelidad, que verifica
 * además que ninguna declaración sobre.
 *
 * A diferencia del resto de los tools del catálogo, estos dos NO tienen ruta
 * Express equivalente: la fuente se ingiere y se sirve solo por MCP (ver
 * `routes-vs-catalog.test.ts`, lista MCP_ONLY_PATHS). El handler habla con la
 * misma base que usaría la API (`sunat-aduanas`), sin intermediario HTTP.
 *
 * La tabla guardada ya está agregada a nivel (anio, flujo, subpartida, pais,
 * via): `filas_origen` indica cuántas filas mensuales de la fuente se fusionaron
 * en cada registro, para que el dato nunca parezca más granular de lo que es.
 */

interface AgregadaRow extends NeonRow {
  anio: number;
  flujo: string;
  subpartida: string;
  descripcion: string;
  sector: string;
  tipo: string;
  pais_codigo: string;
  pais_nombre: string;
  continente: string;
  bloque_1: string;
  bloque_2: string;
  cuode: string;
  via_codigo: string;
  via_nombre: string;
  usd_millones: number | string;
  tm: number | string | null;
  filas_origen: number;
  fecha_corte: string;
}

const GROUP_BY_COLUMNAS: Record<string, { columna: string; alias: string }> = {
  subpartida: { columna: "subpartida", alias: "subpartida" },
  pais: { columna: "pais_codigo", alias: "pais_codigo" },
  sector: { columna: "sector", alias: "sector" },
  bloque: { columna: "bloque_1", alias: "bloque_1" },
  via: { columna: "via_nombre", alias: "via_nombre" },
  flujo: { columna: "flujo", alias: "flujo" },
  anio: { columna: "anio", alias: "anio" },
  tipo: { columna: "tipo", alias: "tipo" },
};

interface Filtros {
  where: string;
  values: unknown[];
}

function buildWhere(args: Record<string, unknown>): Filtros {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const push = (cond: string, value: unknown) => {
    values.push(value);
    conditions.push(cond.replaceAll("$$", `$${values.length}`));
  };

  const anio = args.anio ? Number(args.anio) : null;
  const desde = args.desde ? Number(args.desde) : null;
  const hasta = args.hasta ? Number(args.hasta) : null;
  const flujo = args.flujo as string | undefined;
  const subpartida = args.subpartida as string | undefined;
  const pais = args.pais as string | undefined;
  const bloque = args.bloque as string | undefined;
  const sector = args.sector as string | undefined;
  const tipo = args.tipo as string | undefined;
  const via = args.via as string | undefined;

  if (anio !== null) push("anio = $$", anio);
  if (desde !== null) push("anio >= $$", desde);
  if (hasta !== null) push("anio <= $$", hasta);
  if (flujo) push("flujo = $$", flujo.toUpperCase());
  if (subpartida) push("subpartida LIKE $$", `${subpartida}%`);
  if (pais) push("(pais_codigo = $$ OR UPPER(pais_nombre) = UPPER($$))", pais.toUpperCase());
  if (bloque) push("UPPER(bloque_1) = $$", bloque.toUpperCase());
  if (sector) push("UPPER(sector) = $$", sector.toUpperCase());
  if (tipo) push("UPPER(tipo) = $$", tipo.toUpperCase());
  if (via) push("UPPER(via_nombre) = $$", via.toUpperCase());

  return { where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "", values };
}

/**
 * Lista de comercio exterior por producto × destino. Sin `groupBy` devuelve las
 * filas tal cual están agregadas (anio × flujo × subpartida × pais × via); con
 * `groupBy` devuelve totales por esa dimensión (los USD vienen en MILLONES,
 * como la fuente).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const limit = Math.min(args.limit ? Number(args.limit) : 200, 500);
  const offset = args.offset ? Number(args.offset) : 0;
  const { where, values } = buildWhere(args);
  const groupBy = (args.groupBy as string | undefined)?.toLowerCase();

  if (groupBy) {
    const spec = GROUP_BY_COLUMNAS[groupBy];
    if (!spec) {
      return {
        status: 400,
        body: {
          error: `groupBy inválido: "${groupBy}". Valores: ${Object.keys(GROUP_BY_COLUMNAS).join(", ")}.`,
        },
      };
    }
    const { rows } = await db.query<{
      dimension: string;
      usd_millones: string;
      tm: string | null;
      subpartidas: number;
      paises: number;
    }>(
      // @nuevo: agregación por dimensión sobre la tabla nueva de MINCETUR (fuente sin route Express).
      `SELECT ${spec.columna} AS dimension,
              SUM(usd_millones) AS usd_millones,
              SUM(tm) AS tm,
              COUNT(DISTINCT subpartida) AS subpartidas,
              COUNT(DISTINCT pais_codigo) AS paises
       FROM comercio_bienes_agregado
       ${where}
       GROUP BY ${spec.columna}
       ORDER BY usd_millones DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );
    return {
      status: 200,
      body: {
        resultados: rows.map((r) => ({
          dimension: spec.alias,
          valor: r.dimension,
          usdMillones: Number(r.usd_millones),
          tm: r.tm === null ? null : Number(r.tm),
          subpartidasDistintas: Number(r.subpartidas),
          paisesDistintos: Number(r.paises),
        })),
        groupBy: spec.alias,
        unidad: "USD millones",
        fuente: "MINCETUR DGIECE — Comercio Exterior de Bienes (datosabiertos.mincetur.gob.pe)",
        ingesta: "manual, sin scheduler — refleja la última corrida del conector",
      },
    };
  }

  const { rows } = await db.query<AgregadaRow>(
    // @nuevo: lectura de la tabla nueva de MINCETUR (fuente sin route Express).
    `SELECT anio, flujo, subpartida, descripcion, sector, tipo, pais_codigo, pais_nombre,
            continente, bloque_1, bloque_2, cuode, via_codigo, via_nombre,
            usd_millones, tm, filas_origen, fecha_corte
     FROM comercio_bienes_agregado
     ${where}
     ORDER BY usd_millones DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        anio: r.anio,
        flujo: r.flujo,
        subpartida: r.subpartida,
        descripcion: r.descripcion,
        sector: r.sector,
        tipo: r.tipo,
        paisCodigo: r.pais_codigo,
        paisNombre: r.pais_nombre,
        continente: r.continente,
        bloque1: r.bloque_1,
        bloque2: r.bloque_2,
        cuode: r.cuode,
        viaCodigo: r.via_codigo,
        viaNombre: r.via_nombre,
        usdMillones: Number(r.usd_millones),
        tm: r.tm === null ? null : Number(r.tm),
        filasOrigen: r.filas_origen,
        fechaCorte: r.fecha_corte,
      })),
      total: rows.length,
      unidad: "USD millones",
      granularidad: "anio x flujo x subpartida (10 digitos) x pais x via; filas mensuales de la fuente ya sumadas",
      fuente: "MINCETUR DGIECE — Comercio Exterior de Bienes (datosabiertos.mincetur.gob.pe)",
      ingesta: "manual, sin scheduler — refleja la última corrida del conector",
    },
  };
}

/** Frescura de la ingesta MINCETUR: último lote, cobertura de años y filas. */
export async function meta(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;
  const { rows: lotes } = await db.query<{ id: string; source_file: string; year: number; checksum: string; row_count: number; ingested_at: string }>(
    // @nuevo: lotes del conector MINCETUR sobre raw_batches compartido (sin route Express).
    `SELECT id, source_file, year, checksum, row_count, ingested_at
     FROM raw_batches WHERE source_file LIKE 'mincetur_%'
     ORDER BY ingested_at DESC LIMIT 10`
  );
  const { rows: cobertura } = await db.query<{ anio: number; flujo: string; filas: string; corte: string }>(
    // @nuevo: cobertura por año/flujo de la tabla nueva de MINCETUR (sin route Express).
    `SELECT anio, flujo, COUNT(*) AS filas, MAX(fecha_corte) AS corte
     FROM comercio_bienes_agregado
     GROUP BY anio, flujo ORDER BY anio DESC, flujo LIMIT 40`
  );
  return {
    status: 200,
    body: {
      lotes,
      cobertura: cobertura.map((c) => ({
        anio: c.anio,
        flujo: c.flujo,
        filasAgregadas: Number(c.filas),
        fechaCorteFuente: c.corte,
      })),
      fuente: "MINCETUR DGIECE — Comercio Exterior de Bienes",
    },
  };
}
