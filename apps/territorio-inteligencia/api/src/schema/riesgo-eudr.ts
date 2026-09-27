import { z } from "zod";

export const RiesgoEUDRQuerySchema = z.object({
  ruc: z.string().optional(),
  departamento: z.string().optional(),
});

export type RiesgoEUDRQuery = z.infer<typeof RiesgoEUDRQuerySchema>;

/**
 * `NO_EVALUABLE` no es un cuarto nivel de riesgo: es la ausencia de dato. Sin
 * él, un `LEFT JOIN` sin coincidencia caía en el `ELSE` y reportaba "BAJO" —
 * es decir, "no deforestó", cuando en realidad no se pudo mirar.
 */
export const RiesgoEUDRDataSchema = z.object({
  ruc: z.string(),
  nombre: z.string(),
  estadoRiesgo: z.enum(["ALTO", "MEDIO", "BAJO", "NO_EVALUABLE"]),
  superficieDeforestada: z.number().nullable(),
  evidencia: z.string(),
});

export type RiesgoEUDRData = z.infer<typeof RiesgoEUDRDataSchema>;
