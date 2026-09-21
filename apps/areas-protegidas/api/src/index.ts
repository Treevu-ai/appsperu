import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4032);
const app = createApp();

app.listen(port, () => {
  console.log(`Áreas Protegidas API escuchando en http://localhost:${port}`);
});
