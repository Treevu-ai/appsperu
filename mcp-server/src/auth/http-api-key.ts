import type { NextFunction, Request, Response } from "express";
import type { ApiKeyRecord } from "./api-key.js";

/**
 * Fase 1-D (HTTP): a diferencia de stdio (un proceso = un `activeKey` fijo,
 * validado una sola vez al arrancar), un proceso HTTP sirve muchas sesiones
 * con códigos distintos a la vez — no hay "un" activeKey de proceso. Este
 * middleware valida el header `x-api-key` en CADA request y lo adjunta a
 * `req.apiKey` para que la ruta lo use al construir el `McpServer` de esa
 * sesión (ver `http-transport.ts`).
 */
declare module "express-serve-static-core" {
  interface Request {
    apiKey?: ApiKeyRecord;
  }
}

const REASON_MESSAGES: Record<string, string> = {
  NOT_FOUND: "El código no existe.",
  INACTIVE: "El código fue desactivado.",
  REVOKED: "El código fue revocado.",
  EXPIRED: "El código venció.",
  BUDGET_EXCEEDED: "El código ya agotó su presupuesto de queries.",
};

export function requireApiKey() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawKey = req.header("x-api-key");
    if (!rawKey) {
      res.status(401).json({ error: "Falta el header x-api-key." });
      return;
    }

    const { validateApiKey } = await import("./api-key.js");
    const result = await validateApiKey(rawKey);
    if (!result.ok) {
      res.status(401).json({ error: `x-api-key inválida: ${REASON_MESSAGES[result.reason]}` });
      return;
    }

    req.apiKey = result.key;
    next();
  };
}
