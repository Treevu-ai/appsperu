import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4011);
const app = createApp();

app.listen(port, () => {
  console.log(`BCRP comercio exterior API escuchando en http://localhost:${port}`);
});
