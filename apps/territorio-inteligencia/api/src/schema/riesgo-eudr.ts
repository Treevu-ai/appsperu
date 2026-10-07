import { z } from "zod";

export const RiesgoEUDRQuerySchema = z.object({
  departamento: z.string().optional().describe("Nombre de departamento (ej. 'La Libertad'). Sin esto, puede devolver muchos títulos a nivel nacional."),
});

export type RiesgoEUDRQuery = z.infer<typeof RiesgoEUDRQuerySchema>;

/**
 * No hay `ruc`/`nombre` de titular: SERFOR no publica dueño del título
 * forestal (confirmado, no es un gap temporal de datos). El identificador es
 * el título forestal mismo (`tituloForestalId`, `docLegal`), no una persona o
 * empresa.
 */
export const RiesgoEUDRDataSchema = z.object({
  tituloForestalId: z.string(),
  sector: z.string().nullable(),
  docLegal: z.string().nullable(),
  superficieHa: z.number().nullable(),
  estadoRiesgo: z.enum(["ALTO", "MEDIO", "BAJO"]),
  alertasDentroDelTitulo: z.number().int(),
  evidencia: z.string(),
});

export type RiesgoEUDRData = z.infer<typeof RiesgoEUDRDataSchema>;
