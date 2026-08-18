import express from "express";
import { apiRateLimit, corsMiddleware, helmetMiddleware } from "./lib/security.js";

const app = express();
const PORT = process.env.PORT || 4004;

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json());
app.use("/api", apiRateLimit);

app.get("/", (req, res) => {
  res.json({
    name: "CEPLAN Estratégico API",
    version: "0.1.0",
    status: "running"
  });
});

app.listen(PORT, () => {
  console.log(`CEPLAN Estratégico API corriendo en puerto ${PORT}`);
});
