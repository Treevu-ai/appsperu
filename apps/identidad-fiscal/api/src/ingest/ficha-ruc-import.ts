import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import {
  parseFichaRuc,
  parseRepresentantes,
  isRejectedFicha,
  type ParsedFichaRuc,
  type ParsedRepresentante,
} from "./ficha-ruc-normalize.js";

/**
 * Formato de entrada: un JSON con el texto plano (`body.innerText`) ya
 * extraído por navegador de cada RUC — no hay conector `fetch()` automático
 * (ver docs/data-contracts/sunat-ficha-ruc.md, reCAPTCHA v3 server-side).
 * `representantesText` es opcional: algunos RUC no tienen el botón de
 * representantes legales o no se consultó esa sub-página.
 */
export interface FichaRucInputRow {
  ruc: string;
  fichaText: string;
  representantesText?: string;
  fechaConsulta: string; // ISO timestamp de cuándo se hizo la consulta
}

export interface ImportSummary {
  total: number;
  accepted: number;
  rejected: { ruc: string; reason: string }[];
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function insertFicha(client: PoolClient, ficha: ParsedFichaRuc, fechaConsulta: string): Promise<void> {
  await client.query(
    `INSERT INTO ficha_ruc (
       ruc, razon_social, nombre_comercial, tipo_contribuyente, fecha_inscripcion,
       fecha_inicio_actividades, estado_contribuyente, condicion_contribuyente,
       domicilio_fiscal, sistema_emision_comprobante, actividad_comercio_exterior,
       sistema_contabilidad, comprobantes_pago, sistema_emision_electronica,
       emisor_electronico_desde, comprobantes_electronicos, afiliado_ple_desde,
       padrones, fecha_consulta
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (ruc) DO UPDATE SET
       razon_social = EXCLUDED.razon_social,
       nombre_comercial = EXCLUDED.nombre_comercial,
       tipo_contribuyente = EXCLUDED.tipo_contribuyente,
       fecha_inscripcion = EXCLUDED.fecha_inscripcion,
       fecha_inicio_actividades = EXCLUDED.fecha_inicio_actividades,
       estado_contribuyente = EXCLUDED.estado_contribuyente,
       condicion_contribuyente = EXCLUDED.condicion_contribuyente,
       domicilio_fiscal = EXCLUDED.domicilio_fiscal,
       sistema_emision_comprobante = EXCLUDED.sistema_emision_comprobante,
       actividad_comercio_exterior = EXCLUDED.actividad_comercio_exterior,
       sistema_contabilidad = EXCLUDED.sistema_contabilidad,
       comprobantes_pago = EXCLUDED.comprobantes_pago,
       sistema_emision_electronica = EXCLUDED.sistema_emision_electronica,
       emisor_electronico_desde = EXCLUDED.emisor_electronico_desde,
       comprobantes_electronicos = EXCLUDED.comprobantes_electronicos,
       afiliado_ple_desde = EXCLUDED.afiliado_ple_desde,
       padrones = EXCLUDED.padrones,
       fecha_consulta = EXCLUDED.fecha_consulta`,
    [
      ficha.ruc,
      ficha.razonSocial,
      ficha.nombreComercial,
      ficha.tipoContribuyente,
      ficha.fechaInscripcion,
      ficha.fechaInicioActividades,
      ficha.estadoContribuyente,
      ficha.condicionContribuyente,
      ficha.domicilioFiscal,
      ficha.sistemaEmisionComprobante,
      ficha.actividadComercioExterior,
      ficha.sistemaContabilidad,
      ficha.comprobantesPago,
      ficha.sistemaEmisionElectronica,
      ficha.emisorElectronicoDesde,
      ficha.comprobantesElectronicos,
      ficha.afiliadoPleDesde,
      ficha.padrones,
      fechaConsulta,
    ]
  );

  await client.query(`DELETE FROM ficha_ruc_actividades WHERE ruc = $1`, [ficha.ruc]);
  for (const act of ficha.actividades) {
    await client.query(
      `INSERT INTO ficha_ruc_actividades (ruc, orden, tipo, codigo_ciiu, descripcion) VALUES ($1,$2,$3,$4,$5)`,
      [ficha.ruc, act.orden, act.tipo, act.codigoCiiu, act.descripcion]
    );
  }
}

async function insertRepresentantes(client: PoolClient, ruc: string, reps: ParsedRepresentante[]): Promise<void> {
  await client.query(`DELETE FROM ficha_ruc_representantes WHERE ruc = $1`, [ruc]);
  for (const rep of reps) {
    await client.query(
      `INSERT INTO ficha_ruc_representantes (ruc, tipo_documento, numero_documento, nombre, cargo, fecha_desde)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ruc, rep.tipoDocumento, rep.numeroDocumento, rep.nombre, rep.cargo, rep.fechaDesde]
    );
  }
}

export async function importFichaRuc(rows: FichaRucInputRow[]): Promise<ImportSummary> {
  const rejected: { ruc: string; reason: string }[] = [];
  let accepted = 0;

  for (const row of rows) {
    const parsed = parseFichaRuc(row.fichaText);
    if (isRejectedFicha(parsed)) {
      rejected.push({ ruc: row.ruc, reason: parsed.reason });
      continue;
    }

    await withClient((client) => insertFicha(client, parsed, row.fechaConsulta));

    if (row.representantesText) {
      const reps = parseRepresentantes(row.representantesText);
      await withClient((client) => insertRepresentantes(client, parsed.ruc, reps));
    }

    accepted += 1;
  }

  return { total: rows.length, accepted, rejected };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: npm run import:ficha-ruc -- <archivo.json>");
    process.exit(1);
  }

  const rows = JSON.parse(readFileSync(filePath, "utf-8")) as FichaRucInputRow[];

  importFichaRuc(rows)
    .then((summary) => {
      console.log("Importación de fichas RUC completada:", summary);
      return pool.end();
    })
    .catch((err) => {
      console.error("Importación falló:", err);
      process.exit(1);
    });
}
