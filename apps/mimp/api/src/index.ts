import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4019);
const app = createApp();

app.listen(port, () => {
  console.log(`MIMP API escuchando en http://localhost:${port}`);
});
