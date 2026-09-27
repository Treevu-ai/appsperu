import { z } from "zod";

export const TitularesRiesgoQuerySchema = z.object({
  ruc: z.string().optional(),
  departamento: z.string().optional(),
  soloVigentes: z.preprocess((val) => val === "true", z.boolean().optional()),
});

export type TitularesRiesgoQuery = z.infer<typeof TitularesRiesgoQuerySchema>;

export const TitularRiesgoSchema = z.object({
  ruc: z.string(),
  nombre: z.string(),
  tipoCatastro: z.enum(["minero", "forestal"]),
  codigoConcesion: z.string(),
  superficie: z.number().nullable(),
  ubicacion: z.string().nullable(),
  riesgos: z.array(z.object({
    tipo: z.string(), // "inhabilitacion" | "judicial" | "multa"
    resolucion: z.string(),
    desde: z.string().nullable(),
    hasta: z.string().nullable(),
    estado: z.string(),
    descripcion: z.string().optional(),
  })),
});

export type TitularRiesgo = z.infer<typeof TitularRiesgoSchema>;
