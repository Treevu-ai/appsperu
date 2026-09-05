import { pool } from "../db/pool.js";
import { ingestBienesMueblesBajaYear } from "./bienes-muebles-baja-connector.js";

const years = process.argv.slice(2).map(Number).filter((y) => y >= 2020 && y <= 2100);
const targetYears = years.length > 0 ? years : [2020, 2021, 2022, 2023, 2024];

(async () => {
  for (const ejercicio of targetYears) {
    const summary = await ingestBienesMueblesBajaYear(ejercicio);
    console.log(`Bienes muebles baja ${ejercicio}:`, summary);
  }
})()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
