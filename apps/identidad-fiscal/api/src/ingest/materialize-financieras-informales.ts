import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

/**
 * GOT-06/GOT-07 adaptados (ver migración 011): materializa candidatas a
 * financiera informal ("gota a gota", casa de cambio o de empeño) desde
 * `contribuyentes` por coincidencia de nombre -- no hay CIIU en el padrón
 * reducido nacional (solo en `ficha_ruc_actividades`/`ruc_consulta_masiva`,
 * ambas con cobertura parcial de un seed, no el universo completo), así que
 * no se puede filtrar por código de actividad económica real.
 *
 * Re-ejecutable: trunca y vuelve a insertar completo cada vez (mismo
 * criterio que otras materializaciones del repo, ver
 * `apps/actividad-agraria/api/src/ingest/materialize-coverage.ts`) -- el
 * padrón de `contribuyentes` se re-ingiere periódicamente y las candidatas
 * deben reflejar su estado más reciente, no acumular versiones viejas.
 */

const PATRON = String.raw`\mPRESTAMOS?\M|\mEMPE[ÑN]OS?\M|CASA DE CAMBIO|CAMBIO DE MONEDA|\mPRENDARI[OA]S?\M`;

// Códigos UBIGEO de departamento (2 primeros dígitos), INEI -- estables, no
// cambian; se evita depender de un cruce con otra tabla solo para este mapeo
// fijo de 25 entradas.
const DEPARTAMENTO_POR_PREFIJO: Record<string, string> = {
  "01": "AMAZONAS", "02": "ANCASH", "03": "APURIMAC", "04": "AREQUIPA",
  "05": "AYACUCHO", "06": "CAJAMARCA", "07": "CALLAO", "08": "CUSCO",
  "09": "HUANCAVELICA", "10": "HUANUCO", "11": "ICA", "12": "JUNIN",
  "13": "LA LIBERTAD", "14": "LAMBAYEQUE", "15": "LIMA", "16": "LORETO",
  "17": "MADRE DE DIOS", "18": "MOQUEGUA", "19": "PASCO", "20": "PIURA",
  "21": "PUNO", "22": "SAN MARTIN", "23": "TACNA", "24": "TUMBES",
  "25": "UCAYALI",
};

function departamentoDeUbigeo(ubigeo: string | null): string | null {
  if (!ubigeo || ubigeo.length < 2) return null;
  return DEPARTAMENTO_POR_PREFIJO[ubigeo.slice(0, 2)] ?? null;
}

export interface MaterializeSummary {
  candidatas: number;
  activas: number;
}

export async function materializeFinancierasInformales(): Promise<MaterializeSummary> {
  const { rows } = await pool.query<{
    ruc: string;
    razon_social: string;
    ubigeo: string | null;
    estado_contribuyente: string | null;
    condicion_domicilio: string | null;
  }>(
    `SELECT ruc, razon_social, ubigeo, estado_contribuyente, condicion_domicilio
     FROM contribuyentes
     WHERE razon_social ~* $1`,
    [PATRON]
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE financieras_informales_candidatas");

    if (rows.length > 0) {
      const columns = [
        "ruc", "razon_social", "ubigeo", "departamento",
        "estado_contribuyente", "condicion_domicilio", "patron_coincidente",
      ];
      const values: unknown[] = [];
      const tuples: string[] = [];
      rows.forEach((row, i) => {
        const base = i * columns.length;
        tuples.push(`(${columns.map((_, j) => `$${base + j + 1}`).join(",")})`);
        values.push(
          row.ruc,
          row.razon_social,
          row.ubigeo,
          departamentoDeUbigeo(row.ubigeo),
          row.estado_contribuyente,
          row.condicion_domicilio,
          PATRON
        );
      });
      await client.query(
        `INSERT INTO financieras_informales_candidatas (${columns.join(",")}) VALUES ${tuples.join(",")}`,
        values
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    candidatas: rows.length,
    activas: rows.filter((r) => r.estado_contribuyente === "ACTIVO").length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  materializeFinancierasInformales()
    .then((summary) => {
      console.log("Materialización de financieras informales completada:", summary);
      return pool.end();
    })
    .catch((error) => {
      console.error("Materialización falló:", error);
      process.exit(1);
    });
}
