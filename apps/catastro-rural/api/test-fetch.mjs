import { normalizeMidagri, LAYER_NAMES } from "./src/ingest/normalize-midagri.js";

async function test() {
  const res = await fetch(
    "https://georural.midagri.gob.pe/geoservicios/rest/services/public/Catastro_Rural/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultOffset=0&resultRecordCount=1000&f=json"
  );
  console.log("Fetch status:", res.status);
  const payload = await res.json();
  console.log("Features:", payload.features?.length, "exceeded:", payload.exceededTransferLimit);
  
  const { rows, rejected } = normalizeMidagri(payload.features ?? [], 0);
  console.log("Normalized rows:", rows.length, "rejected:", rejected.length);
  if (rows.length > 0) {
    console.log("Sample row:", JSON.stringify(rows[0], null, 2).slice(0, 500));
  }
}

test().catch(console.error);