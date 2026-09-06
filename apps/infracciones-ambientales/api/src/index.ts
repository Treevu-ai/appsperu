import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4023);
const app = createApp();

app.listen(port, () => {
  console.log(`Infracciones Ambientales API escuchando en http://localhost:${port}`);
});
