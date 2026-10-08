import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4048);
const app = createApp();

app.listen(port, () => {
  console.log(`SINADEF Defunciones API escuchando en http://localhost:${port}`);
});
