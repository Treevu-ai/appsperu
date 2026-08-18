import express, { type ErrorRequestHandler } from "express";
import { publicWorksRouter } from "./routes/public-works.js";
import { crossrefRouter } from "./routes/crossref.js";
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

  app.use("/api", apiRateLimit);
  app.use("/api/public-works", publicWorksRouter);
  app.use("/api/crossref", crossrefRouter);

  // Debe ir al final: sin esto, un rechazo dentro de un handler async
  // se vuelve un unhandled rejection que tumba el proceso entero.
  app.use(errorHandler);

  return app;
}
