import { pathToFileURL } from "node:url";
import { pool, connectSafe } from "../db/pool.js";
import { sancionesPool } from "../db/sanciones-pool.js";
import { computeConcentration } from "../suppliers/concentration.js";

/**
 * IIC (Índice de Integridad en Contrataciones) -- piloto La Libertad.
 * Granularidad: por entidad compradora (buyer_id+buyer_name), no regional
 * -- a diferencia de INCORE/IRESA/IRBG/IRIS (IPE), que solo llegan a nivel
 * de las 25 regiones.
 *
 * Escala 0-10, 10 = mejor (menor riesgo), comparable con la convención de
 * IRIS. Mínimo 5 adjudicaciones en el período para calificar -- con menos,
 * datos_insuficientes=true y NO se asigna un score (nunca "riesgo cero"
 * por falta de dato, mismo principio que
 * apps/territorio-inteligencia/api/src/routes/riesgo-eudr.ts).
 */

const MIN_ADJUDICACIONES = 5;

interface AwardRow {
  award_id: string;
  ocid: string;
  buyer_id: string;
  buyer_name: string;
  supplier_id: string;
  valor_monto: string;
  fecha: string;
}

interface InhabilitacionRow {
  ruc: string;
  desde: string | null;
  hasta: string | null;
}

interface EntidadAgregada {
  buyer_id: string;
  buyer_name: string;
  adjudicaciones: AwardRow[];
}

function limpiarRuc(supplierId: string | null): string | null {
  if (!supplierId) return null;
  return supplierId.replace("PE-RUC-", "").trim();
}

/** Normaliza un valor dentro de [min,max] a escala 0-10. Si min===max, todos quedan en 10 (sin varianza, no se castiga). */
/**
 * Sin varianza (min===max, ej. universo de 1 sola entidad calificable, o
 * todas con el mismo crudo), NO se puede normalizar por percentil -- se usa
 * el valor absoluto directo (crudo ya vive en [0,1]: porcentaje o HHI
 * normalizado). Bug real encontrado en tests: devolver 10 en ese caso
 * (percentil "más alto" sin más contexto) hacía que, tras invertir con
 * `10 - normalizar0a10(...)`, un crudo=0 (el mejor caso posible, 0% de
 * monto sancionado) terminara en score=0 (el peor) -- justo al revés.
 */
function normalizar0a10(valor: number, min: number, max: number): number {
  if (max === min) return Math.max(0, Math.min(10, valor * 10));
  const pct = (valor - min) / (max - min);
  return Math.max(0, Math.min(10, pct * 10));
}

async function fetchAwardsLaLibertad(): Promise<AwardRow[]> {
  const { rows } = await pool.query<AwardRow>(
    `SELECT award_id, ocid, buyer_id, buyer_name, supplier_id, valor_monto, fecha::text
     FROM awards
     WHERE departamento ILIKE '%LIBERTAD%' AND supplier_id IS NOT NULL AND buyer_id IS NOT NULL`
  );
  return rows;
}

async function fetchInhabilitaciones(): Promise<Map<string, InhabilitacionRow[]>> {
  const { rows } = await sancionesPool.query<InhabilitacionRow>(
    `SELECT ruc, desde::text, hasta::text FROM inhabilitaciones WHERE ruc IS NOT NULL`
  );
  const byRuc = new Map<string, InhabilitacionRow[]>();
  for (const r of rows) {
    if (!byRuc.has(r.ruc)) byRuc.set(r.ruc, []);
    byRuc.get(r.ruc)!.push(r);
  }
  return byRuc;
}

/** Número de postores DISTINTOS registrados por ocid -- proxy de "sin concurso competitivo" cuando =1. No hay campo de modalidad limpio en awards/procurement_processes (tags es solo etapa OCDS: planning/tender/award/contract), así que se usa este conteo real en vez de inventar un campo. */
async function fetchPostoresPorOcid(): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ ocid: string; n_postores: string }>(
    `SELECT b.ocid, count(DISTINCT b.bidder_id) AS n_postores
     FROM bidders b
     JOIN procurement_processes p ON p.ocid = b.ocid
     WHERE p.departamento ILIKE '%LIBERTAD%'
     GROUP BY b.ocid`
  );
  const byOcid = new Map<string, number>();
  for (const r of rows) byOcid.set(r.ocid, Number(r.n_postores));
  return byOcid;
}

interface ResultadoEntidad {
  buyer_id: string;
  buyer_name: string;
  n_adjudicaciones: number;
  monto_total: number;
  datos_insuficientes: boolean;
  pctMontoSancionado: number | null; // sub A crudo (0-1)
  pctUnSoloPostor: number | null; // sub B crudo (0-1)
  hhi: number | null; // sub C crudo (0-1)
}

function fechaEnVigencia(fecha: string, desde: string | null, hasta: string | null): boolean {
  if (!desde || !hasta) return false;
  const f = new Date(fecha).getTime();
  return f >= new Date(desde).getTime() && f <= new Date(hasta).getTime();
}

