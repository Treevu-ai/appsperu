import { describe, expect, it } from "vitest";
import { decodeCsvBuffer } from "../ingest/decode-csv.js";

describe("decodeCsvBuffer", () => {
  it("decodifica Latin-1 (la codificación real del CSV de MINAM, verificado 2026-10-19)", () => {
    // Bytes reales de la fuente: `Ñ` = 0xD1, sin secuencias multibyte UTF-8.
    const latin1 = Buffer.from([
      0x44, 0x49, 0x53, 0x54, 0x52, 0x49, 0x54, 0x4f, 0x3b, // "DISTRITO;"
      0x42, 0x41, 0xd1, 0x4f, 0x53, // "BAÑOS"
      0x3b,
      0x46, 0x45, 0x52, 0x52, 0x45, 0xd1, 0x41, 0x46, 0x45, // "FERREÑAFE"
    ]);
    const texto = decodeCsvBuffer(latin1);
    expect(texto).toBe("DISTRITO;BAÑOS;FERREÑAFE");
    expect(texto).not.toContain("\uFFFD");
  });

  it("decodifica tildes Latin-1 (Á = 0xC1, Ó = 0xD3, Í = 0xCD)", () => {
    const latin1 = Buffer.from([0x43, 0x4f, 0x4e, 0x53, 0x54, 0x49, 0x54, 0x55, 0x43, 0x49, 0xd3, 0x4e]); // "CONSTITUCIÓN"
    expect(decodeCsvBuffer(latin1)).toBe("CONSTITUCIÓN");
  });

  it("deja el UTF-8 intacto si la fuente cambia de codificación", () => {
    const utf8 = Buffer.from("DISTRITO;BAÑOS;NEPEÑA\n", "utf-8");
    expect(decodeCsvBuffer(utf8)).toBe("DISTRITO;BAÑOS;NEPEÑA\n");
  });

  it("no produce caracteres de reemplazo en una línea de cabecera completa", () => {
    const cabecera =
      "FECHA_CORTE;UBIGEO;ANIO;DEPARTAMENTO;PROVINCIA;DISTRITO;REGION_NATURAL";
    const buffer = Buffer.from(cabecera, "latin1");
    expect(decodeCsvBuffer(buffer)).toBe(cabecera);
  });
});
