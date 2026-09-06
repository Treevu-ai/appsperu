import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4024);
const app = createApp();

app.listen(port, () => {
  console.log(`Red Vial Subnacional API escuchando en http://localhost:${port}`);
});
