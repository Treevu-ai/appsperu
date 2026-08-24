import express, { type ErrorRequestHandler } from "express";
import { executionRouter } from "./routes/execution.js";
import { benchmarkRouter } from "./routes/benchmark.js";
import { metaRouter } from "./routes/meta.js";
import { proyectosRouter } from "./routes/proyectos.js";
import { lluviasRouter } from "./routes/lluvias.js";
import { sectorsRouter } from "./routes/sectors.js";
import { careServicesRouter } from "./routes/care-services.js";
import { foodRouter } from "./routes/food.js";
import { infrastructureRouter } from "./routes/infrastructure.js";
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
  app.use("/api/execution", executionRouter);
  app.use("/api/benchmark", benchmarkRouter);
  app.use("/api/meta", metaRouter);
  app.use("/api/proyectos", proyectosRouter);
  app.use("/api/lluvias", lluviasRouter);
  app.use("/api/sectores", sectorsRouter);
  app.use("/api/servicios-cuidados/alimentacion", foodRouter);
  app.use("/api/servicios-cuidados", careServicesRouter);
  app.use("/api/infraestructura", infrastructureRouter);

  // Debe ir al final: sin esto, un rechazo dentro de un handler async
  // se vuelve un unhandled rejection que tumba el proceso entero en vez
  // de devolver un 500 (bug real encontrado en radar-inversiones).
  app.use(errorHandler);

  return app;
}