async function calcularCrudos(): Promise<ResultadoEntidad[]> {
  const [awards, inhabByRuc, postoresPorOcid] = await Promise.all([
    fetchAwardsLaLibertad(),
    fetchInhabilitaciones(),
    fetchPostoresPorOcid(),
  ]);

  const porEntidad = new Map<string, EntidadAgregada>();
  for (const a of awards) {
    const key = a.buyer_id;
    const actual = porEntidad.get(key) ?? { buyer_id: a.buyer_id, buyer_name: a.buyer_name, adjudicaciones: [] };
    actual.adjudicaciones.push(a);
    porEntidad.set(key, actual);
  }

  const resultados: ResultadoEntidad[] = [];
  for (const [, entidad] of porEntidad) {
    const { adjudicaciones } = entidad;
    const n_adjudicaciones = adjudicaciones.length;
    const monto_total = adjudicaciones.reduce((s, a) => s + Number(a.valor_monto), 0);
    const datos_insuficientes = n_adjudicaciones < MIN_ADJUDICACIONES;

    // Sub A: % monto a proveedores con inhabilitación VIGENTE al momento de adjudicar.
    let montoSancionado = 0;
    for (const a of adjudicaciones) {
      const ruc = limpiarRuc(a.supplier_id);
      if (!ruc) continue;
      const sanciones = inhabByRuc.get(ruc);
      if (!sanciones) continue;
      const vigenteAlAdjudicar = sanciones.some((s) => fechaEnVigencia(a.fecha, s.desde, s.hasta));
      if (vigenteAlAdjudicar) montoSancionado += Number(a.valor_monto);
    }
    const pctMontoSancionado = monto_total > 0 ? montoSancionado / monto_total : null;

    // Sub B: % de adjudicaciones cuyo ocid tiene exactamente 1 postor distinto registrado.
    const conDatosPostores = adjudicaciones.filter((a) => postoresPorOcid.has(a.ocid));
    const unSoloPostor = conDatosPostores.filter((a) => postoresPorOcid.get(a.ocid) === 1).length;
    const pctUnSoloPostor = conDatosPostores.length > 0 ? unSoloPostor / conDatosPostores.length : null;

    // Sub C: HHI por monto entre proveedores distintos de la entidad --
    // reutiliza src/suppliers/concentration.ts (ya existente, base 10,000
    // estándar de organización industrial) en vez de un cálculo propio.
    const montoPorProveedor = new Map<string, number>();
    for (const a of adjudicaciones) {
      const ruc = limpiarRuc(a.supplier_id) ?? a.supplier_id;
      montoPorProveedor.set(ruc, (montoPorProveedor.get(ruc) ?? 0) + Number(a.valor_monto));
    }
    const shares = [...montoPorProveedor.entries()].map(([supplierId, valorTotal]) => ({ supplierId, valorTotal }));
    const hhi = monto_total > 0 ? computeConcentration(shares).hhi / 10000 : null; // normalizado a 0-1 para ser comparable con los otros sub-indicadores

    resultados.push({
      buyer_id: entidad.buyer_id,
      buyer_name: entidad.buyer_name,
      n_adjudicaciones,
      monto_total,
      datos_insuficientes,
      pctMontoSancionado,
      pctUnSoloPostor,
      hhi,
    });
  }

  return resultados;
}

interface IICRow {
  buyer_id: string;
  buyer_name: string;
  score: number | null;
  sub_indicador_a: number | null;
  sub_indicador_b: number | null;
  sub_indicador_c: number | null;
  n_subindicadores: number;
  n_adjudicaciones: number;
  monto_total: number;
  datos_insuficientes: boolean;
  notas: string | null;
}

