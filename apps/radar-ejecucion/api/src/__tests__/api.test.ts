import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /health", () => {
  it("responds ok without touching the database", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/meta/sources", () => {
  it("returns traceability info for the most recent ingestion batches", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          resource_id: "abc-123",
          fetched_at: "2026-08-16T00:00:00.000Z",
          record_count: 1500,
          checksum: "deadbeef",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/meta/sources");

    expect(res.status).toBe(200);
    expect(res.body.fuentes[0].ultimosLotes[0]).toMatchObject({
      resourceId: "abc-123",
      registros: 1500,
      checksum: "deadbeef",
    });
  });
});

describe("GET /api/execution", () => {
  it("returns the ranking with traceability and applies query filters", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          entity_code: "001",
          nombre: "Municipalidad de Ejemplo",
          nivel_gobierno: "GOBIERNO_LOCAL",
          funcion: "Educación",
          anio_fiscal: 2025,
          pia: "1000000",
          pim: "1200000",
          devengado: "600000",
          fecha_corte: "2026-08-16",
          resource_id: "abc-123",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/execution").query({ nivel: "GOBIERNO_LOCAL", anio: "2025" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0].avancePct).toBe(50);
    expect(res.body.resultados[0].fuente.dataset).toMatch(/MEF/);

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual(["GOBIERNO_LOCAL", 2025]);
  });
});

