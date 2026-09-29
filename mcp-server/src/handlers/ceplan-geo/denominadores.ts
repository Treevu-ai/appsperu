import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool, crossAppUnavailable } from "../proveedores-sancionados/_helpers.js";
import { fetchEjecucionByUbigeo } from "./crossref.js";

/**
 * @fidelity: precomputado
 *
 * `tasas()` reemplaza `fetchDenunciasByProvincia` (HTTP a seguridad-ciudadana)
 * por el mismo SELECT que `apps/seguridad-ciudadana/api/src/routes/denuncias.ts`,
 * consultado directo vía `crossAppPool`. Ver también `crossref.ts` (mismo
 * app) para el resto de reemplazos HTTP->SQL cross-app ya documentados.
 */

type TierName = "GRANDE" | "MEDIANO" | "PEQUEÑO";

/** Copiado de `apps/ceplan-geo/api/src/routes/denominadores.ts::assignTiers`. */
function assignTiers<T extends { poblacion: number }>(rows: T[]): (T & { tier: TierName })[] {
  const sorted = [...rows].sort((a, b) => b.poblacion - a.poblacion);
  const tierSize = Math.ceil(sorted.length / 3);
  return sorted.map((row, index) => {
    const tier: TierName = index < tierSize ? "GRANDE" : index < tierSize * 2 ? "MEDIANO" : "PEQUEÑO";
    return { ...row, tier };
  });
}

/**
 * Handler para `ceplan_geo_denominadores_poblacion` — GET /api/denominadores/poblacion.
 * Idéntico a `apps/ceplan-geo/api/src/routes/denominadores.ts` (`/poblacion`).
 */
export async function poblacion(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = (args.departamento as string | undefined) ?? "LA LIBERTAD";
  const provincia = (args.provincia as string | undefined) ?? "TRUJILLO";

  const { rows } = await db.query<NeonRow>(
    `SELECT ubigeo, departamento, provincia, distrito, poblacion, fuente, vintage, observed_at
     FROM population_by_ubigeo
     WHERE upper(departamento) = upper($1) AND upper(provincia) = upper($2)
     ORDER BY distrito`,
    [departamento, provincia]
  );

  return {
    status: 200,
    body: {
      departamento: departamento.toUpperCase(),
      provincia: provincia.toUpperCase(),
      resultados: rows.map((row) => ({
        ubigeo: row.ubigeo,
        distrito: row.distrito,
        poblacion: Number(row.poblacion),
        fuente: row.fuente,
        vintage: row.vintage,
        fechaObservacion: row.observed_at,
      })),
      limitacion:
        "Población Censo 2017; no refleja crecimiento posterior. Usar solo para tasas comparables con vintage declarado.",
    },
  };
}

/**
 * Handler para `ceplan_geo_denominadores_tasas` — GET /api/denominadores/tasas.
 *
 * El route de origen (`fetchDenunciasByProvincia` en
 * `apps/ceplan-geo/api/src/lib/api-clients.ts`) llama por HTTP a
 * `seguridad-ciudadana` (`GET /api/denuncias`). Mismo reemplazo HTTP->SQL que
 * en `crossref.ts`: se consulta `police_reports` directo vía `crossAppPool`
 * con el mismo SELECT que
 * `apps/seguridad-ciudadana/api/src/routes/denuncias.ts`, agregando por
 * `ubigeo` en JS exactamente como hacía `fetchDenunciasByProvincia`.
 */
export async function tasas(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const departamento = ((args.departamento as string | undefined) ?? "LA LIBERTAD").toUpperCase();
  const provincia = ((args.provincia as string | undefined) ?? "TRUJILLO").toUpperCase();
  const anio = args.anio !== undefined ? Number(args.anio) : 2024;
  const por = args.por !== undefined ? Number(args.por) : 1000;
  const metrica = (args.metrica as string | undefined) ?? "denuncias";

  const { rows: poblacionRows } = await db.query<NeonRow>(
    `SELECT ubigeo, distrito, poblacion, fuente, vintage
     FROM population_by_ubigeo
     WHERE upper(departamento) = $1 AND upper(provincia) = $2`,
    [departamento, provincia]
  );

  if (poblacionRows.length === 0) {
    return { status: 404, body: { error: "Sin denominadores de población para la provincia solicitada." } };
  }

  let denunciasAgg: Array<{ ubigeo: string; distrito: string; cantidad: number }> = [];
  let dependency: { app: string; ok: boolean; error?: string } | null = null;

  if (metrica === "denuncias") {
    const seguridadDb = crossAppPool("seguridad-ciudadana", env);
    if (!seguridadDb) {
      return {
        status: 502,
        body: {
          error: "seguridad-ciudadana no disponible para calcular tasas.",
          dependencia: { app: "seguridad-ciudadana", ok: false, error: "No hay base Neon configurada." },
        },
      };
    }

    // @nuevo: reemplaza fetchDenunciasByProvincia (HTTP a seguridad-ciudadana); SELECT idéntico a apps/seguridad-ciudadana/api/src/routes/denuncias.ts
    const { rows: denunciaRows } = await seguridadDb.query<NeonRow>(
      `SELECT departamento, provincia, distrito, ubigeo, anio, mes, modalidad, cantidad
       FROM police_reports
       WHERE departamento = $1 AND provincia = $2 AND anio = $3
       ORDER BY departamento, provincia, distrito, anio, mes, modalidad`,
      [departamento, provincia, anio]
    );
    dependency = { app: "seguridad-ciudadana", ok: true };

    const byUbigeo = new Map<string, { ubigeo: string; distrito: string; cantidad: number }>();
    for (const row of denunciaRows) {
      const ubigeo = row.ubigeo as string;
      const current = byUbigeo.get(ubigeo) ?? { ubigeo, distrito: row.distrito as string, cantidad: 0 };
      current.cantidad += Number(row.cantidad ?? 0);
      byUbigeo.set(ubigeo, current);
    }
    denunciasAgg = [...byUbigeo.values()];
  }

  const volumenByUbigeo = new Map<string, number>();
  for (const row of denunciasAgg) {
    volumenByUbigeo.set(row.ubigeo, (volumenByUbigeo.get(row.ubigeo) ?? 0) + row.cantidad);
  }

  const resultados = poblacionRows.map((row) => {
    const volumen = volumenByUbigeo.get(row.ubigeo as string) ?? 0;
    const poblacionValue = Number(row.poblacion);
    const tasa = poblacionValue > 0 ? Math.round((volumen / poblacionValue) * por * 100) / 100 : null;
    return {
      ubigeo: row.ubigeo,
      distrito: row.distrito,
      volumen,
      poblacion: poblacionValue,
      tasaPor: por,
      tasa,
      denominador: { fuente: row.fuente, vintage: row.vintage },
      estadoDenominador: poblacionValue > 0 ? "POBLACION_CENSO_2017" : "SIN_DENOMINADOR",
    };
  });

  return {
    status: 200,
    body: {
      departamento,
      provincia,
      anio,
      metrica,
      por,
      dependencias: dependency ? [dependency] : [],
      resultados,
      limitacion:
        "Tasa = volumen anual / población Censo 2017 × factor. No implica riesgo relativo ajustado por subregistro o modalidad.",
    },
  };
}

