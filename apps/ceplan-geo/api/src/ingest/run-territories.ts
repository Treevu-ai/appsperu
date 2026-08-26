import { runTerritoriesIngest } from "./ingest-territories.js";

runTerritoriesIngest()
  .then((summaries) => {
    for (const summary of summaries) {
      console.log(
        `${summary.layerName}: ${summary.accepted} features aceptados, ${summary.rejected} rechazados, ${summary.territoriesUpserted} territorios`
      );
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error en ingest:territories:", err);
    process.exit(1);
  });
