import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import {
  extractRuc,
  peorCoincidencia,
  crossAppPool,
  crossAppUnavailable,
  type InhabilitacionRow,
} from "./_helpers.js";

interface DenunciaRow extends NeonRow {
  provincia: string;
  distrito: string;
  ubigeo: string | null;
  total_extorsion: string;
}

type ContractRow = {
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
};

interface RawContractRow extends NeonRow {
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

interface InhabUniverseRow extends NeonRow {
  ruc: string;
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  estado: string | null;
}

/**
 * Handler para `proveedores_sancionados_extorsion_velocidad_sancion` —
 * GET /api/crossref/extorsion-velocidad-sancion.
 *
 * A diferencia de los otros dos cruces de extorsión, aquí la ventana temporal ES
 * la señal — un proveedor que empieza a contratar pocos días después de recibir
 * su sanción, en un distrito con extorsión activa. La coincidencia temporal NO
 * prueba que la sanción motivara el contrato; es un patrón para priorizar.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const seguridadDb = crossAppPool("seguridad-ciudadana", env);
  if (!seguridadDb) return crossAppUnavailable("seguridad-ciudadana");
  const comprasDb = crossAppPool("compras-publicas", env);
  if (!comprasDb) return crossAppUnavailable("compras-publicas");

  const departamento = (args.departamento as string).toUpperCase();
  const anio = Number(args.anio);
  const ventanaDiasPostSancion = args.ventanaDiasPostSancion !== undefined ? Number(args.ventanaDiasPostSancion) : 90;

  const { rows: denunciaRows } = await seguridadDb.query<DenunciaRow>(
    `SELECT provincia, distrito, ubigeo, SUM(cantidad)::text AS total_extorsion
       FROM police_reports
      WHERE departamento = $1 AND anio = $2 AND modalidad = 'Extorsión'
      GROUP BY provincia, distrito, ubigeo
      ORDER BY SUM(cantidad) DESC`,
    [departamento, anio]
  );

  if (denunciaRows.length === 0) {
    return {
      status: 200,
      body: {
        departamento,
        anio,
        ventanaDiasPostSancion,
        distritosAlturaExtorsion: [],
        totalAlertas: 0,
        alertas: [],
      },
    };
  }

  const distritosAltos = denunciaRows.slice(0, 10).map((d) => ({
    provincia: d.provincia,
    distrito: d.distrito,
    ubigeo: d.ubigeo,
    denunciasExtorsion: Number(d.total_extorsion),
  }));

  const { rows: inhabRows } = await db.query<InhabUniverseRow>(
    "SELECT ruc, resolucion, desde, hasta, estado FROM inhabilitaciones WHERE desde IS NOT NULL"
  );
  const inhabilitacionesByRuc = new Map<string, InhabilitacionRow[]>();
  for (const r of inhabRows) {
    if (!inhabilitacionesByRuc.has(r.ruc)) inhabilitacionesByRuc.set(r.ruc, []);
    inhabilitacionesByRuc.get(r.ruc)!.push({ resolucion: r.resolucion, desde: r.desde, hasta: r.hasta, estado: r.estado });
  }
  const rucsSancionados = [...inhabilitacionesByRuc.keys()];

  if (rucsSancionados.length === 0) {
    return {
      status: 200,
      body: {
        departamento,
        anio,
        ventanaDiasPostSancion,
        distritosAlturaExtorsion: distritosAltos,
        totalAlertas: 0,
        alertas: [],
        nota: "Sin inhabilitaciones registradas con fecha `desde` — no hay universo de RUC sancionados contra el cual cruzar.",
      },
    };
  }

  const awardsSupplierIds = rucsSancionados.map((ruc) => `PE-RUC-${ruc}`);
  const minorContractsSupplierIds = rucsSancionados.map((ruc) => `seace:ruc:${ruc}`);

  const { rows: minorRows } = await comprasDb.query<RawContractRow>(
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

  const { rows: awardRows } = await comprasDb.query<RawContractRow>(
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

  return {
    status: 200,
    body: {
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
    },
  };
}
