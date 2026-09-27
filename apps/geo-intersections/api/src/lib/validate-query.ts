import type { ZodSchema } from "zod";
import type { Request, Response } from "express";

export function parseQuery<T>(
  schema: ZodSchema<T>,
  query: unknown,
  res: Response
): T | null {
  const result = schema.safeParse(query);
  if (!result.success) {
    res.status(400).json({
      error: "Parámetros de query inválidos.",
      details: result.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return null;
  }
  return result.data;
}
