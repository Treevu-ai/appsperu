import { Router } from "express";
import { seguridadPool } from "../db/seguridad-pool.js";
import { programasPool } from "../db/programas-pool.js";
import { saludPool } from "../db/salud-pool.js";
import { empresasPool } from "../db/empresas-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import {
  FichaDistritalQuerySchema,
  NOTA_DENUNCIAS_SIDPOL,
  NOTA_ESTABLECIMIENTOS,
  NOTA_EMPRESAS_PRIVADAS,
  ADVERTENCIA_FICHA,
  type CoberturaSocialDistrito,
  type FichaDistritalData,
} from "../schema/ficha-distrital.js";

export const fichaDistritalRouter = Router();

/**
 * Columnas de `cobertura_social` que se exponen en la ficha. Todas son
 * conteos agregados por MIDIS, nunca listados nominales (ver
 * `docs/data-contracts/infomidis-cobertura-social.md`). Se listan a mano en
 * vez de hacer `SELECT *` para que una columna nueva de la fuente no aparezca
 * en la API sin que nadie la documente.
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

type DenunciaRow = {
  departamento: string;
  provincia: string;
  distrito: string;
  modalidad: string;
  cantidad: string;
};

type CoberturaRow = {
  fecha_corte: Date | string;
} & Record<string, unknown>;

type IpressRow = {
  total: string;
  activos: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
};

type EmpresaRow = {
  anio: number;
  mes: number;
  numero_empresas: number | null;
  distrito: string | null;
};

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** `null` en cualquier programa es "sin dato ese corte", no cero — ver schema. */
function toCoberturaSocial(row: CoberturaRow | undefined): CoberturaSocialDistrito | null {
  if (!row) return null;

  const programas: Record<string, number | null> = {};
  const columnasSinDato: string[] = [];
  for (const columna of COLUMNAS_COBERTURA) {
    const valor = row[columna];
    programas[columna] = toNumberOrNull(valor);
    if (valor === null || valor === undefined) columnasSinDato.push(columna);
  }

  const fecha = row.fecha_corte;
  return {
    fechaCorte: fecha instanceof Date ? fecha.toISOString() : String(fecha),
    programas,
    columnasSinDato,
  };
}

/**
 * `GET /api/ficha-distrital?ubigeo=&anio=`
 *
 * Cuatro fuentes, cuatro consultas independientes sobre pools de solo
 * lectura. Ninguna depende de que otra devuelva filas: un distrito sin
 * denuncias sigue devolviendo cobertura social y establecimientos. Las
 * respuestas vacías se exponen como `null`, nunca como cero, porque "la
 * fuente no publicó ese distrito" y "ese distrito tiene cero" son cosas
 * distintas.
 */
fichaDistritalRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(FichaDistritalQuerySchema, req.query, res);
    if (!parsed) return;
    const { ubigeo, anio } = parsed;
    const anioNum = Number(anio);

    const [denunciasRes, coberturaRes, ipressRes, empresasRes] = await Promise.all([
      seguridadPool.query<DenunciaRow>(
        `SELECT departamento, provincia, distrito, modalidad, SUM(cantidad)::text AS cantidad
           FROM police_reports
          WHERE ubigeo = $1 AND anio = $2
          GROUP BY departamento, provincia, distrito, modalidad
          ORDER BY SUM(cantidad) DESC, modalidad ASC`,
        [ubigeo, anioNum]
      ),
      programasPool.query<CoberturaRow>(
        `SELECT fecha_corte, ${COLUMNAS_COBERTURA.join(", ")}
           FROM cobertura_social
          WHERE ubigeo = $1
          ORDER BY fecha_corte DESC
          LIMIT 1`,
        [ubigeo]
      ),
      saludPool.query<IpressRow>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE estado = 'ACTIVO')::text AS activos,
                MIN(departamento) AS departamento,
                MIN(provincia) AS provincia,
                MIN(distrito) AS distrito
           FROM ipress
          WHERE ubigeo = $1`,
        [ubigeo]
      ),
      empresasPool.query<EmpresaRow>(
        `SELECT anio, mes, numero_empresas, distrito
           FROM empresas_privadas_distrito
          WHERE ubigeo = $1
          ORDER BY anio DESC, mes DESC
          LIMIT 1`,
        [ubigeo]
      ),
    ]);

    const denunciaRows = denunciasRes.rows;
    const ipressRow = ipressRes.rows[0];
    const empresaRow = empresasRes.rows[0];

    // Si ninguna de las cuatro fuentes conoce el UBIGEO, no hay ficha que
    // armar — 400 no aplica (el formato era válido) ni 500 (no hubo error):
    // el distrito simplemente no está en los datos ingeridos.
    const algunaFuenteTieneDato =
      denunciaRows.length > 0 ||
      coberturaRes.rows.length > 0 ||
      Number(ipressRow?.total ?? 0) > 0 ||
      empresaRow !== undefined;

    if (!algunaFuenteTieneDato) {
      res.status(404).json({
        error: `El UBIGEO ${ubigeo} no aparece en ninguna de las cuatro fuentes de esta ficha (SIDPOL ${anio}, MIDIS, RENIPRESS, MTPE).`,
        ubigeo,
      });
      return;
    }

    // SIDPOL es la única de las cuatro con departamento/provincia/distrito
    // NOT NULL, así que si hay denuncias, ahí salen los nombres. Si no las
    // hay, se intenta con MTPE (`distrito`) y después con RENIPRESS (ambos
    // nullable).
    const denunciaPrimaria = denunciaRows[0];
    const modalidades = denunciaRows.map((d) => ({
      modalidad: d.modalidad,
      cantidad: Number(d.cantidad),
    }));

    const body: FichaDistritalData = {
      ubigeo,
      anio: anioNum,
      departamento: denunciaPrimaria?.departamento ?? ipressRow?.departamento ?? null,
      provincia: denunciaPrimaria?.provincia ?? ipressRow?.provincia ?? null,
      distrito: denunciaPrimaria?.distrito ?? empresaRow?.distrito ?? ipressRow?.distrito ?? null,
      denuncias: {
        // `null` si SIDPOL no publicó ese distrito en ese año. Es distinto de
        // 0: 0 sería "se publicó y no hubo denuncias".
        total: denunciaRows.length > 0 ? modalidades.reduce((acc, m) => acc + m.cantidad, 0) : null,
        porModalidad: modalidades,
        nota: NOTA_DENUNCIAS_SIDPOL,
      },
      coberturaSocial: toCoberturaSocial(coberturaRes.rows[0]),
      establecimientosSalud:
        Number(ipressRow?.total ?? 0) > 0
          ? {
              total: Number(ipressRow.total),
              activos: Number(ipressRow.activos),
              nota: NOTA_ESTABLECIMIENTOS,
            }
          : null,
      empresasPrivadas: empresaRow
        ? {
            anio: empresaRow.anio,
            mes: empresaRow.mes,
            numeroEmpresas: toNumberOrNull(empresaRow.numero_empresas),
            nota: NOTA_EMPRESAS_PRIVADAS,
          }
        : null,
      advertencia: ADVERTENCIA_FICHA,
    };

    res.json(body);
  })
);
