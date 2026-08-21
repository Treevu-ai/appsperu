import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4006);
const app = createApp();

app.listen(port, () => {
  console.log(`Identidad fiscal API escuchando en http://localhost:${port}`);
});
