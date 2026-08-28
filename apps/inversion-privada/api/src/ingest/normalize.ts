export const VERTIX_SERVICE_URL =
  "https://www.investinperu.pe/wp-content/themes/hello-elementor-child/__api/service/app/vertixService.php";

/** Códigos INEI de departamento usados por el buscador VERTIX (01–25). */
export const INEI_DEPARTMENTS: { code: string; name: string }[] = [
  { code: "01", name: "AMAZONAS" },
  { code: "02", name: "ANCASH" },
  { code: "03", name: "APURIMAC" },
  { code: "04", name: "AREQUIPA" },
  { code: "05", name: "AYACUCHO" },
  { code: "06", name: "CAJAMARCA" },
  { code: "07", name: "CALLAO" },
  { code: "08", name: "CUSCO" },
  { code: "09", name: "HUANCAVELICA" },
  { code: "10", name: "HUANUCO" },
  { code: "11", name: "ICA" },
  { code: "12", name: "JUNIN" },
  { code: "13", name: "LA LIBERTAD" },
  { code: "14", name: "LAMBAYEQUE" },
  { code: "15", name: "LIMA" },
  { code: "16", name: "LORETO" },
  { code: "17", name: "MADRE DE DIOS" },
  { code: "18", name: "MOQUEGUA" },
  { code: "19", name: "PASCO" },
  { code: "20", name: "PIURA" },
  { code: "21", name: "PUNO" },
  { code: "22", name: "SAN MARTIN" },
  { code: "23", name: "TACNA" },
  { code: "24", name: "TUMBES" },
  { code: "25", name: "UCAYALI" },
];

export interface VertixApiProject {
  Id: number;
  Slug: string;
  TipoProyecto: string;
  IdTipoProyecto?: number;
  Nombre: string;
  NombreCorto?: string;
  Estado?: string;
  Fase?: string;
  IdFase?: number;
  Titular?: string;
  Sector?: string;
  Cartera?: string;
  Modalidad?: string;
  ModalidadContractual?: string;
  Iniciativa?: string;
  MontoInversionSIGV?: number | string | null;
  MontoProyecto?: string;
  GreenBrownfield?: string;
  BuenaProPrevista?: string;
  AnhoConcesion?: number | string | null;
  url_thumb?: string;
  url_geo?: string;
}

export interface VertixApiResponse {
  Code: number;
  RecordsTotal?: number;
  Data?: VertixApiProject[];
  Message?: string;
}

export interface NormalizedPrivateProject {
  vertixId: number;
  slug: string;
  tipoProyecto: string;
  idTipoProyecto: number | null;
  nombre: string;
  nombreCorto: string | null;
  estado: string | null;
  fase: string | null;
  idFase: number | null;
  titular: string | null;
  sector: string | null;
  cartera: string | null;
  modalidad: string | null;
  modalidadContractual: string | null;
  iniciativa: string | null;
  montoInversionSigv: number | null;
  montoProyecto: string | null;
  greenBrownfield: string | null;
  buenaProPrevista: string | null;
  anhoConcesion: number | null;
  departamentosInei: string[];
  departamentos: string[];
  urlThumb: string | null;
  urlGeo: string | null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInt(value: unknown): number | null {
  const n = parseOptionalNumber(value);
  return n === null ? null : Math.trunc(n);
}

export function normalizeVertixProject(
  raw: VertixApiProject,
  deptIndex: Map<number, string[]>
): NormalizedPrivateProject {
  const codes = [...(deptIndex.get(raw.Id) ?? [])].sort();
  const names = codes
    .map((code) => INEI_DEPARTMENTS.find((d) => d.code === code)?.name)
    .filter((name): name is string => Boolean(name));

  return {
    vertixId: raw.Id,
    slug: raw.Slug,
    tipoProyecto: raw.TipoProyecto,
    idTipoProyecto: parseOptionalInt(raw.IdTipoProyecto),
    nombre: raw.Nombre,
    nombreCorto: raw.NombreCorto?.trim() || null,
    estado: raw.Estado?.trim() || null,
    fase: raw.Fase?.trim() || null,
    idFase: parseOptionalInt(raw.IdFase),
    titular: raw.Titular?.trim() || null,
    sector: raw.Sector?.trim() || null,
    cartera: raw.Cartera?.trim() || null,
    modalidad: raw.Modalidad?.trim() || null,
    modalidadContractual: raw.ModalidadContractual?.trim() || null,
    iniciativa: raw.Iniciativa?.trim() || null,
    montoInversionSigv: parseOptionalNumber(raw.MontoInversionSIGV),
    montoProyecto: raw.MontoProyecto?.trim() || null,
    greenBrownfield: raw.GreenBrownfield?.trim() || null,
    buenaProPrevista: raw.BuenaProPrevista?.trim() || null,
    anhoConcesion: parseOptionalInt(raw.AnhoConcesion),
    departamentosInei: codes,
    departamentos: names,
    urlThumb: raw.url_thumb?.trim() || null,
    urlGeo: raw.url_geo?.trim() || null,
  };
}

export function normalizeDepartamentoQuery(value: string): string {
  return value.trim().toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export function departamentoMatches(project: NormalizedPrivateProject, departamento: string): boolean {
  const needle = normalizeDepartamentoQuery(departamento);
  return project.departamentos.some((d) => normalizeDepartamentoQuery(d) === needle);
}
