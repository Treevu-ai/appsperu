import express, { type ErrorRequestHandler } from "express";
import { cemRouter } from "./routes/cem.js";
import { chat100Router } from "./routes/chat100.js";
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
  app.use("/api/cem", cemRouter);
  app.use("/api/chat100", chat100Router);

  app.use(errorHandler);

  return app;
}
