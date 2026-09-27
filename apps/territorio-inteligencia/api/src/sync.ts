import { syncMinamDeforestacion } from "./connectors/minam-deforestacion.connector.js";

async function main() {
  try {
    await syncMinamDeforestacion();
    console.log("Sincronización exitosa.");
    process.exit(0);
  } catch (e) {
    console.error("Sincronización fallida:", e);
    process.exit(1);
  }
}

main();
