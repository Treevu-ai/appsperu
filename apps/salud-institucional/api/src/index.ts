import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4007);
const app = createApp();

app.listen(port, () => {
  console.log(`Salud institucional API escuchando en http://localhost:${port}`);
});
