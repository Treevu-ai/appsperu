import express, { type ErrorRequestHandler } from "express";
import { reclamosRouter } from "./routes/reclamos.js";
import { traficoRouter } from "./routes/trafico.js";
import { recaudacionRouter } from "./routes/recaudacion.js";
import { pool } from "./db/pool.js";
import { apiRateLimit, corsMiddleware, helmetMiddleware } from "./lib/security.js";

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
  app.get("/readyz", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ready", database: "ok" });
    } catch {
      res.status(503).json({ status: "not_ready", database: "unavailable" });
    }
  });

  app.use("/api", apiRateLimit);
  app.use("/api/reclamos", reclamosRouter);
  app.use("/api/trafico", traficoRouter);
  app.use("/api/recaudacion", recaudacionRouter);

  app.use(errorHandler);

  return app;
}