function calcularIIC(crudos: ResultadoEntidad[]): IICRow[] {
  const calificables = crudos.filter((c) => !c.datos_insuficientes);

  // Normalización min-max DENTRO del universo de entidades calificadas de
  // La Libertad -- cada sub-indicador crudo está en [0,1] (porcentaje o
  // HHI), más alto = peor; se invierte al convertir a escala 0-10 (10=mejor).
  const pctSancA = calificables.map((c) => c.pctMontoSancionado).filter((v): v is number => v !== null);
  const pctSancB = calificables.map((c) => c.pctUnSoloPostor).filter((v): v is number => v !== null);
  const hhiVals = calificables.map((c) => c.hhi).filter((v): v is number => v !== null);

  const minA = Math.min(...pctSancA, 0);
  const maxA = Math.max(...pctSancA, 0);
  const minB = Math.min(...pctSancB, 0);
  const maxB = Math.max(...pctSancB, 0);
  const minC = Math.min(...hhiVals, 0);
  const maxC = Math.max(...hhiVals, 0);

  const resultado: IICRow[] = [];
  for (const c of crudos) {
    if (c.datos_insuficientes) {
      resultado.push({
        buyer_id: c.buyer_id,
        buyer_name: c.buyer_name,
        score: null,
        sub_indicador_a: null,
        sub_indicador_b: null,
        sub_indicador_c: null,
        n_subindicadores: 0,
        n_adjudicaciones: c.n_adjudicaciones,
        monto_total: c.monto_total,
        datos_insuficientes: true,
        notas: `Menos de ${MIN_ADJUDICACIONES} adjudicaciones en el período -- sin score, no se puede calificar con confianza.`,
      });
      continue;
    }

    // invertido: 10 - normalizado(crudo), porque crudo alto = peor
    const subA = c.pctMontoSancionado !== null ? 10 - normalizar0a10(c.pctMontoSancionado, minA, maxA) : null;
    const subB = c.pctUnSoloPostor !== null ? 10 - normalizar0a10(c.pctUnSoloPostor, minB, maxB) : null;
    const subC = c.hhi !== null ? 10 - normalizar0a10(c.hhi, minC, maxC) : null;

    const disponibles = [subA, subB, subC].filter((v): v is number => v !== null);
    const n_subindicadores = disponibles.length;
    const score = n_subindicadores > 0 ? disponibles.reduce((s, v) => s + v, 0) / n_subindicadores : null;

    const notasPartes: string[] = [];
    if (subB === null) notasPartes.push("sub-indicador B sin dato (ningún ocid de esta entidad tiene postores registrados en 'bidders')");
    if (c.pctMontoSancionado !== null && c.pctMontoSancionado > 0) {
      notasPartes.push(`${(c.pctMontoSancionado * 100).toFixed(1)}% del monto fue a proveedor(es) con inhabilitación vigente al adjudicar`);
    }

    resultado.push({
      buyer_id: c.buyer_id,
      buyer_name: c.buyer_name,
      score,
      sub_indicador_a: subA,
      sub_indicador_b: subB,
      sub_indicador_c: subC,
      n_subindicadores,
      n_adjudicaciones: c.n_adjudicaciones,
      monto_total: c.monto_total,
      datos_insuficientes: false,
      notas: notasPartes.length > 0 ? notasPartes.join("; ") : null,
    });
  }

  return resultado;
}

async function persistir(filas: IICRow[]): Promise<void> {
  const fechaCorte = new Date().toISOString().slice(0, 10);
  const client = await connectSafe();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM indice_integridad_contrataciones WHERE fecha_corte = $1`, [fechaCorte]);
    for (const f of filas) {
      await client.query(
        `INSERT INTO indice_integridad_contrataciones
           (buyer_id, buyer_name, fecha_corte, score, sub_indicador_a, sub_indicador_b, sub_indicador_c,
            n_subindicadores, n_adjudicaciones, monto_total, datos_insuficientes, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (buyer_id, fecha_corte) DO UPDATE SET
           score = EXCLUDED.score, sub_indicador_a = EXCLUDED.sub_indicador_a,
           sub_indicador_b = EXCLUDED.sub_indicador_b, sub_indicador_c = EXCLUDED.sub_indicador_c,
           n_subindicadores = EXCLUDED.n_subindicadores, n_adjudicaciones = EXCLUDED.n_adjudicaciones,
           monto_total = EXCLUDED.monto_total, datos_insuficientes = EXCLUDED.datos_insuficientes,
           notas = EXCLUDED.notas`,
        [
          f.buyer_id,
          f.buyer_name,
          fechaCorte,
          f.score,
          f.sub_indicador_a,
          f.sub_indicador_b,
          f.sub_indicador_c,
          f.n_subindicadores,
          f.n_adjudicaciones,
          f.monto_total,
          f.datos_insuficientes,
          f.notas,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function calcularYPersistirIIC(): Promise<IICRow[]> {
  const crudos = await calcularCrudos();
  const iic = calcularIIC(crudos);
  await persistir(iic);
  return iic;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  calcularYPersistirIIC()
    .then((filas) => {
      const calificadas = filas.filter((f) => !f.datos_insuficientes).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
      const insuficientes = filas.filter((f) => f.datos_insuficientes);
      console.log(`\n=== IIC La Libertad -- ${calificadas.length} entidades calificadas, ${insuficientes.length} con datos insuficientes ===\n`);
      console.log("Ranking (peor a mejor score):");
      for (const f of calificadas) {
        console.log(
          `  ${f.score!.toFixed(2)} | ${f.buyer_name} | n=${f.n_adjudicaciones} | monto=S/${f.monto_total.toLocaleString("es-PE")} | ` +
            `A=${f.sub_indicador_a?.toFixed(2)} B=${f.sub_indicador_b?.toFixed(2) ?? "s/d"} C=${f.sub_indicador_c?.toFixed(2)}` +
            (f.notas ? ` | ${f.notas}` : "")
        );
      }
      console.log(`\nEntidades con <${MIN_ADJUDICACIONES} adjudicaciones (sin score):`);
      for (const f of insuficientes) {
        console.log(`  ${f.buyer_name} | n=${f.n_adjudicaciones}`);
      }
      return Promise.all([pool.end(), sancionesPool.end()]);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
