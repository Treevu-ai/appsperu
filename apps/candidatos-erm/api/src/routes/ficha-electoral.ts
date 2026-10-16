import { Router } from "express";
import { pool } from "../db/pool.js";
import { autoridadesPool } from "../db/autoridades-pool.js";
import { renamuPool } from "../db/renamu-pool.js";
import { sancionadosPool } from "../db/sancionados-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import {
  FichaElectoralQuerySchema,
  NOTA_AUTORIDADES,
  NOTA_SANCIONES,
  NOTA_MUNICIPALIDAD,
  ADVERTENCIA_FICHA_ELECTORAL,
  type CandidatoFicha,
  type FichaElectoralData,
  type SancionDirecta,
} from "../schema/ficha-electoral.js";

export const fichaElectoralRouter = Router();

// Mismo criterio que `/api/candidatos` y que `personas-sancionadas.ts` de
// proveedores-sancionados: el DNI se almacena sin enmascarar (es la
// declaración jurada del candidato, pública en su hoja de vida) pero NUNCA
// sale enmascarado de la API.
function maskDni(dni: string): string {
  return `${"*".repeat(dni.length - 3)}${dni.slice(-3)}`;
}

const TIPOS_MUNICIPO: Record<string, string> = {
  "1": "Provincial",
  "2": "Distrital",
  "3": "Centro Poblado",
};

type CandidatoRow = {
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
};

type AutoridadRow = {
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  cargo: string;
  organizacion_politica: string;
  ambito: string | null;
  periodo: string | null;
};

type MunicipioRow = {
  id: string;
  idmunici: string;
  anio: number;
  tipomuni: string;
  departamento: string;
  provincia: string;
  distrito: string;
};

type ConectividadRow = {
  tiene_internet: boolean | null;
};

type VehiculosRow = {
  operativos: string;
};

type SancionRow = {
  dni: string | null;
  ruc: string;
  razon_social: string;
  estado: string | null;
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  tipo: "INHABILITACION" | "MULTA";
};

function toSancion(r: SancionRow): SancionDirecta {
  return {
    tipo: r.tipo,
    razonSocial: r.razon_social,
    ruc: r.ruc,
    estado: r.estado,
    resolucion: r.resolucion,
    desde: r.desde,
    hasta: r.hasta,
  };
}

/**
 * `GET /api/ficha-electoral?ubigeo=`
 *
 * Cuatro fuentes, uniones todas exactas: candidatos por UBIGEO, autoridades
 * por UBIGEO, municipalidad RENAMU por UBIGEO, y sanciones por DNI exacto
 * (nunca por nombre — un match difuso sobre nombre produciría acusaciones
 * falsas contra homónimos).
 *
 * Deliberadamente NO incluye obras paralizadas de INFOBRAS: esa app no tiene
 * UBIGEO, solo distrito/provincia como texto, y su XLSX fuente corrompe la
 * "Ñ" por un espacio en decenas de distritos (ver `docs/conectores.md`,
 * "Bug de la 'Ñ'"). Un join exacto sobre ese texto subestimaría en silencio
 * circunscripciones como Cañete. Para eso existe la recuperación difusa de
 * `infobras/crossref/territory-lookup.ts`, que no se puede reutilizar como un
 * join SQL.
 */
fichaElectoralRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(FichaElectoralQuerySchema, req.query, res);
    if (!parsed) return;
    const { ubigeo } = parsed;

    const [candidatosRes, autoridadesRes, municipioRes] = await Promise.all([
      pool.query<CandidatoRow>(
        `SELECT dni, nombre_completo, cargo, tipo_eleccion, organizacion_politica,
                organizacion_estado, estado, departamento, provincia, distrito,
                posicion, sentencias_declaradas
           FROM candidatos_erm
          WHERE ubigeo = $1
          ORDER BY tipo_eleccion, cargo, posicion NULLS LAST, nombre_completo`,
        [ubigeo]
      ),
      autoridadesPool.query<AutoridadRow>(
        `SELECT nombres, apellido_paterno, apellido_materno, cargo,
                organizacion_politica, ambito, periodo
           FROM autoridades_electas
          WHERE ubigeo = $1
          ORDER BY cargo, posicion NULLS LAST, apellido_paterno`,
        [ubigeo]
      ),
      renamuPool.query<MunicipioRow>(
        `SELECT id, idmunici, anio, tipomuni, departamento, provincia, distrito
           FROM renamu_municipalidades
          WHERE ubigeo = $1
          ORDER BY anio DESC
          LIMIT 1`,
        [ubigeo]
      ),
    ]);

    const candidatoRows = candidatosRes.rows;
    const municipioRow = municipioRes.rows[0];

    // Sanciones: solo si hay candidatos cuyo DNI consultar. Un array vacío
    // aquí significa "ningún candidato tiene sanción", no "no se consultó".
    let sancionesPorDni = new Map<string, SancionRow[]>();
    if (candidatoRows.length > 0) {
      const dnis = [...new Set(candidatoRows.map((c) => c.dni))];
      const { rows: sancionRows } = await sancionadosPool.query<SancionRow>(
        `SELECT dni, ruc, razon_social, estado, resolucion, desde, hasta,
                'INHABILITACION'::text AS tipo
           FROM inhabilitaciones WHERE dni = ANY($1)
         UNION ALL
         SELECT dni, ruc, razon_social, estado, resolucion, desde, hasta,
                'MULTA'::text AS tipo
           FROM multas WHERE dni = ANY($1)`,
        [dnis]
      );
      sancionesPorDni = new Map();
      for (const row of sancionRows) {
        if (!row.dni) continue;
        if (!sancionesPorDni.has(row.dni)) sancionesPorDni.set(row.dni, []);
        sancionesPorDni.get(row.dni)!.push(row);
      }
    }

    // RENAMU: identificación + conectividad + vehículos de la municipalidad
    // más reciente registrada para ese UBIGEO.
    let municipalidad: FichaElectoralData["municipalidad"] = null;
    if (municipioRow) {
      const [conectividadRes, vehiculosRes] = await Promise.all([
        renamuPool.query<ConectividadRow>(
          `SELECT tiene_internet FROM renamu_conectividad WHERE municipio_id = $1`,
          [municipioRow.id]
        ),
        renamuPool.query<VehiculosRow>(
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
      res.status(404).json({
        error: `El UBIGEO ${ubigeo} no aparece en ninguna de las tres fuentes por UBIGEO de esta ficha (candidatos ERM, autoridades electas, RENAMU).`,
        ubigeo,
      });
      return;
    }

    // Nombres territoriales: de los candidatos si los hay (traen `departamento`
    // en la fuente), si no de RENAMU, que los trae NOT NULL.
    const nombres = candidatoRows[0];

    const detalle: CandidatoFicha[] = candidatoRows.map((c) => ({
      dniEnmascarado: maskDni(c.dni),
      nombreCompleto: c.nombre_completo,
      cargo: c.cargo,
      tipoEleccion: c.tipo_eleccion,
      organizacionPolitica: c.organizacion_politica,
      organizacionEstado: c.organizacion_estado,
      estado: c.estado,
      posicion: c.posicion,
      sentenciasDeclaradas: c.sentencias_declaradas,
    }));

    const porTipoYEleccionMap = new Map<string, number>();
    for (const c of candidatoRows) {
      const clave = `${c.tipo_eleccion}|${c.cargo}`;
      porTipoYEleccionMap.set(clave, (porTipoYEleccionMap.get(clave) ?? 0) + 1);
    }

    const candidatosConSancionDirecta = candidatoRows
      .map((c) => {
        const sanciones = sancionesPorDni.get(c.dni) ?? [];
        if (sanciones.length === 0) return null;
        return {
          dniEnmascarado: maskDni(c.dni),
          nombreCompleto: c.nombre_completo,
          cargo: c.cargo,
          organizacionPolitica: c.organizacion_politica,
          sanciones: sanciones.map(toSancion),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const body: FichaElectoralData = {
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
        detalle,
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
      candidatosConSancionDirecta,
      notaSanciones: NOTA_SANCIONES,
      advertencia: ADVERTENCIA_FICHA_ELECTORAL,
    };

    res.json(body);
  })
);
