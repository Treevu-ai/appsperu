/**
 * Tests de las fórmulas puras del Índice de Vulnerabilidad Portuaria (v1 y v2-tráfico).
 * Movidos fuera de __tests__/vulnerabilidad.test.ts: ese archivo entero se salta sin
 * DATABASE_URL (importa el router, que importa el pool al tope del módulo), así que CI
 * (que no define DATABASE_URL) nunca corría estos tests pese a que no tocan la DB.
 */
import { describe, expect, it } from "vitest";
import {
  calcularScoreVulnerabilidad,
  calcularScoreVulnerabilidadTrafico,
  calcularScoreVulnerabilidadV3,
  PESOS_V3,
} from "../lib/vulnerabilidad-scoring.js";

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

describe("PESOS_V3", () => {
  it("suma exactamente 1.00 — si no, el score v3 no está en una escala 0-100 real", () => {
    const suma = Object.values(PESOS_V3).reduce((acc, p) => acc + p, 0);
    expect(Math.round(suma * 10000) / 10000).toBe(1);
  });
});

describe("calcularScoreVulnerabilidadV3", () => {
  it("normaliza cada componente a [0,1] antes de ponderar, no suma crudos como v1/v2", () => {
    // Mismo terminal "mejor caso" de v1 (Bueno/concesionado/Nacional/Marítimo/geo) + mismo
    // volumen/variación que el test de v2 (75/50), sin match TBML (null → contribuye 0).
    // A mano: 10/75*.1932 + 5/30*.1545 + 5/25*.1159 + 15/20*.0773 + 0/20*.0773
    //        + 75/75*.1545 + 50/75*.0773 + 0*.15 = 0.338698... * 100 = 33.87
    const resultado = calcularScoreVulnerabilidadV3({
      estadoConservacion: "Bueno",
      esConcesionado: true,
      alcance: "Nacional",
      ambito: "Marítimo",
      tieneGeolocalizacion: true,
      volumenScore: 75,
      variacionScore: 50,
      tbmlScore: null,
    });

    expect(resultado.score).toBeCloseTo(33.87, 1);
    expect(resultado.componentes.tbmlCrudo).toBeNull();
  });

  it("un terminal con la mitad de su valor FOB anómalo (tbmlScore=50) sube el score frente al mismo terminal sin match", () => {
    const sinMatch = calcularScoreVulnerabilidadV3({
      estadoConservacion: "Bueno",
      esConcesionado: true,
      alcance: "Nacional",
      ambito: "Marítimo",
      tieneGeolocalizacion: true,
      volumenScore: 75,
      variacionScore: 50,
      tbmlScore: null,
    });
    const conTbml = calcularScoreVulnerabilidadV3({
      estadoConservacion: "Bueno",
      esConcesionado: true,
      alcance: "Nacional",
      ambito: "Marítimo",
      tieneGeolocalizacion: true,
      volumenScore: 75,
      variacionScore: 50,
      tbmlScore: 50,
    });

    // 50/100 * peso tbml (0.15) = +7.5 puntos exactos frente al caso sin match.
    expect(conTbml.score - sinMatch.score).toBeCloseTo(7.5, 1);
  });

  it("un geo=false penaliza proporcionalmente menos que en v1/v2 porque su peso nominal (7.73%) es chico frente al 10% original", () => {
    const conGeo = calcularScoreVulnerabilidadV3({
      estadoConservacion: "Bueno", esConcesionado: true, alcance: "Nacional", ambito: "Marítimo",
      tieneGeolocalizacion: true, volumenScore: 0, variacionScore: 0, tbmlScore: 0,
    });
    const sinGeo = calcularScoreVulnerabilidadV3({
      estadoConservacion: "Bueno", esConcesionado: true, alcance: "Nacional", ambito: "Marítimo",
      tieneGeolocalizacion: false, volumenScore: 0, variacionScore: 0, tbmlScore: 0,
    });

    // geo crudo pasa de 0 a 20 (max 20) → normalizado 0→1, peso 0.0773 → +7.73 puntos.
    expect(sinGeo.score - conGeo.score).toBeCloseTo(7.73, 1);
  });
});
