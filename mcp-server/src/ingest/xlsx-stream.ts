import { open } from "node:fs/promises";
import { createInflateRaw } from "node:zlib";

/** Callback por cada fila de datos (ya sin el encabezado), con el XML crudo de la fila. */
export type RowHandler = (rowXml: string) => void;

/**
 * Lector streaming de la hoja principal de un `.xlsx`, sin cargar el archivo en
 * memoria ni depender de la librería `xlsx`.
 *
 * Por qué existe: los XLSX de "Comercio Exterior de Bienes" de MINCETUR tienen
 * ~630.000 filas y ~680 MB de XML de hoja por año (verificado en vivo:
 * `<dimension ref="A1:R631118"/>`). `XLSX.readFile` necesita el workbook entero
 * en RAM y con esos tamaños devuelve resultados inconsistentes (a veces 0 filas,
 * a veces `Sheets` undefined). Acá se lee la entrada
 * `xl/worksheets/sheet1.xml` directo del ZIP y se infla por chunks.
 *
 * Implementación: se recorren los local file headers hasta encontrar la entrada
 * de la hoja y desde ahí se alimenta un `inflateRaw` con los bytes comprimidos
 * del ZIP. La salida inflada se corta por `</row>`; lo que queda entre chunks se
 * arrastra (una fila puede partirse entre dos writes del inflater).
 */
export async function iterSheetRows(
  filePath: string,
  onRow: RowHandler
): Promise<{ filas: number; bytes: number }> {
  const handle = await open(filePath, "r");
  try {
    const head = Buffer.alloc(65536);
    const headRead = await handle.read(head, 0, 65536, 0);
    let dataStart: number | null = null;
    let pos = 0;
    while (pos < headRead.bytesRead) {
      const sig = head.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), pos);
      if (sig < 0) break;
      const nameLen = head.readUInt16LE(sig + 26);
      const extraLen = head.readUInt16LE(sig + 28);
      const name = head.slice(sig + 30, sig + 30 + nameLen).toString("latin1");
      if (name === "xl/worksheets/sheet1.xml") {
        dataStart = sig + 30 + nameLen + extraLen;
        break;
      }
      pos = sig + 4;
    }
    if (dataStart === null) {
      throw new Error(
        `${filePath}: no se encontró la entrada xl/worksheets/sheet1.xml en los primeros 64 KB del ZIP`
      );
    }

    let filas = 0;
    let bytes = 0;
    let pendiente = "";
    let esHeader = true;

    const drenar = (texto: string) => {
      pendiente += texto;
      let corte: number;
      while ((corte = pendiente.indexOf("</row>")) >= 0) {
        const fila = pendiente.slice(0, corte);
        pendiente = pendiente.slice(corte + 6);
        const inicio = fila.indexOf("<row ");
        if (inicio < 0) continue; // `<sheetData>` de apertura u otro markup
        if (esHeader) {
          esHeader = false; // fila 1 = encabezado; se descarta
          continue;
        }
        filas += 1;
        onRow(fila.slice(inicio));
      }
    };

    const inflate = createInflateRaw();
    // Los listeners se adjuntan ANTES de escribir: si se adjuntan después del
    // `end()`, el evento puede haber disparado ya y el await cuelga para siempre.
    const fin = new Promise<void>((resolve, reject) => {
      inflate.on("error", reject);
      inflate.on("close", resolve);
      inflate.on("end", resolve);
    });
    inflate.on("data", (chunk: Buffer) => drenar(chunk.toString("utf8")));

    const chunk = Buffer.alloc(1 << 20);
    let offset = dataStart;
    let eof = false;
    while (!eof) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset);
      if (bytesRead === 0) {
        eof = true;
        inflate.end();
      } else {
        offset += bytesRead;
        bytes += bytesRead;
        if (!inflate.write(chunk.slice(0, bytesRead))) {
          // Backpressure: esperar a que el inflater drene antes de seguir.
          await new Promise<void>((resolve) => inflate.once("drain", resolve));
        }
      }
    }
    await fin;
    // Lo que queda tras el último `</row>` es markup de cierre (</sheetData>…),
    // no una fila: se descarta.
    pendiente = "";

    return { filas, bytes };
  } finally {
    await handle.close();
  }
}
