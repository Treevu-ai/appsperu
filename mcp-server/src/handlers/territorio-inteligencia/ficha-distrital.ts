import type { NeonRow } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `territorio_inteligencia_ficha_distrital` —
 * GET /api/ficha-distrital.
 *
 * Une cuatro bases por UBIGEO: `seguridad_ciudadana.police_reports` (SIDPOL),
 * `programas_sociales.cobertura_social` (MIDIS), `servicios_salud.ipress`
 * (RENIPRESS) y `actividad_empresarial.empresas_privadas_distrito` (MTPE).
 * Es coincidencia territorial, no relación causal.
 */

const COLUMNAS_COBERTURA = [
  "cunamas_cuidado_diurno",
  "cunamas_acompanamiento_familias",
  "juntos_hogares_afiliados",
  "juntos_hogares_abonados",
  "foncodes_usuarios_estimados",
  "qaliwarma_ninos_atendidos",
  "qaliwarma_iiee",
  "pension65_usuarios",
  "contigo_usuarios",
  "pais_tambos",
  "pais_atenciones",
  "pais_beneficiarios",
] as const;

const NOTA_DENUNCIAS =
  "Denuncias registradas ante la PNP (SIDPOL). Una denuncia es una imputación, no un hecho confirmado. " +
  "SIDPOL no publica homicidio ni sicariato a nivel distrital: la ausencia de esas modalidades acá no significa " +
  "ausencia de violencia letal (DQ-15).";

const NOTA_ESTABLECIMIENTOS =
  "Conteo de establecimientos RENIPRESS por UBIGEO. Mide presencia de infraestructura, no calidad ni " +
  "capacidad de atención — RENIPRESS no publica camas ni personal por establecimiento en este dataset.";

const NOTA_EMPRESAS =
  "Empresas privadas formales registradas ante el MTPE para el corte más reciente disponible. " +
  "Solo empleo formal: no incluye informales ni independientes, que son la mayoría en distritos rurales.";

const ADVERTENCIA =
  "Coincidencia territorial por UBIGEO entre cuatro fuentes independientes. No implica relación causal " +
  "entre denuncias, cobertura social, infraestructura de salud y empleo formal.";

interface DenunciaRow extends NeonRow {
  departamento: string;
  provincia: string;
  distrito: string;
  modalidad: string;
  cantidad: string;
}

interface CoberturaRow extends NeonRow {
  fecha_corte: string | Date;
  [columna: string]: unknown;
}

interface IpressRow extends NeonRow {
  total: string;
  activos: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
}

