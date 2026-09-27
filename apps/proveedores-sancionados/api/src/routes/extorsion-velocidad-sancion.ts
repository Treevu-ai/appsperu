import { Router } from "express";
import { z } from "zod";
import { extractRuc } from "@appsperu/shared-identity";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { seguridadPool } from "../db/seguridad-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { vigenteEnFecha } from "../lib/temporal-status.js";

export const extorsionVelocidadSancionRouter = Router();

const DEFAULT_VENTANA_DIAS_POST_SANCION = 90;

const ExtorsionVelocidadQuerySchema = z.object({
  departamento: z.string().min(1),
  anio: z
    .string()
    .regex(/^\d{4}$/, "anio debe ser un año de 4 dígitos"),
  ventanaDiasPostSancion: z.coerce.number().int().min(0).max(3650).default(DEFAULT_VENTANA_DIAS_POST_SANCION),
});

interface DenunciaRow {
  provincia: string;
  distrito: string;
  ubigeo: string | null;
  total_extorsion: string;
}

interface ContractRow {
  origen: "awards" | "minor_contracts";
  ocid: string | null;
  awardId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  buyerName: string | null;
  valorMonto: number | null;
  valorMoneda: string | null;
  fecha: string | Date | null;
  provincia: string | null;
  distrito: string | null;
}

interface RawContractRow {
  ocid: string | null;
  award_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  buyer_name: string | null;
  valor_monto: string | number | null;
  valor_moneda: string | null;
  fecha: string | Date | null;
  provincia: string | null;
  distrito: string | null;
}

interface InhabilitacionRow {
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  estado: string | null;
}

