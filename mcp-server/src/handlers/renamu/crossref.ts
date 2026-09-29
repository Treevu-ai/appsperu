import type { NeonRow } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface InvestmentAgg {
  ubigeo: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  inversiones: number;
  montoViableTotal: number;
  costoActualizadoTotal: number;
}

interface CapacidadAgg {
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  anio: number;
  tieneVehiculoOperativo: boolean | null;
  tieneInternet: boolean | null;
}

interface DepartamentoRow extends NeonRow {
  departamento: string;
}

interface InvestmentRow extends NeonRow {
  ubigeo: string;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  inversiones: string;
  monto_viable_total: string;
  costo_actualizado_total: string;
}

interface CapacidadRow extends NeonRow {
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  anio: number;
  tiene_vehiculo_operativo: boolean | null;
  tiene_internet: boolean | null;
}

/**
 * Handler para `renamu_crossref` — GET /api/crossref.
 *
 * SQL idéntico a `apps/renamu/api/src/routes/crossref.ts`. `inversionesPool`
 * de la ruta Express (base `radar-inversiones`, ver
 * `apps/renamu/api/src/db/inversiones-pool.ts` → `INVERSIONES_DATABASE_URL`)
 * se resuelve acá vía `getPoolForApp(env, "radar-inversiones")` — cruce entre
 * bases distintas, no se puede resolver en un solo SQL (ver docblock de
 * `ToolHandlerContext.env`).
 */
export async function crossref(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;

  const inversionesPool = getPoolForApp(env as NeonEnv, "radar-inversiones");
  if (!inversionesPool) {
    return { status: 503, body: { error: "Servicio radar-inversiones no disponible: falta la conexión a su base de datos." } };
  }

  const departamento = (args.departamento as string | undefined)?.toUpperCase().trim();
  const ubigeo = (args.ubigeo as string | undefined)?.trim();
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;

  const { rows: coberturaRows } = await inversionesPool.query<DepartamentoRow>(
    "SELECT DISTINCT departamento FROM investments WHERE nivel = 'GL' AND departamento IS NOT NULL ORDER BY departamento"
  );
  const departamentosConInversion = coberturaRows.map((r) => r.departamento);

  const invConditions = ["nivel = 'GL'", "ubigeo IS NOT NULL", "distrito <> '- TODOS -'"];
  const invParams: unknown[] = [];
  if (departamento) {
    invParams.push(departamento);
    invConditions.push(`departamento = $${invParams.length}`);
  }
  if (ubigeo) {
    invParams.push(ubigeo);
    invConditions.push(`ubigeo = $${invParams.length}`);
  }

  const { rows: invRows } = await inversionesPool.query<InvestmentRow>(
    `SELECT ubigeo, departamento, provincia, distrito,
            COUNT(*) AS inversiones,
            COALESCE(SUM(monto_viable), 0) AS monto_viable_total,
            COALESCE(SUM(costo_actualizado), 0) AS costo_actualizado_total
     FROM investments
     WHERE ${invConditions.join(" AND ")}
     GROUP BY ubigeo, departamento, provincia, distrito`,
    invParams
  );

  const capConditions = ["m.anio = COALESCE($1::int, (SELECT MAX(anio) FROM renamu_municipalidades))"];
  const capParams: unknown[] = [anio ?? null];
  if (departamento) {
    capParams.push(departamento);
    capConditions.push(`m.departamento = $${capParams.length}`);
  }
  if (ubigeo) {
    capParams.push(ubigeo);
    capConditions.push(`m.ubigeo = $${capParams.length}`);
  }

  const { rows: capRows } = await db.query<CapacidadRow>(
    `SELECT m.ubigeo, m.departamento, m.provincia, m.distrito, m.anio,
            bool_or(v.tiene AND v.cantidad_operativa > 0) AS tiene_vehiculo_operativo,
            c.tiene_internet
     FROM renamu_municipalidades m
     LEFT JOIN renamu_vehiculos v ON v.municipio_id = m.id
     LEFT JOIN renamu_conectividad c ON c.municipio_id = m.id
     WHERE ${capConditions.join(" AND ")}
     GROUP BY m.ubigeo, m.departamento, m.provincia, m.distrito, m.anio, c.tiene_internet`,
    capParams
  );

  const investmentsByUbigeo = new Map<string, InvestmentAgg>(
    invRows.map((r) => [
      r.ubigeo,
      {
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        inversiones: Number(r.inversiones),
        montoViableTotal: Number(r.monto_viable_total),
        costoActualizadoTotal: Number(r.costo_actualizado_total),
      },
    ])
  );
  const capacidadByUbigeo = new Map<string, CapacidadAgg>(
    capRows.map((r) => [
      r.ubigeo,
      {
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        anio: r.anio,
        tieneVehiculoOperativo: r.tiene_vehiculo_operativo,
        tieneInternet: r.tiene_internet,
      },
    ])
  );

  const resultados = [...investmentsByUbigeo.keys()]
    .map((u) => {
      const inv = investmentsByUbigeo.get(u)!;
      const cap = capacidadByUbigeo.get(u) ?? null;
      return {
        ubigeo: u,
        departamento: inv.departamento,
        provincia: inv.provincia,
        distrito: inv.distrito,
        inversionGL: {
          inversiones: inv.inversiones,
          montoViableTotal: inv.montoViableTotal,
          costoActualizadoTotal: inv.costoActualizadoTotal,
        },
        capacidad: cap ? { anio: cap.anio, tieneVehiculoOperativo: cap.tieneVehiculoOperativo, tieneInternet: cap.tieneInternet } : null,
        puntoCiego: !cap || (cap.tieneVehiculoOperativo !== true && cap.tieneInternet !== true),
      };
    })
    .sort((a, b) => b.inversionGL.montoViableTotal - a.inversionGL.montoViableTotal);

  return {
    status: 200,
    body: {
      coberturaInversion: {
        departamentosConDatos: departamentosConInversion,
        nota:
          "investments (radar-inversiones, nivel=GL) no cubre todo el país por diseño -- un distrito sin inversión aquí puede ser un distrito no ingerido todavía en esa fuente, no necesariamente un distrito sin inversión real ejecutada por su municipalidad. Se excluyen registros con distrito='- TODOS -' (agregados provinciales/departamentales de la fuente, no distritos reales).",
      },
      resultados,
    },
  };
}
