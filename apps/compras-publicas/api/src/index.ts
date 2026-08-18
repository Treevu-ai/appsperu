import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4001);
const app = createApp();

app.listen(port, () => {
  console.log(`Compras públicas API escuchando en http://localhost:${port}`);
});
