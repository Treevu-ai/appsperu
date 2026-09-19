import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { pool } from "../db/pool.js";

/**
 * Exporta el universo de cooperativas (semilla de 139 RUC extraída de
 * PRODUCE antes de eliminar esa tabla, ver `cooperativas-ruc-seed.json`)
 * cruzado con lo que ya se haya importado de la ficha individual de SUNAT
 * (`ficha_ruc` + `ficha_ruc_actividades` + `ficha_ruc_representantes`).
 *
 * Fila 1 = encabezados. Columna A = cooperativa (razón social), columna B
 * = RUC, el resto son los campos de la ficha SUNAT — en blanco para los
 * RUC que todavía no se consultaron (no se inventa ni se interpola nada).
 */

const HEADERS = [
  "Cooperativa",
  "RUC",
  "Nombre Comercial",
  "Tipo Contribuyente",
  "Fecha Inscripción",
  "Fecha Inicio Actividades",
  "Estado Contribuyente",
  "Condición Contribuyente",
  "Domicilio Fiscal",
  "Sistema Emisión Comprobante",
  "Actividad Comercio Exterior",
  "Sistema Contabilidad",
  "Actividad Principal (CIIU)",
  "Actividades Secundarias (CIIU)",
  "Comprobantes de Pago",
  "Sistema Emisión Electrónica",
  "Emisor Electrónico Desde",
  "Comprobantes Electrónicos",
  "Afiliado PLE Desde",
  "Padrones",
  "Representante(s) Legal(es)",
  "Fecha de Consulta SUNAT",
  // Padrón Reducido RUC (bulk, ya ingerido — `contribuyentes`, 2.3M filas).
  // A diferencia de la ficha individual de arriba, esto no requiere
  // navegador: cruce directo, disponible para el 100% del universo.
  "Estado Contribuyente (Padrón)",
  "Condición Domicilio (Padrón)",
  // "Consulta Múltiple de RUC" (e-consultaruc.sunat.gob.pe/cl-ti-itmrconsmulruc)
  // — bulk hasta 100 RUC por archivo, sin reCAPTCHA, distinto del endpoint
  // individual bloqueado. Ver ruc_consulta_masiva /
  // docs/data-contracts/sunat-consulta-multiple-ruc.md.
  "Tipo Contribuyente (Consulta Múltiple)",
  "Profesión/Oficio (Consulta Múltiple)",
  "Nombre Comercial (Consulta Múltiple)",
  "Fecha Inscripción (Consulta Múltiple)",
  "Fecha Inicio Actividades (Consulta Múltiple)",
  "Departamento (Consulta Múltiple)",
  "Provincia (Consulta Múltiple)",
  "Distrito (Consulta Múltiple)",
  "Dirección (Consulta Múltiple)",
  "Teléfono (Consulta Múltiple)",
  "Actividad Comercio Exterior (Consulta Múltiple)",
  "CIIU Principal (Consulta Múltiple)",
  "CIIU Secundario 1 (Consulta Múltiple)",
  "CIIU Secundario 2 (Consulta Múltiple)",
  "Afecto Nuevo RUS (Consulta Múltiple)",
  "Buen Contribuyente (Consulta Múltiple)",
  "Agente Retención IGV (Consulta Múltiple)",
  "Agente Percepción Venta Interna (Consulta Múltiple)",
  "Agente Percepción Combustible (Consulta Múltiple)",
  // A partir de acá: NO viene de SUNAT — extraído de los archivos base
  // provistos por el usuario (directorio base.xlsx, PAC MIDAGRI/coops san
  // martín), cruzado por RUC. Ver `cooperativas-base-extra.json`.
  "Fecha Inicio Actividades (Base)",
  "Activo/Habido SUNAT (Base)",
  "Exporta SI/NO (Base)",
  "Exportación 2025 FOB USD (Base)",
  "Exportación 2025 Kilos (Base)",
  "Destinos Exportación (Base)",
  "Gerente General (Base)",
  "Representante Legal (Base)",
  "Ventas Totales 2018-2025 (Base)",
  "Ventas Totales 2025 (Base)",
  "Ventas Exportación 2025 (Base)",
  "Ventas Nacionales 2025 (Base)",
  "Sede (Base)",
  "Ubigeo (Base)",
  "Departamento (Base)",
  "Provincia (Base)",
  "Distrito (Base)",
  "Nombre SUNAT (Base)",
  "Tipo de Organización (Base)",
  "Socios Varones (Base)",
  "Socias Mujeres (Base)",
  "Hectáreas Totales (Base)",
  "Certificación Orgánica (Base)",
  "Certificación Comercio Justo (Base)",
  "Otras Certificaciones (Base)",
  "Correo (Base)",
  "Celular (Base)",
  "Página Web (Base)",
] as const;

