import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4034);
const app = createApp();

app.listen(port, () => {
  console.log(`Catastro Forestal API escuchando en http://localhost:${port}`);
});
