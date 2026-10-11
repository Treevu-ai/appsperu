import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4049);
const app = createApp();

app.listen(port, () => {
  console.log(`Pérdida de Bosque API escuchando en http://localhost:${port}`);
});