function diffEnDias(desde: unknown, hasta: unknown): number | null {
  if (typeof desde !== "string" && !(desde instanceof Date)) return null;
  if (typeof hasta !== "string" && !(hasta instanceof Date)) return null;
  const start = new Date(typeof desde === "string" ? `${desde.slice(0, 10)}T00:00:00Z` : desde).getTime();
  const end = new Date(typeof hasta === "string" ? `${hasta.slice(0, 10)}T00:00:00Z` : hasta).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

function peorCoincidencia(
  fechaContrato: unknown,
  inhabilitaciones: readonly InhabilitacionRow[],
  ventanaDiasPostSancion: number
): { severidad: "DURANTE_SANCION_VIGENTE" | "POCO_DESPUES_DE_SANCION"; resolucion: string; diasDesdeFinSancion: number | null } | null {
  let mejor: { severidad: "DURANTE_SANCION_VIGENTE" | "POCO_DESPUES_DE_SANCION"; resolucion: string; diasDesdeFinSancion: number | null } | null = null;

  for (const inhab of inhabilitaciones) {
    const estabaVigente = vigenteEnFecha(fechaContrato, inhab.desde, inhab.hasta);
    if (estabaVigente === true) {
      return { severidad: "DURANTE_SANCION_VIGENTE", resolucion: inhab.resolucion, diasDesdeFinSancion: null };
    }
    if (estabaVigente === false && inhab.hasta !== null) {
      const dias = diffEnDias(inhab.hasta, fechaContrato);
      if (dias !== null && dias >= 0 && dias <= ventanaDiasPostSancion) {
        if (!mejor || dias < (mejor.diasDesdeFinSancion ?? Infinity)) {
          mejor = { severidad: "POCO_DESPUES_DE_SANCION", resolucion: inhab.resolucion, diasDesdeFinSancion: dias };
        }
      }
    }
  }

  return mejor;
}

extorsionVelocidadSancionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ExtorsionVelocidadQuerySchema, req.query, res);
    if (!parsed) return;

    const departamento = parsed.departamento.toUpperCase();
    const anio = Number(parsed.anio);
    const { ventanaDiasPostSancion } = parsed;

    if (!seguridadPool) {
      res.status(503).json({
        error: "Servicio de seguridad-ciudadana no disponible. SEGURIDAD_DATABASE_URL no está configurada.",
      });
      return;
    }

    // Step 1: Get extorsión denuncias by distrito from seguridad
    const { rows: denunciaRows } = await seguridadPool.query<DenunciaRow>(
      `SELECT provincia, distrito, ubigeo, SUM(cantidad)::text AS total_extorsion
         FROM police_reports
        WHERE departamento = $1 AND anio = $2 AND modalidad = 'Extorsión'
        GROUP BY provincia, distrito, ubigeo
        ORDER BY SUM(cantidad) DESC`,
      [departamento, anio]
    );

    if (denunciaRows.length === 0) {
      res.json({
        departamento,
        anio,
        ventanaDiasPostSancion,
        distritosAlturaExtorsion: [],
        totalAlertas: 0,
        alertas: [],
      });
      return;
    }

    const distritosAltos = denunciaRows.slice(0, 10).map((d) => ({
      provincia: d.provincia,
      distrito: d.distrito,
      ubigeo: d.ubigeo,
      denunciasExtorsion: Number(d.total_extorsion),
    }));

    // Step 2: Get all RUCs with inhabilitaciones (from proveedores-sancionados DB)
    const { rows: inhabRows } = await pool.query(
      "SELECT ruc, resolucion, desde, hasta, estado FROM inhabilitaciones WHERE desde IS NOT NULL"
    );
    const inhabilitacionesByRuc = new Map<string, InhabilitacionRow[]>();
    for (const r of inhabRows) {
      if (!inhabilitacionesByRuc.has(r.ruc)) inhabilitacionesByRuc.set(r.ruc, []);
      inhabilitacionesByRuc.get(r.ruc)!.push({ resolucion: r.resolucion, desde: r.desde, hasta: r.hasta, estado: r.estado });
    }
    const rucsSancionados = [...inhabilitacionesByRuc.keys()];

    if (rucsSancionados.length === 0) {
      res.json({
        departamento,
        anio,
        ventanaDiasPostSancion,
        distritosAlturaExtorsion: distritosAltos,
        totalAlertas: 0,
        alertas: [],
        nota: "Sin inhabilitaciones registradas con fecha `desde` — no hay universo de RUC sancionados contra el cual cruzar.",
      });
      return;
    }

    // Step 3: Query contracts for sancionados proveedores in the specified departamento/year
    const awardsSupplierIds = rucsSancionados.map((ruc) => `PE-RUC-${ruc}`);
    const minorContractsSupplierIds = rucsSancionados.map((ruc) => `seace:ruc:${ruc}`);

    const { rows: minorRows } = await comprasPool.query<RawContractRow>(
      `SELECT c.contracting_id, c.ocid, c.award_id, c.winning_supplier_id AS supplier_id,
              s.legal_name AS supplier_name, m.official_name AS buyer_name,
              c.awarded_amount AS valor_monto, c.award_date AS fecha,
              c.execution_province AS provincia, c.execution_district AS distrito
         FROM minor_contracts c
         LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
         LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
        WHERE c.winning_supplier_id = ANY($1)
          AND c.execution_department = $2 AND c.year = $3`,
      [minorContractsSupplierIds, departamento, anio]
    );

    const { rows: awardRows } = await comprasPool.query<RawContractRow>(
      `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha,
              NULL::text AS provincia, NULL::text AS distrito
         FROM awards
        WHERE supplier_id = ANY($1) AND departamento = $2 AND EXTRACT(YEAR FROM fecha) = $3`,
      [awardsSupplierIds, departamento, anio]
    );

    const contractRows: ContractRow[] = [
      ...awardRows.map((row): ContractRow => ({
        origen: "awards",
        ocid: row.ocid,
        awardId: row.award_id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        buyerName: row.buyer_name,
        valorMonto: row.valor_monto === null ? null : Number(row.valor_monto),
        valorMoneda: row.valor_moneda ?? null,
        fecha: row.fecha,
        provincia: row.provincia,
        distrito: row.distrito,
      })),
      ...minorRows.map((row): ContractRow => ({
        origen: "minor_contracts",
        ocid: row.ocid,
        awardId: row.award_id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        buyerName: row.buyer_name,
        valorMonto: row.valor_monto === null ? null : Number(row.valor_monto),
        valorMoneda: null,
        fecha: row.fecha,
        provincia: row.provincia,
        distrito: row.distrito,
      })),
    ];

    const rucBySupplierId = new Map<string, string>();
    for (const row of contractRows) {
      if (!row.supplierId) continue;
      const ruc = extractRuc(row.supplierId);
      if (ruc) rucBySupplierId.set(row.supplierId, ruc);
    }

    // Build distrito lookup for fuzzy matching on buyer_name
    const distritoLookup = new Map<string, { provincia: string; distrito: string; denuncias: number }>();
    for (const d of distritosAltos) {
      const key = `${d.provincia.toUpperCase()}|${d.distrito.toUpperCase()}`;
      distritoLookup.set(key, { provincia: d.provincia, distrito: d.distrito, denuncias: d.denunciasExtorsion });
    }

    const alertas = contractRows
      .map((row) => {
        const ruc = row.supplierId ? rucBySupplierId.get(row.supplierId) ?? null : null;
        if (!ruc) return null;
        const inhabilitaciones = inhabilitacionesByRuc.get(ruc) ?? [];
        if (inhabilitaciones.length === 0) return null;
        const coincidencia = peorCoincidencia(row.fecha, inhabilitaciones, ventanaDiasPostSancion);
        if (!coincidencia) return null;

        // Match to distrito with extorsión denuncias
        let distritoAlto: { provincia: string; distrito: string; denuncias: number } | null = null;

         if (row.provincia && row.distrito) {
          const lookupKey = `${row.provincia.toUpperCase()}|${row.distrito.toUpperCase()}`;
          const fromLookup = distritoLookup.get(lookupKey);
          if (fromLookup) {
            distritoAlto = fromLookup;
          } else {
            const found = distritosAltos.find(
              (d) =>
                d.provincia.toUpperCase() === row.provincia!.toUpperCase() &&
                d.distrito.toUpperCase() === row.distrito!.toUpperCase()
            );
            if (found) {
              distritoAlto = { provincia: found.provincia, distrito: found.distrito, denuncias: found.denunciasExtorsion };
            }
          }
        }

        if (!distritoAlto && (!row.provincia || !row.distrito)) {
          const compradorUpper = (row.buyerName ?? "").toUpperCase();
          const found = distritosAltos.find((d) => compradorUpper.includes(d.distrito.toUpperCase()));
          if (found) {
            distritoAlto = { provincia: found.provincia, distrito: found.distrito, denuncias: found.denunciasExtorsion };
          }
        }

        return {
          origen: row.origen,
          ocid: row.ocid,
          awardId: row.awardId,
          ruc,
          supplierName: row.supplierName,
          buyerName: row.buyerName,
          valorMonto: row.valorMonto,
          valorMoneda: row.valorMoneda,
          fechaContrato: row.fecha,
          severidad: coincidencia.severidad,
          resolucionInhabilitacion: coincidencia.resolucion,
          diasDesdeFinSancion: coincidencia.diasDesdeFinSancion,
          distritoCoincidencia: distritoAlto
            ? {
                provincia: distritoAlto.provincia,
                distrito: distritoAlto.distrito,
                denunciasExtorsion: distritoAlto.denuncias,
              }
            : null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        if (a.severidad !== b.severidad) return a.severidad === "DURANTE_SANCION_VIGENTE" ? -1 : 1;
        const diasA = a.diasDesdeFinSancion ?? -1;
        const diasB = b.diasDesdeFinSancion ?? -1;
        return diasA - diasB;
      });

    res.json({
      departamento,
      anio,
      ventanaDiasPostSancion,
      distritosAlturaExtorsion: distritosAltos,
      totalAlertas: alertas.length,
      alertas,
      nota:
        "Este endpoint cruza Extorsión (seguridad-ciudadana) con Velocidad Sanción-Contrato (proveedores-sancionados). " +
        "DURANTE_SANCION_VIGENTE: el contrato se adjudicó mientras la inhabilitación estaba activa. " +
        "POCO_DESPUES_DE_SANCION: el contrato se adjudicó dentro de la ventana configurada después de que la inhabilitación terminó. " +
        "El campo distritoCoincidencia vincula cada alerta con el distrito de extorsión donde opera el proveedor. " +
        "Ninguna conclusión determina irregularidad por sí sola — requiere revisión humana.",
    });
  })
);
