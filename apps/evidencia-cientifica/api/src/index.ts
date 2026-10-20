import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4100);
const app = createApp();

app.listen(port, () => {
  console.log(`Evidencia científica API escuchando en http://localhost:${port}`);
});
