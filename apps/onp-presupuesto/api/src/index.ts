import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4046);
const app = createApp();

app.listen(port, () => {
  console.log(`ONP Presupuesto API escuchando en http://localhost:${port}`);
});
