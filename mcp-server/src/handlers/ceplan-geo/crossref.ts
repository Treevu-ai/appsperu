import type { NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * @fidelity: precomputado
 *
 * `inversiones()`, `obras()` y `fetchEjecucionByUbigeo()` reemplazan
 * llamadas HTTP en vivo del route de origen (`apps/ceplan-geo/api/src/lib/api-clients.ts`)
 * hacia otras apps (`radar-inversiones`, `infobras`, `radar-ejecucion`) por
 * el mismo SELECT que ya usa cada app de origen, consultado directo vía
 * `crossAppPool`. Cada consulta nueva está marcada `@nuevo:` abajo, con el
 * SELECT de origen citado en el docblock de la función correspondiente.
 */
import { crossAppPool, crossAppUnavailable } from "../proveedores-sancionados/_helpers.js";
import { getTerritoryByUbigeo, lookupTerritoryByNames } from "./territories.js";
import { findNearbyInfrastructure } from "./infrastructure.js";

type TerritoryMatchStatus = "confirmada" | "candidata" | "sin_match";
type TerritoryRecord = {
  ubigeo: string;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  geometryGeojson: string | null;
};

/* ---------------------------------------------------------------------------
 * Copiado de `apps/ceplan-geo/api/src/crossref/enrich.ts`.
 * ------------------------------------------------------------------------- */
function serializeTerritory(territory: TerritoryRecord | null) {
  if (!territory) return null;
  return {
    ubigeo: territory.ubigeo,
    departamento: territory.departamento,
    provincia: territory.provincia,
    distrito: territory.distrito,
    geometry: territory.geometryGeojson ? JSON.parse(territory.geometryGeojson) : null,
  };
}

function crossrefEnvelope(input: {
  matcher: string;
  cobertura: "COMPLETA_VERIFICADA" | "PARCIAL" | "SIN_DATOS_EN_FUENTE" | "BLOQUEADA";
  restriccion: string;
  dependencias: Array<{ app: string; url?: string; ok: boolean; error?: string }>;
  corte?: Record<string, unknown>;
  resultados: unknown[];
}) {
  return {
    matcher: input.matcher,
    cobertura: input.cobertura,
    restriccion: input.restriccion,
    dependencias: input.dependencias,
    corte: input.corte ?? { generadoEl: new Date().toISOString() },
    resultados: input.resultados,
  };
}

function enrichWithTerritory(input: {
  territory: TerritoryRecord | null;
  matchStatus: TerritoryMatchStatus;
  nearbyInfrastructure?: Array<{ infraType: string; name: string; distanceKm: number; properties: Record<string, unknown> }>;
  payload: Record<string, unknown>;
}) {
  return {
    ...input.payload,
    territorio: serializeTerritory(input.territory),
    matcher: input.matchStatus === "confirmada" ? "territorio_nombre" : input.matchStatus,
    nearbyInfrastructure: input.nearbyInfrastructure ?? [],
    restriccion:
      input.matchStatus === "sin_match"
        ? "No se pudo resolver UBIGEO oficial; no afirmar ubicación territorial exacta."
        : input.matchStatus === "candidata"
          ? "Tríada territorial ambigua; el UBIGEO es candidato, no confirmado."
          : "Pertenencia territorial por nombre normalizado; no implica coordenadas de la obra/inversión.",
  };
}

/**
 * Handler para `ceplan_geo_crossref_salud` — GET /api/crossref/salud.
 * Idéntico a `apps/ceplan-geo/api/src/routes/crossref.ts` (`/salud`).
 */
export async function salud(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;
  const { rows } = await db.query<NeonRow>(
    `SELECT COUNT(*) AS filas,
            COUNT(*) FILTER (WHERE match_status = 'confirmada') AS confirmadas,
            COUNT(*) FILTER (WHERE match_status = 'candidata') AS candidatas,
            COUNT(*) FILTER (WHERE match_status = 'sin_match') AS sin_match,
            COUNT(DISTINCT departamento) AS departamentos_construidos,
            MAX(updated_at) AS ultima_construccion
     FROM territory_name_crosswalk
     WHERE source = 'infobras'`
  );
  const filas = Number(rows[0].filas);
  return {
    status: 200,
    body: {
      filas,
      confirmadas: Number(rows[0].confirmadas),
      candidatas: Number(rows[0].candidatas),
      sinMatch: Number(rows[0].sin_match),
      departamentosConstruidos: Number(rows[0].departamentos_construidos),
      ultimaConstruccion: rows[0].ultima_construccion,
      estado: filas === 0 ? "VACIO" : "OK",
      limitation:
        "Un departamento ausente de este caché no significa que sus obras no tengan match territorial: GET /crossref/obras recalcula en vivo para cualquier tríada sin entrada aquí. Este endpoint solo mide qué tan caliente está el caché, no la cobertura real del cruce.",
    },
  };
}

/**
 * Handler para `ceplan_geo_crossref_inversiones` — GET /api/crossref/inversiones.
 *
 * El route de origen (`apps/ceplan-geo/api/src/routes/crossref.ts`, vía
 * `apps/ceplan-geo/api/src/lib/api-clients.ts::fetchInversiones`) llama por
 * HTTP a `radar-inversiones` (`GET /api/investments`). Igual que el resto de
 * cruces ya portados (`infobras/crossref.ts`), ese salto HTTP se reemplaza
 * por una consulta SQL directa a la base de `radar-inversiones` vía
 * `crossAppPool` — mismo SELECT que
 * `apps/radar-inversiones/api/src/routes/investments.ts` sin filtros de
 * paginación (el cliente HTTP original tampoco los usaba). El resto de la
 * lógica (lookup territorial, infraestructura cercana, envelope) es la misma
 * de `routes/crossref.ts`.
 */
export async function inversiones(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const departamento = ((args.departamento as string | undefined)?.toUpperCase().trim()) ?? "LA LIBERTAD";

  const inversionesDb = crossAppPool("radar-inversiones", env);
  if (!inversionesDb) return crossAppUnavailable("radar-inversiones");

  // @nuevo: reemplaza fetchInversiones (HTTP a radar-inversiones); SELECT idéntico a apps/radar-inversiones/api/src/routes/investments.ts
  const { rows: invRows } = await inversionesDb.query<NeonRow>(
    `SELECT i.cui, i.nombre, i.departamento, i.provincia, i.distrito,
            i.monto_viable, i.costo_actualizado, i.estado, rb.fetched_at
     FROM investments i
     JOIN raw_investment_batches rb ON rb.id = i.source_batch_id
     WHERE i.departamento = $1
     ORDER BY i.costo_actualizado DESC NULLS LAST`,
    [departamento]
  );

  const dependency = { app: "radar-inversiones", ok: true };

  const resultados = [];
  for (const row of invRows) {
    const { territory, matchStatus } = await lookupTerritoryByNames(
      db,
      row.departamento as string,
      row.provincia as string | null,
      row.distrito as string | null
    );
    const nearbyInfrastructure = territory ? await findNearbyInfrastructure(db, territory.ubigeo, 50) : [];

    resultados.push(
      enrichWithTerritory({
        territory,
        matchStatus,
        nearbyInfrastructure,
        payload: {
          inversion: {
            cui: row.cui,
            nombre: row.nombre,
            departamento: row.departamento,
            provincia: row.provincia,
            distrito: row.distrito,
            montoViable: row.monto_viable === null ? null : Number(row.monto_viable),
            costoActualizado: row.costo_actualizado === null ? null : Number(row.costo_actualizado),
            estado: row.estado,
            fuente: { extraidoEl: row.fetched_at },
          },
        },
      })
    );
  }

  return {
    status: 200,
    body: crossrefEnvelope({
      matcher: "territorio_nombre",
      cobertura: invRows.length > 0 ? "PARCIAL" : "SIN_DATOS_EN_FUENTE",
      restriccion:
        "La API de radar-inversiones no expone UBIGEO; el territorio se resuelve por departamento/provincia/distrito.",
      dependencias: [dependency],
      corte: { departamento, extraidoEl: (invRows[0]?.fetched_at as string | undefined) ?? null },
      resultados,
    }),
  };
}

/**
 * Handler para `ceplan_geo_crossref_obras` — GET /api/crossref/obras.
 *
 * Mismo reemplazo HTTP->SQL que `inversiones()` de arriba, ahora contra
 * `infobras` (`fetchInfobrasObras` -> `GET /api/public-works`). El SELECT
 * replica `apps/infobras/api/src/routes/public-works.ts` / ya portado en
 * `../infobras/public-works.ts` (filtro por `departamento`, sin señales
 * derivadas porque el cliente HTTP original tampoco las usaba).
 */
export async function obras(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const departamento = ((args.departamento as string | undefined)?.toUpperCase().trim()) ?? "LA LIBERTAD";

  const infobrasDb = crossAppPool("infobras", env);
  if (!infobrasDb) return crossAppUnavailable("infobras");

  // @nuevo: reemplaza fetchInfobrasObras (HTTP a infobras); SELECT idéntico a apps/infobras/api/src/routes/public-works.ts
  const { rows: obraRows } = await infobrasDb.query<NeonRow>(
    `SELECT pw.codigo_infobras, pw.nombre_obra, pw.cui, pw.departamento, pw.provincia, pw.distrito,
            pw.estado_ejecucion, rb.fetched_at
     FROM public_works pw
     JOIN raw_infobras_batches rb ON rb.id = pw.source_batch_id
     WHERE pw.departamento = $1
     ORDER BY pw.nombre_obra ASC`,
    [departamento]
  );

  const dependency = { app: "infobras", ok: true };

  const { rows: crosswalkRows } = await db.query<NeonRow>(
    `SELECT departamento, provincia, distrito, ubigeo, match_status
     FROM territory_name_crosswalk
     WHERE departamento = $1 AND source = 'infobras'`,
    [departamento]
  );
  const crosswalk = new Map(
    crosswalkRows.map((row) => [`${row.departamento}|${row.provincia ?? ""}|${row.distrito ?? ""}`, row])
  );

  const resultados = [];
  for (const obra of obraRows) {
    const obraDepartamento = (obra.departamento as string | null)?.toUpperCase() ?? "";
    const obraProvincia = (obra.provincia as string | null)?.toUpperCase() ?? "";
    const obraDistrito = (obra.distrito as string | null)?.toUpperCase() ?? "";
    const key = `${obraDepartamento}|${obraProvincia}|${obraDistrito}`;
    const cached = crosswalk.get(key);
    let territory = null;
    let matchStatus: TerritoryMatchStatus = "sin_match";

    if (cached?.ubigeo && cached.match_status !== "sin_match") {
      territory = await getTerritoryByUbigeo(db, cached.ubigeo as string);
      matchStatus = cached.match_status as "confirmada" | "candidata";
    } else {
      const lookup = await lookupTerritoryByNames(
        db,
        obra.departamento as string | null,
        obra.provincia as string | null,
        obra.distrito as string | null
      );
      territory = lookup.territory;
      matchStatus = lookup.matchStatus;
    }

    const nearbyInfrastructure = territory ? await findNearbyInfrastructure(db, territory.ubigeo, 50) : [];

    resultados.push(
      enrichWithTerritory({
        territory,
        matchStatus,
        nearbyInfrastructure,
        payload: {
          obra: {
            codigoInfobras: obra.codigo_infobras,
            nombreObra: obra.nombre_obra,
            cui: obra.cui,
            departamento: obra.departamento,
            provincia: obra.provincia,
            distrito: obra.distrito,
            estadoEjecucion: obra.estado_ejecucion,
            fuente: { extraidoEl: obra.fetched_at },
          },
        },
      })
    );
  }

  return {
    status: 200,
    body: crossrefEnvelope({
      matcher: "territorio_nombre",
      cobertura: obraRows.length > 0 ? "PARCIAL" : "SIN_DATOS_EN_FUENTE",
      restriccion: "INFOBRAS no publica coordenadas ni UBIGEO; no usar point-in-polygon.",
      dependencias: [dependency],
      corte: { departamento, extraidoEl: (obraRows[0]?.fetched_at as string | undefined) ?? null },
      resultados,
    }),
  };
}

/**
 * Copiado de la porción de `apps/ceplan-geo/api/src/lib/api-clients.ts::fetchEjecucionByUbigeo`
 * necesaria acá, sustituyendo las dos llamadas HTTP a `radar-ejecucion`
 * (`GET /api/execution?ubigeo=` y `GET /api/execution?metaDepartamento=`) por
 * el mismo SELECT que `../radar-ejecucion/execution.ts::list` (ya portado),
 * restringido a los filtros que este caller usa. Secuencial (no
 * `Promise.all`): Workers permite solo 6 conexiones simultáneas y esto abre
 * una conexión nueva por `db.query`, igual que el resto de cruces
 * cross-app ya portados.
 */
interface EjecucionRow {
  entityCode: unknown;
  nombre: unknown;
  nivelGobierno: unknown;
  funcion: unknown;
  pim: number;
  devengado: number;
  fechaCorte: unknown;
  alcance: "SEDE_EJECUTORA" | "META_DEPARTAMENTO";
  metaDepartamento: string | null;
}

async function fetchEjecucionByUbigeo(
  ejecucionDb: ToolHandlerContext["db"],
  ubigeo: string,
  departamentoMeta?: string
) {
  // @nuevo: reemplaza GET /api/execution?ubigeo= (HTTP a radar-ejecucion); SELECT idéntico a apps/radar-ejecucion/api/src/routes/execution.ts::list
  const { rows: sedeRows } = await ejecucionDb.query<NeonRow>(
    `${LATEST_BUDGET_CTE}
     SELECT b.entity_code, e.nombre, e.nivel_gobierno, b.funcion, b.pim, b.devengado, b.fecha_corte
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     WHERE e.ubigeo = $1`,
    [ubigeo]
  );
  const filasSede: EjecucionRow[] = sedeRows.map((row) => ({
    entityCode: row.entity_code,
    nombre: row.nombre,
    nivelGobierno: row.nivel_gobierno,
    funcion: row.funcion,
    pim: Number(row.pim),
    devengado: Number(row.devengado),
    fechaCorte: row.fecha_corte,
    alcance: "SEDE_EJECUTORA",
    metaDepartamento: null,
  }));

  let filasNacionalDirigido: EjecucionRow[] = [];
  if (departamentoMeta) {
    // @nuevo: reemplaza GET /api/execution?metaDepartamento= (HTTP a radar-ejecucion); SELECT idéntico a apps/radar-ejecucion/api/src/routes/execution.ts::list
    const { rows: metaRows } = await ejecucionDb.query<NeonRow>(
      `${LATEST_BUDGET_CTE}
       SELECT b.entity_code, e.nombre, e.nivel_gobierno, b.funcion, b.pim, b.devengado, b.fecha_corte, b.meta_departamento
       FROM latest_budget b
       JOIN entities e ON e.entity_code = b.entity_code
       WHERE b.meta_departamento = $1`,
      [departamentoMeta]
    );
    filasNacionalDirigido = metaRows.map((row) => ({
      entityCode: row.entity_code,
      nombre: row.nombre,
      nivelGobierno: row.nivel_gobierno,
      funcion: row.funcion,
      pim: Number(row.pim),
      devengado: Number(row.devengado),
      fechaCorte: row.fecha_corte,
      alcance: "META_DEPARTAMENTO" as const,
      metaDepartamento: (row.meta_departamento as string | null) ?? departamentoMeta,
    }));
  }

  return { filasSede, filasNacionalDirigido };
}

/**
 * Handler para `ceplan_geo_crossref_ejecucion` — GET /api/crossref/ejecucion.
 * Mismo reemplazo HTTP->SQL contra `radar-ejecucion` documentado arriba en
 * `fetchEjecucionByUbigeo`.
 */
export async function ejecucion(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const ubigeo = args.ubigeo as string;

  const territory = await getTerritoryByUbigeo(db, ubigeo);
  if (!territory) {
    return { status: 404, body: { error: "UBIGEO no encontrado en ceplan-geo." } };
  }

  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  if (!ejecucionDb) return crossAppUnavailable("radar-ejecucion");

  const { filasSede, filasNacionalDirigido } = await fetchEjecucionByUbigeo(
    ejecucionDb,
    ubigeo,
    territory.departamento
  );
  const dependency = { app: "radar-ejecucion", ok: true };

  const nearbyInfrastructure = await findNearbyInfrastructure(db, ubigeo, 50);

  return {
    status: 200,
    body: crossrefEnvelope({
      matcher: "ubigeo_exacto",
      cobertura: filasSede.length + filasNacionalDirigido.length > 0 ? "PARCIAL" : "SIN_DATOS_EN_FUENTE",
      restriccion:
        "Ejecución por sede (ubigeo) y gasto nacional dirigido (metaDepartamento) se entregan en secciones separadas; no deben sumarse.",
      dependencias: [dependency],
      corte: { ubigeo },
      resultados: [
        {
          territorio: {
            ubigeo: territory.ubigeo,
            departamento: territory.departamento,
            provincia: territory.provincia,
            distrito: territory.distrito,
          },
          ejecucionSedeRegional: filasSede,
          ejecucionNacionalDirigida: filasNacionalDirigido,
          advertenciaGasto:
            "Mezclar ejecucionSedeRegional y ejecucionNacionalDirigida es el error más común en lecturas territoriales de Trujillo/La Libertad.",
          nearbyInfrastructure,
        },
      ],
    }),
  };
}

export { fetchEjecucionByUbigeo };
