import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4012);
const app = createApp();

app.listen(port, () => {
  console.log(`Inversión privada (VERTIX) API escuchando en http://localhost:${port}`);
});
