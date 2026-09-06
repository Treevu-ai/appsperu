import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4016);
const app = createApp();

app.listen(port, () => {
  console.log(`Actividad empresarial API escuchando en http://localhost:${port}`);
});
