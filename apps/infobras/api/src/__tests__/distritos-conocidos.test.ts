import { describe, expect, it } from "vitest";
import { DISTRITOS_POR_DEPARTAMENTO, distritoEsSospechoso } from "../ingest/distritos-conocidos.js";

describe("distritoEsSospechoso", () => {
  it("marca como sospechosos los 3 casos reales encontrados en Pataz (DQ-14, 2026-09-08)", () => {
    // Los 7 obras reales traían "ANDAHUAYLILLAS"/"CCARHUAYO" (distritos reales
    // de Quispicanchi, Cusco) o "TURPAY" (variante mal escrita de "URPAY") en
    // vez del distrito real (confirmado por el nombre de la obra y la
    // entidad ejecutora) — ver docs/TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md, DQ-14.
    expect(distritoEsSospechoso("LA LIBERTAD", "ANDAHUAYLILLAS")).toBe(true);
    expect(distritoEsSospechoso("LA LIBERTAD", "CCARHUAYO")).toBe(true);
    expect(distritoEsSospechoso("LA LIBERTAD", "TURPAY")).toBe(true);
  });

  it("no marca un distrito real de La Libertad", () => {
    expect(distritoEsSospechoso("LA LIBERTAD", "URPAY")).toBe(false);
    expect(distritoEsSospechoso("LA LIBERTAD", "HUAYLILLAS")).toBe(false);
    expect(distritoEsSospechoso("LA LIBERTAD", "TRUJILLO")).toBe(false);
  });

  it("es insensible a mayúsculas/minúsculas y a espacios extra", () => {
    expect(distritoEsSospechoso("la libertad", "urpay")).toBe(false);
    expect(distritoEsSospechoso(" LA LIBERTAD ", " URPAY ")).toBe(false);
  });

  it("nunca marca cuando el distrito está ausente — ausencia de dato no es sospecha", () => {
    expect(distritoEsSospechoso("LA LIBERTAD", null)).toBe(false);
  });

  it("no marca nada cuando no hay catálogo para el departamento — ausencia de chequeo, no 'verificado'", () => {
    expect(distritoEsSospechoso("DEPARTAMENTO INEXISTENTE", "CUALQUIER COSA")).toBe(false);
  });

  it("el catálogo de LA LIBERTAD tiene exactamente 83 distritos (total oficial INEI)", () => {
    expect(DISTRITOS_POR_DEPARTAMENTO["LA LIBERTAD"].size).toBe(83);
  });

  it("cubre los 25 departamentos/región constitucional del Perú", () => {
    expect(Object.keys(DISTRITOS_POR_DEPARTAMENTO)).toHaveLength(25);
  });
});