/**
 * Handler para `ceplan_geo_denominadores_benchmark_ejecucion` —
 * GET /api/denominadores/benchmark-ejecucion.
 *
 * Reutiliza `fetchEjecucionByUbigeo` de `./crossref.ts` (mismo reemplazo
 * HTTP->SQL contra `radar-ejecucion` documentado ahí). El route de origen
 * llama esto con `Promise.all` por distrito porque cada llamada era HTTP;
 * acá se hace secuencial porque cada `db.query` abre su propia conexión y
 * Workers solo permite 6 simultáneas — mismo criterio que el resto de
 * handlers cross-app ya portados.
 */
export async function benchmarkEjecucion(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const departamento = ((args.departamento as string | undefined) ?? "LA LIBERTAD").toUpperCase();
  const provincia = ((args.provincia as string | undefined) ?? "TRUJILLO").toUpperCase();

  const { rows: poblacionRows } = await db.query<NeonRow>(
    `SELECT ubigeo, distrito, poblacion FROM population_by_ubigeo
     WHERE upper(departamento) = $1 AND upper(provincia) = $2`,
    [departamento, provincia]
  );

  if (poblacionRows.length === 0) {
    return { status: 404, body: { error: "Sin denominadores de población para la provincia solicitada." } };
  }

  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  if (!ejecucionDb) {
    return {
      status: 502,
      body: {
        error: "radar-ejecucion no disponible para calcular el benchmark.",
        dependencia: { app: "radar-ejecucion", ok: false, error: "No hay base Neon configurada." },
      },
    };
  }

  const ejecuciones: Array<{ ubigeo: string; distrito: string; poblacion: number; pim: number; devengado: number }> =
    [];
  for (const row of poblacionRows) {
    const { filasSede } = await fetchEjecucionByUbigeo(ejecucionDb, row.ubigeo as string, departamento);
    const locales = filasSede.filter((r) => r.nivelGobierno === "GOBIERNOS LOCALES");
    ejecuciones.push({
      ubigeo: row.ubigeo as string,
      distrito: row.distrito as string,
      poblacion: Number(row.poblacion),
      pim: locales.reduce((sum, r) => sum + r.pim, 0),
      devengado: locales.reduce((sum, r) => sum + r.devengado, 0),
    });
  }
  const dependency = { app: "radar-ejecucion", ok: true };

  const withTiers = assignTiers(ejecuciones).map((row) => ({
    ...row,
    avancePctIndefinido: row.pim === 0,
    avancePct: row.pim > 0 ? Math.round((row.devengado / row.pim) * 10000) / 100 : null,
  }));

  const resultados = (["GRANDE", "MEDIANO", "PEQUEÑO"] as TierName[]).flatMap((tier) => {
    const enTier = withTiers
      .filter((r) => r.tier === tier)
      .sort((a, b) => (b.avancePct ?? -Infinity) - (a.avancePct ?? -Infinity));
    const tamanoTier = enTier.length;
    return enTier.map((row, index) => ({
      ubigeo: row.ubigeo,
      distrito: row.distrito,
      poblacion: row.poblacion,
      tier: row.tier,
      pim: row.pim,
      devengado: row.devengado,
      avancePct: row.avancePct,
      avancePctIndefinido: row.avancePctIndefinido,
      posicionEnTier: index + 1,
      tamanoTier,
      percentilEnTier: tamanoTier > 1 ? Math.round(((tamanoTier - (index + 1)) / (tamanoTier - 1)) * 100) : null,
    }));
  });

  return {
    status: 200,
    body: {
      departamento,
      provincia,
      dependencias: [dependency],
      resultados,
      limitacion:
        "Compara solo GOBIERNOS LOCALES (excluye Gobierno Regional/Nacional con sede en el mismo distrito) y solo ejecución por sede propia (excluye gasto nacional dirigido). Terciles de tamaño calculados sobre la cobertura real de population_by_ubigeo (hoy, solo la provincia de Trujillo, Censo 2017) — no es un catálogo nacional.",
    },
  };
}