describe("GET /api/execution (validación de query)", () => {
  it("responde 400 cuando departamento llega repetido como array, sin tocar la base", async () => {
    const app = createApp();
    const res = await request(app).get("/api/execution?departamento=a&departamento=b");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválidos/);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("responde 400 cuando anio no es un año de 4 dígitos", async () => {
    const app = createApp();
    const res = await request(app).get("/api/execution?anio=abc");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/servicios-cuidados/alimentacion", () => {
  it("expone lotes documentados sin inventar RUC ni recepción escolar", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      period_id: "WASI-MIKUNA-LL-2025", year: 2025, territorial_unit: "LA LIBERTAD", modality: "PRODUCTOS", planned_students: "276812", planned_schools: "3692", published_lots: "35", awarded_lots: "27", materialized_lots: "3", school_denominator_status: "PUBLICADO_AGREGADO_SIN_PADRON", coverage_status: "PARCIAL_DECLARADA", limitation: "Cobertura parcial", source_url: "https://fuente.test", source_label: "Fuente", automation_status: "MANUAL_ASISTIDA", checksum_status: "NO_DESCARGADO_EN_PILOTO",
    }] });
    queryMock.mockResolvedValueOnce({ rows: [{
      lot_id: "WASI-2025-LL5-GUADALUPE", committee_name: "LA LIBERTAD 5", item_literal: "GUADALUPE", contract_reference: "0002", modality: "PRODUCTOS", supplier_name_published: "CONSORCIO SUYANNA", supplier_ruc: null, supplier_ruc_status: "RUC_NO_PUBLICADO_EN_EVIDENCIA", documented_delivery_number: "1", lot_status: "ENTREGA_REFERIDA_EN_DOCUMENTO", observed_at: "2025-04-16", limitation: "Sin colegio", source_url: "https://fuente.test", source_label: "Fuente", automation_status: "MANUAL_ASISTIDA", evidencias: [],
    }] });

    const res = await request(createApp()).get("/api/servicios-cuidados/alimentacion/lotes?periodo=2025");
    expect(res.status).toBe(200);
    expect(res.body.periodo.lotesMaterializados).toBe(3);
    expect(res.body.resultados[0]).toMatchObject({ ruc: null, estadoRuc: "RUC_NO_PUBLICADO_EN_EVIDENCIA", entregaReferidaNumero: 1 });
    expect(res.body.cautela).toMatch(/no acredita por sí sola/i);
  });

  it("no reparte cobertura regional entre distritos sin padrón", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ period_id: "WASI-MIKUNA-LL-2025", year: 2025, territorial_unit: "LA LIBERTAD", planned_students: "276812", planned_schools: "3692", school_denominator_status: "PUBLICADO_AGREGADO_SIN_PADRON", coverage_status: "PARCIAL_DECLARADA", limitation: "Sin padrón" }] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [{ colegios_documentados: "0", entregas_con_acta: "0" }] });
    const res = await request(createApp()).get("/api/servicios-cuidados/alimentacion/cobertura?periodo=2025&distrito=Casa%20Grande");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ periodo: { colegiosPublicados: 3692 }, colegiosDocumentados: 0, entregasConActaDocumentada: 0, resultados: [] });
    expect(res.body.limitacion).toMatch(/No se atribuyen/i);
  });

  it("bloquea en modo estricto cuando la cadena no tiene claves suficientes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      period_id: "WASI-MIKUNA-LL-2025", year: 2025, published_lots: "35", awarded_lots: "27", materialized_lots: "3", planned_schools: "3692", school_denominator_status: "PUBLICADO_AGREGADO_SIN_PADRON", coverage_status: "PARCIAL_DECLARADA", limitation: "Parcial", lotes_en_tabla: "3", lotes_con_ruc: "0", colegios_documentados: "0", entregas_con_acta: "0", pendientes_revision: "5",
    }] });
    const res = await request(createApp()).get("/api/servicios-cuidados/alimentacion/integridad?periodo=2025&estricto=true");
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ estado: "BLOQUEADO_POR_EVIDENCIA", controles: { lotesConRucExacto: 0, colegiosDocumentados: 0 } });
  });

  it("rechaza una búsqueda de proveedor por nombre o RUC incompleto sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/servicios-cuidados/alimentacion/proveedores/CONSORCIO-SUYANNA?periodo=2025");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/11 dígitos/);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("separa una denuncia documentada de una sanción o conclusión de responsabilidad", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      observation_id: "7", observation_kind: "DENUNCIA_CON_EXPEDIENTE", observation_status: "EN_INVESTIGACION", authority_name: "Fiscalía", case_reference: "EXP-123", food_lot_id: null, contract_reference: null, ruc_start_date: null, contract_date: null, source_url: "https://fuente.test/exp", source_detail: "Documento público", observed_at: "2026-08-24", linkage_status: "RUC_EXACTO_DOCUMENTADO",
    }] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/servicios-cuidados/alimentacion/observaciones-proveedor/20100027021");
    expect(res.status).toBe(200);
    expect(res.body.observaciones[0]).toMatchObject({ tipo: "DENUNCIA_CON_EXPEDIENTE", estado: "EN_INVESTIGACION", expediente: "EXP-123" });
    expect(res.body.cautela).toMatch(/no acredita responsabilidad/i);
  });

  it("rechaza atribuir observaciones a un proveedor sin RUC exacto", async () => {
    const res = await request(createApp()).get("/api/servicios-cuidados/alimentacion/observaciones-proveedor/CONSORCIO-SUYANNA");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/sectores/inventory", () => {
  it("keeps national destination and regional execution as different territorial rules", async () => {
    queryMock.mockResolvedValueOnce({ rows: [
      { entity_code: "1750", nombre: "AUTORIDAD NACIONAL DE INFRAESTRUCTURA - ANIN", nivel_gobierno: "GOBIERNO NACIONAL", regla_territorial: "META_DEPARTAMENTO", clasificado: true },
      { entity_code: "831", nombre: "REGION LA LIBERTAD-SEDE CENTRAL", nivel_gobierno: "GOBIERNOS REGIONALES", regla_territorial: "SEDE_EJECUTORA", clasificado: true },
    ] });
    const response = await request(createApp()).get("/api/sectores/inventory?anio=2026&departamento=la%20libertad");
    expect(response.status).toBe(200);
    expect(response.body.resultados).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityCode: "1750", reglaTerritorial: "META_DEPARTAMENTO" }),
      expect.objectContaining({ entityCode: "831", reglaTerritorial: "SEDE_EJECUTORA" }),
    ]));
    expect(queryMock.mock.calls[0][0]).toMatch(/b\.meta_departamento/);
  });
});

