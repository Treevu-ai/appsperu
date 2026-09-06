import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4018);
const app = createApp();

app.listen(port, () => {
  console.log(`MINDEF API escuchando en http://localhost:${port}`);
});
