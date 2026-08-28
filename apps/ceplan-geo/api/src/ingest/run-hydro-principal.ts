import { runHydroPrincipalIngest } from "./ingest-hydro-principal.js";

runHydroPrincipalIngest()
  .then((summary) => {
    console.log(
      `${summary.layerName} (${summary.infraType}): ${summary.accepted} aceptados, ${summary.rejected} rechazados`
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error en ingest:hydro-principal:", err);
    process.exit(1);
  });
