import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4050);
const app = createApp();

app.listen(port, () => {
  console.log(`OSINFOR Sanciones API escuchando en http://localhost:${port}`);
});
