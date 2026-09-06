/**
 * Campos confirmados en vivo (2026-09-05) en la respuesta real de
 * `BusquedaInformesCGR.ashx?Action=loadInformesElastic` que contienen o
 * pueden contener datos de una persona natural identificada — NUNCA se
 * leen ni se pasan a `normalizeInforme`. Esta constante existe para que
 * cualquier cambio futuro que intente agregar uno de estos campos al
 * mapeo sea una decisión explícita y visible en el diff, no un descuido.
 *
 * - `Funcionarios` / `TotalFuncionarios`: nombres de funcionarios con
 *   responsabilidad identificada en el informe (confirmado que el campo
 *   se llena en informes reales, aunque venga `null` en la mayoría).
 * - `Responsabilidad`: texto libre asociado a la responsabilidad, mismo
 *   riesgo.
 * - `Text`: índice de texto libre para el buscador, concatena muchos
 *   campos de la fila — no se puede garantizar que nunca incluya un
 *   nombre cuando `Funcionarios` está poblado, así que se descarta entera.
 */
export const CAMPOS_PERSONALES_EXCLUIDOS = ["Funcionarios", "TotalFuncionarios", "Responsabilidad", "Text"] as const;

export type RawInforme = Record<string, unknown>;

export interface InformeNormalizado {
  codigoInforme: string;
  numeroInforme: string | null;
  ciacCodigo: string | null;
  entidad: string | null;
  codigoEntidad: string | null;
  sector: string | null;
  codigoSector: string | null;
  nivelGobierno: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  descripcion: string | null;
  modalidadServicio: string | null;
  servicioControl: string | null;
  tipoInforme: string | null;
  periodo: number | null;
  fechaEmision: string | null;
  fechaPublicacion: string | null;
  fechaFinEjecucion: string | null;
  esConResponsabilidad: boolean | null;
  totalRecomendaciones: number | null;
  esCovid: boolean | null;
  esReconstruccion: boolean | null;
  urlResumenEjecutivo: string | null;
  urlResumenInforme: string | null;
  urlInformeCompleto: string | null;
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function intOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** La fuente usa "S"/"N" para booleanos (confirmado: EsReconstruccion). */
function boolSN(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toUpperCase();
  if (v === "S") return true;
  if (v === "N") return false;
  return null;
}

/** "2023/10/16" -> "2023-10-16". Confirmado en vivo, formato consistente
 * con separador '/'. Devuelve null si no calza el patrón, no lanza. */
function parseFecha(value: unknown): string | null {
  const text = textOrNull(value);
  if (!text) return null;
  const match = text.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (!match) return null;
  const [, yyyy, mm, dd] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Mapea una fila cruda de la API a la forma que se persiste — únicamente
 * campos de entidad/informe. Los campos en `CAMPOS_PERSONALES_EXCLUIDOS`
 * ni siquiera se leen de `raw` acá, deliberadamente.
 *
 * Devuelve `null` (no lanza) cuando falta `CodigoInforme` — es el único
 * caso esperado de "fila no persistible" (sin clave primaria). Cualquier
 * otra excepción real (ej. un cambio de forma en la API) debe propagarse
 * sin capturarse, para no confundirse con este caso documentado — ver
 * el `continue` explícito en `informes-control-connector.ts` que consume
 * este `null`, en vez de un `try/catch` genérico alrededor de esta función.
 */
export function normalizeInforme(raw: RawInforme): InformeNormalizado | null {
  const codigoInforme = textOrNull(raw.CodigoInforme);
  if (!codigoInforme) {
    return null;
  }

  return {
    codigoInforme,
    numeroInforme: textOrNull(raw.NumeroInforme),
    ciacCodigo: textOrNull(raw.CiacCodigo),
    entidad: textOrNull(raw.Entidad),
    codigoEntidad: textOrNull(raw.CodigoEntidad),
    sector: textOrNull(raw.Sector),
    codigoSector: textOrNull(raw.CodigoSector),
    nivelGobierno: textOrNull(raw.NivelGobierno),
    departamento: textOrNull(raw.Departamento),
    provincia: textOrNull(raw.Provincia),
    distrito: textOrNull(raw.Distrito),
    descripcion: textOrNull(raw.Descripcion),
    modalidadServicio: textOrNull(raw.ModalidadServicio),
    servicioControl: textOrNull(raw.ServicioControl),
    tipoInforme: textOrNull(raw.TipoInforme),
    periodo: intOrNull(raw.Periodo),
    fechaEmision: parseFecha(raw.FechaEmision),
    fechaPublicacion: parseFecha(raw.FechaPublicacion),
    fechaFinEjecucion: parseFecha(raw.FechaFinEjecucion),
    esConResponsabilidad: boolSN(raw.EsConResponsabilidad),
    totalRecomendaciones: intOrNull(raw.TotalRecomendaciones),
    esCovid: boolSN(raw.EsCovid),
    esReconstruccion: boolSN(raw.EsReconstruccion),
    urlResumenEjecutivo: textOrNull(raw.ResumenEjecutivo),
    urlResumenInforme: textOrNull(raw.ResumenInforme),
    urlInformeCompleto: textOrNull(raw.RutaCloudInforme),
  };
}

/** `TotalRows` viene repetido en cada fila de la página (confirmado en
 * vivo) — se lee de la primera fila de una página no vacía. */
export function extractTotalRows(rows: RawInforme[]): number | null {
  if (rows.length === 0) return null;
  return intOrNull(rows[0].TotalRows);
}
