import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4002);
const app = createApp();

app.listen(port, () => {
  console.log(`Radar de inversiones API escuchando en http://localhost:${port}`);
});