describe("GET /api/lluvias/seguimiento", () => {
  it("returns the terminal-ready columns without presenting an entity seat as beneficiary district", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          entity_code: "029",
          entidad_responsable: "AUTORIDAD NACIONAL DE INFRAESTRUCTURA",
          proyecto_nombre: "CREACION DEL SERVICIO DE DRENAJE PLUVIAL",
          programa_ppto_nombre: "ASIGNACIONES PRESUPUESTALES",
          anio_fiscal: 2026,
          pia: "11490390",
          pim: "11490390",
          devengado: "1000000",
          meta_departamento: "LA LIBERTAD",
          fecha_corte: "2026-08-24",
          resource_id: "2026-Gasto-Mensual.csv",
          departamento_ejecutora: "LIMA",
          provincia_ejecutora: "LIMA",
          distrito_ejecutora: "LIMA",
        },
      ],
    });
    queryMock.mockResolvedValueOnce({
      rows: [{
        cui: "2539202",
        entidad_responsable: "AUTORIDAD NACIONAL DE INFRAESTRUCTURA (ANIN)",
        actividad_literal: "CREACION DEL SERVICIO DE DRENAJE PLUVIAL",
        pia_legal: "11490390",
        pim: null,
        devengado: null,
        estado_pim: "NO_PUBLICADO_EN_FUENTE_DE_PROYECTO",
        alerta_consistencia_territorial: "Las fuentes publican 5 y 6 distritos.",
        observed_at: "2026-08-24",
        distritos: [{ distrito: "TRUJILLO" }, { distrito: "EL PORVENIR" }],
        fuentes: [{ etiqueta: "Ley de Presupuesto", url: "https://example.test", detalle: "CUI y PIA" }],
      }],
    });

    const app = createApp();
    const res = await request(app).get("/api/lluvias/seguimiento").query({ anio: "2026", busqueda: "drenaje" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      entidadResponsable: "AUTORIDAD NACIONAL DE INFRAESTRUCTURA",
      cui: null,
      cuiEstado: "NO_PUBLICADO_EN_CSV_MEF_GASTO",
      actividad: "CREACION DEL SERVICIO DE DRENAJE PLUVIAL",
      pim: 11490390,
      devengado: 1000000,
      distritoBeneficiado: null,
      distritoBeneficiadoEstado: "NO_PUBLICADO_EN_CSV_MEF_GASTO",
      pimCobertura: "ATRIBUIDO_A_LA_ACTIVIDAD_POR_FILA_MEF",
    });
    expect(res.body.resultados[0].alcanceTerritorial).toEqual({ tipo: "DEPARTAMENTO_META", departamento: "LA LIBERTAD" });
    expect(queryMock.mock.calls[0][1]).toEqual(["LA LIBERTAD", 2026, "%DRENAJE%"]);
    expect(res.body.proyectosTerritoriales[0]).toMatchObject({
      cui: "2539202",
      entidadResponsable: "AUTORIDAD NACIONAL DE INFRAESTRUCTURA (ANIN)",
      piaLegal: 11490390,
      pim: null,
      devengado: null,
      distritoBeneficiado: expect.arrayContaining(["TRUJILLO", "EL PORVENIR"]),
    });
    expect(res.body.cobertura.conciliacion).toMatch(/No hay cruce automático/);
  });
});

