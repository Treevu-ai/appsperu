import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Envuelve un handler async para que un rechazo (ej. una query de Postgres
 * que falla) llegue al middleware de errores de Express en vez de convertirse
 * en un unhandled rejection que tumba todo el proceso (mismo bug real ya
 * encontrado y corregido en radar-inversiones/api).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
