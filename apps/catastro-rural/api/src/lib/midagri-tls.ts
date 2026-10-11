import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import tls from "node:tls";
import { Agent } from "undici";

/**
 * Mismo problema que INGEMMET: `georural.midagri.gob.pe` (y subdominios *.gob.pe)
 * envía solo el certificado hoja sin la CA intermedia ("Sectigo Public Server
 * Authentication CA OV R36"). El bundle de Node no la incluye.
 *
 * Solución: dispatcher de `undici` con CA bundle de Node + CA intermedia de Sectigo
 * (descargada de crt.sh). Se pasa explícitamente a cada `fetch()` del conector.
 */
const CA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "certs",
  "sectigo-public-server-authentication-ca-ov-r36.pem"
);

let cachedDispatcher: Agent | null = null;

export function midagriDispatcher(): Agent {
  if (!cachedDispatcher) {
    const intermediateCa = readFileSync(CA_PATH, "utf-8");
    cachedDispatcher = new Agent({ connect: { ca: [...tls.rootCertificates, intermediateCa] } });
  }
  return cachedDispatcher;
}