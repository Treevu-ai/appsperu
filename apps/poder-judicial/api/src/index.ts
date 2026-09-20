import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4028);
const app = createApp();

app.listen(port, () => {
  console.log(`Poder Judicial API escuchando en http://localhost:${port}`);
});