interface BaseExtraRow {
  ruc: string;
  ventasTotales2018_2025?: number | null;
  ventasTotales2025?: number | null;
  ventasExportacion2025?: number | null;
  ventasNacionales2025?: number | null;
  activoHabidoSunatBase?: string | null;
  fechaInicioActividadesBase?: string | null;
  exportaSiNo?: string | null;
  exportacion2025FobUsd?: number | null;
  exportacion2025Kilos?: number | null;
  destinosExportacion?: string | null;
  gerenteGeneralBase?: string | null;
  representanteLegalBase?: string | null;
  productoDom?: string | null;
  producto1?: string | null;
  sede?: string | null;
  ubigeoBase?: string | null;
  departamentoBase?: string | null;
  provinciaBase?: string | null;
  distritoBase?: string | null;
  nombreSunatBase?: string | null;
  tipoOrganizacionBase?: string | null;
  sociosVarones?: number | null;
  sociasMujeres?: number | null;
  hectareasTotales?: number | null;
  certificacionOrganica?: string | null;
  certificacionComercioJusto?: string | null;
  otrasCertificaciones?: string | null;
  correoBase?: string | null;
  celularBase?: string | null;
  paginaWebBase?: string | null;
}

interface FichaRow {
  ruc: string;
  razon_social: string | null;
  nombre_comercial: string | null;
  tipo_contribuyente: string | null;
  fecha_inscripcion: Date | null;
  fecha_inicio_actividades: Date | null;
  estado_contribuyente: string | null;
  condicion_contribuyente: string | null;
  domicilio_fiscal: string | null;
  sistema_emision_comprobante: string | null;
  actividad_comercio_exterior: string | null;
  sistema_contabilidad: string | null;
  comprobantes_pago: string[] | null;
  sistema_emision_electronica: string[] | null;
  emisor_electronico_desde: Date | null;
  comprobantes_electronicos: string | null;
  afiliado_ple_desde: Date | null;
  padrones: string[] | null;
  fecha_consulta: Date | null;
}

interface ActividadRow {
  ruc: string;
  tipo: string;
  codigo_ciiu: string | null;
  descripcion: string;
}

interface RepresentanteRow {
  ruc: string;
  nombre: string;
  cargo: string | null;
  numero_documento: string | null;
  fecha_desde: Date | null;
}

interface PadronRow {
  ruc: string;
  estado_contribuyente: string | null;
  condicion_domicilio: string | null;
}

