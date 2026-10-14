import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool } from "../proveedores-sancionados/_helpers.js";

/**
 * Handler para `identidad_fiscal_eudr_legalidad` — GET /api/eudr-legalidad.
 *
 * Origen: apps/identidad-fiscal/api/src/routes/eudr-legalidad.ts. Cierra una
 * deriva real que el test CX-15 venía reportando: el endpoint Express existía
 * sin tool MCP. El SQL replica el de la ruta (mismas tablas, mismos filtros).
 *
 * Cruza tres bases (identidad-fiscal propia + infracciones-ambientales +
 * proveedores-sancionados). La ruta Express lo hacía con `Promise.all`; acá las
 * consultas cruzadas van SECUENCIALES, como el resto de los handlers cruzados,
 * por el tope de conexiones concurrentes del Worker (ver docblock de
 * `handlers/registry.ts`).
 *
 * SEMÁNTICA QUE NO HAY QUE ROMPER: es una señal de riesgo contra fuentes
 * públicas, no una certificación de legalidad. La ausencia de hallazgos no
 * prueba cumplimiento.
 */

interface ParcelaRow extends NeonRow {
  codigo_parcela: string;
}

interface InfraccionRow extends NeonRow {
  nro_expediente: string;
  fecha_rd: string | Date | null;
  detalle_infraccion: string | null;
  tipo_sancion: string | null;
  cantidad_multa: string | number | null;
}

interface InhabRow extends NeonRow {
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  infraccion: string | null;
  estado: string;
}

interface MultaRow extends NeonRow {
  resolucion: string;
  fecha_resolucion: string | Date | null;
  monto_multa: string | number | null;
  infraccion: string | null;
  estado: string;
}

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const ruc = args.ruc as string | undefined;
  if (!ruc || !/^\d{11}$/.test(ruc)) {
    return { status: 400, body: { error: "ruc inválido: debe tener 11 dígitos." } };
  }

  const { rows: parcelas } = await db.query<ParcelaRow>(
    `SELECT codigo_parcela FROM eudr_parcela WHERE ruc = $1`,
    [ruc]
  );

  const ambientalPool = crossAppPool("infracciones-ambientales", env);
  const sancionadosPool = crossAppPool("proveedores-sancionados", env);

  const infracciones = [];
  if (ambientalPool) {
    const { rows } = await ambientalPool.query<InfraccionRow>(
      `SELECT nro_expediente, fecha_rd, detalle_infraccion, tipo_sancion, cantidad_multa
       FROM infracciones_ambientales
       WHERE tipo_doc = 'R.U.C.' AND id_doc_administrado = $1
       ORDER BY fecha_rd DESC NULLS LAST`,
      [ruc]
    );
    for (const r of rows) {
      infracciones.push({
        expediente: r.nro_expediente,
        fecha: r.fecha_rd,
        detalle: r.detalle_infraccion,
        tipoSancion: r.tipo_sancion,
        multaUit: r.cantidad_multa === null ? null : Number(r.cantidad_multa),
      });
    }
  }

  const inhabilitaciones = [];
  const multas = [];
  if (sancionadosPool) {
    const { rows } = await sancionadosPool.query<InhabRow>(
      `SELECT resolucion, desde, hasta, infraccion, estado
       FROM inhabilitaciones WHERE ruc = $1 ORDER BY desde DESC NULLS LAST`,
      [ruc]
    );
    for (const r of rows) {
      inhabilitaciones.push({
        resolucion: r.resolucion,
        desde: r.desde,
        hasta: r.hasta,
        infraccion: r.infraccion,
        estado: r.estado,
        vigente: r.estado === "VIGENTE",
      });
    }
    const { rows: multaRows } = await sancionadosPool.query<MultaRow>(
      `SELECT resolucion, fecha_resolucion, monto_multa, infraccion, estado
       FROM multas WHERE ruc = $1 ORDER BY fecha_resolucion DESC NULLS LAST`,
      [ruc]
    );
    for (const r of multaRows) {
      multas.push({
        resolucion: r.resolucion,
        fecha: r.fecha_resolucion,
        infraccion: r.infraccion,
        estado: r.estado,
        montoMulta: r.monto_multa === null ? null : Number(r.monto_multa),
        vigente: r.estado === "VIGENTE",
      });
    }
  }

  const tieneInhabilitacionVigente = inhabilitaciones.some((i) => i.vigente);
  const tieneSancionAmbiental = infracciones.length > 0;

  return {
    status: 200,
    body: {
      ruc,
      parcelasRegistradas: parcelas.map((r) => r.codigo_parcela),
      sancionesAmbientalesOefa: infracciones,
      inhabilitacionesOsce: inhabilitaciones,
      multasOsce: multas,
      riesgo: {
        inhabilitacionVigente: tieneInhabilitacionVigente,
        algunaSancionAmbiental: tieneSancionAmbiental,
        nivel: tieneInhabilitacionVigente || tieneSancionAmbiental ? "REVISAR" : "SIN_HALLAZGOS",
      },
      fuentes: {
        ambiental: "OEFA / RUIAS (infracciones-ambientales)",
        contratacionPublica: "OSCE / RNP (proveedores-sancionados)",
      },
      enriquecimiento: {
        ambiental: ambientalPool ? "ok" : "ENRIQUECIMIENTO_NO_CONFIGURADO",
        contratacionPublica: sancionadosPool ? "ok" : "ENRIQUECIMIENTO_NO_CONFIGURADO",
      },
      aclaracion:
        "Esto es una señal de riesgo contra fuentes públicas, no una certificación de legalidad. " +
        "La ausencia de hallazgos no prueba cumplimiento, solo que no hay sanción registrada en estas fuentes.",
    },
  };
}
