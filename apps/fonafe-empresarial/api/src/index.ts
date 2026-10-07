import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4043);
const app = createApp();

app.listen(port, () => {
  console.log(`FONAFE Empresarial API escuchando en http://localhost:${port}`);
});
