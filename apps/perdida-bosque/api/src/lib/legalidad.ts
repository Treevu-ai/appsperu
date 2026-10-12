import { ambientalPool } from "../db/ambiental-pool.js";
import { sancionadosPool } from "../db/sancionados-pool.js";

interface InfraccionAmbientalRow {
  nro_expediente: string;
  fecha_rd: string | Date | null;
  detalle_infraccion: string | null;
  tipo_sancion: string | null;
  cantidad_multa: string | number | null;
}

interface InhabilitacionRow {
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  infraccion: string | null;
  estado: string;
}

export interface RiesgoLegalidad {
  sancionesAmbientalesOefa: Array<{
    expediente: string;
    fecha: string | Date | null;
    detalle: string | null;
    tipoSancion: string | null;
    multaUit: number | null;
  }>;
  inhabilitacionesOsce: Array<{
    resolucion: string;
    desde: string | Date | null;
    hasta: string | Date | null;
    infraccion: string | null;
    estado: string;
    vigente: boolean;
  }>;
  inhabilitacionVigente: boolean;
  algunaSancionAmbiental: boolean;
  nivel: "REVISAR" | "SIN_HALLAZGOS";
}

/**
 * Mismo cruce que `identidad-fiscal/api` (`eudr-legalidad.ts`) — duplicado
 * acá porque son apps independientes y cada una ya tiene su propio pool
 * cruzado a las bases de legalidad, no por preferencia de diseño.
 */
export async function evaluarLegalidad(ruc: string): Promise<RiesgoLegalidad> {
  const [infraccionesResult, inhabilitacionesResult] = await Promise.all([
    ambientalPool.query<InfraccionAmbientalRow>(
      `SELECT nro_expediente, fecha_rd, detalle_infraccion, tipo_sancion, cantidad_multa
       FROM infracciones_ambientales
       WHERE tipo_doc = 'R.U.C.' AND id_doc_administrado = $1
       ORDER BY fecha_rd DESC NULLS LAST`,
      [ruc]
    ),
    sancionadosPool.query<InhabilitacionRow>(
      `SELECT resolucion, desde, hasta, infraccion, estado
       FROM inhabilitaciones WHERE ruc = $1 ORDER BY desde DESC NULLS LAST`,
      [ruc]
    ),
  ]);

  const sancionesAmbientalesOefa = infraccionesResult.rows.map((r) => ({
    expediente: r.nro_expediente,
    fecha: r.fecha_rd,
    detalle: r.detalle_infraccion,
    tipoSancion: r.tipo_sancion,
    multaUit: r.cantidad_multa === null ? null : Number(r.cantidad_multa),
  }));

  const inhabilitacionesOsce = inhabilitacionesResult.rows.map((r) => ({
    resolucion: r.resolucion,
    desde: r.desde,
    hasta: r.hasta,
    infraccion: r.infraccion,
    estado: r.estado,
    vigente: r.estado === "VIGENTE",
  }));

  const inhabilitacionVigente = inhabilitacionesOsce.some((i) => i.vigente);
  const algunaSancionAmbiental = sancionesAmbientalesOefa.length > 0;

  return {
    sancionesAmbientalesOefa,
    inhabilitacionesOsce,
    inhabilitacionVigente,
    algunaSancionAmbiental,
    nivel: inhabilitacionVigente || algunaSancionAmbiental ? "REVISAR" : "SIN_HALLAZGOS",
  };
}
