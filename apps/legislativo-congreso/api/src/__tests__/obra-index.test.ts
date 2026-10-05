/**
 * Tests del índice invertido que sostiene el cruce.
 *
 * El comportamiento anterior: la estrategia previa armaba
 * `nombre_obra ILIKE $2 OR ...` con una cláusula por keyword del periodo y
 * truncaba en 500 por `codigo_infobras`. Aquí se fija lo que la reemplazó.
 */

import { describe, expect, it } from "vitest";

import { construirIndiceObras, puntuarProyecto } from "../crossref/obra-index.js";
import { extractKeywords } from "../lib/keyword-matcher.js";

const OBRAS = [
  { codigo_infobras: "O1", nombre_obra: "CONSTRUCCION DE OBRAS PUBLICAS" },
  { codigo_infobras: "O2", nombre_obra: "SANEAMIENTOS DE AGUA POTABLE" },
  { codigo_infobras: "O3", nombre_obra: "CREACION DE LOS SERVICIOS DE SALUD" },
  { codigo_infobras: "O4", nombre_obra: "MEJORAMIENTO DEL SERVICIO DE MOVILIDAD PEATONAL" },
];

describe("construirIndiceObras", () => {
  it("indexa por token completo, no por subcadena", () => {
    const indice = construirIndiceObras(OBRAS);

    expect(indice.postings.has("creacion")).toBe(true);
    expect(indice.postings.has("crea")).toBe(false);
    // "PUBLICAS" se singulariza a "publica", que es la forma del título.
    expect(indice.postings.has("publica")).toBe(true);
    expect(indice.postings.has("public")).toBe(false);
  });

  it("singulariza al indexar, así que obra y título convergen", () => {
    const indice = construirIndiceObras(OBRAS);
    // "SANEAMIENTOS" se indexa como "saneamiento", que es la forma del título.
    expect(indice.postings.get("saneamiento")).toEqual([1]);
  });

  it("excluye el boilerplate administrativo del nombre de la obra", () => {
    const indice = construirIndiceObras([
      { codigo_infobras: "X", nombre_obra: "MEJORAMIENTO EN EL DISTRITO DE SAN MARTIN PROVINCIA DEPARTAMENTO" },
    ]);

    for (const token of ["distrito", "provincia", "departamento"]) {
      expect(indice.postings.has(token)).toBe(false);
    }
    expect(indice.postings.has("mejoramiento")).toBe(true);
  });

  it("cuenta una obra una sola vez por token aunque lo repita", () => {
    const indice = construirIndiceObras([
      { codigo_infobras: "X", nombre_obra: "MEJORAMIENTO MEJORAMIENTO Y MEJORAMIENTO" },
    ]);
    expect(indice.postings.get("mejoramiento")).toEqual([0]);
  });

  it("asigna IDF descendente: raro pesa más que común", () => {
    const indice = construirIndiceObras(OBRAS);
    // "peatonal" aparece en 1 de 4 obras; "servicio" (SERVICIOS + SERVICIO) en 2.
    const raro = indice.idf.get("peatonal")!;
    const comun = indice.idf.get("servicio")!;
    expect(raro).toBeGreaterThan(comun);
  });

  it("un departamento vacío no rompe", () => {
    const indice = construirIndiceObras([]);
    expect(indice.obras).toEqual([]);
    expect(indice.postings.size).toBe(0);
    expect(puntuarProyecto(indice, ["obras"], { umbralMinimo: 0.3, matchedMinimo: 1 })).toEqual([]);
  });
});

