import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import express from "express";
import { intersectionsRouter } from "./routes/intersections.js";
import { ruralCommunitiesRouter } from "./routes/rural-communities.js";
import { pool } from "./db/pool.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Demasiadas solicitudes. Intentar en 1 minuto." },
    })
  );

  // Health
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/readyz", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not ready" });
    }
  });

  // Rutas
  app.use("/api/cruce", intersectionsRouter);
  app.use("/api/communities", ruralCommunitiesRouter);

  // 404 catch-all
  app.use((_req, res) => res.status(404).json({ error: "No encontrado." }));

  // Error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Error interno." });
  });

  return app;
}
