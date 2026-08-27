import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4010);
const app = createApp();

app.listen(port, () => {
  console.log(`Seguridad ciudadana API escuchando en http://localhost:${port}`);
});
