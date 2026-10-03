/**
 * Tests de las fórmulas puras del Índice de Vulnerabilidad Portuaria (v1 y v2-tráfico).
 * Movidos fuera de __tests__/vulnerabilidad.test.ts: ese archivo entero se salta sin
 * DATABASE_URL (importa el router, que importa el pool al tope del módulo), así que CI
 * (que no define DATABASE_URL) nunca corría estos tests pese a que no tocan la DB.
 */
import { describe, expect, it } from "vitest";
import { calcularScoreVulnerabilidad, calcularScoreVulnerabilidadTrafico } from "../lib/vulnerabilidad-scoring.js";

describe("calcularScoreVulnerabilidad (v1)", () => {
  it("calcula el score correctamente para un terminal en buenas condiciones", () => {
    // estado:Bueno=10*0.25=2.5 + concesion:true=5*0.20=1.0 + alcance:Nacional=5*0.15=0.75
    // + ambito:Marítimo=15*0.10=1.5 + geo:true=0*0.10=0 → 5.75
    const resultado = calcularScoreVulnerabilidad({
      estadoConservacion: "Bueno",
      esConcesionado: true,
      alcance: "Nacional",
      ambito: "Marítimo",
      tieneGeolocalizacion: true,
    });

    expect(resultado.score).toBe(5.75);
    expect(resultado.componentes.estadoConservacion).toBe(10);
    expect(resultado.componentes.esConcesionado).toBe(5);
    expect(resultado.componentes.alcance).toBe(5);
    expect(resultado.componentes.ambito).toBe(15);
    expect(resultado.componentes.tieneGeolocalizacion).toBe(0);
  });

  it("calcula score alto para un terminal en mal estado sin geo", () => {
    // estado:Malo=50*0.25=12.5 + concesion:false=30*0.20=6.0 + alcance:Local=25*0.15=3.75
    // + ambito:null=15*0.10=1.5 + geo:false=20*0.10=2.0 → 25.75
    const resultado = calcularScoreVulnerabilidad({
      estadoConservacion: "Malo",
      esConcesionado: false,
      alcance: "Local",
      ambito: null,
      tieneGeolocalizacion: false,
    });

    expect(resultado.score).toBe(25.75);
    expect(resultado.componentes.tieneGeolocalizacion).toBe(20);
  });
});

describe("calcularScoreVulnerabilidadTrafico (v2)", () => {
  it("suma los componentes de volumen/variación al score v1", () => {
    // v1 (mismo terminal del primer test) = 5.75; volumen:75*0.20=15; variacion:50*0.10=5 → 25.75
    const resultado = calcularScoreVulnerabilidadTrafico({
      estadoConservacion: "Bueno",
      esConcesionado: true,
      alcance: "Nacional",
      ambito: "Marítimo",
      tieneGeolocalizacion: true,
      volumenScore: 75,
      variacionScore: 50,
    });

    expect(resultado.score).toBe(25.75);
    expect(resultado.componentes.volumenHistorico).toBe(75);
    expect(resultado.componentes.variacion3Anios).toBe(50);
    expect(resultado.componentes.estadoConservacion).toBe(10);
  });

  it("no penaliza con un default alto cuando no hay match (null)", () => {
    // sin match en el histórico APN: debe quedar igual al score v1 puro (5.75), no inflado.
    const resultado = calcularScoreVulnerabilidadTrafico({
      estadoConservacion: "Bueno",
      esConcesionado: true,
      alcance: "Nacional",
      ambito: "Marítimo",
      tieneGeolocalizacion: true,
      volumenScore: null,
      variacionScore: null,
    });

    expect(resultado.score).toBe(5.75);
    expect(resultado.componentes.volumenHistorico).toBeNull();
    expect(resultado.componentes.variacion3Anios).toBeNull();
  });
});
