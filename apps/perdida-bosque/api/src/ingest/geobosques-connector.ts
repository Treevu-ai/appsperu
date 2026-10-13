import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool, connectSafe } from "../db/pool.js";

const BASE_URL = "https://geobosques.minam.gob.pe/geobosque/controller/consulta.php";

/**
 * Código UBIGEO de departamento → nombre. Tabla fija: los 25 departamentos
 * del Perú no cambian (misma lista que
 * apps/territorio-inteligencia/api/src/lib/ubigeo.ts).
 */
const DEPARTAMENTOS: Record<string, string> = {
  "01": "AMAZONAS",
  "02": "ANCASH",
  "03": "APURIMAC",
  "04": "AREQUIPA",
  "05": "AYACUCHO",
  "06": "CAJAMARCA",
  "07": "CALLAO",
  "08": "CUSCO",
  "09": "HUANCAVELICA",
  "10": "HUANUCO",
  "11": "ICA",
  "12": "JUNIN",
  "13": "LA LIBERTAD",
  "14": "LAMBAYEQUE",
  "15": "LIMA",
  "16": "LORETO",
  "17": "MADRE DE DIOS",
  "18": "MOQUEGUA",
  "19": "PASCO",
  "20": "PIURA",
  "21": "PUNO",
  "22": "SAN MARTIN",
  "23": "TACNA",
  "24": "TUMBES",
  "25": "UCAYALI",
};

const PAUSA_ENTRE_LLAMADAS_MS = 400;

interface PerdidaRaw {
  anio_: string;
  perdida_: string | number | null;
  rango1_: string | number | null;
  rango2_: string | number | null;
  rango3_: string | number | null;
  rango4_: string | number | null;
  rango5_: string | number | null;
  tipobosque_: string | null;
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** La API devuelve 5 filas de calibración con anio_ "1".."5" que no son años reales. */
function esAnioReal(anioStr: string): boolean {
  return /^\d{4}$/.test(anioStr) && Number(anioStr) >= 2001;
}

async function fetchConsulta(nivel: string, ubigeo: string): Promise<{ raw: string; filas: PerdidaRaw[] }> {
  const body = new URLSearchParams({ datos: JSON.stringify({ nc: nivel, ub: ubigeo }) });
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Geobosques devolvió ${res.status} para nc=${nivel} ub=${ubigeo}`);
  const raw = await res.text();
  const parsed = JSON.parse(raw) as Array<{ perdida?: PerdidaRaw[] }>;
  const filas = (parsed[0]?.perdida ?? []).filter((f) => esAnioReal(f.anio_));
  return { raw, filas };
}

async function ingestNivel(nivel: string, ubigeo: string): Promise<number> {
  const { raw, filas } = await fetchConsulta(nivel, ubigeo);

  const client = await connectSafe();
  try {
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_geobosques_batches (nivel, ubigeo, source_url, checksum, record_count)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [nivel, ubigeo, BASE_URL, checksumOf(raw), filas.length]
    );
    const batchId = batchRows[0].id;

    let filasInsertadas = 0;
    await client.query("BEGIN");
    try {
      for (const fila of filas) {
        await client.query(
          `INSERT INTO perdida_bosque_anual
             (nivel, ubigeo, anio, perdida_ha, rango1_ha, rango2_ha, rango3_ha, rango4_ha, rango5_ha,
              tipo_bosque, source_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (nivel, ubigeo, anio) DO UPDATE SET
             perdida_ha = EXCLUDED.perdida_ha,
             rango1_ha = EXCLUDED.rango1_ha,
             rango2_ha = EXCLUDED.rango2_ha,
             rango3_ha = EXCLUDED.rango3_ha,
             rango4_ha = EXCLUDED.rango4_ha,
             rango5_ha = EXCLUDED.rango5_ha,
             tipo_bosque = EXCLUDED.tipo_bosque,
             source_batch_id = EXCLUDED.source_batch_id`,
          [
            nivel,
            ubigeo,
            Number(fila.anio_),
            toNumberOrNull(fila.perdida_),
            toNumberOrNull(fila.rango1_),
            toNumberOrNull(fila.rango2_),
            toNumberOrNull(fila.rango3_),
            toNumberOrNull(fila.rango4_),
            toNumberOrNull(fila.rango5_),
            fila.tipobosque_,
            batchId,
          ]
        );
        filasInsertadas++;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    return filasInsertadas;
  } finally {
    client.release();
  }
}

async function ingestGeobosques(): Promise<{ nacional: number; porDepartamento: Record<string, number>; total: number }> {
  const nacional = await ingestNivel("00", "null");

  const porDepartamento: Record<string, number> = {};
  for (const [codigo, nombre] of Object.entries(DEPARTAMENTOS)) {
    await sleep(PAUSA_ENTRE_LLAMADAS_MS);
    try {
      porDepartamento[`${codigo} ${nombre}`] = await ingestNivel("01", codigo);
    } catch (err) {
      console.error(`Error en departamento ${codigo} ${nombre}:`, err instanceof Error ? err.message : err);
      porDepartamento[`${codigo} ${nombre}`] = 0;
    }
  }

  const total = nacional + Object.values(porDepartamento).reduce((a, b) => a + b, 0);
  return { nacional, porDepartamento, total };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestGeobosques()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
