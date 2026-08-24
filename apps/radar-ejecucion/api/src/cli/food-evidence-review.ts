import { pool } from "../db/pool.js";

function values(name: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) if (process.argv[index] === name && process.argv[index + 1]) result.push(process.argv[index + 1]);
  return result;
}
function required(name: string): string { const value = values(name)[0]?.trim(); if (!value) throw new Error(`Falta ${name}.`); return value; }
function evidence(): string[] { const urls = values("--evidencia"); for (const url of urls) new URL(url); return urls; }

async function list(): Promise<void> {
  const status = values("--estado")[0] ?? "PENDING";
  if (!["PENDING", "REVIEWED", "DISMISSED", "NEEDS_EVIDENCE"].includes(status)) throw new Error("--estado no es válido.");
  const { rows } = await pool.query(
    `SELECT q.queue_id,q.candidate_kind,q.lot_id,q.reason,q.evidence_urls,q.status,q.created_at,
            COUNT(e.event_id)::integer AS eventos_revision
       FROM food_evidence_review_queue q
       LEFT JOIN food_evidence_review_events e ON e.queue_id=q.queue_id
      WHERE q.status=$1 GROUP BY q.queue_id ORDER BY q.created_at,q.queue_id`, [status],
  );
  console.table(rows);
}

async function review(): Promise<void> {
  const queueId = Number(required("--queue-id"));
  const decision = required("--decision").toUpperCase();
  if (!Number.isInteger(queueId) || queueId < 1) throw new Error("--queue-id debe ser un entero positivo.");
  if (!["REVIEWED", "DISMISSED", "NEEDS_EVIDENCE"].includes(decision)) throw new Error("--decision debe ser REVIEWED, DISMISSED o NEEDS_EVIDENCE.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT queue_id FROM food_evidence_review_queue WHERE queue_id=$1 FOR UPDATE", [queueId]);
    if (current.rowCount === 0) throw new Error("Candidato no encontrado.");
    await client.query(
      "INSERT INTO food_evidence_review_events (queue_id,decision,reviewer_role,note,evidence_urls) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [queueId, decision, required("--rol"), required("--nota"), JSON.stringify(evidence())],
    );
    await client.query("UPDATE food_evidence_review_queue SET status=$2 WHERE queue_id=$1", [queueId, decision]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ accion: "revisado", queueId, decision }, null, 2));
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

const action = required("--accion");
const run = action === "list" ? list : action === "review" ? review : () => Promise.reject(new Error("--accion debe ser list o review."));
run().catch((error) => { console.error("No se pudo operar la cola de evidencia alimentaria:", error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => pool.end());
