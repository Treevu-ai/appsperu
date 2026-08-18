import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4004);
const app = createApp();

app.listen(port, () => {
  console.log(`CEPLAN Estratégico API escuchando en http://localhost:${port}`);
});
