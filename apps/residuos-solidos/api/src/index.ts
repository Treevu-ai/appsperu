import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4025);
const app = createApp();

app.listen(port, () => {
  console.log(`Residuos Sólidos API escuchando en http://localhost:${port}`);
});
