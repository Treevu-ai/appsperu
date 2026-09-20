import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { parseOeceFicha, parseOecePersonas, type OecePersona } from "./oece-ficha-normalize.js";

/**
 * Ingesta de la Ficha Única del Proveedor — OECE (ex-OSCE), Buscador de
 * Proveedores del Estado. Confirmado en vivo el 2026-09-20: GET plano
 * a `eap.oece.gob.pe`, sin captcha, sin sesión — accesible por fetch
 * directo desde este entorno. Ver docs/data-contracts/oece-ficha-proveedor.md.
 *
 * Trae, además de un snapshot fresco de datos SUNAT, la conformación
 * societaria/directiva completa (representantes legales, órganos de
 * administración, socios) con DNI de cada persona — mucho más rico que
 * `ficha_ruc_representantes`, que solo tiene 1 registro (cargado a mano
 * por el bloqueo de reCAPTCHA de la ficha individual de SUNAT).
 */

const BASE_URL = "https://eap.oece.gob.pe/ficha-proveedor-cns/1.0/ficha";
const DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function consultarRuc(ruc: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/${ruc}/resumen`);
  if (!res.ok) {
    throw new Error(`OECE respondió ${res.status} para RUC ${ruc}`);
  }
  return res.json();
}

async function upsertFicha(
  ruc: string,
  ficha: ReturnType<typeof parseOeceFicha>,
  fechaConsulta: string
): Promise<void> {
  await pool.query(
    `INSERT INTO ruc_oece_ficha (ruc, razon_social, tipo_empresa, estado_sunat, condicion_sunat, departamento, provincia, distrito, telefono, email, codigo_registro, fecha_consulta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (ruc) DO UPDATE SET
       razon_social = EXCLUDED.razon_social,
       tipo_empresa = EXCLUDED.tipo_empresa,
       estado_sunat = EXCLUDED.estado_sunat,
       condicion_sunat = EXCLUDED.condicion_sunat,
       departamento = EXCLUDED.departamento,
       provincia = EXCLUDED.provincia,
       distrito = EXCLUDED.distrito,
       telefono = EXCLUDED.telefono,
       email = EXCLUDED.email,
       codigo_registro = EXCLUDED.codigo_registro,
       fecha_consulta = EXCLUDED.fecha_consulta`,
    [
      ruc,
      ficha.razonSocial,
      ficha.tipoEmpresa,
      ficha.estadoSunat,
      ficha.condicionSunat,
      ficha.departamento,
      ficha.provincia,
      ficha.distrito,
      null,
      null,
      ficha.codigoRegistro,
      fechaConsulta,
    ]
  );
}

async function upsertPersonas(ruc: string, personas: OecePersona[], fechaConsulta: string): Promise<void> {
  await pool.query(`DELETE FROM ruc_oece_personas WHERE ruc = $1`, [ruc]);
  if (personas.length === 0) return;

  const columns = ["ruc", "rol", "source_id", "dni", "nombre", "tipo_organo", "cargo", "fecha_ingreso", "fecha_consulta"];
  const values: unknown[] = [];
  const tuples: string[] = [];
  personas.forEach((p, i) => {
    const base = i * columns.length;
    tuples.push(`(${columns.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(ruc, p.rol, p.sourceId, p.dni, p.nombre, p.tipoOrgano, p.cargo, p.fechaIngreso, fechaConsulta);
  });

  await pool.query(
    `INSERT INTO ruc_oece_personas (${columns.join(",")}) VALUES ${tuples.join(",")}`,
    values
  );
}

interface FichaConTelefono {
  proveedorT01?: { telefonos?: string[] | null; emails?: string[] | null } | null;
}

async function consultarContacto(ruc: string): Promise<{ telefono: string | null; email: string | null }> {
  const res = await fetch(`https://eap.oece.gob.pe/perfilprov-bus/1.0/ficha/${ruc}`);
  if (!res.ok) return { telefono: null, email: null };
  const data = (await res.json()) as FichaConTelefono;
  return {
    telefono: data.proveedorT01?.telefonos?.[0] ?? null,
    email: data.proveedorT01?.emails?.[0] ?? null,
  };
}

export interface IngestSummary {
  rucsConsultados: number;
  rucsEncontrados: number;
  totalPersonas: number;
  errores: { ruc: string; error: string }[];
}

export async function ingestOeceFicha(rucs: string[]): Promise<IngestSummary> {
  const fechaConsulta = new Date().toISOString();
  const summary: IngestSummary = { rucsConsultados: 0, rucsEncontrados: 0, totalPersonas: 0, errores: [] };

  for (const ruc of rucs) {
    summary.rucsConsultados++;
    try {
      const raw = await consultarRuc(ruc);
      const ficha = parseOeceFicha(ruc, raw as Parameters<typeof parseOeceFicha>[1]);
      if (ficha.razonSocial !== null) summary.rucsEncontrados++;

      const { telefono, email } = await consultarContacto(ruc);
      await upsertFicha(ruc, ficha, fechaConsulta);
      if (telefono !== null || email !== null) {
        await pool.query(`UPDATE ruc_oece_ficha SET telefono = $2, email = $3 WHERE ruc = $1`, [ruc, telefono, email]);
      }

      const personas = parseOecePersonas(raw as Parameters<typeof parseOecePersonas>[0]);
      await upsertPersonas(ruc, personas, fechaConsulta);
      summary.totalPersonas += personas.length;
    } catch (err) {
      summary.errores.push({ ruc, error: err instanceof Error ? err.message : String(err) });
    }
    await sleep(DELAY_MS);
  }

  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  import("./cooperativas-ruc-seed.json", { with: { type: "json" } })
    .then(async (seedMod) => {
      const seed = seedMod.default as { ruc: string }[];
      console.log(`Consultando Ficha de Proveedor OECE para ${seed.length} RUC...`);
      const summary = await ingestOeceFicha(seed.map((s) => s.ruc));
      console.log("Ingesta OECE completada:", summary);
      await pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
