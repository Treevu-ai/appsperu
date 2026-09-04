import express, { type ErrorRequestHandler } from "express";
import { apiRateLimit, corsMiddleware, helmetMiddleware } from "./lib/security.js";
import { pool } from "./db/pool.js";
import { layersRouter } from "./routes/layers.js";
import { territoriesRouter } from "./routes/territories.js";
import { infrastructureRouter } from "./routes/infrastructure.js";
import { crossrefRouter } from "./routes/crossref.js";
import { denominadoresRouter } from "./routes/denominadores.js";
import { patrimonioRouter } from "./routes/patrimonio.js";

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
  app.use("/api/layers", layersRouter);
  app.use("/api/territories", territoriesRouter);
  app.use("/api/infrastructure", infrastructureRouter);
  app.use("/api/crossref", crossrefRouter);
  app.use("/api/denominadores", denominadoresRouter);
  app.use("/api/patrimonio", patrimonioRouter);

  app.use(errorHandler);
  return app;
}
