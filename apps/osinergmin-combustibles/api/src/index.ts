import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4039);
const app = createApp();

app.listen(port, () => {
  console.log(`OSINERGMIN Combustibles API escuchando en http://localhost:${port}`);
});
