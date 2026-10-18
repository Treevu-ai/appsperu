import { inflateRawSync } from "node:zlib";

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_DESCRIPTOR = 0x08074b50;

/**
 * Lee las entradas de un ZIP por sus local file headers. Cubre store (0) y
 * deflate (8). Si el flag bit 3 está activo, el tamaño va en el data
 * descriptor `PK\x07\x08` y solo se acepta cuando el compressed size coincide
 * con los bytes leídos. Un método distinto se rechaza.
 */
export function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let pos = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (pos < 0) throw new Error("No es un zip: falta la firma PK.");
  while (pos + 30 <= buf.length) {
    if (buf.readUInt32LE(pos) !== FIRMA_LOCAL) break;
    const flags = buf.readUInt16LE(pos + 6);
    const method = buf.readUInt16LE(pos + 8);
    let compSize = buf.readUInt32LE(pos + 18);
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const nameStart = pos + 30;
    const name = buf.toString("utf8", nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    let next = dataStart + compSize;
    if (flags & 0x08) {
      // El tamaño viaja después de los datos. El descriptor lleva firma
      // PK\\x07\\x08 y el compressed size tiene que coincidir con los bytes
      // leídos: así no nos quedamos con una firma casual dentro del deflate.
      const hallado = descriptor(buf, dataStart);
      compSize = hallado.compSize;
      next = hallado.next;
    }
    const comp = buf.subarray(dataStart, dataStart + compSize);
    const data = inflar(method, comp, name);
    out.set(name.replaceAll("\\", "/"), data);
    pos = next;
  }
  return out;
}

function descriptor(buf: Buffer, dataStart: number): { compSize: number; next: number } {
  let scan = dataStart;
  while (scan < buf.length) {
    const n = buf.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08]), scan);
    if (n < 0 || buf.readUInt32LE(n) !== FIRMA_DESCRIPTOR) {
      break;
    }
    const compSize = buf.readUInt32LE(n + 8);
    if (compSize === n - dataStart) {
      return { compSize, next: n + 16 };
    }
    scan = n + 4;
  }
  throw new Error("Zip con data descriptor ilegible");
}

function inflar(method: number, comp: Buffer, name: string): Buffer {
  if (method === 0) return Buffer.from(comp);
  if (method === 8) return inflateRawSync(comp);
  throw new Error(`Método zip ${method} no soportado en ${name}`);
}

export function entrada(entries: Map<string, Buffer>, nombre: string): Buffer {
  const data = entries.get(nombre);
  if (!data) throw new Error(`El zip no trae ${nombre}`);
  return data;
}
