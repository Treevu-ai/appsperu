import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4030);
const app = createApp();

app.listen(port, () => {
  console.log(`Legislativo Congreso API escuchando en http://localhost:${port}`);
});
