/**
 * Paridad entre el matcher del handler MCP y el de la app.
 *
 * `mcp-server` duplica el matcher porque su `rootDir: src` impide importar
 * código de fuera sin romper el bundle del Worker — la misma razón por la que
 * `src/db/latest-budget.ts` duplica el CTE de `packages/shared-queries`
 * (ADR-0019). Estos tests son la red que hace segura esa duplicación.
 *
 * Los tests están fuera del build (`tsconfig.json` los excluye), así que sí
 * pueden importar la app; los handlers no.
 *
 * La paridad importa más desde el rewrite del índice invertido: el algoritmo
 * tiene más superficie que puede divergir sin que otra prueba lo note (tabla de
 * sufijos plurales, stopwords, tokens administrativos excluidos del índice).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  extractKeywords as extractKeywordsApp,
  tokenize as tokenizeApp,
  findMatchedKeywords as findMatchedKeywordsApp,
  calculateMatchScore as calculateMatchScoreApp,
} from "../../../apps/legislativo-congreso/api/src/lib/keyword-matcher.js";
import {
  construirIndiceObras,
  puntuarProyecto,
} from "../../../apps/legislativo-congreso/api/src/crossref/obra-index.js";
import { list, proyecto } from "../handlers/legislativo-congreso/cruces.js";
import { getPoolForApp } from "../db/neon-env.js";
import type { ToolHandlerContext } from "../handlers/registry.js";

vi.mock("../db/neon-env.js", () => ({ getPoolForApp: vi.fn() }));

const dbQuery = vi.fn();
const infobrasQuery = vi.fn();
const getPool = vi.mocked(getPoolForApp);

function proyectoRow(overrides: Record<string, unknown> = {}) {
  return {
    per_par_id: 2026,
    pley_num: 1234,
    proyecto_ley: "PL-01234",
    estado: "en comision",
    fecha_presentacion: "2026-03-01",
    titulo: "Ley de obras publicas",
    proponente: "Congresista",
    autores: null,
    ...overrides,
  };
}

function obraRow(nombreObra = "Construccion de obras publicas", overrides: Record<string, unknown> = {}) {
  return {
    codigo_infobras: "OBR-001",
    codigo_entidad: "ENT-001",
    entidad_nombre: "Municipalidad",
    nombre_obra: nombreObra,
    modalidad_ejecucion: "administracion directa",
    naturaleza_obra: "construccion",
    estado_ejecucion: "en ejecucion",
    nivel_gobierno: "municipal",
    sector_entidad: "urbanismo",
    cui: "123456",
    nombre_inversion: null,
    monto_viable: "1000.5",
    costo_actualizado: "1500",
    departamento: "LA LIBERTAD",
    provincia: "TRUJILLO",
    distrito: "TRUJILLO",
    avance_fisico_real_pct: "45.5",
    ejecucion_financiera_pct: "30",
    existe_paralizacion: false,
    causal_paralizacion: null,
    fecha_paralizacion: null,
    dias_paralizado: null,
    ...overrides,
  };
}

function ctx(args: Record<string, unknown>): ToolHandlerContext {
  // Estos handlers solo usan db, args y env.
  return { db: { query: dbQuery }, args, env: {} } as unknown as ToolHandlerContext;
}

beforeEach(() => {
  dbQuery.mockReset();
  infobrasQuery.mockReset();
  getPool.mockReset();
  getPool.mockReturnValue({ query: infobrasQuery } as never);
});

/** Corpus que ejercita acentos, plurales, fragmentos y boilerplate. */
const TITULOS = [
  "Ley que crea la Universidad Nacional de Ciencias de la Salud",
  "LEY DE FORTALECIMIENTO DE LA GESTIÓN INTEGRAL DE RESIDUOS SÓLIDOS",
  "Ley de saneamiento de aguas residuales",
  "Ley que declara de interés nacional el mejoramiento de caminos vecinales",
  "Proyecto de ley 12345 de presupuestos 2026",
  "LEY DE LA MOVILIDAD PEATONAL",
];

const NOMBRES_OBRA = [
  "CREACION DE LOS SERVICIOS DE SALUD DEL PUESTO DE SALUD DEL CASERIO",
  "MEJORAMIENTO DE LA GESTION INTEGRAL DE LOS RESIDUOS SOLIDOS EN EL DISTRITO",
  "SANEAMIENTOS DE AGUA POTABLE Y ALCANTARILLADO",
  "RENOVACION DE VIAS VECINALES DEL DISTRITO DE SAN MARTIN PROVINCIA",
  "CREACION E INSTATALACION DEL SERVICIO DEL SISTEMA DE ALCANTARILLADO",
  "MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA EN TRANSITABILIDAD PEATONAL",
];

