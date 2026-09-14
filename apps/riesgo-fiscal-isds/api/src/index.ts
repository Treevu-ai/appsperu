import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4027);
const app = createApp();

app.listen(port, () => {
  console.log(`Riesgo fiscal ISDS API escuchando en http://localhost:${port}`);
});
