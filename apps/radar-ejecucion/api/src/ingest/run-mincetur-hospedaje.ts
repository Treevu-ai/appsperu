import { ingestMinceturHospedajeYear } from "./mincetur-hospedaje-connector.js";

const years = process.argv.slice(2).map(Number).filter((y) => y >= 2015 && y <= 2100);
const targetYears = years.length > 0 ? years : [2023, 2024];

(async () => {
  for (const anio of targetYears) {
    const summary = await ingestMinceturHospedajeYear(anio);
    console.log(`MINCETUR hospedaje ${anio}:`, summary);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
