import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import tls from "node:tls";
import { Agent } from "undici";

/**
 * Hallazgo real de Copilot: el fix anterior (`node --use-system-ca`) requiere Node 22+, pero
 * `.github/workflows/ci.yml` fija Node 20 (`node-version: 20`) — el flag simplemente no existe
 * ahí, así que `npm run ingest:ingemmet` fallaría en el entorno real del proyecto.
 *
 * Causa raíz real (verificada con `openssl s_client -showcerts`): `geocatmin.ingemmet.gob.pe`
 * solo envía su certificado hoja en el handshake TLS, sin la CA intermedia
 * ("Sectigo Public Server Authentication CA OV R36") -- el bundle de CAs que Node empaqueta por
 * defecto no la incluye, así que la cadena no se puede completar (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
 * `curl`/navegadores no fallan porque el almacén de confianza del sistema operativo sí la tiene
 * cacheada (o la busca vía AIA).
 *
 * Fix real, compatible con cualquier Node ≥ 18 (no depende de un flag de CLI específico de
 * versión): se arma un `dispatcher` de `undici` con el CA bundle por defecto de Node
 * (`tls.rootCertificates`) más la CA intermedia real de Sectigo (descargada de crt.sh,
 * `certs/sectigo-public-server-authentication-ca-ov-r36.pem`), y se pasa explícitamente a cada
 * `fetch()` de este conector -- no se toca la configuración TLS global del proceso.
 */
const CA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "certs",
  "sectigo-public-server-authentication-ca-ov-r36.pem"
);

let cachedDispatcher: Agent | null = null;

export function ingemmetDispatcher(): Agent {
  if (!cachedDispatcher) {
    const intermediateCa = readFileSync(CA_PATH, "utf-8");
    cachedDispatcher = new Agent({ connect: { ca: [...tls.rootCertificates, intermediateCa] } });
  }
  return cachedDispatcher;
}
