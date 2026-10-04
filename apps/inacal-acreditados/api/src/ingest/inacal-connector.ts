import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const BASE_URL = "https://servicios.inacal.gob.pe/datos_abiertos_data/api";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const CATEGORIAS_RICAS = ["OrganismoInspeccion", "OrganismoCertificacionProducto", "OrganismoCertificacionSistema"] as const;

interface OrganismoRico {
  id: number;
  nombre: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  web?: string;
  resolucion?: string;
  registroNro?: string;
  vigencia?: string;
  tipo?: string;
}

interface LaboratorioMinimo {
  id: number;
  nombre: string;
}

function nullIfEmpty(s: string | undefined): string | null {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
}

async function fetchJson<T>(endpoint: string): Promise<{ data: T; raw: string }> {
  const res = await fetch(`${BASE_URL}/${endpoint}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`INACAL devolvió ${res.status} al pedir ${endpoint}`);
  const raw = await res.text();
  return { data: JSON.parse(raw) as T, raw };
}

async function ingestCategoriaRica(categoria: (typeof CATEGORIAS_RICAS)[number]): Promise<{ batchId: number; filasInsertadas: number }> {
  const { data: organismos, raw } = await fetchJson<OrganismoRico[]>(categoria);
  const checksum = createHash("sha256").update(raw).digest("hex");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_inacal_batches (categoria, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [categoria, `${BASE_URL}/${categoria}`, checksum, organismos.length]
    );
    const batchId = batchRows[0].id;

    for (const o of organismos) {
      await client.query(
        `INSERT INTO organismos_acreditados
           (categoria, inacal_id, nombre, direccion, telefono, email, web, resolucion, registro_nro, vigencia, tipo, source_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (categoria, inacal_id) DO UPDATE SET
           nombre = EXCLUDED.nombre, direccion = EXCLUDED.direccion, telefono = EXCLUDED.telefono,
           email = EXCLUDED.email, web = EXCLUDED.web, resolucion = EXCLUDED.resolucion,
           registro_nro = EXCLUDED.registro_nro, vigencia = EXCLUDED.vigencia, tipo = EXCLUDED.tipo,
           source_batch_id = EXCLUDED.source_batch_id`,
        [
          categoria, o.id, o.nombre, nullIfEmpty(o.direccion), nullIfEmpty(o.telefono),
          nullIfEmpty(o.email), nullIfEmpty(o.web), nullIfEmpty(o.resolucion),
          nullIfEmpty(o.registroNro), nullIfEmpty(o.vigencia), nullIfEmpty(o.tipo), batchId,
        ]
      );
    }
    await client.query("COMMIT");
    return { batchId, filasInsertadas: organismos.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ingestLaboratorios(): Promise<{ batchId: number; filasInsertadas: number }> {
  const { data: labs, raw } = await fetchJson<LaboratorioMinimo[]>("LaboratorioEnsayo");
  const checksum = createHash("sha256").update(raw).digest("hex");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_inacal_batches (categoria, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      ["LaboratorioEnsayo", `${BASE_URL}/LaboratorioEnsayo`, checksum, labs.length]
    );
    const batchId = batchRows[0].id;

    for (const l of labs) {
      await client.query(
        `INSERT INTO laboratorios_ensayo (inacal_id, nombre, source_batch_id) VALUES ($1,$2,$3)
         ON CONFLICT (inacal_id) DO UPDATE SET nombre = EXCLUDED.nombre, source_batch_id = EXCLUDED.source_batch_id`,
        [l.id, l.nombre, batchId]
      );
    }
    await client.query("COMMIT");
    return { batchId, filasInsertadas: labs.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ingestInacal() {
  const resultados: Record<string, { batchId: number; filasInsertadas: number }> = {};
  for (const categoria of CATEGORIAS_RICAS) {
    resultados[categoria] = await ingestCategoriaRica(categoria);
  }
  resultados["LaboratorioEnsayo"] = await ingestLaboratorios();
  return resultados;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestInacal()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
