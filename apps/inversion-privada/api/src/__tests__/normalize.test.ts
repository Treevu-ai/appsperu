import { describe, expect, it } from "vitest";
import {
  departamentoMatches,
  normalizeDepartamentoQuery,
  normalizeVertixProject,
  type VertixApiProject,
} from "../ingest/normalize.js";

const sampleProject: VertixApiProject = {
  Id: 509,
  Slug: "509-red-vial",
  TipoProyecto: "APP",
  IdTipoProyecto: 25299,
  Nombre: "Red vial Nº 5",
  NombreCorto: "Red vial",
  Estado: "En Ejecución Contractual",
  Fase: "Ejecución Contractual",
  IdFase: 104,
  Titular: "MINISTERIO DE TRANSPORTES Y COMUNICACIONES",
  Sector: "Transporte",
  Cartera: "Vial",
  Modalidad: "Autofinanciada",
  ModalidadContractual: "Contrato de Concesión",
  Iniciativa: "Iniciativa Estatal",
  MontoInversionSIGV: 61.4,
  MontoProyecto: "US$ 61.40",
  GreenBrownfield: "Greenfield",
  BuenaProPrevista: "24/05/2002",
  AnhoConcesion: 25,
  url_thumb: "https://example.com/thumb.png",
  url_geo: "",
};

describe("normalizeVertixProject", () => {
  it("normaliza campos y enriquece departamentos desde el índice", () => {
    const deptIndex = new Map<number, string[]>([[509, ["13", "15"]]]);
    const row = normalizeVertixProject(sampleProject, deptIndex);

    expect(row).toMatchObject({
      vertixId: 509,
      tipoProyecto: "APP",
      montoInversionSigv: 61.4,
      anhoConcesion: 25,
      departamentosInei: ["13", "15"],
      departamentos: ["LA LIBERTAD", "LIMA"],
      urlGeo: null,
    });
  });

  it("deja departamentos vacíos si el proyecto no aparece en el índice", () => {
    const row = normalizeVertixProject(sampleProject, new Map());
    expect(row.departamentos).toEqual([]);
    expect(row.departamentosInei).toEqual([]);
  });
});

describe("departamentoMatches", () => {
  it("compara departamentos sin acentos y en mayúsculas", () => {
    const row = normalizeVertixProject(sampleProject, new Map([[509, ["13"]]]));
    expect(departamentoMatches(row, "la libertad")).toBe(true);
    expect(departamentoMatches(row, "LIMA")).toBe(false);
  });
});

describe("normalizeDepartamentoQuery", () => {
  it("normaliza texto de búsqueda", () => {
    expect(normalizeDepartamentoQuery("La Libertad")).toBe("LA LIBERTAD");
  });
});
