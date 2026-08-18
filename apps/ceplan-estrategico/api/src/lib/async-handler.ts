import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Envuelve un handler async para que un rechazo (ej. una query de Postgres
 * que falla) llegue al middleware de errores de Express en vez de convertirse
 * en un unhandled rejection que tumba todo el proceso. Bug real encontrado en
 * radar-inversiones: una columna ambigua en /api/crossref crasheó el
 * servidor completo porque ningún handler async estaba envuelto así.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
