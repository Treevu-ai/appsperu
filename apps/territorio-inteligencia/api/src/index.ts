import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4047);
const app = createApp();

app.listen(port, () => {
  console.log(`Territorio Inteligencia API escuchando en http://localhost:${port}`);
});
