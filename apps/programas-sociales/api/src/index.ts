import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4015);
const app = createApp();

app.listen(port, () => {
  console.log(`Programas sociales API escuchando en http://localhost:${port}`);
});
