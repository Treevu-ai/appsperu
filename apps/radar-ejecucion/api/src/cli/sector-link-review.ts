import { pool } from "../db/pool.js";

function values(name: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) if (process.argv[index] === name && process.argv[index + 1]) result.push(process.argv[index + 1]);
  return result;
}
function required(name: string): string { const value = values(name)[0]?.trim(); if (!value) throw new Error(`Falta ${name}.`); return value; }
function evidence(): string[] { const urls = values("--evidencia"); for (const url of urls) new URL(url); return urls; }

async function add(): Promise<void> {
  const type = required("--tipo");
  if (type !== "CUI_ACTIVIDAD" && type !== "ENTIDAD_COMPRA") throw new Error("--tipo debe ser CUI_ACTIVIDAD o ENTIDAD_COMPRA.");
  const entityCode = required("--entity-code"); const cui = values("--cui")[0] ?? null; const contractingId = values("--contracting-id")[0] ?? null;
  if ((type === "CUI_ACTIVIDAD" && !cui) || (type === "ENTIDAD_COMPRA" && !contractingId)) throw new Error("El tipo requiere --cui o --contracting-id, respectivamente.");
  const result = await pool.query(
    `INSERT INTO sector_link_review_queue (candidate_type,entity_code,cui,contracting_id,reason,evidence_urls)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT (candidate_type,entity_code,COALESCE(cui,''),COALESCE(contracting_id,'')) DO NOTHING
     RETURNING queue_id,status,created_at`, [type, entityCode, cui, contractingId, required("--razon"), JSON.stringify(evidence())],
  );
  console.log(JSON.stringify({ action: "added", result: result.rows[0] ?? null, duplicate: result.rowCount === 0 }, null, 2));
}

async function review(): Promise<void> {
  const queueId = Number(required("--queue-id")); const decision = required("--decision").toUpperCase();
  if (!Number.isInteger(queueId) || queueId < 1) throw new Error("--queue-id debe ser un entero positivo.");
  if (!["REVIEWED", "DISMISSED", "NEEDS_EVIDENCE"].includes(decision)) throw new Error("--decision debe ser REVIEWED, DISMISSED o NEEDS_EVIDENCE.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT queue_id FROM sector_link_review_queue WHERE queue_id=$1 FOR UPDATE", [queueId]);
    if (current.rowCount === 0) throw new Error("Candidato no encontrado.");
    await client.query(`INSERT INTO sector_link_review_events (queue_id,decision,reviewer_role,note,evidence_urls) VALUES ($1,$2,$3,$4,$5::jsonb)`, [queueId, decision, required("--rol"), required("--nota"), JSON.stringify(evidence())]);
    await client.query("UPDATE sector_link_review_queue SET status=$2 WHERE queue_id=$1", [queueId, decision]);
    await client.query("COMMIT"); console.log(JSON.stringify({ action: "reviewed", queueId, decision }, null, 2));
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function list(): Promise<void> {
  const status = values("--estado")[0] ?? "PENDING";
  const { rows } = await pool.query(`SELECT q.*,COUNT(e.review_event_id)::integer AS review_events FROM sector_link_review_queue q LEFT JOIN sector_link_review_events e ON e.queue_id=q.queue_id WHERE q.status=$1 GROUP BY q.queue_id ORDER BY q.created_at DESC`, [status]);
  console.table(rows);
}

const action = required("--accion");
const run = action === "add" ? add : action === "review" ? review : action === "list" ? list : () => Promise.reject(new Error("--accion debe ser add, review o list."));
run().catch((error) => { console.error("No se pudo operar la cola de vínculos:", error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => pool.end());
