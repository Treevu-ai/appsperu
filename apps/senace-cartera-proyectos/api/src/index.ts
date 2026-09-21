import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4033);
const app = createApp();

app.listen(port, () => {
  console.log(`SENACE Cartera de Proyectos API escuchando en http://localhost:${port}`);
});
