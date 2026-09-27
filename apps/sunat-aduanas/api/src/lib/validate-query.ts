import type { Response } from "express";
import { z } from "zod";

export function parseQuery<T extends z.ZodType>(
  schema: T,
  query: unknown,
  res: Response
): z.infer<T> | null {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Parámetros inválidos",
      details: parsed.error.flatten().fieldErrors,
    });
    return null;
  }
  return parsed.data;
}
