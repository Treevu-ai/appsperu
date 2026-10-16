import type { NeonRow } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `candidatos_erm_ficha_electoral` — GET /api/ficha-electoral.
 *
 * Une cuatro bases: `candidatos_erm` (propia) y `autoridades_electas` /
 * `renamu_municipalidades` por UBIGEO, más `inhabilitaciones`+`multas` de
 * `proveedores-sancionados` por DNI exacto. Ninguna unión es difusa: un match
 * sobre nombre produciría acusaciones falsas contra homónimos.
 */

const NOTA_AUTORIDADES =
  "El recurso 'actual' de Autoridades Electas que publica el JNE en datosabiertos.gob.pe fue verificado " +
  "2026-09-06 cubriendo solo las autoridades nacionales recién proclamadas (Presidencia, Senado, Diputados, " +
  "Parlamento Andino). Un vacío acá NO significa que la circunscripción no tenga autoridad: significa que " +
  "el dataset vigente aún no la incluye. El recurso histórico 2014-2022, que sí cubre ámbitos municipales, " +
  "no se ingeró por riesgo de PII (trae DNI sin enmascarar).";

const NOTA_SANCIONES =
  "Sanción administrativa del Tribunal de Contrataciones del Estado (inhabilitación o multa), cruzada por " +
  "DNI exacto. NO es una sentencia penal ni una condena, y una inhabilitación vigente no inhabilita " +
  "necesariamente la postulación: eso depende de la ley electoral aplicable, que esta ficha no evalúa.";

const NOTA_MUNICIPALIDAD =
  "RENAMU (INEI) cubre identificación y equipamiento/conectividad institucional. El Módulo I, que mezcla " +
  "datos institucionales con PII del alcalde, se excluyó completo en la ingesta: por eso no hay nombre de " +
  "la máxima autoridad en esta ficha.";

const ADVERTENCIA =
  "Ficha de contexto por circunscripción. Reúne fuentes independientes sobre el mismo UBIGEO; no establece " +
  "ninguna relación causal entre una candidatura, una sanción y los datos institucionales de la municipalidad.";

const TIPOS_MUNICIPO: Record<string, string> = {
  "1": "Provincial",
  "2": "Distrital",
  "3": "Centro Poblado",
};

function maskDni(dni: string): string {
  return `${"*".repeat(Math.max(dni.length - 3, 0))}${dni.slice(-3)}`;
}

interface CandidatoRow extends NeonRow {
  dni: string;
  nombre_completo: string;
  cargo: string;
  tipo_eleccion: string;
  organizacion_politica: string;
  organizacion_estado: string | null;
  estado: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  posicion: number | null;
  sentencias_declaradas: number | null;
}

interface AutoridadRow extends NeonRow {
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  cargo: string;
  organizacion_politica: string;
  ambito: string | null;
  periodo: string | null;
}

