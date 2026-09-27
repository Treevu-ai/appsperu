import { z } from "zod";

export const RiesgoEUDRQuerySchema = z.object({
  ruc: z.string().optional(),
  departamento: z.string().optional(),
});

export type RiesgoEUDRQuery = z.infer<typeof RiesgoEUDRQuerySchema>;

export const RiesgoEUDRDataSchema = z.object({
  ruc: z.string(),
  nombre: z.string(),
  estadoRiesgo: z.enum(["ALTO", "MEDIO", "BAJO"]),
  superficieDeforestada: z.number().nullable(),
  evidencia: z.string(),
});

export type RiesgoEUDRData = z.infer<typeof RiesgoEUDRDataSchema>;
