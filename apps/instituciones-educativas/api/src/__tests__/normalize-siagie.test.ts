import { describe, expect, it } from "vitest";
import { normalizeTrayectoria } from "../ingest/normalize-siagie.js";

describe("normalizeTrayectoria", () => {
  // Fila real confirmada 2026-09-21 contra el CSV 2024 (sin discapacidad).
  function realRow2024(overrides: Record<string, unknown> = {}) {
    return {
      cod_mod: "1506",
      anexo: "0",
      Nombre: "LOS LUCEROS",
      gestion: "Pública de gestión directa",
      id_nivel: "A5",
      dsc_nivel: "Inicial no escolarizado",
      Edad: "5.0",
      TipoDiscaIntegrada: "",
      TotalEstudiantes: "2",
      Discapacidad: "0",
      Mujer: "1",
      Hombre: "1",
      Venezolanos: "0",
      Peruanos: "2",
      Extranjeros: "0",
      DNI_validado: "2",
      DNI_SinValidar: "0",
      No_DNI: "0",
      Aprobado: "0",
      Desaprobado: "0",
      Retirado: "0",
      Fallecido: "0",
      RequiereRecuperacion: "0",
      Matriculado: "2",
      PostergaEvaluacion: "0",
      tot_atraso: "0",
      ...overrides,
    };
  }

  it("normaliza una fila real del CSV 2024 (con Desaprobado, sin PromocionGuiada)", () => {
    const { rows, rejected } = normalizeTrayectoria([realRow2024()], 2024);
    expect(rejected).toEqual([]);
    expect(rows[0]).toMatchObject({
      anio: 2024,
      codMod: "1506",
      anexo: "0",
      edad: 5,
      tipoDiscaIntegrada: "",
      totalEstudiantes: 2,
      desaprobado: 0,
      promocionGuiada: null,
    });
  });

  it("normaliza una fila real del CSV 2021 (con PromocionGuiada, sin Desaprobado -- desvío de esquema real entre años)", () => {
    const row2021 = realRow2024();
    delete (row2021 as Record<string, unknown>).Desaprobado;
    (row2021 as Record<string, unknown>).PromocionGuiada = "1";

    const { rows } = normalizeTrayectoria([row2021], 2021);
    expect(rows[0].desaprobado).toBeNull();
    expect(rows[0].promocionGuiada).toBe(1);
  });

  it("preserva tipoDiscaIntegrada distinto como filas separadas (misma escuela/nivel/edad, distinta discapacidad)", () => {
    const sinDisca = realRow2024({ TotalEstudiantes: "4", Mujer: "0", Hombre: "4" });
    const conDisca = realRow2024({ TipoDiscaIntegrada: "TEA", TotalEstudiantes: "1", Discapacidad: "1", Mujer: "0", Hombre: "1" });

    const { rows } = normalizeTrayectoria([sinDisca, conDisca], 2024);
    expect(rows).toHaveLength(2);
    expect(rows[0].tipoDiscaIntegrada).toBe("");
    expect(rows[1].tipoDiscaIntegrada).toBe("TEA");
  });

  it("rechaza una fila sin cod_mod", () => {
    const { rows, rejected } = normalizeTrayectoria([realRow2024({ cod_mod: "" })], 2024);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/cod_mod/);
  });

  it("rechaza una fila sin anexo", () => {
    const { rows, rejected } = normalizeTrayectoria([realRow2024({ anexo: "" })], 2024);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/anexo/);
  });

  it("trata un conteo numérico ausente como 0, no como error", () => {
    const row = realRow2024();
    delete (row as Record<string, unknown>).Fallecido;
    const { rows } = normalizeTrayectoria([row], 2024);
    expect(rows[0].fallecido).toBe(0);
  });
});
