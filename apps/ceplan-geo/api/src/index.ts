import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4005);
const app = createApp();

app.listen(port, () => {
  console.log(`CEPLAN Geo API escuchando en http://localhost:${port}`);
});
