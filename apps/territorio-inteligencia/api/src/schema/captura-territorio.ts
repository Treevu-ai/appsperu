import { z } from "zod";

export const CapturaTerritorioQuerySchema = z.object({
  departamento: z.string().optional(),
  tipoCatastro: z.enum(["minero", "forestal"]).optional(),
  limiteRucs: z.preprocess((val) => Number(val), z.number().optional()),
});

export type CapturaTerritorioQuery = z.infer<typeof CapturaTerritorioQuerySchema>;

export const CapturaDataSchema = z.object({
  ruc: z.string(),
  nombre: z.string(),
  totalSuperficie: z.number(),
  conteoTítulos: z.number(),
  proporcionTerritorial: z.number(),
});

export type CapturaData = z.infer<typeof CapturaDataSchema>;
