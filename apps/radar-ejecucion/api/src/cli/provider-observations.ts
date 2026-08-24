import { pool } from "../db/pool.js";

type ObservationKind = "SANCION_FORMAL" | "DENUNCIA_CON_EXPEDIENTE" | "PROCESO_EN_CURSO" | "ANTIGUEDAD_RUC" | "REFERENCIA_EXTERNA";
type ObservationStatus = "VIGENTE" | "PRESENTADA" | "EN_INVESTIGACION" | "ARCHIVADA" | "RESUELTA" | "CONTEXTO";

function values(name: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) if (process.argv[index] === name && process.argv[index + 1]) result.push(process.argv[index + 1]);
  return result;
}
function optional(name: string): string | null { return values(name)[0]?.trim() || null; }
function required(name: string): string { const value = optional(name); if (!value) throw new Error(`Falta ${name}.`); return value; }
function date(name: string, requiredValue = false): string | null {
  const value = optional(name);
  if (!value && requiredValue) throw new Error(`Falta ${name}.`);
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} debe usar YYYY-MM-DD.`);
  return value;
}

async function list(): Promise<void> {
  const ruc = required("--ruc");
  if (!/^\d{11}$/.test(ruc)) throw new Error("--ruc debe contener 11 dígitos.");
  const base = (process.env.RADAR_EJECUCION_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
  const params = new URLSearchParams();
  const kind = optional("--tipo"); const status = optional("--estado");
  if (kind) params.set("tipo", kind); if (status) params.set("estado", status);
  const response = await fetch(`${base}/api/servicios-cuidados/alimentacion/observaciones-proveedor/${ruc}?${params}`);
  if (!response.ok) throw new Error(`La API devolvió HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json() as { observaciones: unknown[]; cautela: string };
  if (process.argv.includes("--json")) { console.log(JSON.stringify(data, null, 2)); return; }
  console.table(data.observaciones); console.log(`Cautela: ${data.cautela}`);
}

async function register(): Promise<void> {
  const kind = required("--tipo").toUpperCase() as ObservationKind;
  const status = required("--estado").toUpperCase() as ObservationStatus;
  if (!(["SANCION_FORMAL", "DENUNCIA_CON_EXPEDIENTE", "PROCESO_EN_CURSO", "ANTIGUEDAD_RUC", "REFERENCIA_EXTERNA"] as string[]).includes(kind)) throw new Error("--tipo no es válido.");
  if (!(["VIGENTE", "PRESENTADA", "EN_INVESTIGACION", "ARCHIVADA", "RESUELTA", "CONTEXTO"] as string[]).includes(status)) throw new Error("--estado no es válido.");
  const ruc = optional("--ruc");
  const providerLiteral = optional("--proveedor-literal");
  if (ruc && !/^\d{11}$/.test(ruc)) throw new Error("--ruc debe contener 11 dígitos.");
  if (!ruc && !providerLiteral) throw new Error("Una referencia sin RUC exige --proveedor-literal y queda sin vincular.");
  if (!ruc && optional("--lote")) throw new Error("Una referencia sin RUC no puede llevar --lote.");
  if ((kind === "SANCION_FORMAL" || kind === "DENUNCIA_CON_EXPEDIENTE" || kind === "PROCESO_EN_CURSO") && (!optional("--autoridad") || !optional("--expediente"))) throw new Error("Sanción, denuncia o proceso exige --autoridad y --expediente.");
  const rucStart = date("--fecha-inicio-ruc", kind === "ANTIGUEDAD_RUC");
  const contractDate = date("--fecha-contrato", kind === "ANTIGUEDAD_RUC");
  const source = required("--fuente"); new URL(source);
  const result = await pool.query(
    `INSERT INTO supplier_observations (
       ruc,supplier_name_literal,observation_kind,observation_status,linkage_status,authority_name,case_reference,
       food_lot_id,contract_reference,ruc_start_date,contract_date,source_url,source_detail,observed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (ruc,observation_kind,case_reference,source_url,observed_at) DO NOTHING
     RETURNING observation_id,linkage_status,created_at`,
    [ruc, providerLiteral, kind, status, ruc ? "RUC_EXACTO_DOCUMENTADO" : "SIN_RUC_NO_VINCULAR", optional("--autoridad"), optional("--expediente"), optional("--lote"), optional("--contrato"), rucStart, contractDate, source, required("--detalle"), date("--fecha-observada", true)],
  );
  console.log(JSON.stringify({ accion: "registrada", resultado: result.rows[0] ?? null, duplicado: result.rowCount === 0, regla: ruc ? "Vínculo por RUC exacto documentado." : "Referencia preservada sin atribuirla a proveedor." }, null, 2));
}

const action = required("--accion");
const run = action === "list" ? list : action === "registrar" ? register : () => Promise.reject(new Error("--accion debe ser list o registrar."));
run().catch((error) => { console.error("No se pudo operar observaciones de proveedor:", error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => pool.end());
