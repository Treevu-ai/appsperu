import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import {
  parseRucMasivoFile,
  isRejected,
  type NormalizedRucMasivo,
} from "./ruc-consulta-masiva-normalize.js";

const INSERT_COLUMNS = [
  "ruc",
  "razon_social",
  "tipo_contribuyente",
  "profesion_oficio",
  "nombre_comercial",
  "condicion_contribuyente",
  "estado_contribuyente",
  "fecha_inscripcion",
  "fecha_inicio_actividades",
  "departamento",
  "provincia",
  "distrito",
  "direccion",
  "telefono",
  "fax",
  "actividad_comercio_exterior",
  "ciiu_principal",
  "ciiu_secundario_1",
  "ciiu_secundario_2",
  "afecto_nuevo_rus",
  "buen_contribuyente",
  "agente_retencion",
  "agente_percepcion_venta_interna",
  "agente_percepcion_combustible",
  "fecha_consulta",
] as const;

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function insertBatch(client: PoolClient, rows: NormalizedRucMasivo[], fechaConsulta: string): Promise<void> {
  if (rows.length === 0) return;

  const byRuc = new Map(rows.map((row) => [row.ruc, row]));
  const deduped = [...byRuc.values()];

  const values: unknown[] = [];
  const tuples: string[] = [];
  deduped.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    const placeholders = INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",");
    tuples.push(`(${placeholders})`);
    values.push(
      row.ruc,
      row.razonSocial,
      row.tipoContribuyente,
      row.profesionOficio,
      row.nombreComercial,
      row.condicionContribuyente,
      row.estadoContribuyente,
      row.fechaInscripcion,
      row.fechaInicioActividades,
      row.departamento,
      row.provincia,
      row.distrito,
      row.direccion,
      row.telefono,
      row.fax,
      row.actividadComercioExterior,
      row.ciiuPrincipal,
      row.ciiuSecundario1,
      row.ciiuSecundario2,
      row.afectoNuevoRus,
      row.buenContribuyente,
      row.agenteRetencion,
      row.agentePercepcionVentaInterna,
      row.agentePercepcionCombustible,
      fechaConsulta
    );
  });

  const updateSet = INSERT_COLUMNS.filter((c) => c !== "ruc")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(",\n       ");

  await client.query(
    `INSERT INTO ruc_consulta_masiva (${INSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (ruc) DO UPDATE SET
       ${updateSet}`,
    values
  );
}

export interface ImportSummary {
  total: number;
  accepted: number;
  rejected: { raw: string[]; reason: string }[];
}

/**
 * SUNAT no es consistente en el encoding del .txt que genera esta fuente
 * entre una descarga y otra — confirmado en vivo el 2026-09-19: dos .zip
 * descargados con la misma variante de archivo (100 RUC) llegaron uno en
 * UTF-8 y otro en Latin-1. No depende (solo) de la variante usada. Ver
 * `docs/data-contracts/sunat-consulta-multiple-ruc.md`.
 *
 * Se detecta intentando decodificar como UTF-8 estricto (`fatal: true`):
 * si el buffer no es UTF-8 válido, cae a Latin-1.
 */
function decodeAuto(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return buf.toString("latin1");
  }
}

/**
 * `filePath` es el .txt extraído del .zip que descarga la Consulta Múltiple
 * de RUC (encoding detectado automáticamente, ver `decodeAuto` arriba).
 */
export async function importRucMasivo(filePath: string, fechaConsulta: string): Promise<ImportSummary> {
  const raw = decodeAuto(readFileSync(filePath));
  const parsed = parseRucMasivoFile(raw);

  const accepted = parsed.filter((r) => !isRejected(r)) as NormalizedRucMasivo[];
  const rejected = parsed.filter(isRejected) as { raw: string[]; reason: string }[];

  await withClient((client) => insertBatch(client, accepted, fechaConsulta));

  return { total: parsed.length, accepted: accepted.length, rejected };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: npm run import:ruc-masivo -- <archivo.txt>");
    process.exit(1);
  }

  importRucMasivo(filePath, new Date().toISOString())
    .then((summary) => {
      console.log("Importación de consulta múltiple de RUC completada:", summary);
      return pool.end();
    })
    .catch((err) => {
      console.error("Importación falló:", err);
      process.exit(1);
    });
}
