import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { extractRuc, maskDocumento, crossAppPool, crossAppUnavailable } from "./_helpers.js";

interface DenunciaRow extends NeonRow {
  provincia: string;
  distrito: string;
  ubigeo: string | null;
  total_extorsion: string;
}

interface ProveedorContratoRow extends NeonRow {
  winning_supplier_id: string | null;
  supplier_id: string | null;
  ruc: string | null;
  supplier_name: string | null;
  valor_monto: string | number | null;
  fecha: string | Date | null;
  buyer_name: string | null;
  provincia: string | null;
  distrito: string | null;
}

interface VinculoRow extends NeonRow {
  numero_documento: string;
  nombre: string;
  rol: string;
  cargo: string | null;
  fecha_ingreso: string | Date | null;
  ruc: string;
}

interface VinculoDeRuc {
  numero_documento: string;
  nombre: string;
  rol: string;
  cargo: string | null;
  fecha_ingreso: string | Date | null;
}

interface OwnerSancionRow extends NeonRow {
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

interface SancionadoRucRow extends NeonRow {
  ruc: string;
}

/**
 * Handler para `proveedores_sancionados_extorsion_duenos_reales` —
 * GET /api/crossref/extorsion-duenos-reales.
 *
 * Extorsión en territorio alto contra los dueños reales de la obra pública: las
 * denuncias policiales de Extorsión por distrito, los ganadores de los contratos
 * de esa zona y las sanciones recaídas sobre las PERSONAS (DNI) vinculadas a
 * esos proveedores — la cuenta atrás del contratista no siempre es la persona
 * jurídica.
 *
 * Los tres dominios se ingieren por separado y pueden tener fechas de corte
 * distintas: un vacío aquí puede ser cobertura faltante, no ausencia de sanción.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const seguridadDb = crossAppPool("seguridad-ciudadana", env);
  if (!seguridadDb) return crossAppUnavailable("seguridad-ciudadana");
  const comprasDb = crossAppPool("compras-publicas", env);
  if (!comprasDb) return crossAppUnavailable("compras-publicas");

  const departamento = (args.departamento as string).toUpperCase();
  const anio = Number(args.anio);

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
        distritosAlturaExtorsion: [],
        resultado: [],
        metadata: {
          totalDenunciasExtorsion: 0,
          totalProveedoresSancionadosEncontrados: 0,
          rucsProveedoresSancionados: 0,
          dnisVinculadas: 0,
          totalSancionesOwnerEncontradas: 0,
        },
      },
    };
  }

  const distritosAltos = denunciaRows.slice(0, 10).map((d) => ({
    provincia: d.provincia,
    distrito: d.distrito,
    denunciasExtorsion: Number(d.total_extorsion),
  }));

  const { rows: inhabRows } = await db.query<SancionadoRucRow>(
    `SELECT DISTINCT ruc FROM inhabilitaciones WHERE estado ILIKE '%VIGENTE%'`
  );
  const proveedoresSancionados = new Set(inhabRows.map((r) => r.ruc));

  const { rows: minorRows } = await comprasDb.query<ProveedorContratoRow>(
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

  const { rows: awardRows } = await comprasDb.query<ProveedorContratoRow>(
    `SELECT a.supplier_id, a.supplier_name, a.ruc, a.valor_monto::text,
            a.fecha, a.buyer_name, NULL::text AS provincia, NULL::text AS distrito
       FROM awards a
      WHERE a.departamento = $1 AND EXTRACT(YEAR FROM a.fecha) = $2`,
    [departamento, anio]
  );

  const contractRows: ProveedorContratoRow[] = [...minorRows, ...awardRows];

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
    return {
      status: 200,
      body: {
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
      },
    };
  }

  const rucsConVinculo = await comprasDb.query<VinculoRow>(
    `SELECT ruc, numero_documento, nombre, rol, cargo, fecha_ingreso
       FROM supplier_conformacion
      WHERE ruc = ANY($1)
        AND tipo_documento ILIKE '%NACIONAL DE IDENTIDAD%'
      ORDER BY ruc, rol, nombre`,
    [rucsProveedoresSancionados]
  );

  const vinculosPorRuc = new Map<string, VinculoDeRuc[]>();
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

  let ownerInhabRows: OwnerSancionRow[] = [];
  let ownerMultaRows: OwnerSancionRow[] = [];

  if (allDnis.length > 0) {
    const { rows: inhab } = await db.query<OwnerSancionRow>(
      `SELECT dni, ruc, razon_social, resolucion, estado, desde, hasta, infraccion, norma
         FROM inhabilitaciones
        WHERE dni = ANY($1)`,
      [allDnis]
    );
    ownerInhabRows = inhab;

    const { rows: multas } = await db.query<OwnerSancionRow>(
      `SELECT dni, ruc, razon_social, resolucion, estado, desde, hasta, infraccion, norma
         FROM multas
        WHERE dni = ANY($1)`,
      [allDnis]
    );
    ownerMultaRows = multas;
  }

  const sancionesByDni = new Map<string, OwnerSancionRow[]>();
  for (const row of [...ownerInhabRows, ...ownerMultaRows]) {
    if (row.dni) {
      if (!sancionesByDni.has(row.dni)) sancionesByDni.set(row.dni, []);
      sancionesByDni.get(row.dni)!.push(row);
    }
  }

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

  return {
    status: 200,
    body: {
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
    },
  };
}
