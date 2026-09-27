import type { Response } from "express";
import type { ZodType, z } from "zod";

export function parseQuery<T extends ZodType>(schema: T, query: unknown, res: Response): z.infer<T> | null {
  const result = schema.safeParse(query);
  if (!result.success) {
    res.status(400).json({
      error: "Parámetros de consulta inválidos.",
      detalles: result.error.issues.map((issue) => ({ campo: issue.path.join("."), mensaje: issue.message })),
    });
    return null;
  }
  return result.data;
}