describe("paridad app ↔ MCP: tokenización y matching", () => {
  it("'crea' no matchea 'CREACION'", () => {
    const keywords = extractKeywordsApp("Ley que crea la Universidad Nacional de Ciencias de la Salud");
    expect(findMatchedKeywordsApp(keywords, "CREACION DE LOS SERVICIOS DE SALUD")).toEqual(["salud"]);
    expect(calculateMatchScoreApp(["crea"], "CREACION")).toBe(0);
  });

  it("singulariza plurales", () => {
    expect(findMatchedKeywordsApp(["saneamiento"], "SANEAMIENTOS DE AGUA POTABLE")).toEqual(["saneamiento"]);
  });

  it("el handler MCP tampoco matchea 'crea' contra 'CREACION'", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow({ titulo: TITULOS[0] })] });
    infobrasQuery.mockResolvedValueOnce({ rows: [obraRow(NOMBRES_OBRA[0])] });

    // Umbral bajo a propósito: el título aporta 5 keywords y solo "salud"
    // coincide (1/5 = 0.2), así que a 0.3 no habría cruce y la prueba no
    // distinguiría "no matchea 'crea'" de "descartado por umbral".
    const res = await list(ctx({ umbral_score: 0.1, matched_minimo: 1 }));

    // El único match es "salud", igual que en la app: 'crea' queda fuera.
    const resultados = (res.body as { resultados: Array<{ matchedKeywords: string[] }> }).resultados;
    expect(resultados.map((r) => r.matchedKeywords)).toEqual([["salud"]]);
  });

  it("el corpus completo tokeniza sin lanzar en ambos lados", () => {
    for (const titulo of TITULOS) {
      expect(tokenizeApp(titulo).length).toBeGreaterThan(0);
      expect(extractKeywordsApp(titulo).length).toBeGreaterThan(0);
    }
  });
});

describe("paridad app ↔ MCP: índice invertido", () => {
  it("el índice de la app excluye el boilerplate administrativo", () => {
    const indice = construirIndiceObras([
      {
        codigo_infobras: "O1",
        nombre_obra: "MEJORAMIENTO DEL DISTRITO PROVINCIA DEPARTAMENTO LA LIBERTAD",
      },
    ]);
    expect(indice.postings.has("distrito")).toBe(false);
    expect(indice.postings.has("provincia")).toBe(false);
    expect(indice.postings.has("departamento")).toBe(false);
    expect(indice.postings.has("mejoramiento")).toBe(true);
  });

  it("el handler MCP tampoco puntúa contra el boilerplate administrativo", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [proyectoRow({ titulo: "Ley que declara distrito provincia departamento" })],
    });
    infobrasQuery.mockResolvedValueOnce({
      rows: [obraRow("MEJORAMIENTO DE LA RED DISTRITO PROVINCIA DEPARTAMENTO LA LIBERTAD")],
    });

    const res = await list(ctx({ umbral_score: 0.3, matched_minimo: 1 }));

    expect((res.body as { total: number }).total).toBe(0);
  });

  it("list coincide con el cálculo de la app sobre el mismo corpus", async () => {
    const proyectos = TITULOS.map((titulo, i) => proyectoRow({ pley_num: 1000 + i, titulo }));
    const obras = NOMBRES_OBRA.map((nombre, i) =>
      obraRow(nombre, { codigo_infobras: `OBR-${String(i).padStart(4, "0")}` })
    );

    dbQuery.mockResolvedValueOnce({ rows: proyectos });
    infobrasQuery.mockResolvedValueOnce({ rows: obras });

    const res = await list(ctx({ umbral_score: 0.3, matched_minimo: 1, limit: 1000 }));
    const delHandler = (res.body as {
      resultados: Array<{ matchScore: number; matchedKeywords: string[]; obra: { codigoInfobras: string } }>;
    }).resultados.map((r) => ({
      codigo: r.obra.codigoInfobras,
      matchScore: r.matchScore,
      kws: r.matchedKeywords,
    }));

    // Réplica del cálculo de la app con su propio índice.
    const indice = construirIndiceObras(
      obras.map((o) => ({ codigo_infobras: o.codigo_infobras, nombre_obra: o.nombre_obra }))
    );
    const esperado: Array<{ codigo: string; matchScore: number; kws: string[] }> = [];
    for (const p of proyectos) {
      const keywords = extractKeywordsApp(p.titulo);
      for (const m of puntuarProyecto(indice, keywords, { umbralMinimo: 0.3, matchedMinimo: 1 })) {
        const matchScore = m.matched / keywords.length;
        if (matchScore < 0.3) continue;
        esperado.push({ codigo: obras[m.obraIndex].codigo_infobras, matchScore, kws: m.keywords });
      }
    }

    expect(delHandler.length).toBe(esperado.length);
    const clave = (xs: Array<{ codigo: string; matchScore: number }>) =>
      xs.map((x) => `${x.codigo}:${x.matchScore.toFixed(9)}`).sort();
    expect(clave(delHandler)).toEqual(clave(esperado));

    for (const x of esperado) {
      const y = delHandler.find((d) => d.codigo === x.codigo);
      expect(y?.kws).toEqual(x.kws);
    }
  });

  it("el detalle comparte criterio con la lista", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow({ titulo: TITULOS[5] })] });
    infobrasQuery.mockResolvedValueOnce({
      rows: [obraRow(NOMBRES_OBRA[5], { codigo_infobras: "OBR-0005" })],
    });

    const res = await proyecto(ctx({ periodo: 2026, numero: 1234, umbral_score: 0.3, matched_minimo: 1 }));

    const keywords = extractKeywordsApp(TITULOS[5]);
    const esperado = calculateMatchScoreApp(keywords, NOMBRES_OBRA[5]);
    const r0 = (res.body as { resultados: Array<{ matchScore: number }> }).resultados[0];
    expect(r0.matchScore).toBeCloseTo(esperado, 10);
  });
});
