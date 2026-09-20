import { parse } from "csv-parse/sync";

/**
 * 12 columnas de dimensión (texto) + 47 columnas de conteo (numéricas) del
 * CSV real "Procesos judiciales principales a nivel nacional, a partir del
 * 2023" (datosabiertos.gob.pe, publicador: Poder Judicial). Ver
 * docs/data-contracts/poder-judicial-procesos-jurisdiccionales.md para el
 * detalle de la fuente y la verificación de clave única.
 */
const DIMENSION_COLUMNS = [
  "ANIO",
  "MES",
  "DISTRITO_JUDICIAL",
  "PROVINCIA",
  "DISTRITO",
  "CODIGODEP",
  "DEPENDENCIA",
  "ESTADO",
  "TIPO_ORGANO",
  "ESPEC_EXP",
  "ESPEC_DEP",
  "CONDICION",
] as const;

const NUMERIC_COLUMNS = [
  "PENDIENTET",
  "PPLAZOIMPUG",
  "PENDIENTEE",
  "PENDIENTE",
  "IMPROCEDENTEI",
  "NADMITIDO",
  "APE_INSINFERIOR",
  "APE_INSSUPERIORANULADA",
  "INGRESOT_SIN",
  "DEOTRADEPENT",
  "INGRESOT_CON",
  "RESCONSENTIDA",
  "APE_CONFIRMADAI",
  "APE_REVOCADAI",
  "INGRESOE_SIN",
  "DEOTRADEPENE",
  "INGRESOE_CON",
  "INGRESO_SIN",
  "INGRESO_CON",
  "IMPROCEDENTER",
  "SENTENCIA",
  "AUTODEFINITIVO",
  "CONCILIADO",
  "INFORMEFINAL",
  "APE_CONFIRMADAR",
  "APE_REVOCADAR",
  "APE_ANULADAR",
  "APE_RESUELTA",
  "RESUELTOT",
  "OTROSEGRESOST",
  "RESUELTOE",
  "OTROSEGRESOSE",
  "RESUELTO",
  "CONFIRMADA_ADEF",
  "REVOCADA_ADEF",
  "RDEV_CONFIRMADA",
  "RDEV_ANULADA",
  "RDEV_REVOCADA",
  "PENDIENTECALF",
  "INGRESOCALF",
  "RESUELTOCALF",
  "PENDIENTECUAD",
  "INGRESOCUAD",
  "RESUELTOCUAD",
  "PENDIENTEEXH",
  "INGRESOEXH",
  "RESUELTOEXH",
] as const;

const ALL_COLUMNS = [...DIMENSION_COLUMNS, ...NUMERIC_COLUMNS];

export interface NormalizedProcesoJurisdiccional {
  anio: number;
  mes: string;
  distritoJudicial: string;
  provincia: string | null;
  distrito: string | null;
  codigoDependencia: string;
  dependencia: string;
  estado: string;
  tipoOrgano: string;
  especExp: string;
  especDep: string;
  condicion: string;
  conteos: Record<string, number>;
}

export interface RejectedRawRow {
  raw: Record<string, string>;
  reason: string;
}

export interface ParsedProcesosJudicialesCsv {
  rows: NormalizedProcesoJurisdiccional[];
  rejected: RejectedRawRow[];
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Entero no negativo — el CSV fuente son solo conteos, nunca negativos. */
function toNonNegativeInt(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * Parsea el CSV crudo (ya decodificado Latin-1 por el caller) a filas
 * tipadas. Rechaza (y cuenta, no descarta en silencio) cualquier fila que
 * no traiga las 12 columnas de dimensión requeridas o donde algún conteo
 * numérico no sea un entero no negativo válido — mismo criterio que
 * `cenares-parse.ts` (servicios-salud) para filas desalineadas.
 */
export function parseProcesosJudicialesCsv(csvText: string): ParsedProcesosJudicialesCsv {
  const parsed = parse(csvText, {
    columns: true,
    delimiter: ",",
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const rows: NormalizedProcesoJurisdiccional[] = [];
  const rejected: RejectedRawRow[] = [];

  for (const row of parsed) {
    const missing = ALL_COLUMNS.filter((col) => row[col] === undefined);
    if (missing.length > 0) {
      rejected.push({ raw: row, reason: `fila desalineada, faltan columnas: ${missing.join(", ")}` });
      continue;
    }

    const anioRaw = (row.ANIO ?? "").trim();
    if (!/^\d{4}$/.test(anioRaw)) {
      rejected.push({ raw: row, reason: `ANIO inválido: "${anioRaw}"` });
      continue;
    }

    const requiredDims: [string, string][] = [
      ["DISTRITO_JUDICIAL", row.DISTRITO_JUDICIAL],
      ["CODIGODEP", row.CODIGODEP],
      ["DEPENDENCIA", row.DEPENDENCIA],
      ["ESTADO", row.ESTADO],
      ["TIPO_ORGANO", row.TIPO_ORGANO],
      ["ESPEC_EXP", row.ESPEC_EXP],
      ["ESPEC_DEP", row.ESPEC_DEP],
      ["CONDICION", row.CONDICION],
      ["MES", row.MES],
    ];
    const emptyDim = requiredDims.find(([, v]) => (v ?? "").trim() === "");
    if (emptyDim) {
      rejected.push({ raw: row, reason: `columna requerida vacía: ${emptyDim[0]}` });
      continue;
    }

    const conteos: Record<string, number> = {};
    let invalidNumeric: string | null = null;
    for (const col of NUMERIC_COLUMNS) {
      const n = toNonNegativeInt(row[col]);
      if (n === null) {
        invalidNumeric = col;
        break;
      }
      conteos[col] = n;
    }
    if (invalidNumeric) {
      rejected.push({ raw: row, reason: `valor numérico inválido en ${invalidNumeric}: "${row[invalidNumeric]}"` });
      continue;
    }

    rows.push({
      anio: Number(anioRaw),
      mes: row.MES.trim(),
      distritoJudicial: row.DISTRITO_JUDICIAL.trim(),
      provincia: emptyToNull(row.PROVINCIA),
      distrito: emptyToNull(row.DISTRITO),
      codigoDependencia: row.CODIGODEP.trim(),
      dependencia: row.DEPENDENCIA.trim(),
      estado: row.ESTADO.trim(),
      tipoOrgano: row.TIPO_ORGANO.trim(),
      especExp: row.ESPEC_EXP.trim(),
      especDep: row.ESPEC_DEP.trim(),
      condicion: row.CONDICION.trim(),
      conteos,
    });
  }

  return { rows, rejected };
}

export { NUMERIC_COLUMNS, DIMENSION_COLUMNS };
