import type { NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool, crossAppUnavailable } from "../proveedores-sancionados/_helpers.js";

interface CrosswalkRow extends NeonRow {
  ejecucion_entity_code: string;
  ejecucion_nombre: string;
  infobras_codigo_entidad: string;
  infobras_entidad_nombre: string;
  confidence: "confirmada" | "candidata";
  score: number | string;
  computed_at: string;
}

interface ObraCuiRow extends NeonRow {
  cui: string;
  obras: number | string;
  obras_paralizadas: number | string;
  avance_fisico_real_promedio: number | string | null;
}

interface InversionRow extends NeonRow {
  cui: string;
  nombre: string;
  estado: string;
  monto_viable: number | string | null;
  costo_actualizado: number | string | null;
}

interface DevengadoRow extends NeonRow {
  entity_code: string;
  devengado: number | string;
  cortes: string[];
}

interface ObrasEntidadRow extends NeonRow {
  codigo_entidad: string;
  obras: number | string;
  obras_paralizadas: number | string;
}

/**
 * Handler para `infobras_crossref_salud` — GET /api/crossref/salud.
 *
 * Salud del crossref infobras<->radar-ejecucion (SI-07) — `entity_crosswalk`
 * se puebla con `npm run crossref:build`, un job manual sin scheduler. Una
 * auditoría de datos de La Libertad (2026-09) encontró la tabla en 0 filas
 * durante meses sin que nadie lo notara, bloqueando el componente
 * `obrasNoParalizadas` del score institucional para el 100% de las
 * entidades del país. Este endpoint permite verificarlo sin conectarse
 * directamente a la base.
 */
export async function salud(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;
  const { rows } = await db.query<NeonRow>(
    `SELECT COUNT(*) AS filas,
            COUNT(*) FILTER (WHERE confidence = 'confirmada') AS confirmadas,
            COUNT(*) FILTER (WHERE confidence = 'candidata') AS candidatas,
            MAX(computed_at) AS ultima_construccion
     FROM entity_crosswalk`,
  );
  const filas = Number(rows[0].filas);
  return {
    status: 200,
    body: {
      filas,
      confirmadas: Number(rows[0].confirmadas),
      candidatas: Number(rows[0].candidatas),
      ultimaConstruccion: rows[0].ultima_construccion,
      estado: filas === 0 ? "VACIO" : "OK",
    },
  };
}

/**
 * Handler para `infobras_crossref` — GET /api/crossref.
 *
 * Cruce INFOBRAS <-> radar-inversiones por CUI — a diferencia del cruce por
 * nombre de entidad (compras-publicas), acá SÍ hay una clave compartida
 * exacta entre las dos fuentes (`Codigo unico de inversión` en INFOBRAS,
 * `cui` en investments), así que no hace falta matching difuso: se agrega
 * en vivo por CUI y se junta en la capa de aplicación, mismo patrón que el
 * cruce SEC_EJEC de radar-inversiones <-> radar-ejecucion.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const wantedDepartamento = ((args.departamento as string | undefined)?.toUpperCase().trim()) ?? "LA LIBERTAD";

  const { rows: obraRows } = await db.query<ObraCuiRow>(
    `SELECT cui,
            COUNT(*) AS obras,
            COUNT(*) FILTER (WHERE existe_paralizacion) AS obras_paralizadas,
            AVG(avance_fisico_real_pct) AS avance_fisico_real_promedio
     FROM public_works
     WHERE departamento = $1 AND cui IS NOT NULL AND cui != ''
     GROUP BY cui`,
    [wantedDepartamento],
  );

  if (obraRows.length === 0) {
    return { status: 200, body: { resultados: [] } };
  }

  const cuis = obraRows.map((r) => r.cui);

  const inversionesDb = crossAppPool("radar-inversiones", env);
  if (!inversionesDb) return crossAppUnavailable("radar-inversiones");

  const { rows: inversionRows } = await inversionesDb.query<InversionRow>(
    `SELECT cui, nombre, estado, monto_viable, costo_actualizado
     FROM investments
     WHERE cui = ANY($1)`,
    [cuis],
  );

  const inversionByCui = new Map(inversionRows.map((r) => [r.cui, r]));

  return {
    status: 200,
    body: {
      resultados: obraRows.map((r) => {
        const inversion = inversionByCui.get(r.cui);
        return {
          cui: r.cui,
          obras: Number(r.obras),
          obrasParalizadas: Number(r.obras_paralizadas),
          avanceFisicoRealPromedio:
            r.avance_fisico_real_promedio === null ? null : Math.round(Number(r.avance_fisico_real_promedio) * 100) / 100,
          enInversiones: Boolean(inversion),
          nombreInversion: inversion?.nombre ?? null,
          estadoInversion: inversion?.estado ?? null,
          montoViableInversion: inversion ? Number(inversion.monto_viable) || 0 : null,
          costoActualizadoInversion: inversion ? Number(inversion.costo_actualizado) || 0 : null,
        };
      }),
    },
  };
}

/**
 * Handler para `infobras_crossref_ejecucion` — GET /api/crossref/ejecucion.
 *
 * Cruce INFOBRAS <-> radar-ejecucion por nombre de entidad — a diferencia
 * del cruce por CUI de arriba, acá no hay clave compartida exacta, así que
 * se reutiliza el mismo matcher difuso de compras-publicas (ver
 * `../crossref/match.ts`) sobre el crosswalk persistido en `entity_crosswalk`
 * (recalculable con `npm run crossref:build`). Los indicadores (devengado,
 * obras paralizadas) se consultan en vivo, igual que en compras-publicas.
 */
