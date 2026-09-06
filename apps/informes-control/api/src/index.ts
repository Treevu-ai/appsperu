import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4017);
const app = createApp();

app.listen(port, () => {
  console.log(`Informes de control API escuchando en http://localhost:${port}`);
});