interface EmpresaRow extends NeonRow {
  anio: number;
  mes: number;
  numero_empresas: number | null;
  distrito: string | null;
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export async function get(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { args, env } = ctx;
  const ubigeo = args.ubigeo as string;
  const anio = Number(args.anio);

  const seguridadPool = getPoolForApp(env as NeonEnv, "seguridad-ciudadana");
  const programasPool = getPoolForApp(env as NeonEnv, "programas-sociales");
  const saludPool = getPoolForApp(env as NeonEnv, "servicios-salud");
  const empresasPool = getPoolForApp(env as NeonEnv, "actividad-empresarial");

  if (!seguridadPool && !programasPool && !saludPool && !empresasPool) {
    return {
      status: 200,
      body: { estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", ubigeo, anio },
    };
  }

  const [denunciasRes, coberturaRes, ipressRes, empresasRes] = await Promise.all([
    seguridadPool
      ? seguridadPool.query<DenunciaRow>(
          `SELECT departamento, provincia, distrito, modalidad, SUM(cantidad)::text AS cantidad
             FROM police_reports
            WHERE ubigeo = $1 AND anio = $2
            GROUP BY departamento, provincia, distrito, modalidad
            ORDER BY SUM(cantidad) DESC, modalidad ASC`,
          [ubigeo, anio]
        )
      : Promise.resolve({ rows: [] as DenunciaRow[] }),
    programasPool
      ? programasPool.query<CoberturaRow>(
          `SELECT fecha_corte, ${COLUMNAS_COBERTURA.join(", ")}
             FROM cobertura_social
            WHERE ubigeo = $1
            ORDER BY fecha_corte DESC
            LIMIT 1`,
          [ubigeo]
        )
      : Promise.resolve({ rows: [] as CoberturaRow[] }),
    saludPool
      ? saludPool.query<IpressRow>(
          `SELECT COUNT(*)::text AS total,
                  COUNT(*) FILTER (WHERE estado = 'ACTIVO')::text AS activos,
                  MIN(departamento) AS departamento,
                  MIN(provincia) AS provincia,
                  MIN(distrito) AS distrito
             FROM ipress
            WHERE ubigeo = $1`,
          [ubigeo]
        )
      : Promise.resolve({ rows: [] as IpressRow[] }),
    empresasPool
      ? empresasPool.query<EmpresaRow>(
          `SELECT anio, mes, numero_empresas, distrito
             FROM empresas_privadas_distrito
            WHERE ubigeo = $1
            ORDER BY anio DESC, mes DESC
            LIMIT 1`,
          [ubigeo]
        )
      : Promise.resolve({ rows: [] as EmpresaRow[] }),
  ]);

  const denunciaRows = denunciasRes.rows;
  const ipressRow = ipressRes.rows[0];
  const empresaRow = empresasRes.rows[0];
  const coberturaRow = coberturaRes.rows[0];

  const algunaFuenteTieneDato =
    denunciaRows.length > 0 ||
    coberturaRow !== undefined ||
    Number(ipressRow?.total ?? 0) > 0 ||
    empresaRow !== undefined;

  if (!algunaFuenteTieneDato) {
    return {
      status: 404,
      body: {
        error:
          `El UBIGEO ${ubigeo} no aparece en ninguna de las cuatro fuentes de esta ficha ` +
          `(SIDPOL ${anio}, MIDIS, RENIPRESS, MTPE).`,
        ubigeo,
      },
    };
  }

  const modalidades = denunciaRows.map((d) => ({
    modalidad: d.modalidad,
    cantidad: Number(d.cantidad),
  }));

  // Un NULL de programa es "sin dato ese corte", no cero — ver
  // apps/programas-sociales/api/src/db/migrations/001_init.sql.
  let coberturaSocial: unknown = null;
  if (coberturaRow) {
    const programas: Record<string, number | null> = {};
    const columnasSinDato: string[] = [];
    for (const columna of COLUMNAS_COBERTURA) {
      const valor = coberturaRow[columna];
      programas[columna] = toNumberOrNull(valor);
      if (valor === null || valor === undefined) columnasSinDato.push(columna);
    }
    const fecha = coberturaRow.fecha_corte;
    coberturaSocial = {
      fechaCorte: fecha instanceof Date ? fecha.toISOString() : String(fecha),
      programas,
      columnasSinDato,
    };
  }

  const denunciaPrimaria = denunciaRows[0];

  return {
    status: 200,
    body: {
      ubigeo,
      anio,
      departamento: denunciaPrimaria?.departamento ?? ipressRow?.departamento ?? null,
      provincia: denunciaPrimaria?.provincia ?? ipressRow?.provincia ?? null,
      distrito: denunciaPrimaria?.distrito ?? empresaRow?.distrito ?? ipressRow?.distrito ?? null,
      denuncias: {
        total: denunciaRows.length > 0 ? modalidades.reduce((acc, m) => acc + m.cantidad, 0) : null,
        porModalidad: modalidades,
        nota: NOTA_DENUNCIAS,
      },
      coberturaSocial,
      establecimientosSalud:
        Number(ipressRow?.total ?? 0) > 0
          ? { total: Number(ipressRow.total), activos: Number(ipressRow.activos), nota: NOTA_ESTABLECIMIENTOS }
          : null,
      empresasPrivadas: empresaRow
        ? {
            anio: empresaRow.anio,
            mes: empresaRow.mes,
            numeroEmpresas: toNumberOrNull(empresaRow.numero_empresas),
            nota: NOTA_EMPRESAS,
          }
        : null,
      advertencia: ADVERTENCIA,
    },
  };
}
