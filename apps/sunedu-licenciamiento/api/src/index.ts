import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4045);
const app = createApp();

app.listen(port, () => {
  console.log(`SUNEDU Licenciamiento API escuchando en http://localhost:${port}`);
});
