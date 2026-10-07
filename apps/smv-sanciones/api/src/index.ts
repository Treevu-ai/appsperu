import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4044);
const app = createApp();

app.listen(port, () => {
  console.log(`SMV Sanciones API escuchando en http://localhost:${port}`);
});
