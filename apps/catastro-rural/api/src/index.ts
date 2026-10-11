import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4032);
const app = createApp();

app.listen(port, () => {
  console.log(`Catastro Rural API escuchando en http://localhost:${port}`);
});