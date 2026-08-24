import express, { type ErrorRequestHandler } from "express";
import { investmentsRouter } from "./routes/investments.js";
import { crossrefRouter } from "./routes/crossref.js";
import { apiRateLimit, corsMiddleware, helmetMiddleware } from "./lib/security.js";
import { pool } from "./db/pool.js";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("Error no manejado en un request:", err);
  res.status(500).json({ error: "Error interno del servidor." });
};

export function createApp() {
  const app = express();
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/readyz", async (_req, res) => { try { await pool.query("SELECT 1"); res.json({ status: "ready", database: "ok" }); } catch { res.status(503).json({ status: "not_ready", database: "unavailable" }); } });

  app.use("/api", apiRateLimit);
  app.use("/api/investments", investmentsRouter);
  app.use("/api/crossref", crossrefRouter);

  // Debe ir al final: sin esto, un rechazo dentro de un handler async
  // (ej. una query de Postgres que falla) se vuelve un unhandled rejection
  // que tumba el proceso entero en vez de devolver un 500 — nos pasó de
  // verdad con un bug de columna ambigua en /api/crossref.
  app.use(errorHandler);

  return app;
}
