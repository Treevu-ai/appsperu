import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface IdentityRow extends NeonRow {
  subject_id: string;
  source_identifier_value: string | null;
  target_identifier_value: string | null;
  strength: string;
  created_at: string | null;
  [key: string]: unknown;
}

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const identifier = args.identifier as string;
  const verified = args.soloVerificadas === "true";

  const { rows } = await db.query<IdentityRow>(
    `SELECT * FROM entity_identity_links
      WHERE ($1 IN (subject_id, source_identifier_value, target_identifier_value))
        ${verified ? "AND strength IN ('EXACTA','VERIFICADA')" : ""}
      ORDER BY strength, created_at DESC`, [identifier]
  );

  return {
    status: 200,
    body: { resultados: rows, limitation: "Una relación candidata no equivale a identidad confirmada. Solo las relaciones verificadas pueden alimentar cruces automáticos." },
  };
}
