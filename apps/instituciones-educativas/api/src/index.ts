import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4022);
const app = createApp();

app.listen(port, () => {
  console.log(`Instituciones Educativas API escuchando en http://localhost:${port}`);
});