interface RucMasivoRow {
  ruc: string;
  tipo_contribuyente: string | null;
  profesion_oficio: string | null;
  nombre_comercial: string | null;
  fecha_inscripcion: Date | null;
  fecha_inicio_actividades: Date | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  telefono: string | null;
  actividad_comercio_exterior: string | null;
  ciiu_principal: string | null;
  ciiu_secundario_1: string | null;
  ciiu_secundario_2: string | null;
  afecto_nuevo_rus: string | null;
  buen_contribuyente: string | null;
  agente_retencion: string | null;
  agente_percepcion_venta_interna: string | null;
  agente_percepcion_combustible: string | null;
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

async function loadData(seedRucs: string[]) {
  const { rows: fichas } = await pool.query<FichaRow>(`SELECT * FROM ficha_ruc`);
  const { rows: actividades } = await pool.query<ActividadRow>(
    `SELECT ruc, tipo, codigo_ciiu, descripcion FROM ficha_ruc_actividades ORDER BY ruc, orden`
  );
  const { rows: representantes } = await pool.query<RepresentanteRow>(
    `SELECT ruc, nombre, cargo, numero_documento, fecha_desde FROM ficha_ruc_representantes ORDER BY ruc, fecha_desde DESC NULLS LAST`
  );
  const { rows: padron } = await pool.query<PadronRow>(
    `SELECT ruc, estado_contribuyente, condicion_domicilio FROM contribuyentes WHERE ruc = ANY($1)`,
    [seedRucs]
  );
  const padronByRuc = new Map(padron.map((p) => [p.ruc, p]));

  const { rows: rucMasivo } = await pool.query<RucMasivoRow>(
    `SELECT ruc, tipo_contribuyente, profesion_oficio, nombre_comercial, fecha_inscripcion,
            fecha_inicio_actividades, departamento, provincia, distrito, direccion, telefono,
            actividad_comercio_exterior, ciiu_principal, ciiu_secundario_1, ciiu_secundario_2,
            afecto_nuevo_rus, buen_contribuyente, agente_retencion,
            agente_percepcion_venta_interna, agente_percepcion_combustible
     FROM ruc_consulta_masiva WHERE ruc = ANY($1)`,
    [seedRucs]
  );
  const rucMasivoByRuc = new Map(rucMasivo.map((r) => [r.ruc, r]));

  const fichasByRuc = new Map(fichas.map((f) => [f.ruc, f]));

  const actividadesByRuc = new Map<string, { principal: string; secundarias: string }>();
  for (const ruc of new Set(actividades.map((a) => a.ruc))) {
    const rows = actividades.filter((a) => a.ruc === ruc);
    const principal = rows.find((a) => a.tipo === "PRINCIPAL");
    const secundarias = rows.filter((a) => a.tipo === "SECUNDARIA");
    actividadesByRuc.set(ruc, {
      principal: principal ? `${principal.codigo_ciiu ?? ""} - ${principal.descripcion}` : "",
      secundarias: secundarias.map((a) => `${a.codigo_ciiu ?? ""} - ${a.descripcion}`).join(" | "),
    });
  }

  const representantesByRuc = new Map<string, string>();
  for (const ruc of new Set(representantes.map((r) => r.ruc))) {
    const rows = representantes.filter((r) => r.ruc === ruc);
    representantesByRuc.set(
      ruc,
      rows
        .map((r) => `${r.nombre}${r.cargo ? ` (${r.cargo})` : ""}${r.numero_documento ? ` - DNI ${r.numero_documento}` : ""}${r.fecha_desde ? ` desde ${fmtDate(r.fecha_desde)}` : ""}`)
        .join(" | ")
    );
  }

  return { fichasByRuc, actividadesByRuc, representantesByRuc, padronByRuc, rucMasivoByRuc };
}

export async function exportFichaRucXlsx(
  seed: { ruc: string; razonSocial: string }[],
  outPath: string,
  baseExtra: BaseExtraRow[] = []
): Promise<number> {
  const { fichasByRuc, actividadesByRuc, representantesByRuc, padronByRuc, rucMasivoByRuc } = await loadData(
    seed.map((s) => s.ruc)
  );
  const baseExtraByRuc = new Map(baseExtra.map((b) => [b.ruc, b]));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cooperativas");

  sheet.addRow([...HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };

  for (const seedRow of seed) {
    const ficha = fichasByRuc.get(seedRow.ruc);
    const act = actividadesByRuc.get(seedRow.ruc);
    const reps = representantesByRuc.get(seedRow.ruc) ?? "";
    const base = baseExtraByRuc.get(seedRow.ruc);
    const padron = padronByRuc.get(seedRow.ruc);
    const masivo = rucMasivoByRuc.get(seedRow.ruc);

    sheet.addRow([
      seedRow.razonSocial,
      seedRow.ruc,
      ficha?.nombre_comercial ?? "",
      ficha?.tipo_contribuyente ?? "",
      fmtDate(ficha?.fecha_inscripcion ?? null),
      fmtDate(ficha?.fecha_inicio_actividades ?? null),
      ficha?.estado_contribuyente ?? "",
      ficha?.condicion_contribuyente ?? "",
      ficha?.domicilio_fiscal ?? "",
      ficha?.sistema_emision_comprobante ?? "",
      ficha?.actividad_comercio_exterior ?? "",
      ficha?.sistema_contabilidad ?? "",
      act?.principal ?? "",
      act?.secundarias ?? "",
      (ficha?.comprobantes_pago ?? []).join(" | "),
      (ficha?.sistema_emision_electronica ?? []).join(" | "),
      fmtDate(ficha?.emisor_electronico_desde ?? null),
      ficha?.comprobantes_electronicos ?? "",
      fmtDate(ficha?.afiliado_ple_desde ?? null),
      (ficha?.padrones ?? []).join(" | "),
      reps,
      fmtDate(ficha?.fecha_consulta ?? null),
      padron?.estado_contribuyente ?? "",
      padron?.condicion_domicilio ?? "",
      masivo?.tipo_contribuyente ?? "",
      masivo?.profesion_oficio ?? "",
      masivo?.nombre_comercial ?? "",
      fmtDate(masivo?.fecha_inscripcion ?? null),
      fmtDate(masivo?.fecha_inicio_actividades ?? null),
      masivo?.departamento ?? "",
      masivo?.provincia ?? "",
      masivo?.distrito ?? "",
      masivo?.direccion ?? "",
      masivo?.telefono ?? "",
      masivo?.actividad_comercio_exterior ?? "",
      masivo?.ciiu_principal ?? "",
      masivo?.ciiu_secundario_1 ?? "",
      masivo?.ciiu_secundario_2 ?? "",
      masivo?.afecto_nuevo_rus ?? "",
      masivo?.buen_contribuyente ?? "",
      masivo?.agente_retencion ?? "",
      masivo?.agente_percepcion_venta_interna ?? "",
      masivo?.agente_percepcion_combustible ?? "",
      base?.fechaInicioActividadesBase ?? "",
      base?.activoHabidoSunatBase ?? "",
      base?.exportaSiNo ?? "",
      base?.exportacion2025FobUsd ?? "",
      base?.exportacion2025Kilos ?? "",
      base?.destinosExportacion ?? "",
      base?.gerenteGeneralBase ?? "",
      base?.representanteLegalBase ?? "",
      base?.ventasTotales2018_2025 ?? "",
      base?.ventasTotales2025 ?? "",
      base?.ventasExportacion2025 ?? "",
      base?.ventasNacionales2025 ?? "",
      base?.sede ?? "",
      base?.ubigeoBase ?? "",
      base?.departamentoBase ?? "",
      base?.provinciaBase ?? "",
      base?.distritoBase ?? "",
      base?.nombreSunatBase ?? "",
      base?.tipoOrganizacionBase ?? "",
      base?.sociosVarones ?? "",
      base?.sociasMujeres ?? "",
      base?.hectareasTotales ?? "",
      base?.certificacionOrganica ?? "",
      base?.certificacionComercioJusto ?? "",
      base?.otrasCertificaciones ?? "",
      base?.correoBase ?? "",
      base?.celularBase ?? "",
      base?.paginaWebBase ?? "",
    ]);
  }

  sheet.columns.forEach((col) => {
    col.width = 22;
  });
  sheet.getColumn(1).width = 45;
  sheet.getColumn(9).width = 45;

  await workbook.xlsx.writeFile(outPath);
  return seed.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outPath = process.argv[2] ?? "cooperativas-ficha-ruc.xlsx";

  Promise.all([
    import("./cooperativas-ruc-seed.json", { with: { type: "json" } }),
    import("./cooperativas-base-extra.json", { with: { type: "json" } }),
  ])
    .then(async ([seedMod, extraMod]) => {
      const seed = seedMod.default as { ruc: string; razonSocial: string }[];
      const baseExtra = extraMod.default as BaseExtraRow[];
      const count = await exportFichaRucXlsx(seed, outPath, baseExtra);
      console.log(`Exportadas ${count} filas a ${outPath}`);
      await pool.end();
    })
    .catch((err) => {
      console.error("Exportación falló:", err);
      process.exit(1);
    });
}
