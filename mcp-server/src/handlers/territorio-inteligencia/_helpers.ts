/**
 * Copia de apps/territorio-inteligencia/api/src/lib/ubigeo.ts — mcp-server
 * no puede importar código fuente de una app (paquetes npm separados), y
 * esta tabla es demasiado pequeña (25 filas fijas) para justificar un
 * paquete compartido nuevo. Mantener ambas copias en sync si cambia.
 */
const DEPARTAMENTO_POR_CODIGO: Record<string, string> = {
  "01": "AMAZONAS", "02": "ANCASH", "03": "APURIMAC", "04": "AREQUIPA",
  "05": "AYACUCHO", "06": "CAJAMARCA", "07": "CALLAO", "08": "CUSCO",
  "09": "HUANCAVELICA", "10": "HUANUCO", "11": "ICA", "12": "JUNIN",
  "13": "LA LIBERTAD", "14": "LAMBAYEQUE", "15": "LIMA", "16": "LORETO",
  "17": "MADRE DE DIOS", "18": "MOQUEGUA", "19": "PASCO", "20": "PIURA",
  "21": "PUNO", "22": "SAN MARTIN", "23": "TACNA", "24": "TUMBES",
  "25": "UCAYALI",
};

const CODIGO_POR_DEPARTAMENTO: Record<string, string> = Object.fromEntries(
  Object.entries(DEPARTAMENTO_POR_CODIGO).map(([codigo, nombre]) => [nombre, codigo])
);

function normalizar(nombre: string): string {
  return nombre.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export function codigoDeDepartamento(nombre: string): string | null {
  return CODIGO_POR_DEPARTAMENTO[normalizar(nombre)] ?? null;
}
