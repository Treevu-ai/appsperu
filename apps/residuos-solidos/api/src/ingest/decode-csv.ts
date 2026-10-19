/**
 * Decodificación del CSV de MINAM/PNDA.
 *
 * El archivo está en Latin-1/ISO-8859-1 (verificado 2026-10-19: 0 secuencias multibyte
 * UTF-8 en los 1,32 MB; `Ñ` aparece como byte crudo 0xD1 — `BAÑOS`, `FERREÑAFE`,
 * `NEPEÑA`…). Decodificarlo como UTF-8 convertía esos bytes en U+FFFD y dejaba
 * 222 filas / 48 nombres de distrito dañados en la base (`PU?OS` por `PUÑOS`).
 *
 * Se decide por contenido: si el buffer no es UTF-8 válido se lee como Latin-1, así si
 * la fuente algún día se publica en UTF-8 sigue funcionando.
 */
export function decodeCsvBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString("utf-8");
  return Buffer.from(utf8, "utf-8").equals(buffer) ? utf8 : buffer.toString("latin1");
}
