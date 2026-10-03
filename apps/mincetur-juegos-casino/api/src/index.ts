import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4042);
const app = createApp();

app.listen(port, () => {
  console.log(`MINCETUR Juegos de Casino API escuchando en http://localhost:${port}`);
});