describe("puntuarProyecto", () => {
  const indice = construirIndiceObras(OBRAS);

  it("devuelve el score como fracción de keywords del proyecto", () => {
    const cruces = puntuarProyecto(indice, ["obras", "publicas"], { umbralMinimo: 0.5, matchedMinimo: 1 });

    expect(cruces).toHaveLength(1);
    expect(cruces[0].obraIndex).toBe(0);
    expect(cruces[0].matched).toBe(2);
    expect(cruces[0].keywords.sort()).toEqual(["obras", "publicas"]);
  });

  it("aplica matchedMinimo además del umbral", () => {
    // 2 de 2 = 1.0 sobre O3 ("CREACION ... SALUD").
    expect(puntuarProyecto(indice, ["creacion", "salud"], { umbralMinimo: 0.3, matchedMinimo: 1 }))
      .toHaveLength(1);
    expect(puntuarProyecto(indice, ["creacion", "salud"], { umbralMinimo: 0.3, matchedMinimo: 2 }))
      .toHaveLength(1);
  });

  it("matchedMinimo descarta la coincidencia mínima aunque el score alcance el umbral", () => {
    // 1 de 2 = 0.5, que pasa el umbral 0.3 pero no llega a 2 keywords. Es el
    // caso dominante en la ingesta real, y el que justificaba el parámetro.
    expect(puntuarProyecto(indice, ["peatonal", "inexistente"], { umbralMinimo: 0.3, matchedMinimo: 1 }))
      .toHaveLength(1);
    expect(puntuarProyecto(indice, ["peatonal", "inexistente"], { umbralMinimo: 0.3, matchedMinimo: 2 }))
      .toHaveLength(0);
  });

  it("descarta por umbral de fracción", () => {
    // 1 de 2 = 0.5
    expect(puntuarProyecto(indice, ["salud", "inexistente"], { umbralMinimo: 0.6, matchedMinimo: 1 }))
      .toHaveLength(0);
    expect(puntuarProyecto(indice, ["salud", "inexistente"], { umbralMinimo: 0.5, matchedMinimo: 1 }))
      .toHaveLength(1);
  });

  it("cuenta contra las keywords deduplicadas que entrega extractKeywords", () => {
    // El índice confía en que la lista venga deduplicada: `extractKeywords` ya
    // lo garantiza.
    const keywords = extractKeywords("Ley de salud y salud");
    expect(keywords).toEqual(["ley", "salud"]);

    const cruces = puntuarProyecto(indice, keywords, { umbralMinimo: 0.5, matchedMinimo: 1 });
    const sobreObraCreacion = cruces.find((c) => c.obraIndex === 2)!;
    expect(sobreObraCreacion.matched).toBe(1);
    expect(sobreObraCreacion.keywords).toEqual(["salud"]);
  });

  it("no matchea por subcadena", () => {
    expect(puntuarProyecto(indice, ["crea"], { umbralMinimo: 0.3, matchedMinimo: 1 })).toHaveLength(0);
  });

  it("devuelve vacío si el proyecto no aporta keywords", () => {
    expect(puntuarProyecto(indice, [], { umbralMinimo: 0, matchedMinimo: 1 })).toHaveLength(0);
  });

  it("acumula el IDF de las keywords coincidentes", () => {
    const conPez = construirIndiceObras([
      { codigo_infobras: "A", nombre_obra: "SANEAMIENTO DE AGUA" },
      { codigo_infobras: "B", nombre_obra: "SANEAMIENTO DE AGUA Y CANAL" },
      { codigo_infobras: "C", nombre_obra: "SANEAMIENTO DE AGUA, CANAL Y DRENAJE" },
      { codigo_infobras: "D", nombre_obra: "PUENTE PEATONAL" },
    ]);
    const cruces = puntuarProyecto(conPez, ["saneamiento"], { umbralMinimo: 0.5, matchedMinimo: 1 });

    // "saneamiento" aparece en 3 de 4 obras y "puente" en 1 de 4.
    const saneamiento = cruces.find((c) => c.obraIndex === 0)!.idfSum;
    const puente = puntuarProyecto(conPez, ["puente"], { umbralMinimo: 0.5, matchedMinimo: 1 })[0].idfSum;
    expect(puente).toBeGreaterThan(saneamiento);
  });
});
