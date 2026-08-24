import express, { type ErrorRequestHandler } from "express";
import { scoreRouter } from "./routes/score.js";
import { apiRateLimit, corsMiddleware, helmetMiddleware } from "./lib/security.js";
import { ejecucionPool } from "./db/ejecucion-pool.js";
import { infobrasPool } from "./db/infobras-pool.js";
import { inversionesPool } from "./db/inversiones-pool.js";
import { comprasPool } from "./db/compras-pool.js";
import { fiscalPool } from "./db/fiscal-pool.js";

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
      await Promise.all([
        ejecucionPool.query("SELECT 1"),
        infobrasPool.query("SELECT 1"),
        inversionesPool.query("SELECT 1"),
        comprasPool.query("SELECT 1"),
        fiscalPool.query("SELECT 1"),
      ]);
      res.json({ status: "ready", dependencies: "ok" });
    } catch {
      res.status(503).json({ status: "not_ready", dependencies: "unavailable" });
    }
  });

  app.use("/api", apiRateLimit);
  app.use("/api/score", scoreRouter);

  app.use(errorHandler);

  return app;
}
