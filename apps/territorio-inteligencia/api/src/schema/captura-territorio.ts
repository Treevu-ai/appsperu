import { z } from "zod";

export const CapturaTerritorioQuerySchema = z.object({
  departamento: z.string().optional(),
  tipoCatastro: z.enum(["minero", "forestal"]).optional().describe("Sin esto, devuelve ambos."),
  limiteRucs: z.preprocess((val) => Number(val), z.number().optional()).describe("Top N por superficie. El nombre es histórico — ninguna fuente tiene RUC, ver `identificador`."),
});

export type CapturaTerritorioQuery = z.infer<typeof CapturaTerritorioQuerySchema>;

export const CapturaDataSchema = z.object({
  // Minero: nombre del titular (sin RUC en la fuente). Forestal: SECTOR o,
  // si viene vacío (frecuente), la modalidad (`capa`) — SERFOR no publica
  // titular de concesión forestal.
  identificador: z.string(),
  tipoCatastro: z.enum(["minero", "forestal"]),
  totalSuperficie: z.number(),
  conteoTitulos: z.number(),
  proporcionTerritorial: z.number(),
});

export type CapturaData = z.infer<typeof CapturaDataSchema>;
