import { runProjectsSectorialIngest } from "./ingest-projects-sectorial.js";

runProjectsSectorialIngest()
  .then((summary) => {
    console.log(
      `${summary.layerName} (${summary.infraType}): ${summary.accepted} aceptados, ${summary.rejected} rechazados`
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error en ingest:projects-sectorial:", err);
    process.exit(1);
  });