describe("GET /api/servicios-cuidados", () => {
  const alimentacion = {
    service_id: "ALIM-WASI-MIKUNA-LA-LIBERTAD-2025",
    service_type: "ALIMENTACION",
    service_name: "Servicio alimentario escolar de La Libertad",
    responsible_entity: "WASI MIKUNA",
    period_label: "Año escolar 2025",
    department: "LA LIBERTAD",
    cui: null,
    cui_status: "CUI_NO_PUBLICADO_EN_FUENTE",
    work_code: null,
    work_status: "NO_APLICA",
    beneficiary_students: "276812",
    beneficiary_schools: "3692",
    purchase_committees: "5",
    published_lots: "35",
    awarded_lots: "27",
    delivery_evidence_status: "SIN_EVIDENCIA_DE_ENTREGA_INGRESADA",
    verification_status: "EVIDENCIA_OFICIAL",
    observed_at: "2025-02-04",
    limitation: "No se infieren proveedores.",
    sources: [{ label: "Fuente oficial", url: "https://example.test", detail: "Cobertura" }],
    territories: [{ departamento: "LA LIBERTAD", provincia: null, distrito: null, estado: "COBERTURA_REGIONAL_PUBLICADA" }],
    proveedores_oficiales: "0",
    entregas_evidenciadas: "0",
  };

  it("declares missing food suppliers and deliveries instead of inferring them", async () => {
    queryMock.mockResolvedValueOnce({ rows: [alimentacion] });
    const response = await request(createApp()).get("/api/servicios-cuidados?tipo=ALIMENTACION");

    expect(response.status).toBe(200);
    expect(response.body.resultados[0]).toMatchObject({
      id: "ALIM-WASI-MIKUNA-LA-LIBERTAD-2025",
      tipo: "ALIMENTACION",
      infraestructura: { cui: null, estadoCui: "CUI_NO_PUBLICADO_EN_FUENTE", estadoObra: "NO_APLICA" },
      atencion: { estudiantesPublicados: 276812, institucionesPublicadas: 3692, lotesPublicados: 35, lotesAdjudicadosPublicados: 27, entregasEvidenciadas: 0 },
      proveedores: { proveedoresConRucVinculadoOficialmente: 0, estado: "SIN_RUC_OFICIALMENTE_VINCULADO" },
    });
    expect(response.body.limitation).toMatch(/fuente oficial/i);
    expect(queryMock.mock.calls[0][1]).toEqual(["LA LIBERTAD", "ALIMENTACION"]);
  });

  it("returns detail without fabricating a provider or a school delivery", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [alimentacion] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const response = await request(createApp()).get("/api/servicios-cuidados/ALIM-WASI-MIKUNA-LA-LIBERTAD-2025");

    expect(response.status).toBe(200);
    expect(response.body.proveedores).toMatchObject({ estado: "SIN_RUC_OFICIALMENTE_VINCULADO", resultados: [] });
    expect(response.body.entregas).toEqual([]);
  });
});

describe("GET /api/execution/:entityCode", () => {
  it("returns 404 when the entity has no ingested data", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/execution/NOPE");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no encontrada/);
  });

  it("includes source traceability on every timeline entry", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          entity_code: "001",
          nombre: "Municipalidad de Ejemplo",
          nivel_gobierno: "GOBIERNO_LOCAL",
          funcion: "Educación",
          anio_fiscal: 2025,
          pia: "1000000",
          pim: "1200000",
          devengado: "900000",
          fecha_corte: "2026-08-16",
          resource_id: "abc-123",
          fetched_at: "2026-08-16T00:00:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/execution/001");

    expect(res.status).toBe(200);
    expect(res.body.linea_de_tiempo[0].fuente).toMatchObject({ resourceId: "abc-123" });
    expect(res.body.linea_de_tiempo[0].avancePct).toBe(75);
  });
});

describe("GET /api/benchmark/:entityCode", () => {
  it("returns 404 when entity does not exist", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/benchmark/NOPE");

    expect(res.status).toBe(404);
  });

  it("returns 422 when no cohort rule exists for the entity's government level", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ entity_code: "001", nivel_gobierno: "GOBIERNO_NACIONAL" }],
    });

    const app = createApp();
    const res = await request(app).get("/api/benchmark/001");

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/regla de cohorte/);
  });

  it("returns a computed percentile when the cohort is sufficient", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ entity_code: "001", nivel_gobierno: "GOBIERNO_LOCAL" }] })
      .mockResolvedValueOnce({
        rows: [
          { entity_code: "001", pim: "1000", devengado: "500" },
          { entity_code: "002", pim: "1000", devengado: "900" },
          { entity_code: "003", pim: "1000", devengado: "100" },
          { entity_code: "004", pim: "1000", devengado: "700" },
          { entity_code: "005", pim: "1000", devengado: "300" },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/benchmark/001").query({ anio: "2025" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.n).toBe(5);
    expect(typeof res.body.percentil).toBe("number");
  });
});
