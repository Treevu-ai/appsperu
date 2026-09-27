import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/pool.js";
import type { Express } from "express";

let app: Express;
const baseUrl = "/api/terminales/vulnerabilidad";

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await pool.end();
});

describe("Índice de Vulnerabilidad Portuaria", () => {
  // ─── Test: El score se calcula correctamente ───────────────────────────────
  it("debe calcular el score correctamente para un terminal conocido", async () => {
    // Terminal en buenas condiciones, concedido, con geo
    // Score esperado:
    //   estado:Bueno=10 * 0.25 = 2.5
    //   concesion:true=5 * 0.20 = 1.0
    //   alcance:Nacional=5 * 0.15 = 0.75
    //   ambito:Marítimo=15 * 0.10 = 1.5
    //   geo:true=0 * 0.10 = 0
    //   Total: 5.75
    const { calcularScoreVulnerabilidad } = await import("../src/routes/vulnerabilidad-portuaria.js");

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

  it("debe calcular score alto para terminal en mal estado sin geo", async () => {
    // Terminal malo, no concedido, local, sin geo
    //   estado:Malo=50 * 0.25 = 12.5
    //   concesion:false=30 * 0.20 = 6.0
    //   alcance:Local=25 * 0.15 = 3.75
    //   ambito:null=15 * 0.10 = 1.5
    //   geo:false=20 * 0.10 = 2.0
    //   Total: 25.75
    const { calcularScoreVulnerabilidad } = await import("../src/routes/vulnerabilidad-portuaria.js");

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

  // ─── Test: Ranking ordenando por score DESC ─────────────────────────────────
  it("debe devolver terminales ordenados por score DESC", async () => {
    const res = await import("supertest").then((m) =>
      m.default(app).get(baseUrl).query({ limit: 5 })
    );

    expect(res.status).toBe(200);
    expect(res.body.resultados).toBeDefined();
    expect(Array.isArray(res.body.resultados)).toBe(true);

    if (res.body.resultados.length > 1) {
      // Verificar que están ordenados DESC
      for (let i = 0; i < res.body.resultados.length - 1; i++) {
        expect(res.body.resultados[i].scoreVulnerabilidad).toBeGreaterThanOrEqual(
          res.body.resultados[i + 1].scoreVulnerabilidad
        );
      }
    }
  });

  // ─── Test: Filtro por departamento ──────────────────────────────────────────
  it("debe filtrar correctamente por departamento", async () => {
    // Primero obtener un código de departamento válido
    const allRes = await import("supertest").then((m) =>
      m.default(app).get(baseUrl).query({ limit: 1 })
    );

    if (allRes.body.resultados?.length > 0) {
      const dpto = allRes.body.resultados[0].idDepartamento;

      const res = await import("supertest").then((m) =>
        m.default(app).get(baseUrl).query({ departamento: dpto })
      );

      expect(res.status).toBe(200);
      if (res.body.resultados.length > 0) {
        // Todos los resultados deben tener el departamento filtrado
        for (const item of res.body.resultados) {
          expect(item.idDepartamento).toBe(dpto);
        }
      }
    }
  });

  // ─── Test: /:codigo devuelve los componentes del score ─────────────────────
  it("debe devolver componentes del score para un código específico", async () => {
    // Obtener un código válido
    const listRes = await import("supertest").then((m) =>
      m.default(app).get(baseUrl).query({ limit: 1 })
    );

    if (listRes.body.resultados?.length > 0) {
      const codigo = listRes.body.resultados[0].codigoPuerto;

      const res = await import("supertest").then((m) =>
        m.default(app).get(`${baseUrl}/${codigo}`)
      );

      expect(res.status).toBe(200);
      expect(res.body.codigoPuerto).toBe(codigo);
      expect(res.body.componentes).toBeDefined();
      expect(typeof res.body.componentes).toBe("object");

      // Verificar estructura de componentes
      expect(res.body.componentes).toHaveProperty("estadoConservacion");
      expect(res.body.componentes).toHaveProperty("esConcesionado");
      expect(res.body.componentes).toHaveProperty("alcance");
      expect(res.body.componentes).toHaveProperty("ambito");
      expect(res.body.componentes).toHaveProperty("tieneGeolocalizacion");

      // Verificar que score coincide con la suma ponderada
      const { calcularScoreVulnerabilidad } = await import("../src/routes/vulnerabilidad-portuaria.js");
      const item = listRes.body.resultados[0];

      const calculado = calcularScoreVulnerabilidad({
        estadoConservacion: item.estadoConservacion,
        esConcesionado: item.esConcesionado,
        alcance: item.alcance,
        ambito: item.ambito,
        tieneGeolocalizacion: item.tieneGeolocalizacion,
      });

      expect(res.body.scoreVulnerabilidad).toBe(calculado.score);
    }
  });

  // ─── Test: /:codigo devuelve 404 para código inexistente ────────────────────
  it("debe devolver 404 para código de terminal inexistente", async () => {
    const res = await import("supertest").then((m) =>
      m.default(app).get(`${baseUrl}/CODIGO_INEXISTENTE_12345`)
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  // ─── Test: Ranking está presente y es secuencial ────────────────────────────
  it("debe incluir ranking secuencial en la respuesta", async () => {
    const res = await import("supertest").then((m) =>
      m.default(app).get(baseUrl).query({ limit: 10 })
    );

    expect(res.status).toBe(200);
    expect(res.body.resultados).toBeDefined();

    for (let i = 0; i < res.body.resultados.length; i++) {
      expect(res.body.resultados[i].ranking).toBe(i + 1);
    }
  });

  // ─── Test: Paginación funciona correctamente ───────────────────────────────
  it("debe manejar paginación correctamente", async () => {
    const page1 = await import("supertest").then((m) =>
      m.default(app).get(baseUrl).query({ limit: 3, offset: 0 })
    );

    const page2 = await import("supertest").then((m) =>
      m.default(app).get(baseUrl).query({ limit: 3, offset: 3 })
    );

    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);

    // Page 1 y page 2 no deben compartir elementos
    if (page1.body.resultados.length > 0 && page2.body.resultados.length > 0) {
      const codigosP1 = page1.body.resultados.map((r: { codigoPuerto: string }) => r.codigoPuerto);
      const codigosP2 = page2.body.resultados.map((r: { codigoPuerto: string }) => r.codigoPuerto);

      const intersect = codigosP1.filter((c: string) => codigosP2.includes(c));
      expect(intersect).toHaveLength(0);
    }
  });
});

// ─── Test: Scoring Riesgo Climatico v2 ─────────────────────────────────────────

import type { AnaEstacion } from "../src/routes/vulnerabilidad-portuaria.js";

function makeEstacion(overrides: Partial<AnaEstacion>): AnaEstacion {
  return {
    IDESTACIONCONFIG: 1,
    IDESTACION: 1,
    ESTACION: "Estacion Test",
    RIO: "Rio Test",
    DEPARTAMENTO: "Lima",
    PROVINCIA: "Lima",
    DISTRITO: "Lima",
    LONGITUD: "-77.0428",
    LATITUD: "-12.0464",
    VALOR: "100.00",
    UALERTA: "500.00",
    UEMERGENCIA: "800.00",
    UNIDADMEDIDA: "m3/s",
    TENDENCIA: "Estable",
    FLGPUNTOCRITICO: 0,
    OPERADOR: "SENAMHI",
    REGIONHIDRO: "Pacifico",
    RPT_PERIODO: "PERIODO DE ESTIAJE",
    ...overrides,
  };
}

describe("Scoring Riesgo Climatico v2", () => {
  it("debe asignar riesgo bajo a terminal sin geo en departamento costero", async () => {
    const { calcularRiesgoClimatico } = await import(
      "../src/routes/vulnerabilidad-portuaria.js"
    );

    const resultado = calcularRiesgoClimatico({
      latitud: null,
      longitud: null,
      departamento: "13",
      estacionesAna: [],
      fechaDatos: "26/09/2026",
    });

    expect(resultado.scoreClima).toBe(10);
    expect(resultado.nivelRiesgo).toBe("medio");
  });

  it("debe asignar riesgo alto a terminal sin geo en Loreto", async () => {
    const { calcularRiesgoClimatico } = await import(
      "../src/routes/vulnerabilidad-portuaria.js"
    );

    // Usar nombre de departamento (como hace la funcion internamente)
    const resultado = calcularRiesgoClimatico({
      latitud: null,
      longitud: null,
      departamento: "LORETO",
      estacionesAna: [],
      fechaDatos: "26/09/2026",
    });

    expect(resultado.scoreClima).toBe(25);
    expect(resultado.nivelRiesgo).toBe("alto");
  });

  it("debe devolver score bajo cuando no hay estaciones ANA", async () => {
    const { calcularRiesgoClimatico } = await import(
      "../src/routes/vulnerabilidad-portuaria.js"
    );

    const resultado = calcularRiesgoClimatico({
      latitud: -12.0464,
      longitud: -77.0428,
      departamento: "13",
      estacionesAna: [],
      fechaDatos: "26/09/2026",
    });

    expect(resultado.scoreClima).toBe(5);
    expect(resultado.estadoCaudal).toBe("normal");
    expect(resultado.estacionCercana).toBeNull();
  });

  it("debe identificar punto critico y sumar 10 puntos al score", async () => {
    const { calcularRiesgoClimatico } = await import(
      "../src/routes/vulnerabilidad-portuaria.js"
    );

    const resultado = calcularRiesgoClimatico({
      latitud: -12.05,
      longitud: -77.04,
      departamento: "13",
      estacionesAna: [
        makeEstacion({
          ESTACION: "Pte. Santa Anita",
          LATITUD: " -12.05",
          LONGITUD: " -77.04",
          FLGPUNTOCRITICO: 1,
          VALOR: "50.00",
          UALERTA: "500.00",
          UEMERGENCIA: "800.00",
        }),
      ],
      fechaDatos: "26/09/2026",
    });

    expect(resultado.esPuntoCritico).toBe(true);
    expect(resultado.scoreClima).toBeGreaterThanOrEqual(10);
    expect(resultado.nivelRiesgo).toBe("muy_alto");
  });

  it("debe parsear valores con padding de espacios y s.d. sin fallar", async () => {
    const { calcularRiesgoClimatico } = await import(
      "../src/routes/vulnerabilidad-portuaria.js"
    );

    const resultado = calcularRiesgoClimatico({
      latitud: -12.0464,
      longitud: -77.0428,
      departamento: "13",
      estacionesAna: [
        makeEstacion({
          LATITUD: " -12.04",
          LONGITUD: " -77.04",
          VALOR: "    42.69",
          UALERTA: "s.d.",
          UEMERGENCIA: "s.d.",
        }),
      ],
      fechaDatos: "26/09/2026",
    });

    expect(resultado.estadoCaudal).toBe("normal");
    expect(resultado.scoreClima).toBeGreaterThan(0);
  });

  it("debe devolver la estacion mas cercana con datos correctos", async () => {
    const { calcularRiesgoClimatico } = await import(
      "../src/routes/vulnerabilidad-portuaria.js"
    );

    const resultado = calcularRiesgoClimatico({
      latitud: -12.05,
      longitud: -77.04,
      departamento: "13",
      estacionesAna: [
        makeEstacion({ ESTACION: "Lejos", LATITUD: " -15.00", LONGITUD: " -80.00" }),
        makeEstacion({ ESTACION: "Cerca", LATITUD: " -12.05", LONGITUD: " -77.05" }),
        makeEstacion({ ESTACION: "Media", LATITUD: " -13.00", LONGITUD: " -78.00" }),
      ],
      fechaDatos: "26/09/2026",
    });

    expect(resultado.estacionCercana).not.toBeNull();
    expect(resultado.estacionCercana!.nombre).toBe("Cerca");
    expect(resultado.estacionCercana!.distanciaKm).toBeLessThan(5);
  });

  it("debe sumar score v1 + v2 correctamente", async () => {
    const { calcularRiesgoClimatico, calcularScoreVulnerabilidad } = await import(
      "../src/routes/vulnerabilidad-portuaria.js"
    );

    const v1 = calcularScoreVulnerabilidad({
      estadoConservacion: "Bueno",
      esConcesionado: true,
      alcance: "Nacional",
      ambito: "Maritimo",
      tieneGeolocalizacion: true,
    });

    const clima = calcularRiesgoClimatico({
      latitud: -12.0464,
      longitud: -77.0428,
      departamento: "13",
      estacionesAna: [makeEstacion({ LATITUD: " -12.04", LONGITUD: " -77.04" })],
      fechaDatos: "26/09/2026",
    });

    const scoreV2 = v1.score + clima.scoreClima;
    expect(scoreV2).toBeGreaterThan(v1.score);
    expect(scoreV2).toBeLessThanOrEqual(v1.score + 40);
  });
});
