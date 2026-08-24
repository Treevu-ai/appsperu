import { pool } from "../db/pool.js";

type Decision = "REVIEWED" | "DISMISSED";

function values(name: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) result.push(process.argv[index + 1]);
  }
  return result;
}

function required(name: string): string {
  const value = values(name)[0]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

async function main(): Promise<void> {
  const signalId = required("--signal");
  const decision = required("--decision").toUpperCase() as Decision;
  if (decision !== "REVIEWED" && decision !== "DISMISSED") throw new Error("--decision debe ser REVIEWED o DISMISSED.");
  const reviewerRole = required("--rol");
  const note = required("--nota");
  const evidenceUrls = values("--evidencia");
  for (const url of evidenceUrls) new URL(url);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const signal = await client.query<{ signal_id: string }>("SELECT signal_id FROM contract_signals WHERE signal_id = $1 FOR UPDATE", [signalId]);
    if (signal.rowCount === 0) throw new Error("La señal indicada no existe.");
    const event = await client.query(
      `INSERT INTO signal_review_events (signal_id, decision, reviewer_role, note, evidence_urls)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING review_event_id, reviewed_at`,
      [signalId, decision, reviewerRole, note, JSON.stringify(evidenceUrls)],
    );
    await client.query("UPDATE contract_signals SET human_review_status = $2 WHERE signal_id = $1", [signalId, decision]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ signalId, decision, reviewEventId: event.rows[0].review_event_id, reviewedAt: event.rows[0].reviewed_at, evidenceUrls }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => { console.error("No se pudo registrar la revisión:", error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => pool.end());
