import { runInfrastructureIngest } from "./ingest-infrastructure.js";

runInfrastructureIngest()
  .then((summaries) => {
    for (const summary of summaries) {
      console.log(
        `${summary.layerName} (${summary.infraType}): ${summary.accepted} aceptados, ${summary.rejected} rechazados`
      );
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error en ingest:infrastructure:", err);
    process.exit(1);
  });
