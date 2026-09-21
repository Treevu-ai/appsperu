import { describe, expect, it } from "vitest";
import { parseFechaYYYYMMDD, parseInhabilitacionesJudicialesCsv } from "../ingest/oece-inhabilitaciones-judiciales-normalize.js";

// CSV real descargado en vivo el 2026-09-20 (corte 2026-09-01) del attachment
// Confluence att106892498, filas 1, 6 y 15 (2 personas naturales con RUC-10,
// 1 empresa con RUC-20).
const REAL_CSV_HEADER = "FECHA_CORTE|RUC_DNI|NOMBRE_RAZONODENOMINACIONSOCIAL|ORGANO_JURISDICCIONAL|NUMERO_RESOLUCION|FECHA_INICIO|FECHA_FIN";
const REAL_ROW_OK = "20260901|10040039711|BARRETO MARCELO TEODORO|Corte Superior de Justicia de Pasco|SENTENCIA DE FECHA 28.04.2017|20170428|20250428";
const REAL_ROW_EMPRESA = "20260901|20481422141|ROCA INGENIERIA DE LA CONSTRUCCION SAC|Corte Superior de Justicia de Lima|04|20181019|20221019";
// fecha_inicio (20271218) posterior a fecha_fin (20231218) -- invertidas en la fuente real.
const REAL_ROW_FECHAS_INVERTIDAS =
  "20260901|10403004516|CHOQUE QUISPE YIMMY RICHARD|Primer Juzgado Penal Colegiado Supraprovincial de la Corte Superior de Justicia de Arequipa|Sentencia N° 156-2023-1JPCSPA de fecha 10.11.2023|20271218|20231218";
// DNI de 10 dígitos, no calza el formato RUC-10 (11 dígitos) -- anomalía real de la fuente.
const REAL_ROW_RUC_DNI_10_DIGITOS =
  "20260901|1010900768|JOSÉ ANTONIO CORONADO HURTADO|Cuarta Sala Penal Liquidadora de la Corte Superior de Justicia de Lima Norte|s/n de fecha 23.08.2018|20190214|20240214";

describe("parseFechaYYYYMMDD", () => {
  it("parsea una fecha real válida", () => {
    expect(parseFechaYYYYMMDD("20260901")).toBe("2026-09-01");
  });

  it("rechaza una fecha calendario inválida (round-trip contra Date.UTC)", () => {
    expect(parseFechaYYYYMMDD("20240231")).toBeNull(); // 31 de febrero no existe
  });

  it("rechaza formato incorrecto o vacío", () => {
    expect(parseFechaYYYYMMDD("2026-09-01")).toBeNull();
    expect(parseFechaYYYYMMDD("")).toBeNull();
    expect(parseFechaYYYYMMDD(undefined)).toBeNull();
  });
});

describe("parseInhabilitacionesJudicialesCsv", () => {
  it("acepta una fila real con RUC-10 (persona natural)", () => {
    const { accepted, rejected } = parseInhabilitacionesJudicialesCsv(`${REAL_CSV_HEADER}\n${REAL_ROW_OK}`);
    expect(rejected).toEqual([]);
    expect(accepted).toEqual([
      {
        fechaCorte: "2026-09-01",
        rucDni: "10040039711",
        nombre: "BARRETO MARCELO TEODORO",
        organoJurisdiccional: "Corte Superior de Justicia de Pasco",
        numeroResolucion: "SENTENCIA DE FECHA 28.04.2017",
        fechaInicio: "2017-04-28",
        fechaFin: "2025-04-28",
      },
    ]);
  });

  it("acepta una fila real con RUC-20 (empresa) -- no solo personas naturales, pese a la descripción del dataset", () => {
    const { accepted } = parseInhabilitacionesJudicialesCsv(`${REAL_CSV_HEADER}\n${REAL_ROW_EMPRESA}`);
    expect(accepted[0].rucDni).toBe("20481422141");
    expect(accepted[0].nombre).toBe("ROCA INGENIERIA DE LA CONSTRUCCION SAC");
  });

  it("rechaza una fila real con fecha_inicio posterior a fecha_fin, en vez de adivinar cuál es correcta", () => {
    const { accepted, rejected } = parseInhabilitacionesJudicialesCsv(`${REAL_CSV_HEADER}\n${REAL_ROW_FECHAS_INVERTIDAS}`);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([{ raw: REAL_ROW_FECHAS_INVERTIDAS.split("|"), reason: "fecha_inicio posterior a fecha_fin" }]);
  });

  it("acepta ruc_dni de 10 dígitos tal cual (no fuerza el formato RUC-10 de 11) -- dni derivado queda NULL en la BD para este caso", () => {
    // No es responsabilidad de este parser derivar `dni` (eso lo hace la
    // columna GENERATED de Postgres) -- solo confirma que no se rechaza ni
    // se trunca/rellena el valor con 10 dígitos.
    const { accepted, rejected } = parseInhabilitacionesJudicialesCsv(`${REAL_CSV_HEADER}\n${REAL_ROW_RUC_DNI_10_DIGITOS}`);
    expect(rejected).toEqual([]);
    expect(accepted[0].rucDni).toBe("1010900768");
  });

  it("salta la fila de encabezado", () => {
    const { accepted, rejected } = parseInhabilitacionesJudicialesCsv(REAL_CSV_HEADER);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it("cuenta como rechazada (no descarta en silencio) una fila con menos columnas de las esperadas", () => {
    const filaCorta = "20260901|10040039711|BARRETO MARCELO TEODORO";
    const { accepted, rejected } = parseInhabilitacionesJudicialesCsv(`${REAL_CSV_HEADER}\n${filaCorta}`);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([{ raw: filaCorta.split("|"), reason: "número de columnas inesperado (3, se esperaban 7)" }]);
  });

  it("ignora líneas vacías", () => {
    const { accepted, rejected } = parseInhabilitacionesJudicialesCsv(`${REAL_CSV_HEADER}\n\n${REAL_ROW_OK}\n\n`);
    expect(accepted).toHaveLength(1);
    expect(rejected).toEqual([]);
  });
});
