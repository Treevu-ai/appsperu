import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4029);
const app = createApp();

app.listen(port, () => {
  console.log(`Violencia Escolar API escuchando en http://localhost:${port}`);
});
