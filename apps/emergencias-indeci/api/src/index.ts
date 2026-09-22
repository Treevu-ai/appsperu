import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4035);
const app = createApp();

app.listen(port, () => {
  console.log(`Emergencias INDECI API escuchando en http://localhost:${port}`);
});
