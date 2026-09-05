import { http, HttpResponse } from "msw";

/**
 * MSW handlers para tests del cliente HTTP. Coinciden con cualquier host
 * (patrón `*`) porque los tests apuntan a localhost:4000-4013 via env vars.
 */

export const handlers = [
  // /health genérico (lo usa /estado)
  http.get("*/health", () => HttpResponse.json({ status: "ok" })),

  // radar-ejecucion meta sources
  http.get("*/api/meta/sources", () =>
    HttpResponse.json({
      items: [
        { runAt: new Date().toISOString(), records: 1234, cobertura: "PARCIAL" },
        { runAt: new Date(Date.now() - 86_400_000).toISOString(), records: 1230, cobertura: "PARCIAL" },
      ],
    }),
  ),

  // radar-ejecucion sector ficha
  http.get("*/api/sectores/:sectorId/ficha", ({ params }) =>
    HttpResponse.json({
      sectorId: params.sectorId,
      anio: 2026,
      pia: 100_000_000,
      pim: 120_000_000,
      devengado: 65_000_000,
      regla: "gobierno-regional-por-funcion v1",
      cobertura: "PARCIAL",
      matcher: "SEC_EJEC exact",
      corte: "2026-08-26",
    }),
  ),

  // radar-ejecucion sector comparativo
  http.get("*/api/sectores/comparativo", () =>
    HttpResponse.json({
      anio: 2026,
      departamento: "LA LIBERTAD",
      resultados: [
        {
          sectorId: "TRANSPORTE",
          sector: "TRANSPORTE",
          entityCode: "831",
          entidad: "GOBIERNO REGIONAL LA LIBERTAD",
          tipoEntidad: "SEDE_EJECUTORA",
          nivelGobierno: "GOBIERNOS REGIONALES",
          reglaTerritorial: "SEDE_EJECUTORA",
          alcance: "Ejecutado por sede regional",
          pia: 250_000_000,
          pim: 320_000_000,
          devengado: 158_000_000,
          saldoPorDevengar: 162_000_000,
          cobertura: { estado: "COMPLETA", fechaCorteParticion: "2026-08-26", registrosParticion: 1820 },
          cortesUsados: ["2026-08-26"],
          recursos: ["mef-pim-devengado"],
        },
        {
          sectorId: "SALUD",
          sector: "SALUD",
          entityCode: "832",
          entidad: "GOBIERNO REGIONAL LA LIBERTAD",
          tipoEntidad: "SEDE_EJECUTORA",
          nivelGobierno: "GOBIERNOS REGIONALES",
          reglaTerritorial: "SEDE_EJECUTORA",
          alcance: "Ejecutado por sede regional",
          pia: 380_000_000,
          pim: 410_000_000,
          devengado: 198_000_000,
          saldoPorDevengar: 212_000_000,
          cobertura: { estado: "COMPLETA", fechaCorteParticion: "2026-08-26", registrosParticion: 940 },
          cortesUsados: ["2026-08-26"],
          recursos: ["mef-pim-devengado"],
        },
      ],
      limitation:
        "El comparativo muestra responsabilidades distintas. No suma Gobierno Nacional dirigido al departamento y Gobierno Regional ejecutado por sede como un único presupuesto.",
    }),
  ),

  // radar-ejecucion benchmark
  http.get("*/api/benchmark/:entityCode", ({ params }) => {
    const code = String(params.entityCode);
    // Para el entity 831 (transporte) → ok, percentil 60
    // Para el 999 (inexistente) → 404 lo capturaría antes, pero aquí devolvemos datos_insuficientes
    if (code === "999") {
      return HttpResponse.json({
        entityCode: code,
        anioFiscal: 2026,
        status: "datos_insuficientes",
        n: 2,
        minRequerido: 5,
        criterios: "nivel_gobierno=GOBIERNOS REGIONALES, funcion=*, regla=gobierno-regional-por-funcion v1",
        fechaCorte: "2026-08-26",
      });
    }
    return HttpResponse.json({
      entityCode: code,
      anioFiscal: 2026,
      status: "ok",
      n: 25,
      percentil: 60,
      medianaAvancePct: 49.5,
      criterios: "nivel_gobierno=GOBIERNOS REGIONALES, funcion=*, regla=gobierno-regional-por-funcion v1",
      exclusiones: "Entidades con PIM = 0 excluidas del cálculo de avance.",
      fechaCorte: "2026-08-26",
    });
  }),

  // identidad-fiscal contribuyente
  http.get("*/api/contribuyentes/:ruc", ({ params }) =>
    HttpResponse.json({
      value: {
        ruc: params.ruc,
        razonSocial: "CONSTRUCTORA EJEMPLO S.A.C.",
        estado: "ACTIVO",
        condicion: "HABIDO",
        ubigeo: "130101",
      },
      fuente: "identidad-fiscal",
      cobertura: "COMPLETA",
      matcher: "ruc exact",
      corte: "2026-08-26",
    }),
  ),

  // proveedores-sancionados
  http.get("*/api/sanciones/:ruc", () =>
    HttpResponse.json({
      items: [{ ruc: "20123456789", tipo: "INHABILITACION", estado: "VIGENTE", expediente: "EXP-2025-001" }],
      cobertura: "PARCIAL",
      matcher: "ruc exact",
      corte: "2026-08-26",
    }),
  ),

  // compras-publicas suppliers
  http.get("*/api/suppliers", () =>
    HttpResponse.json({
      items: [
        {
          supplierId: "sup-001",
          ruc: "20123456789",
          razonSocial: "CONSTRUCTORA EJEMPLO S.A.C.",
          valorTotal: 12_500_000,
          adjudicaciones: 8,
          entidadesDistintas: 3,
        },
      ],
      concentracion: { cr3: 45.2, cr5: 62.1, hhi: 1850, proveedoresConsiderados: 24 },
      cobertura: "PARCIAL",
      matcher: "departamento + ruc",
      corte: "2026-08-26",
    }),
  ),

  // infobras public works — shape real de apps/infobras/api/src/routes/public-works.ts
  // (withSignals()): `resultados`, no `items`; sin cobertura/matcher/corte a
  // nivel de respuesta (ver apps/rastro-web/src/lib/api-client.ts).
  http.get("*/api/public-works", () =>
    HttpResponse.json({
      resultados: [
        {
          codigoInfobras: "INF-2025-001",
          codigoEntidad: "E-831",
          entidadNombre: "GOBIERNO REGIONAL LA LIBERTAD",
          nombreObra: "MEJORAMIENTO DE CARRETERA TRUJILLO - OTUZCO",
          modalidadEjecucion: "CONTRATA",
          naturalezaObra: "MEJORAMIENTO",
          estadoEjecucion: "EN EJECUCION",
          nivelGobierno: "GOBIERNOS REGIONALES",
          sectorEntidad: "TRANSPORTE",
          cui: "2456789",
          departamento: "LA LIBERTAD",
          provincia: "TRUJILLO",
          distrito: "TRUJILLO",
          montoViable: 50_000_000,
          costoActualizado: 53_200_000,
          avanceFisicoProgPct: 45,
          avanceFisicoRealPct: 42.5,
          ejecucionFinancieraPct: 38.0,
          existeParalizacion: false,
          causalParalizacion: null,
          fechaParalizacion: null,
          diasParalizado: null,
          costDriftPct: 6.4,
          gapFisicoFinanciero: 4.5,
          fuente: { dataset: "INFOBRAS - Datos Abiertos (Contraloría)", extraidoEl: "2026-08-26T00:00:00Z" },
        },
      ],
    }),
  ),

  // infobras crossref ejecucion — crosswalk MEF↔INFOBRAS con confianza
  http.get("*/api/crossref/ejecucion", () =>
    HttpResponse.json({
      resultados: [
        {
          ejecucionEntityCode: "831",
          ejecucionNombre: "GOBIERNO REGIONAL LA LIBERTAD",
          infobrasCodigoEntidad: "E-831",
          infobrasEntidadNombre: "GOBIERNO REGIONAL LA LIBERTAD",
          confidence: "confirmada",
          score: 1,
          devengado: 4_558_800_000,
          coberturaTemporal: { cortesUsados: ["2026-08-26"], estado: "PARCIAL" },
          obras: 12,
          obrasParalizadas: 3,
          computedAt: "2026-09-02T00:00:00Z",
        },
      ],
    }),
  ),
];
