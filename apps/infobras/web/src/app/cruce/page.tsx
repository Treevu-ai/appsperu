import { CrossrefTable } from "@/components/CrossrefTable";
import { getCrossref } from "@/lib/api";

const DEFAULT_DEPARTAMENTO = "LA LIBERTAD";

interface PageProps {
  searchParams: Promise<{ departamento?: string }>;
}

export default async function CrucePage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const departamento = resolvedSearchParams.departamento ?? DEFAULT_DEPARTAMENTO;
  const { resultados } = await getCrossref(departamento);

  const conMatch = resultados.filter((r) => r.enInversiones).length;
  const conParalizacion = resultados.filter((r) => r.obrasParalizadas > 0).length;

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Cruce de fuentes</p>
      <h1>Obras (INFOBRAS) × Inversiones (Invierte.pe)</h1>
      <p className="lede">
        Cruce por <strong>CUI</strong> (Código Único de Inversión) — clave exacta compartida
        entre INFOBRAS y radar-inversiones, sin matching difuso. Conecta el avance físico de
        obra con el dato financiero del proyecto. El match rate refleja que radar-inversiones
        solo tiene una muestra parcial de Invierte.pe, no el universo completo — un CUI sin
        match no significa que no exista, significa que aún no se ingirió. <a href="/">← Obras</a>
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">CUIs con obras</div>
          <div className="stat-value">{resultados.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Con match en inversiones</div>
          <div className="stat-value">{conMatch}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Con obra paralizada</div>
          <div className="stat-value">{conParalizacion}</div>
        </div>
      </div>

      <CrossrefTable rows={resultados} />
    </main>
  );
}
