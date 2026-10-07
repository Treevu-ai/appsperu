import type { NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface EntidadTasaRow extends NeonRow {
  entity_code: string;
  nombre: string;
  nivel_gobierno: string;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  total_devengado: number | string;
  total_pim: number | string;
  tasa_ejecucion: number | string;
}

interface CohorteRow extends NeonRow {
  nivel_gobierno: string;
  departamento: string;
  mediana_cohorte: number | string;
  n_entidades: number | string;
}

/**
 * Handler para `radar_ejecucion_indice_ejecucion` — GET /api/indices/ejecucion.
 * Origen: apps/radar-ejecucion/api/src/routes/indice-ejecucion.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const nivel = args.nivel as string | undefined;
  const funcion = args.funcion as string | undefined;
  const departamento = args.departamento as string | undefined;
  const anioFinal = args.anio ? Number(args.anio) : undefined;
  const orden = (args.orden as string | undefined) ?? "tasa_desc";

  const condiciones1: string[] = [];
  const params1: unknown[] = [];
  if (nivel) { params1.push(nivel); condiciones1.push(`e.nivel_gobierno = $${params1.length}`); }
  if (funcion) { params1.push(funcion); condiciones1.push(`b.funcion = $${params1.length}`); }
  if (departamento) { params1.push(departamento.toUpperCase()); condiciones1.push(`t.departamento = $${params1.length}`); }
  if (anioFinal !== undefined) { params1.push(anioFinal); condiciones1.push(`b.anio_fiscal = $${params1.length}`); }
  const where1 = condiciones1.length > 0 ? `WHERE ${condiciones1.join(" AND ")}` : "";

  const condiciones2: string[] = [];
  const params2: unknown[] = [];
  if (departamento) { params2.push(departamento.toUpperCase()); condiciones2.push(`t.departamento = $${params2.length}`); }
  if (funcion) { params2.push(funcion); condiciones2.push(`b.funcion = $${params2.length}`); }
  if (anioFinal !== undefined) { params2.push(anioFinal); condiciones2.push(`b.anio_fiscal = $${params2.length}`); }
  const where2 = condiciones2.length > 0 ? `WHERE ${condiciones2.join(" AND ")}` : "";

  const paso1 = `
      ${LATEST_BUDGET_CTE},
      entidad_tasa AS (
        SELECT
          e.entity_code, e.nombre, e.nivel_gobierno,
          t.departamento, t.provincia, t.distrito,
          SUM(b.devengado) AS total_devengado,
          SUM(b.pim)       AS total_pim,
          CASE WHEN SUM(b.pim) > 0
               THEN ROUND(SUM(b.devengado) / SUM(b.pim) * 100, 1)
               ELSE NULL END AS tasa_ejecucion
        FROM entities e
        JOIN territories t ON t.ubigeo = e.ubigeo
        JOIN latest_budget b ON b.entity_code = e.entity_code
        ${where1}
        GROUP BY e.entity_code, e.nombre, e.nivel_gobierno, t.departamento, t.provincia, t.distrito
      )
      SELECT entity_code, nombre, nivel_gobierno, departamento, provincia, distrito,
             total_devengado, total_pim, tasa_ejecucion
      FROM entidad_tasa
      WHERE tasa_ejecucion IS NOT NULL`;

  const paso2 = `
      ${LATEST_BUDGET_CTE},
      entidad_tasa AS (
        SELECT
          e.entity_code, e.nivel_gobierno, t.departamento,
          SUM(b.devengado) AS total_devengado,
          SUM(b.pim)       AS total_pim,
          CASE WHEN SUM(b.pim) > 0
               THEN ROUND(SUM(b.devengado) / SUM(b.pim) * 100, 1)
               ELSE NULL END AS tasa_ejecucion
        FROM entities e
        JOIN territories t ON t.ubigeo = e.ubigeo
        JOIN latest_budget b ON b.entity_code = e.entity_code
        ${where2}
        GROUP BY e.entity_code, e.nivel_gobierno, t.departamento
      ),
      cohortes AS (
        SELECT
          nivel_gobierno, departamento,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tasa_ejecucion) AS mediana_cohorte,
          COUNT(*) AS n_entidades
        FROM entidad_tasa
        WHERE tasa_ejecucion IS NOT NULL
        GROUP BY nivel_gobierno, departamento
      )
      SELECT nivel_gobierno, departamento, mediana_cohorte, n_entidades
      FROM cohortes`;

  const [{ rows: entidades }, { rows: cohortes }] = await Promise.all([
    db.query<EntidadTasaRow>(paso1, params1),
    db.query<CohorteRow>(paso2, params2),
  ]);

  const cohorteMap = new Map<string, { mediana: number; n: number }>();
  for (const c of cohortes) {
    cohorteMap.set(`${c.nivel_gobierno}::${c.departamento}`, {
      mediana: Number(c.mediana_cohorte),
      n: Number(c.n_entidades),
    });
  }

  const resultados = entidades.map((e) => {
    const cohorte = cohorteMap.get(`${e.nivel_gobierno}::${e.departamento}`);
    const tasaEjecucion = Number(e.tasa_ejecucion);

    if (!cohorte || cohorte.n < 5) {
      return {
        entityCode: e.entity_code, nombre: e.nombre, nivelGobierno: e.nivel_gobierno,
        departamento: e.departamento, provincia: e.provincia, distrito: e.distrito,
        totalPim: Number(e.total_pim), totalDevengado: Number(e.total_devengado),
        tasaEjecucion, medianaCohorte: null, totalCohorte: null,
        ranking: null, percentil: null, cohorteInsuficiente: true,
      };
    }

    const menorOIgual = entidades.filter(
      (other) =>
        other.nivel_gobierno === e.nivel_gobierno &&
        other.departamento === e.departamento &&
        other.tasa_ejecucion !== null &&
        Number(other.tasa_ejecucion) <= tasaEjecucion
    ).length;

    return {
      entityCode: e.entity_code, nombre: e.nombre, nivelGobierno: e.nivel_gobierno,
      departamento: e.departamento, provincia: e.provincia, distrito: e.distrito,
      totalPim: Number(e.total_pim), totalDevengado: Number(e.total_devengado),
      tasaEjecucion, medianaCohorte: cohorte.mediana, totalCohorte: cohorte.n,
      ranking: cohorte.n - menorOIgual + 1,
      percentil: Math.round((menorOIgual / cohorte.n) * 100),
      cohorteInsuficiente: false,
    };
  });

  if (orden === "tasa_desc") {
    resultados.sort((a, b) => (b.tasaEjecucion ?? -1) - (a.tasaEjecucion ?? -1));
  } else if (orden === "tasa_asc") {
    resultados.sort((a, b) => (a.tasaEjecucion ?? 999) - (b.tasaEjecucion ?? 999));
  } else {
    resultados.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  const conRanking = resultados.filter((r) => !r.cohorteInsuficiente).length;
  const sinRanking = resultados.filter((r) => r.cohorteInsuficiente).length;

  return {
    status: 200,
    body: {
      meta: {
        cobertura: "La Libertad (PIM, offsets de byte)",
        nota: "Cohortes con menos de 5 entidades no reciben ranking — la comparabilidad es estadísticamente inválida con muestras menores.",
        filtros: { nivel, funcion, departamento, anio: anioFinal },
        stats: { totalEntidades: resultados.length, conRanking, sinRanking },
        fuente: "MEF - Presupuesto y ejecución de gasto (Consulta Amigable)",
      },
      resultados,
    },
  };
}

interface EntidadFuncionRow extends NeonRow {
  funcion: string;
  total_devengado: number | string;
  total_pim: number | string;
  tasa_ejecucion: number | string | null;
}

interface MedianaFuncionRow extends NeonRow {
  funcion: string;
  mediana_funcion: number | string;
  n_entidades: number | string;
}

/**
 * Handler para `radar_ejecucion_indice_ejecucion_resumen` — GET /api/indices/ejecucion/por-funcion/{entityCode}.
 * Origen: apps/radar-ejecucion/api/src/routes/indice-ejecucion.ts.
 */
export async function porFuncion(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const entityCode = args.entityCode as string;
  const anioFinal = args.anio ? Number(args.anio) : undefined;
  const funcion = args.funcion as string | undefined;

  const condiciones: string[] = [];
  const params: unknown[] = [];
  if (anioFinal !== undefined) { params.push(anioFinal); condiciones.push(`b.anio_fiscal = $${params.length}`); }
  if (funcion) { params.push(funcion); condiciones.push(`b.funcion = $${params.length}`); }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  const entidadParams = [...params, entityCode];
  const entidadWhere =
    condiciones.length > 0
      ? `${where} AND b.entity_code = $${entidadParams.length}`
      : `WHERE b.entity_code = $${entidadParams.length}`;

  const { rows: entidadRows } = await db.query<EntidadFuncionRow>(
    `${LATEST_BUDGET_CTE}
     SELECT b.funcion,
            SUM(b.devengado) AS total_devengado,
            SUM(b.pim)       AS total_pim,
            CASE WHEN SUM(b.pim) > 0
                 THEN ROUND(SUM(b.devengado) / SUM(b.pim) * 100, 1)
                 ELSE NULL
            END AS tasa_ejecucion
     FROM latest_budget b
     ${entidadWhere}
     GROUP BY b.funcion
     ORDER BY b.funcion`,
    entidadParams
  );

  if (entidadRows.length === 0) {
    return { status: 404, body: { error: "Entidad sin datos para el año y filtros dados." } };
  }

  const { rows: medianRows } = await db.query<MedianaFuncionRow>(
    `${LATEST_BUDGET_CTE},
     entidad_funcion_tasa AS (
       SELECT b.entity_code, b.funcion,
              SUM(b.devengado) AS total_devengado,
              SUM(b.pim)       AS total_pim,
              CASE WHEN SUM(b.pim) > 0
                   THEN ROUND(SUM(b.devengado) / SUM(b.pim) * 100, 1)
                   ELSE NULL END AS tasa_ejecucion
       FROM latest_budget b
       JOIN entities e ON e.entity_code = b.entity_code
       ${where}
       GROUP BY b.entity_code, b.funcion
     )
     SELECT funcion,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tasa_ejecucion) AS mediana_funcion,
            COUNT(DISTINCT entity_code) AS n_entidades
     FROM entidad_funcion_tasa
     WHERE tasa_ejecucion IS NOT NULL
     GROUP BY funcion`,
    params
  );

  const medianaMap = new Map<string, { mediana: number; n: number }>();
  for (const r of medianRows) {
    medianaMap.set(r.funcion, { mediana: Number(r.mediana_funcion), n: Number(r.n_entidades) });
  }

  const resultados = entidadRows.map((r) => {
    const med = medianaMap.get(r.funcion);
    const tasa = Number(r.tasa_ejecucion);
    const mediana = med?.mediana ?? null;
    const desviacion = mediana !== null ? Math.round((tasa - mediana) * 10) / 10 : null;

    return {
      funcion: r.funcion,
      totalPim: Number(r.total_pim),
      totalDevengado: Number(r.total_devengado),
      tasaEjecucion: tasa,
      medianaFuncion: mediana,
      nCohorte: med?.n ?? null,
      desviacionDeMediana: desviacion,
    };
  });

  return {
    status: 200,
    body: {
      entityCode,
      anioFiscal: anioFinal,
      meta: {
        cobertura: "La Libertad (PIM)",
        nota: "Cohorte = todas las entidades del mismo nivel de gobierno con la misma función. Desviación = tasa propia − mediana de la cohorte.",
        fuente: "MEF - Consulta Amigable",
      },
      resultados,
    },
  };
}
