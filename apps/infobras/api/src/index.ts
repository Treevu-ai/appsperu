import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4003);
const app = createApp();

app.listen(port, () => {
  console.log(`INFOBRAS API escuchando en http://localhost:${port}`);
});
