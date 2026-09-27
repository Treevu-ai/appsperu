import { Router } from "express";
import { z } from "zod";
import { extractRuc } from "@appsperu/shared-identity";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { seguridadPool } from "../db/seguridad-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const extorsionDuenosRealesRouter = Router();

const ExtorsionDuenosRealesQuerySchema = z.object({
  departamento: z.string().min(1),
  anio: z
    .string()
    .regex(/^\d{4}$/, "anio debe ser un año de 4 dígitos"),
});

interface DenunciaRow {
  provincia: string;
  distrito: string;
  ubigeo: string | null;
  total_extorsion: string;
}

interface ProveedorContratoRow {
  ruc: string | null;
  supplier_name: string | null;
  valor_monto: string | null;
  fecha: string | Date | null;
  buyer_name: string | null;
  provincia: string | null;
  distrito: string | null;
}

interface VinculoRow {
  numero_documento: string;
  nombre: string;
  rol: string;
  cargo: string | null;
  fecha_ingreso: string | Date | null;
}

interface OwnerSancionRow {
  dni: string | null;
  ruc: string;
  razon_social: string;
  resolucion: string;
  estado: string | null;
  desde: string | Date | null;
  hasta: string | Date | null;
  infraccion: string | null;
  norma: string | null;
}

function maskDocumento(numero: string | null): string | null {
  if (!numero || numero.length <= 3) return numero;
  return `${"*".repeat(numero.length - 3)}${numero.slice(-3)}`;
}

extorsionDuenosRealesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ExtorsionDuenosRealesQuerySchema, req.query, res);
    if (!parsed) return;

    const departamento = parsed.departamento.toUpperCase();
    const anio = Number(parsed.anio);

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
        distritosAlturaExtorsion: [],
        resultado: [],
        metadata: {
          totalDenunciasExtorsion: 0,
          totalProveedoresSancionadosEncontrados: 0,
          rucsProveedoresSancionados: 0,
          dnisVinculadas: 0,
          totalSancionesOwnerEncontradas: 0,
        },
      });
      return;
    }

    const distritosAltos = denunciaRows.slice(0, 10).map((d) => ({
      provincia: d.provincia,
      distrito: d.distrito,
      denunciasExtorsion: Number(d.total_extorsion),
    }));

    // Step 2: Get all proveedores with inhabilitación vigente (from proveedores-sancionados DB)
    const { rows: inhabRows } = await pool.query<{ ruc: string }>(
      `SELECT DISTINCT ruc FROM inhabilitaciones WHERE estado ILIKE '%VIGENTE%'`
    );
    const proveedoresSancionados = new Set(inhabRows.map((r) => r.ruc));

    // Step 3: Get contracts in the same departamento/year, filter to sancionados in high-extorsión distritos
    const { rows: minorRows } = await comprasPool.query<ProveedorContratoRow>(
      `SELECT c.winning_supplier_id,
              s.legal_name AS supplier_name,
              s.ruc,
              c.awarded_amount::text AS valor_monto,
              c.award_date AS fecha,
              m.official_name AS buyer_name,
              c.execution_province AS provincia,
              c.execution_district AS distrito
         FROM minor_contracts c
         LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
         LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
        WHERE c.execution_department = $1 AND c.year = $2
          AND c.winning_supplier_id IS NOT NULL`,
      [departamento, anio]
    );

    const { rows: awardRows } = await comprasPool.query<ProveedorContratoRow>(
      `SELECT a.supplier_id, a.supplier_name, a.ruc, a.valor_monto::text,
              a.fecha, a.buyer_name, NULL::text AS provincia, NULL::text AS distrito
         FROM awards a
        WHERE a.departamento = $1 AND EXTRACT(YEAR FROM a.fecha) = $2`,
      [departamento, anio]
    );

    const contractRows: ProveedorContratoRow[] = [...minorRows, ...awardRows];

    // Step 4: Filter contracts to proveedores sancionados in high-extorsión distritos
    const proveedoresPorRuc = new Map<string, ProveedorContratoRow[]>();
    for (const row of contractRows) {
      let ruc: string | null = row.ruc;
      if (!ruc && row.supplier_name) {
        ruc = extractRuc(row.supplier_name);
      }
      if (!ruc || !proveedoresSancionados.has(ruc)) continue;

      const isInDistritoAlto =
        (row.provincia &&
          row.distrito &&
          distritosAltos.some(
            (d) =>
              d.provincia.toUpperCase() === row.provincia?.toUpperCase() &&
              d.distrito.toUpperCase() === row.distrito?.toUpperCase()
          )) ||
        (!row.provincia &&
          !row.distrito &&
          distritosAltos.some((d) =>
            (row.buyer_name ?? "").toUpperCase().includes(d.distrito.toUpperCase())
          ));

      if (!isInDistritoAlto) continue;

      if (!proveedoresPorRuc.has(ruc)) proveedoresPorRuc.set(ruc, []);
      proveedoresPorRuc.get(ruc)!.push(row);
    }

    const rucsProveedoresSancionados = [...proveedoresPorRuc.keys()];

    if (rucsProveedoresSancionados.length === 0) {
      res.json({
        departamento,
        anio,
        distritosAlturaExtorsion: distritosAltos,
        resultado: [],
        metadata: {
          totalDenunciasExtorsion: denunciaRows.reduce((sum, d) => sum + Number(d.total_extorsion), 0),
          totalProveedoresSancionadosEncontrados: proveedoresSancionados.size,
          rucsProveedoresSancionados: 0,
          dnisVinculadas: 0,
          totalSancionesOwnerEncontradas: 0,
        },
      });
      return;
    }

    // Step 5: For those proveedores, find their owners (DNI) via supplier_conformacion
    const rucsConVinculo = await comprasPool.query<VinculoRow & { ruc: string }>(
      `SELECT ruc, numero_documento, nombre, rol, cargo, fecha_ingreso
         FROM supplier_conformacion
        WHERE ruc = ANY($1)
          AND tipo_documento ILIKE '%NACIONAL DE IDENTIDAD%'
        ORDER BY ruc, rol, nombre`,
      [rucsProveedoresSancionados]
    );

    const vinculosPorRuc = new Map<string, VinculoRow[]>();
    for (const row of rucsConVinculo.rows) {
      if (!vinculosPorRuc.has(row.ruc)) vinculosPorRuc.set(row.ruc, []);
      vinculosPorRuc.get(row.ruc)!.push({
        numero_documento: row.numero_documento,
        nombre: row.nombre,
        rol: row.rol,
        cargo: row.cargo,
        fecha_ingreso: row.fecha_ingreso,
      });
    }

    const allDnis = [...new Set(rucsConVinculo.rows.map((r) => r.numero_documento))];

    // Step 6: Check if any of those DNI have their own sanciones
    let ownerInhabRows: OwnerSancionRow[] = [];
    let ownerMultaRows: OwnerSancionRow[] = [];

    if (allDnis.length > 0) {
      const { rows: inhab } = await pool.query<OwnerSancionRow>(
        `SELECT dni, ruc, razon_social, resolucion, estado, desde, hasta, infraccion, norma
           FROM inhabilitaciones
          WHERE dni = ANY($1)`,
        [allDnis]
      );
      ownerInhabRows = inhab;

      const { rows: multas } = await pool.query<OwnerSancionRow>(
        `SELECT dni, ruc, razon_social, resolucion, estado, desde, hasta, infraccion, norma
           FROM multas
          WHERE dni = ANY($1)`,
        [allDnis]
      );
      ownerMultaRows = multas;
    }

    // Build lookup maps by DNI
    const sancionesByDni = new Map<string, OwnerSancionRow[]>();
    for (const row of [...ownerInhabRows, ...ownerMultaRows]) {
      if (row.dni) {
        if (!sancionesByDni.has(row.dni)) sancionesByDni.set(row.dni, []);
        sancionesByDni.get(row.dni)!.push(row);
      }
    }

    // Build resultado: for each proveedor sancionado, check if its owners have sanciones
    const resultados = [];

    for (const ruc of rucsProveedoresSancionados) {
      const contratos = proveedoresPorRuc.get(ruc) ?? [];
      if (contratos.length === 0) continue;

      const proveedorVinculos = vinculosPorRuc.get(ruc) ?? [];
      const ownerSancionesEncontradas: OwnerSancionRow[] = [];

      for (const v of proveedorVinculos) {
        const sanciones = sancionesByDni.get(v.numero_documento);
        if (sanciones && sanciones.length > 0) {
          ownerSancionesEncontradas.push(...sanciones);
        }
      }

      if (ownerSancionesEncontradas.length === 0) continue;

      const dnisSancionados = [...new Set(ownerSancionesEncontradas.map((s) => s.dni).filter(Boolean))];

      resultados.push({
        rucProveedorSancionado: ruc,
        proveedorNombre: contratos[0]?.supplier_name ?? null,
        contratos: contratos.map((c) => ({
          monto: c.valor_monto ? Number(c.valor_monto) : null,
          fecha: c.fecha,
          comprador: c.buyer_name,
          provincia: c.provincia,
          distrito: c.distrito,
        })),
        dueñosReales: proveedorVinculos.map((v) => ({
          nombre: v.nombre,
          rol: v.rol,
          cargo: v.cargo,
          dniEnmascarado: maskDocumento(v.numero_documento),
          fechaIngreso: v.fecha_ingreso,
          tieneSancionPropia: dnisSancionados.includes(v.numero_documento),
        })),
        sancionesOwner: dnisSancionados.length > 0
          ? ownerSancionesEncontradas
              .filter((s) => s.dni && dnisSancionados.includes(s.dni!))
              .map((s) => ({
                dniEnmascarado: maskDocumento(s.dni),
                ruc: s.ruc,
                razonSocial: s.razon_social,
                resolucion: s.resolucion,
                estado: s.estado,
                desde: s.desde,
                hasta: s.hasta,
                infraccion: s.infraccion,
                norma: s.norma,
              }))
          : [],
      });
    }

    res.json({
      departamento,
      anio,
      distritosAlturaExtorsion: distritosAltos,
      resultado: resultados,
      metadata: {
        totalDenunciasExtorsion: denunciaRows.reduce((sum, d) => sum + Number(d.total_extorsion), 0),
        totalProveedoresSancionadosEncontrados: proveedoresSancionados.size,
        rucsProveedoresSancionados: rucsProveedoresSancionados.length,
        dnisVinculadas: allDnis.length,
        totalSancionesOwnerEncontradas: ownerInhabRows.length + ownerMultaRows.length,
      },
    });
  })
);
