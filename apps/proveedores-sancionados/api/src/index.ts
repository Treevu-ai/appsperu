import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4008);
const app = createApp();

app.listen(port, () => {
  console.log(`Proveedores sancionados API escuchando en http://localhost:${port}`);
});
