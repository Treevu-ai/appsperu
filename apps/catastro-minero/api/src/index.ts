import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4031);
const app = createApp();

app.listen(port, () => {
  console.log(`Catastro Minero API escuchando en http://localhost:${port}`);
});
