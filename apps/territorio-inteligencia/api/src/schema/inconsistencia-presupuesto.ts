import { z } from "zod";

export const InconsistenciaPresupuestoQuerySchema = z.object({
  departamento: z.string().optional(),
  sector: z.string().optional(), // e.g., "MINISTERIO DE AGRICULTURA Y RIEGO"
});

export type InconsistenciaPresupuestoQuery = z.infer<typeof InconsistenciaPresupuestoQuerySchema>;

export const InconsistenciaDataSchema = z.object({
  proyecto: z.string(),
  codigoProyecto: z.string(),
  monto: z.number(),
  ubicacion: z.string(),
  conflictoDeteccionado: z.boolean(),
  detalleConflicto: z.string(),
});

export type InconsistenciaData = z.infer<typeof InconsistenciaDataSchema>;
