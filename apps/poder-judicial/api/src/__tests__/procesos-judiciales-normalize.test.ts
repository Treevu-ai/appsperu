import { describe, expect, it } from "vitest";
import { parseProcesosJudicialesCsv } from "../ingest/procesos-judiciales-normalize.js";

// Fragmento real capturado el 2026-09-20 (dataset_jurisdiccional_a-partir-del-2024.csv,
// datosabiertos.gob.pe, publicador: Poder Judicial).
const HEADER =
  "ANIO,MES,DISTRITO_JUDICIAL,PROVINCIA,DISTRITO,CODIGODEP,DEPENDENCIA,ESTADO,TIPO_ORGANO,ESPEC_EXP,ESPEC_DEP,CONDICION," +
  "PENDIENTET,PPLAZOIMPUG,PENDIENTEE,PENDIENTE,IMPROCEDENTEI,NADMITIDO,APE_INSINFERIOR,APE_INSSUPERIORANULADA," +
  "INGRESOT_SIN,DEOTRADEPENT,INGRESOT_CON,RESCONSENTIDA,APE_CONFIRMADAI,APE_REVOCADAI,INGRESOE_SIN,DEOTRADEPENE," +
  "INGRESOE_CON,INGRESO_SIN,INGRESO_CON,IMPROCEDENTER,SENTENCIA,AUTODEFINITIVO,CONCILIADO,INFORMEFINAL," +
  "APE_CONFIRMADAR,APE_REVOCADAR,APE_ANULADAR,APE_RESUELTA,RESUELTOT,OTROSEGRESOST,RESUELTOE,OTROSEGRESOSE,RESUELTO," +
  "CONFIRMADA_ADEF,REVOCADA_ADEF,RDEV_CONFIRMADA,RDEV_ANULADA,RDEV_REVOCADA,PENDIENTECALF,INGRESOCALF,RESUELTOCALF," +
  "PENDIENTECUAD,INGRESOCUAD,RESUELTOCUAD,PENDIENTEEXH,INGRESOEXH,RESUELTOEXH";

const REAL_ROW =
  "2024,Enero,Amazonas,CHACHAPOYAS,CHACHAPOYAS,13,Juzgado de Paz Letrado,En Funcionamiento,Juzgado de Paz Letrado,Civil,Juzgado de Paz Letrado,Permanente," +
  "101,31,198,299,1,17,0,0,18,0,18,1,0,0,1,1,2,19,20,1,4,2,0,0,0,0,0,0,7,0,0,5,7,0,0,0,1,0,18,14,18,91,4,5,0,0,0";

describe("parseProcesosJudicialesCsv", () => {
  it("normaliza una fila real bien formada", () => {
    const csv = [HEADER, REAL_ROW].join("\n");
    const { rows, rejected } = parseProcesosJudicialesCsv(csv);

    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.anio).toBe(2024);
    expect(r.mes).toBe("Enero");
    expect(r.distritoJudicial).toBe("Amazonas");
    expect(r.provincia).toBe("CHACHAPOYAS");
    expect(r.codigoDependencia).toBe("13");
    expect(r.tipoOrgano).toBe("Juzgado de Paz Letrado");
    expect(r.especExp).toBe("Civil");
    expect(r.condicion).toBe("Permanente");
    expect(r.conteos.PENDIENTET).toBe(101);
    expect(r.conteos.PENDIENTE).toBe(299);
    expect(r.conteos.RESUELTOEXH).toBe(0);
  });

  it("acepta un valor vacío en una columna de conteo como 0 (patrón real del CSV)", () => {
    const fields = REAL_ROW.split(",");
    fields[fields.length - 1] = ""; // RESUELTOEXH, última columna, vacía en vez de "0"
    const csv = [HEADER, fields.join(",")].join("\n");
    const { rows, rejected } = parseProcesosJudicialesCsv(csv);
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].conteos.RESUELTOEXH).toBe(0);
  });

  it("rechaza y cuenta una fila desalineada (menos columnas que el encabezado)", () => {
    const truncated = "2024,Enero,Amazonas,CHACHAPOYAS,CHACHAPOYAS,13";
    const csv = [HEADER, truncated].join("\n");
    const { rows, rejected } = parseProcesosJudicialesCsv(csv);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/desalineada/);
  });

  it("rechaza una fila con ANIO no numérico", () => {
    const badYear = REAL_ROW.replace(/^2024/, "AAAA");
    const csv = [HEADER, badYear].join("\n");
    const { rows, rejected } = parseProcesosJudicialesCsv(csv);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/ANIO inválido/);
  });

  it("rechaza una fila con un conteo no numérico", () => {
    const badCount = REAL_ROW.replace(",101,", ",NO_NUMERICO,");
    const csv = [HEADER, badCount].join("\n");
    const { rows, rejected } = parseProcesosJudicialesCsv(csv);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/valor numérico inválido/);
  });
});
