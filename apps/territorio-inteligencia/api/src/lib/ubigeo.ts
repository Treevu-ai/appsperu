/**
 * Código UBIGEO de departamento (2 dígitos, INEI) → nombre. `catastro-forestal`
 * y `geo-intersections.forest_titles` guardan `nom_dep`/`nom_pro`/`nom_dis`
 * como códigos UBIGEO, no como nombres — pese a lo que sugiere el nombre de
 * columna (confirmado en vivo contra Neon, 2026-10-07). Tabla fija: los 25
 * departamentos del Perú no cambian, no amerita una fuente externa.
 */
const DEPARTAMENTO_POR_CODIGO: Record<string, string> = {
  "01": "AMAZONAS",
  "02": "ANCASH",
  "03": "APURIMAC",
  "04": "AREQUIPA",
  "05": "AYACUCHO",
  "06": "CAJAMARCA",
  "07": "CALLAO",
  "08": "CUSCO",
  "09": "HUANCAVELICA",
  "10": "HUANUCO",
  "11": "ICA",
  "12": "JUNIN",
  "13": "LA LIBERTAD",
  "14": "LAMBAYEQUE",
  "15": "LIMA",
  "16": "LORETO",
  "17": "MADRE DE DIOS",
  "18": "MOQUEGUA",
  "19": "PASCO",
  "20": "PIURA",
  "21": "PUNO",
  "22": "SAN MARTIN",
  "23": "TACNA",
  "24": "TUMBES",
  "25": "UCAYALI",
};

const CODIGO_POR_DEPARTAMENTO: Record<string, string> = Object.fromEntries(
  Object.entries(DEPARTAMENTO_POR_CODIGO).map(([codigo, nombre]) => [nombre, codigo])
);

function normalizar(nombre: string): string {
  return nombre
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Nombre de departamento (ej. "La Libertad", acentos/mayúsculas indistintos) → código UBIGEO "13". */
export function codigoDeDepartamento(nombre: string): string | null {
  return CODIGO_POR_DEPARTAMENTO[normalizar(nombre)] ?? null;
}

/** Código UBIGEO de departamento ("13") → nombre ("LA LIBERTAD"). */
export function nombreDeDepartamento(codigo: string): string | null {
  return DEPARTAMENTO_POR_CODIGO[codigo] ?? null;
}