export async function ejecucion(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const confidence = args.confidence as "confirmada" | "candidata" | undefined;

  const params: unknown[] = [];
  let where = "";
  if (confidence) {
    params.push(confidence);
    where = `WHERE confidence = $${params.length}`;
  }

  const { rows: crosswalk } = await db.query<CrosswalkRow>(
    `SELECT ejecucion_entity_code, ejecucion_nombre, infobras_codigo_entidad, infobras_entidad_nombre,
            confidence, score, computed_at
     FROM entity_crosswalk
     ${where}
     ORDER BY confidence, ejecucion_nombre`,
    params,
  );

  if (crosswalk.length === 0) {
    return { status: 200, body: { resultados: [] } };
  }

  const entityCodes = crosswalk.map((r) => r.ejecucion_entity_code);
  const codigosEntidad = crosswalk.map((r) => r.infobras_codigo_entidad);

  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  if (!ejecucionDb) return crossAppUnavailable("radar-ejecucion");

  // SECUENCIAL: Workers permite solo 6 conexiones simultáneas; no usar Promise.all
  // para consultas contra bases distintas.
  const devengadoResult = await ejecucionDb.query<DevengadoRow>(
    `${LATEST_BUDGET_CTE}
     SELECT entity_code, SUM(devengado) AS devengado, array_agg(DISTINCT fecha_corte) AS cortes
     FROM latest_budget
     WHERE entity_code = ANY($1)
     GROUP BY entity_code`,
    [entityCodes],
  );

  const obrasResult = await db.query<ObrasEntidadRow>(
    `SELECT codigo_entidad,
            COUNT(*) AS obras,
            COUNT(*) FILTER (WHERE existe_paralizacion) AS obras_paralizadas
     FROM public_works
     WHERE codigo_entidad = ANY($1)
     GROUP BY codigo_entidad`,
    [codigosEntidad],
  );

  const devengadoByEntity = new Map(
    devengadoResult.rows.map((r) => [r.entity_code, { devengado: Number(r.devengado), cortes: r.cortes }]),
  );
  const obrasByCodigoEntidad = new Map(
    obrasResult.rows.map((r) => [
      r.codigo_entidad,
      { obras: Number(r.obras), obrasParalizadas: Number(r.obras_paralizadas) },
    ]),
  );

  return {
    status: 200,
    body: {
      resultados: crosswalk.map((r) => {
        const obras = obrasByCodigoEntidad.get(r.infobras_codigo_entidad) ?? { obras: 0, obrasParalizadas: 0 };
        return {
          ejecucionEntityCode: r.ejecucion_entity_code,
          ejecucionNombre: r.ejecucion_nombre,
          infobrasCodigoEntidad: r.infobras_codigo_entidad,
          infobrasEntidadNombre: r.infobras_entidad_nombre,
          confidence: r.confidence,
          score: Number(r.score),
          devengado: devengadoByEntity.get(r.ejecucion_entity_code)?.devengado ?? 0,
          coberturaTemporal: devengadoByEntity.has(r.ejecucion_entity_code)
            ? { cortesUsados: devengadoByEntity.get(r.ejecucion_entity_code)!.cortes, estado: "PARCIAL" }
            : null,
          obras: obras.obras,
          obrasParalizadas: obras.obrasParalizadas,
          computedAt: r.computed_at,
        };
      }),
    },
  };
}