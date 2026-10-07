import { z } from "zod";

export const TitularesRiesgoQuerySchema = z.object({
  ruc: z.string().optional().describe("Filtra por texto en el nombre del titular (pese al nombre histórico del parámetro, no es un RUC — ver schema de salida)."),
  departamento: z.string().optional(),
  soloVigentes: z.preprocess((val) => val === "true", z.boolean().optional()),
});

export type TitularesRiesgoQuery = z.infer<typeof TitularesRiesgoQuerySchema>;

export const TitularRiesgoSchema = z.object({
  titular: z.string(),
  // Solo "minero": ni catastro_minero_derechos ni catastro_forestal_titulos
  // tienen columna de RUC, y el forestal tampoco tiene nombre de titular
  // (SERFOR no lo publica) — no hay base para cruzar forestal contra
  // sanciones en absoluto, no es una limitación temporal.
  tipoCatastro: z.literal("minero"),
  concesiones: z.array(z.string()),
  superficie: z.number().nullable(),
  ubicacion: z.string().nullable(),
  riesgos: z.array(z.object({
    tipo: z.enum(["inhabilitacion", "judicial", "multa"]),
    resolucion: z.string(),
    desde: z.string().nullable(),
    hasta: z.string().nullable(),
    estado: z.string(),
    descripcion: z.string().optional(),
    // "confirmada" = mismo nombre normalizado exacto; "candidata" = similitud
    // por tokens (@appsperu/entity-matcher) — NUNCA tratar "candidata" como
    // una violación confirmada, es una coincidencia de nombre a revisar.
    confianza: z.enum(["confirmada", "candidata"]),
  })),
});

export type TitularRiesgo = z.infer<typeof TitularRiesgoSchema>;
