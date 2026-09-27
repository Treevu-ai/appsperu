/**
 * __tests__/connectors.test.ts
 *
 * Tests unitarios para Connector 1 (informes-control) y Connector 2 (SEACE)
 */

import { describe, it, expect, vi } from "vitest";

// Los dos conectores importan el pool para sus rutas de ingesta, pero los tests
// de acá solo ejercitan funciones puras. Sin este mock, importar el módulo
// dispara el throw de `db/pool.ts` cuando no hay DATABASE_URL: la suite entera
// moría en CI mientras pasaba en local, donde el `.env` sí la tenía.
vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn(), end: vi.fn() },
}));

import {
  extractComisariaNames,
  extractHallazgos,
} from "../ingest/informes-control-comisarias-extractor.js";
import { classifyEquipamiento, aggregateAwards } from "../ingest/seace-pnp-equipamiento-connector.js";

describe("Connector 1: informes-control-comisarias-extractor", () => {
  describe("extractComisariaNames", () => {
    it("debe extraer comisaría de texto simple", () => {
      const text = "Auditoría realizada a la Comisaría Breña en Lima.";
      const names = extractComisariaNames(text);
      expect(names).toContain("Breña");
    });

    it("debe extraer múltiples comisarías", () => {
      const text = `
        Se auditaron las comisarías de SJL, Breña y Rímac.
        La Comisaría de Los Olivos también fue visitada.
      `;
      const names = extractComisariaNames(text);
      expect(names.length).toBeGreaterThanOrEqual(4);
    });

    it("debe ignorar textos demasiado cortos", () => {
      const text = "Comisaría A.";
      const names = extractComisariaNames(text);
      expect(names.length).toBe(0); // "A" es demasiado corto
    });

    it("debe manejar variantes (Comisarías vs Comisaría)", () => {
      const text = "Auditoría de las comisarías de Ate y Comas.";
      const names = extractComisariaNames(text);
      expect(names.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("extractHallazgos", () => {
    it("debe detectar hallazgos de infraestructura", () => {
      const text =
        "Las celdas están hacinadas al 120% de capacidad. La ventilación es deficiente.";
      const hallazgos = extractHallazgos(text, 2024);
      expect(hallazgos.some((h) => h.hallazgo_tipo === "infraestructura")).toBe(true);
    });

    it("debe detectar hallazgos de personal", () => {
      const text = "El personal es insuficiente para cubrir los 8 distritos asignados.";
      const hallazgos = extractHallazgos(text, 2024);
      expect(hallazgos.some((h) => h.hallazgo_tipo === "personal")).toBe(true);
    });

    it("debe detectar hallazgos de equipamiento", () => {
      const text = "La flota de patrulleros está fuera de servicio. Solo 2 de 8 vehículos operativos.";
      const hallazgos = extractHallazgos(text, 2024);
      expect(hallazgos.some((h) => h.hallazgo_tipo === "equipamiento")).toBe(true);
    });

    it("debe detectar hallazgos de seguridad críticos", () => {
      const text = "Se detectó incomunicabilidad de detenidos durante 48 horas.";
      const hallazgos = extractHallazgos(text, 2024);
      const criticos = hallazgos.filter((h) => h.severity === "critica");
      expect(criticos.length).toBeGreaterThan(0);
    });

    it("debe incluir año en hallazgos", () => {
      const text = "Infraestructura deficiente.";
      const hallazgos = extractHallazgos(text, 2024);
      expect(hallazgos.every((h) => h.anio === 2024)).toBe(true);
    });

    it("debe retornar al menos un hallazgo (placeholder si no encuentra específicos)", () => {
      const text = "Texto genérico sin hallazgos específicos.";
      const hallazgos = extractHallazgos(text, 2024);
      expect(hallazgos.length).toBeGreaterThan(0);
    });
  });
});

describe("Connector 2: seace-pnp-equipamiento-connector", () => {
  describe("classifyEquipamiento", () => {
    it("debe clasificar VEHICULO", () => {
      const subjects = [
        "SUMINISTRO DE 50 PATRULLEROS FORD RANGER",
        "COMPRA DE MOTOCICLETAS POLICIA",
        "ADQUISICION DE AUTO BLINDADO",
      ];
      for (const subject of subjects) {
        expect(classifyEquipamiento(subject)).toBe("VEHICULO");
      }
    });

    it("debe clasificar ARMAMENTO", () => {
      const subjects = [
        "MUNICIONES 9MM 100000 UNIDADES",
        "SUMINISTRO DE PISTOLAS TÁCTICAS",
        "RIFLES DE ASALTO",
      ];
      for (const subject of subjects) {
        expect(classifyEquipamiento(subject)).toBe("ARMAMENTO");
      }
    });

    it("debe clasificar COMUNICACIONES", () => {
      const subjects = [
        "SISTEMA RADIOCOMUNICACION TRONCALIZADO",
        "RADIO COMUNICADORES",
        "CENTRAL TELEFONICA COMISARIA",
      ];
      for (const subject of subjects) {
        expect(classifyEquipamiento(subject)).toBe("COMUNICACIONES");
      }
    });

    it("debe clasificar EQUIPAMIENTO_SEGURIDAD", () => {
      const subjects = [
        "CHALECOS BALISTICOS 10000 UNIDADES",
        "CASCOS TÁCTICOS",
        "GILET ANTIBALAS",
      ];
      for (const subject of subjects) {
        expect(classifyEquipamiento(subject)).toBe("EQUIPAMIENTO_SEGURIDAD");
      }
    });

    it("debe retornar null para subject no clasificable", () => {
      expect(classifyEquipamiento("SUMINISTRO DE PAPEL HIGIENICO")).toBeNull();
    });

    it("debe ser case-insensitive", () => {
      expect(classifyEquipamiento("suministro de patrulleros")).toBe("VEHICULO");
      expect(classifyEquipamiento("MUNICIONES 9mm")).toBe("ARMAMENTO");
    });
  });

  describe("aggregateAwards", () => {
    it("debe agregar awards por (anio, tipo)", () => {
      const awards = [
        {
          id: "1",
          anio: 2024,
          supplier_name: "PNP",
          subject: "PATRULLERO",
          monto_soles: 1000000,
        },
        {
          id: "2",
          anio: 2024,
          supplier_name: "PNP",
          subject: "OTRO PATRULLERO",
          monto_soles: 2000000,
        },
        {
          id: "3",
          anio: 2023,
          supplier_name: "PNP",
          subject: "MUNICIONES",
          monto_soles: 500000,
        },
      ];

      const aggregated = aggregateAwards(awards);
      expect(aggregated.size).toBe(2); // 2024:VEHICULO, 2023:ARMAMENTO
    });

    it("debe sumar montos correctamente", () => {
      const awards = [
        {
          id: "1",
          anio: 2024,
          supplier_name: "PNP",
          subject: "PATRULLERO",
          monto_soles: 1000000,
        },
        {
          id: "2",
          anio: 2024,
          supplier_name: "PNP",
          subject: "OTRO PATRULLERO",
          monto_soles: 2000000,
        },
      ];

      const aggregated = aggregateAwards(awards);
      const entry = Array.from(aggregated.values())[0];
      expect(entry.monto_soles).toBe(3000000);
      expect(entry.cantidad).toBe(2);
    });

    it("debe filtrar awards no clasificables", () => {
      const awards = [
        {
          id: "1",
          anio: 2024,
          supplier_name: "PNP",
          subject: "PATRULLERO",
          monto_soles: 1000000,
        },
        {
          id: "2",
          anio: 2024,
          supplier_name: "PNP",
          subject: "PAPEL HIGIENICO",
          monto_soles: 100000,
        },
      ];

      const aggregated = aggregateAwards(awards);
      expect(aggregated.size).toBe(1); // Solo el patrullero
    });

    it("debe retornar mapa vacío si no hay awards clasificables", () => {
      const awards = [
        {
          id: "1",
          anio: 2024,
          supplier_name: "PNP",
          subject: "ARTICULOS VARIOS",
          monto_soles: 100000,
        },
      ];

      const aggregated = aggregateAwards(awards);
      expect(aggregated.size).toBe(0);
    });
  });
});
