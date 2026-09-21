import express, { type ErrorRequestHandler } from "express";
import { municipalidadesRouter } from "./routes/municipalidades.js";
import { equipamientoRouter } from "./routes/equipamiento.js";
import { crossrefRouter } from "./routes/crossref.js";
import { pool } from "./db/pool.js";
import { inversionesPool } from "./db/inversiones-pool.js";
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
      // GET /api/crossref depende de inversionesPool además del pool propio de renamu -- un
      // /readyz que solo probara `pool` reportaría "ready" con ese cruce roto (hallazgo real
      // de CodeRabbit en PR #177).
      await Promise.all([pool.query("SELECT 1"), inversionesPool.query("SELECT 1")]);
      res.json({ status: "ready", database: "ok" });
    } catch {
      res.status(503).json({ status: "not_ready", database: "unavailable" });
    }
  });

  app.use("/api", apiRateLimit);
  app.use("/api/municipalidades", municipalidadesRouter);
  app.use("/api/equipamiento", equipamientoRouter);
  app.use("/api/crossref", crossrefRouter);

  app.use(errorHandler);

  return app;
}
