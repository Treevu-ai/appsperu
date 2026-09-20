import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { pool } from "../db/pool.js";

/**
 * Exporta el contenido completo de `ruc_consulta_masiva` (fuente "Consulta
 * Múltiple de RUC" de SUNAT) a un xlsx independiente — los 23 campos
 * propios de esta fuente más RUC y fecha de consulta. No cruza con el
 * seed de cooperativas ni con ninguna otra tabla: es un volcado 1:1 de
 * lo que hay en la tabla. Ver docs/data-contracts/sunat-consulta-multiple-ruc.md.
 */

const HEADERS = [
  "RUC",
  "Razón Social",
  "Tipo Contribuyente",
  "Profesión/Oficio",
  "Nombre Comercial",
  "Condición Contribuyente",
  "Estado Contribuyente",
  "Fecha Inscripción",
  "Fecha Inicio Actividades",
  "Departamento",
  "Provincia",
  "Distrito",
  "Dirección",
  "Teléfono",
  "Fax",
  "Actividad Comercio Exterior",
  "CIIU Principal",
  "CIIU Secundario 1",
  "CIIU Secundario 2",
  "Afecto Nuevo RUS",
  "Buen Contribuyente",
  "Agente Retención IGV",
  "Agente Percepción Venta Interna",
  "Agente Percepción Combustible",
  "Fecha de Consulta",
] as const;

interface RucMasivoRow {
  ruc: string;
  razon_social: string | null;
  tipo_contribuyente: string | null;
  profesion_oficio: string | null;
  nombre_comercial: string | null;
  condicion_contribuyente: string | null;
  estado_contribuyente: string | null;
  fecha_inscripcion: Date | null;
  fecha_inicio_actividades: Date | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  telefono: string | null;
  fax: string | null;
  actividad_comercio_exterior: string | null;
  ciiu_principal: string | null;
  ciiu_secundario_1: string | null;
  ciiu_secundario_2: string | null;
  afecto_nuevo_rus: string | null;
  buen_contribuyente: string | null;
  agente_retencion: string | null;
  agente_percepcion_venta_interna: string | null;
  agente_percepcion_combustible: string | null;
  fecha_consulta: Date | null;
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export async function exportRucMasivoXlsx(outPath: string): Promise<number> {
  const { rows } = await pool.query<RucMasivoRow>(
    `SELECT ruc, razon_social, tipo_contribuyente, profesion_oficio, nombre_comercial,
            condicion_contribuyente, estado_contribuyente, fecha_inscripcion,
            fecha_inicio_actividades, departamento, provincia, distrito, direccion, telefono,
            fax, actividad_comercio_exterior, ciiu_principal, ciiu_secundario_1, ciiu_secundario_2,
            afecto_nuevo_rus, buen_contribuyente, agente_retencion,
            agente_percepcion_venta_interna, agente_percepcion_combustible, fecha_consulta
     FROM ruc_consulta_masiva
     ORDER BY ruc`
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Consulta Múltiple RUC");

  sheet.addRow([...HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };

  for (const r of rows) {
    sheet.addRow([
      r.ruc,
      r.razon_social ?? "",
      r.tipo_contribuyente ?? "",
      r.profesion_oficio ?? "",
      r.nombre_comercial ?? "",
      r.condicion_contribuyente ?? "",
      r.estado_contribuyente ?? "",
      fmtDate(r.fecha_inscripcion),
      fmtDate(r.fecha_inicio_actividades),
      r.departamento ?? "",
      r.provincia ?? "",
      r.distrito ?? "",
      r.direccion ?? "",
      r.telefono ?? "",
      r.fax ?? "",
      r.actividad_comercio_exterior ?? "",
      r.ciiu_principal ?? "",
      r.ciiu_secundario_1 ?? "",
      r.ciiu_secundario_2 ?? "",
      r.afecto_nuevo_rus ?? "",
      r.buen_contribuyente ?? "",
      r.agente_retencion ?? "",
      r.agente_percepcion_venta_interna ?? "",
      r.agente_percepcion_combustible ?? "",
      fmtDate(r.fecha_consulta),
    ]);
  }

  sheet.columns.forEach((col) => {
    col.width = 22;
  });
  sheet.getColumn(2).width = 45;
  sheet.getColumn(13).width = 45;

  await workbook.xlsx.writeFile(outPath);
  return rows.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outPath = process.argv[2] ?? "ruc-consulta-masiva.xlsx";

  exportRucMasivoXlsx(outPath)
    .then(async (count) => {
      console.log(`Exportadas ${count} filas a ${outPath}`);
      await pool.end();
    })
    .catch((err) => {
      console.error("Exportación falló:", err);
      process.exit(1);
    });
}
