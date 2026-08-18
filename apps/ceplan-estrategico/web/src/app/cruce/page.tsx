import { CrossrefTable } from "@/components/CrossrefTable";
import { getCrossref } from "@/lib/api";

export default async function CrucePage() {
  const { resultados } = await getCrossref();

  return (
    <main>
      <p className="eyebrow">Follow the Sol · Cruce de fuentes</p>
      <h1>Gestión estratégica × Ejecución presupuestal</h1>
      <p className="lede">
        Cruce por nivel de gobierno entre los indicadores de CEPLAN (ObservaPerú) y la
        ejecución presupuestal de radar-ejecucion — no hay dato por entidad individual
        disponible públicamente hoy (ver metodología en la página de indicadores). Solo
        Gobierno Nacional (GN) y Gobiernos Regionales (GR) tienen un bucket equivalente
        exacto entre ambas fuentes: radar-ejecucion no distingue municipalidades
        provinciales de distritales, así que esos niveles no cruzan. Los años de referencia
        tampoco necesariamente coinciden entre las dos fuentes — se muestran ambos.{" "}
        <a href="/">← Indicadores</a>
      </p>

      <CrossrefTable rows={resultados} />
    </main>
  );
}