interface MunicipioRow extends NeonRow {
  id: string;
  idmunici: string;
  anio: number;
  tipomuni: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

interface SancionRow extends NeonRow {
  dni: string | null;
  ruc: string;
  razon_social: string;
  estado: string | null;
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  tipo: "INHABILITACION" | "MULTA";
}

export async function get(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { args, env } = ctx;
  const ubigeo = args.ubigeo as string;

  const candidatosPool = getPoolForApp(env as NeonEnv, "candidatos-erm");
  const autoridadesPool = getPoolForApp(env as NeonEnv, "autoridades-electas");
  const renamuPool = getPoolForApp(env as NeonEnv, "renamu");
  const sancionadosPool = getPoolForApp(env as NeonEnv, "proveedores-sancionados");

  if (!candidatosPool || (!autoridadesPool && !renamuPool && !sancionadosPool)) {
    return { status: 200, body: { estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", ubigeo } };
  }

  const [candidatosRes, autoridadesRes, municipioRes] = await Promise.all([
    candidatosPool.query<CandidatoRow>(
      `SELECT dni, nombre_completo, cargo, tipo_eleccion, organizacion_politica,
              organizacion_estado, estado, departamento, provincia, distrito,
              posicion, sentencias_declaradas
         FROM candidatos_erm
        WHERE ubigeo = $1
        ORDER BY tipo_eleccion, cargo, posicion NULLS LAST, nombre_completo`,
      [ubigeo]
    ),
    autoridadesPool
      ? autoridadesPool.query<AutoridadRow>(
          `SELECT nombres, apellido_paterno, apellido_materno, cargo,
                  organizacion_politica, ambito, periodo
             FROM autoridades_electas
            WHERE ubigeo = $1
            ORDER BY cargo, posicion NULLS LAST, apellido_paterno`,
          [ubigeo]
        )
      : Promise.resolve({ rows: [] as AutoridadRow[] }),
    renamuPool
      ? renamuPool.query<MunicipioRow>(
          `SELECT id, idmunici, anio, tipomuni, departamento, provincia, distrito
             FROM renamu_municipalidades
            WHERE ubigeo = $1
            ORDER BY anio DESC
            LIMIT 1`,
          [ubigeo]
        )
      : Promise.resolve({ rows: [] as MunicipioRow[] }),
  ]);

  const candidatoRows = candidatosRes.rows;
  const municipioRow = municipioRes.rows[0];

  let sancionesPorDni = new Map<string, SancionRow[]>();
  if (candidatoRows.length > 0 && sancionadosPool) {
    const dnis = [...new Set(candidatoRows.map((c) => c.dni))];
    const { rows } = await sancionadosPool.query<SancionRow>(
      `SELECT dni, ruc, razon_social, estado, resolucion, desde, hasta,
              'INHABILITACION'::text AS tipo
         FROM inhabilitaciones WHERE dni = ANY($1)
       UNION ALL
       SELECT dni, ruc, razon_social, estado, resolucion, desde, hasta,
              'MULTA'::text AS tipo
         FROM multas WHERE dni = ANY($1)`,
      [dnis]
    );
    for (const row of rows) {
      if (!row.dni) continue;
      if (!sancionesPorDni.has(row.dni)) sancionesPorDni.set(row.dni, []);
      sancionesPorDni.get(row.dni)!.push(row);
    }
  }

  let municipalidad: unknown = null;
  if (municipioRow && renamuPool) {
    const [conectividadRes, vehiculosRes] = await Promise.all([
      renamuPool.query<{ tiene_internet: boolean | null }>(
        `SELECT tiene_internet FROM renamu_conectividad WHERE municipio_id = $1`,
        [municipioRow.id]
      ),
      renamuPool.query<{ operativos: string }>(
        `SELECT COALESCE(SUM(cantidad_operativa), 0)::text AS operativos
           FROM renamu_vehiculos
          WHERE municipio_id = $1`,
        [municipioRow.id]
      ),
    ]);
    municipalidad = {
      idmunici: municipioRow.idmunici,
      anio: municipioRow.anio,
      tipomuni: municipioRow.tipomuni,
      tipo: TIPOS_MUNICIPO[municipioRow.tipomuni] ?? municipioRow.tipomuni,
      tieneInternet: conectividadRes.rows[0]?.tiene_internet ?? null,
      vehiculosOperativos: Number(vehiculosRes.rows[0]?.operativos ?? 0),
      nota: NOTA_MUNICIPALIDAD,
    };
  }

  if (candidatoRows.length === 0 && autoridadesRes.rows.length === 0 && !municipalidad) {
    return {
      status: 404,
      body: {
        error:
          `El UBIGEO ${ubigeo} no aparece en ninguna de las tres fuentes por UBIGEO de esta ficha ` +
          `(candidatos ERM, autoridades electas, RENAMU).`,
        ubigeo,
      },
    };
  }

  const nombres = candidatoRows[0];
  const porTipoYEleccionMap = new Map<string, number>();
  for (const c of candidatoRows) {
    const clave = `${c.tipo_eleccion}|${c.cargo}`;
    porTipoYEleccionMap.set(clave, (porTipoYEleccionMap.get(clave) ?? 0) + 1);
  }

  return {
    status: 200,
    body: {
      ubigeo,
      departamento: nombres?.departamento ?? municipioRow?.departamento ?? null,
      provincia: nombres?.provincia ?? municipioRow?.provincia ?? null,
      distrito: nombres?.distrito ?? municipioRow?.distrito ?? null,
      candidatos: {
        total: candidatoRows.length,
        inscritos: candidatoRows.filter((c) => c.estado === "INSCRITO").length,
        conSentenciasDeclaradas: candidatoRows.filter(
          (c) => c.sentencias_declaradas !== null && c.sentencias_declaradas > 0
        ).length,
        porTipoYEleccion: [...porTipoYEleccionMap.entries()].map(([clave, total]) => {
          const [tipoEleccion, cargo] = clave.split("|");
          return { tipoEleccion, cargo, total };
        }),
        detalle: candidatoRows.map((c) => ({
          dniEnmascarado: maskDni(c.dni),
          nombreCompleto: c.nombre_completo,
          cargo: c.cargo,
          tipoEleccion: c.tipo_eleccion,
          organizacionPolitica: c.organizacion_politica,
          organizacionEstado: c.organizacion_estado,
          estado: c.estado,
          posicion: c.posicion,
          sentenciasDeclaradas: c.sentencias_declaradas,
        })),
      },
      autoridadesVigentes: {
        total: autoridadesRes.rows.length,
        detalle: autoridadesRes.rows.map((a) => ({
          nombreCompleto: [a.nombres, a.apellido_paterno, a.apellido_materno]
            .filter(Boolean)
            .join(" ")
            .trim(),
          cargo: a.cargo,
          organizacionPolitica: a.organizacion_politica,
          ambito: a.ambito,
          periodo: a.periodo,
        })),
        nota: NOTA_AUTORIDADES,
      },
      municipalidad,
      candidatosConSancionDirecta: candidatoRows
        .map((c) => {
          const sanciones = sancionesPorDni.get(c.dni) ?? [];
          if (sanciones.length === 0) return null;
          return {
            dniEnmascarado: maskDni(c.dni),
            nombreCompleto: c.nombre_completo,
            cargo: c.cargo,
            organizacionPolitica: c.organizacion_politica,
            sanciones: sanciones.map((s) => ({
              tipo: s.tipo,
              razonSocial: s.razon_social,
              ruc: s.ruc,
              estado: s.estado,
              resolucion: s.resolucion,
              desde: s.desde,
              hasta: s.hasta,
            })),
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null),
      notaSanciones: NOTA_SANCIONES,
      advertencia: ADVERTENCIA,
    },
  };
}
