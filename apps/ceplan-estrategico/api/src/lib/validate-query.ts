import type { Response } from "express";
import type { ZodType, z } from "zod";

/**
 * Valida `req.query` contra un schema zod. Si falla, ya escribe la respuesta
 * 400 y devuelve `null` — el caller debe hacer `return` inmediatamente.
 * Existe porque Express castea `req.query` a arrays cuando un parámetro se
 * repite (`?nivelGobierno=a&nivelGobierno=b`); sin esta validación eso llegaba
 * sin chequear y tumbaba el handler con un 500 genérico.
 */
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
