import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4026);
const app = createApp();

app.listen(port, () => {
  console.log(`Infraestructura MTC API escuchando en http://localhost:${port}`);
});
