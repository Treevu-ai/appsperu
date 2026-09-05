import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4014);
const app = createApp();

app.listen(port, () => {
  console.log(`Servicios de salud API escuchando en http://localhost:${port}`);
});
