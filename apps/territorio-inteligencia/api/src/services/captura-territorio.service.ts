import { pool } from "../db/pool.js";
import { CapturaTerritorioQuery, type CapturaData } from "../schema/captura-territorio.js";

export async function getCapturaTerritorio(query: CapturaTerritorioQuery): Promise<CapturaData[]> {
  const { departamento, tipoCatastro, limiteRucs = 10 } = query;

  let table = "";
  let rucCol = "";
  let nameCol = "";
  let surfCol = "";

  if (tipoCatastro === "forestal") {
    table = "catastro_forestal_titulos";
    rucCol = "titular_ruc";
    nameCol = "titular_nombre";
    surfCol = "superficie";
  } else {
    table = "catastro_minero_derechos";
    rucCol = "titular"; // Use name as ID if RUC is missing
    nameCol = "titular";
    surfCol = "hectareas";
  }

  let whereClause = "WHERE 1=1";
  const params: any[] = [];

  if (departamento) {
    params.push(departamento);
    whereClause += ` AND departamento = \$${params.length}`;
  }

  const totalSurfQuery = `SELECT SUM(${surfCol}) as total FROM ${table} ${whereClause}`;
  const { rows: [totalRow] } = await pool.query(totalSurfQuery, params);
  const totalSuperficie = Number(totalRow?.total ?? 0);

  const topHoldersQuery = `
    SELECT 
      ${rucCol} as ruc, 
      ${nameCol} as nombre, 
      SUM(${surfCol}) as totalSuperficie, 
      COUNT(*) as "conteoTítulos"
    FROM ${table}
    ${whereClause}
    GROUP BY ${rucCol}, ${nameCol}
    ORDER BY totalSuperficie DESC
    LIMIT \$${params.length + 1}
  `;

  const { rows: holders } = await pool.query(topHoldersQuery, [...params, limiteRucs]);

  return holders.map(h => ({
    ruc: h.ruc,
    nombre: h.nombre,
    totalSuperficie: Number(h.totalsuperficie),
    conteoTítulos: Number(h.conteotítulos),
    proporcionTerritorial: totalSuperficie > 0 ? (Number(h.totalsuperficie) / totalSuperficie) * 100 : 0,
  }));
}
