import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4009);
const app = createApp();

app.listen(port, () => {
  console.log(`Actividad agraria API escuchando en http://localhost:${port}`);
});
