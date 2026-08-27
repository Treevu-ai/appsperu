import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const DEFAULT_WEB_ORIGIN = "http://localhost:3010";

function allowedOrigins(): string[] {
  return (process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN).split(",").map((origin) => origin.trim());
}

export const corsMiddleware = cors({ origin: allowedOrigins() });
export const helmetMiddleware = helmet();
export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
