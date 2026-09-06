import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4020);
const app = createApp();

app.listen(port, () => {
  console.log(`RENAMU API escuchando en http://localhost:${port}`);
});
