const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4007";

export interface ComponentScore {
  valor: number | null;
  disponible: boolean;
}

export interface EntityScore {
  entityCode: string;
  nombre: string;
  scoreCompuesto: number | null;
  componentesUsados: number;
  componentes: {
    ejecucion: ComponentScore;
    obrasNoParalizadas: ComponentScore;
    inversionesSinSobrecosto: ComponentScore;
    comprasNoConcentradas: ComponentScore;
    saludTributariaProveedores: ComponentScore;
  };
}

export interface ScoreResponse {
  departamento: string;
  anioFiscal: number;
  resultados: EntityScore[];
}

export async function getScore(departamento?: string): Promise<ScoreResponse> {
  const qs = departamento ? `?departamento=${encodeURIComponent(departamento)}` : "";
  const res = await fetch(`${API_URL}/api/score${qs}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`La API respondió ${res.status} para /api/score`);
  }
  return (await res.json()) as ScoreResponse;
}
