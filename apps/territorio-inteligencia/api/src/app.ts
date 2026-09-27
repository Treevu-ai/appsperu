import express, { type ErrorRequestHandler } from "express";
import { titularesRiesgoRouter } from "./routes/titulares-riesgo.js";
import { capturaTerritorioRouter } from "./routes/captura-territorio.js";
import { inconsistenciaPresupuestoRouter } from "./routes/inconsistencia-presupuesto.js";
import { riesgoEUDRRouter } from "./routes/riesgo-eudr.js";
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
  app.use("/api/titulares-riesgo", titularesRiesgoRouter);
  app.use("/api/captura-territorio", capturaTerritorioRouter);
  app.use("/api/inconsistencia-presupuesto", inconsistenciaPresupuestoRouter);
  app.use("/api/riesgo-eudr", riesgoEUDRRouter);

  app.use(errorHandler);

  return app;
}
