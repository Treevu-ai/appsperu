/**
 * Tests para el matching keyword-based de cruces (proyectos de ley × INFOBRAS).
 */

import { describe, it, expect } from "vitest";
import {
  calculateMatchScore,
  extractCUI,
  extractKeywords,
  findMatchedKeywords,
  jaccardSimilarity,
  normalizeText,
  tokenize,
} from "../lib/keyword-matcher.js";

describe("keyword-matcher", () => {
  describe("normalizeText", () => {
    it("minúsculas y sin diacríticos", () => {
      expect(normalizeText("Obras Públicas")).toBe("obras publicas");
    });

    it("retorna vacío para texto vacío", () => {
      expect(normalizeText("")).toBe("");
    });
  });

  describe("extractKeywords", () => {
    it("extrae palabras clave de un texto simple", () => {
      const keywords = extractKeywords("Ley de obras públicas y infraestructura");
      expect(keywords).toContain("ley");
      expect(keywords).toContain("obras");
      expect(keywords).toContain("publicas");
      expect(keywords).toContain("infraestructura");
      expect(keywords).not.toContain("de");
      expect(keywords).not.toContain("y");
    });

    it("elimina stopwords en español", () => {
      const keywords = extractKeywords("El proyecto de ley para la infraestructura pública");
      expect(keywords).not.toContain("el");
      expect(keywords).not.toContain("de");
      expect(keywords).not.toContain("para");
      expect(keywords).not.toContain("la");
    });

    it("elimina números puros", () => {
      const keywords = extractKeywords("Ley 12345 de presupuestos 2026");
      expect(keywords).not.toContain("12345");
      expect(keywords).not.toContain("2026");
      expect(keywords).toContain("ley");
      expect(keywords).toContain("presupuestos");
    });

    it("elimina palabras cortas (<3 caracteres)", () => {
      const keywords = extractKeywords("Ley de los y a");
      expect(keywords).not.toContain("y");
      expect(keywords).not.toContain("a");
      expect(keywords).toContain("ley");
    });

    it("elimina duplicados", () => {
      expect(extractKeywords("Obras obras infraestructura infraestructura")).toEqual([
        "obras",
        "infraestructura",
      ]);
    });

    it("elimina duplicados por forma canónica, no solo por palabra cruda", () => {
      // "obra" y "obras" singularizan al mismo token: sin dedupe canónico,
      // ambas sobreviven como keywords distintas y en puntuarProyecto cuentan
      // dos coincidencias para una sola palabra, inflando matchScore.
      const keywords = extractKeywords("obra y obras de saneamiento saneamientos");
      expect(keywords).toEqual(["obra", "saneamiento"]);
    });

    it("retorna array vacío para texto vacío", () => {
      expect(extractKeywords("")).toEqual([]);
    });

    it("remueve acentos", () => {
      const keywords = extractKeywords("Construcción y presupuestos");
      expect(keywords).toContain("construccion");
      expect(keywords).toContain("presupuestos");
    });
  });

  describe("calculateMatchScore", () => {
    it("calcula score 1.0 para match perfecto", () => {
      const keywords = ["obras", "publicas", "infraestructura"];
      expect(calculateMatchScore(keywords, "Obras públicas de infraestructura vial")).toBe(1);
    });

    it("calcula score 0.0 para sin match", () => {
      expect(calculateMatchScore(["salud", "educacion"], "Obras públicas de infraestructura")).toBe(0);
    });

    it("calcula score parcial para match parcial", () => {
      const keywords = ["obras", "salud", "educacion"];
      expect(calculateMatchScore(keywords, "Obras públicas de infraestructura")).toBeCloseTo(1 / 3, 2);
    });

    it("retorna 0.0 para keywords vacíos", () => {
      expect(calculateMatchScore([], "cualquier texto")).toBe(0);
    });

    it("el score no depende de los acentos del texto objetivo", () => {
      const keywords = extractKeywords("Ley de obras públicas");
      const conAcentos = calculateMatchScore(keywords, "CONSTRUCCIÓN DE OBRAS PÚBLICAS");
      const sinAcentos = calculateMatchScore(keywords, "CONSTRUCCION DE OBRAS PUBLICAS");
      expect(conAcentos).toBe(sinAcentos);
      expect(conAcentos).toBeGreaterThan(0);
      expect(findMatchedKeywords(keywords, "CONSTRUCCIÓN DE OBRAS PÚBLICAS")).toContain("publicas");
    });
  });

  describe("findMatchedKeywords", () => {
    it("devuelve las keywords presentes en el texto", () => {
      expect(findMatchedKeywords(["obras", "salud"], "Obras de salud")).toEqual(["obras", "salud"]);
    });

    it("ignora keywords ausentes", () => {
      expect(findMatchedKeywords(["obras", "puente"], "Obras de salud")).toEqual(["obras"]);
    });

    it("normaliza ambos lados: acento en el texto no vacía el resultado", () => {
      const keywords = extractKeywords("Ley de obras públicas");
      const matched = findMatchedKeywords(keywords, "Construcción de OBRAS PÚBLICAS");
      expect(matched).toContain("publicas");
    });

    it("retorna vacío para texto objetivo vacío", () => {
      expect(findMatchedKeywords(["obras"], "")).toEqual([]);
    });

    it("no matchea por subcadena: 'crea' no es 'creacion'", () => {
      // Defecto medido contra la ingesta real: con subcadena, la ley "que crea
      // la Universidad Nacional de Ciencias de la Salud" puntuaba 0.40 contra
      // "CREACION DE LOS SERVICIOS DE SALUD". El token 'crea' ya no cuenta;
      // 'salud' sí, porque aparece como palabra completa en ambos textos.
      const keywords = extractKeywords("Ley que crea la Universidad Nacional de Ciencias de la Salud");
      const objetivo = "CREACION DE LOS SERVICIOS DE SALUD DEL PUESTO DE SALUD";
      expect(findMatchedKeywords(keywords, objetivo)).toEqual(["salud"]);
      expect(findMatchedKeywords(["crea"], objetivo)).toEqual([]);
      expect(calculateMatchScore(["crea"], "CREACION")).toBe(0);
    });

    it("no matchea fragmentos dentro de otra palabra", () => {
      // 'partamento' venia de 'departamento' y 'ent' de 'entidad'.
      expect(findMatchedKeywords(["partamento"], "OBRA EN EL DEPARTAMENTO LA LIBERTAD")).toEqual([]);
      expect(findMatchedKeywords(["ent"], "ENTIDAD PRESTADORA MTC")).toEqual([]);
    });

    it("tolera plurales por sufijo, no por prefijo", () => {
      const keywords = extractKeywords("Ley de saneamiento");
      expect(findMatchedKeywords(keywords, "SANEAMIENTOS DE AGUA POTABLE")).toEqual(["saneamiento"]);
      // Y el plural no se resuelve ampliando el prefijo, que es lo que
      // reintroducia el artefacto.
      expect(findMatchedKeywords(["crea"], "CREACION")).toEqual([]);
    });
  });

  describe("tokenize", () => {
    it("devuelve tokens normalizados, singularizados y sin stopwords", () => {
      expect(tokenize("Construcción de las Obras Públicas")).toEqual(["construccion", "obra", "publica"]);
    });

    it("parte por separadores, no solo por espacios", () => {
      expect(tokenize("obras/publicas, CONCLUSION")).toEqual(["obra", "publica", "conclusion"]);
    });

    it("retorna vacío para texto sin tokens utilizables", () => {
      expect(tokenize("de la el")).toEqual([]);
      expect(tokenize("")).toEqual([]);
    });
  });

  describe("jaccardSimilarity", () => {
    it("calcula similitud 1.0 para strings idénticos", () => {
      expect(jaccardSimilarity("Municipalidad de Trujillo", "Municipalidad de Trujillo")).toBe(1);
    });

    it("calcula similitud 0.0 para strings sin palabras en común", () => {
      expect(jaccardSimilarity("Municipalidad de Trujillo", "Gobierno Regional de Piura")).toBe(0);
    });

    it("calcula similitud parcial", () => {
      // "de" se descarta por tener <=2 caracteres: intersección {municipalidad}=1, unión=3
      expect(jaccardSimilarity("Municipalidad de Trujillo", "Municipalidad de Piura")).toBeCloseTo(0.33, 2);
    });

    it("case insensitive", () => {
      expect(jaccardSimilarity("MUNICIPALIDAD DE TRUJILLO", "municipalidad de trujillo")).toBe(1);
    });

    it("remueve acentos", () => {
      expect(jaccardSimilarity("Construcción", "construccion")).toBe(1);
    });
  });

  describe("extractCUI", () => {
    it("extrae CUI de un texto", () => {
      expect(extractCUI("Proyecto CUI 245678 de infraestructura")).toBe("245678");
    });

    it("extrae CUI de 6 dígitos", () => {
      expect(extractCUI("CUI 123456")).toBe("123456");
    });

    it("retorna null para texto sin CUI", () => {
      expect(extractCUI("Proyecto de infraestructura vial")).toBeNull();
    });

    it("retorna null para texto vacío", () => {
      expect(extractCUI("")).toBeNull();
    });

    it("retorna null para null", () => {
      expect(extractCUI(null as unknown as string)).toBeNull();
    });
  });
});