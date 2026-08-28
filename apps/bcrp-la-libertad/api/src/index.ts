import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4013);
const app = createApp();

app.listen(port, () => {
  console.log(`BCRP La Libertad API escuchando en http://localhost:${port}`);
});
