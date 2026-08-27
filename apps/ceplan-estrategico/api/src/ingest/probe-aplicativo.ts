import { pathToFileURL } from "node:url";
import { probeAplicativoCeplan } from "../lib/aplicativo-probe.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  probeAplicativoCeplan()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.perEntityAvailable ? 0 : 1;
    })
    .catch((error) => {
      console.error("Probe aplicativo CEPLAN falló:", error);
      process.exitCode = 1;
    });
}
