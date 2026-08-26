import { runDiscovery } from "./discovery.js";

runDiscovery()
  .then((summary) => {
    console.log(`Discovery completado: ${summary.discovered} capas descubiertas, ${summary.upserted} registradas.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error en discovery:", err);
    process.exit(1);
  });
