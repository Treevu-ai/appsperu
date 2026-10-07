import { z } from "zod";

export const CapturaTerritorioQuerySchema = z.object({
  departamento: z.string().optional(),
  tipoCatastro: z.enum(["minero", "forestal"]).optional().describe("Sin esto, devuelve ambos."),
  // `.min(1)` importa más de lo que parece: `?limiteRucs=` (vacío) coerciona
  // a 0 con `Number()`, y `0 ?? 10` sigue siendo `0` (solo `undefined` cae al
  // default) — sin el mínimo, ese input devolvía 0 filas en silencio.
  limiteRucs: z.coerce.number().int().min(1).optional().describe("Top N por superficie. Default 10. El nombre es histórico — ninguna fuente tiene RUC, ver `identificador`."),
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
